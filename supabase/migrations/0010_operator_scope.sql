-- ===========================================================================
-- 0010_operator_scope.sql — operators get the users console, lose the checkout
--
-- Two scope corrections, and they ship together because the second is what
-- makes the first safe:
--
--   1. `admin_list_users()`   is_admin()  ->  is_staff()
--      An operator now opens `/admin/users` and may create accounts from it, so
--      the page needs the directory to render at all. Every *mutation* stays
--      administrator-only — `admin_set_user_role`, `admin_set_user_active` and
--      `admin_delete_user` are untouched by this file — and the create endpoint
--      caps an operator's creation at `role = 'customer'`, so an operator can
--      never mint a colleague who outranks them.
--
--   2. `place_order()`        refuses `role = 'operator'`
--      Staff buy with a customer account, not with the account that runs the
--      shop. The guard reads the live `profiles` row rather than anything the
--      client sent, so the moment an administrator sets the role back to
--      `customer` (admin_set_user_role) checkout works again — there is nothing
--      cached at sign-in left to invalidate.
--
-- Idempotent, like every migration here: `create or replace`, no DDL beyond it.
-- Run once, after `0009`, in its own query window.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. the users console: readable by the whole staff, writable by administrators
-- ---------------------------------------------------------------------------
-- The gate moves from is_admin() to is_staff(), which is the *only* change: the
-- returned columns, ordering and limit are byte-for-byte what 0009 defined.
-- Reading emails and phone numbers is a normal part of working an order queue
-- (the orders console embeds the same rows), while changing what an account may
-- do stays with the administrator.
create or replace function public.admin_list_users(p_limit integer default 500)
returns table (
  id            uuid,
  email         text,
  full_name     text,
  phone         text,
  avatar_url    text,
  role          public.user_role,
  is_active     boolean,
  created_at    timestamptz,
  updated_at    timestamptz,
  order_count   bigint,
  total_spent   numeric,
  last_order_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- staff = admin or operator. Role *changes* stay in admin_set_user_role().
  if not public.is_staff() then
    raise exception 'NOT_AUTHORIZED: only staff can list users'
      using errcode = 'P0001';
  end if;

  return query
  select p.id,
         p.email,
         p.full_name,
         p.phone,
         p.avatar_url,
         p.role,
         p.is_active,
         p.created_at,
         p.updated_at,
         coalesce(o.order_count, 0)::bigint,
         coalesce(o.total_spent, 0)::numeric,
         o.last_order_at
    from public.profiles p
    left join (
      select o2.user_id,
             count(*)             as order_count,
             sum(o2.total_amount) as total_spent,
             max(o2.created_at)   as last_order_at
        from public.orders o2
       where o2.user_id is not null
         and o2.status <> 'cancelled'
       group by o2.user_id
    ) o on o.user_id = p.id
   order by p.created_at desc
   limit greatest(coalesce(p_limit, 500), 1);
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. checkout: an operator account cannot place an order
-- ---------------------------------------------------------------------------
-- Placement matters. The guard sits *before* the pricing/stock loop, so a
-- refused attempt never locks a product row and never touches stock — the suite
-- asserts the stock count is unchanged across a refused call.
--
-- Only `operator` is refused, deliberately. An administrator cannot demote
-- themselves (`CANNOT_CHANGE_OWN_ROLE`), so blocking admin accounts would wedge
-- the shop owner out of checkout permanently with no way back; an operator can
-- always ask an administrator for a customer account. Flip this one predicate
-- to `v_role <> 'customer'` if staff-wide blocking is ever wanted.
create or replace function public.place_order(
  p_customer_name    text,
  p_phone            text,
  p_shipping_address text,
  p_payment_method   text,
  p_items            jsonb,
  p_transaction_id   text default null,
  p_notes            text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id  uuid;
  v_user_id   uuid;
  v_active    boolean;
  v_role      public.user_role;
  v_total     numeric(12,2) := 0;
  v_item      jsonb;
  v_line      jsonb;
  v_lines     jsonb := '[]'::jsonb;
  v_product   public.products;
  v_qty       integer;
  v_method    text;
  v_trxid     text;
  v_payment_status text;
begin
  -- Checkout is account-only. Browsing and tracking a legacy guest order stay
  -- open to everyone, but a *new* order must belong to a profile: the app gates
  -- the UI and the middleware redirects, and this is the layer that cannot be
  -- bypassed by calling the RPC straight from a REST client.
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED: please sign in to place an order'
      using errcode = 'P0001';
  end if;

  select p.id, p.is_active, p.role into v_user_id, v_active, v_role
  from public.profiles p
  where p.id = auth.uid();

  if v_user_id is null then
    raise exception 'PROFILE_REQUIRED: your profile is not ready yet'
      using errcode = 'P0001';
  end if;

  -- A blocked account (see admin_set_user_active) keeps its order history and
  -- can still browse, but it cannot place new orders.
  if not coalesce(v_active, true) then
    raise exception 'ACCOUNT_DISABLED: this account has been blocked'
      using errcode = 'P0001';
  end if;

  -- Staff accounts browse and administer; they do not buy. Demoting the account
  -- back to 'customer' (admin_set_user_role) restores checkout immediately,
  -- because this reads the live role.
  if v_role = 'operator' then
    raise exception 'STAFF_CANNOT_ORDER: staff and operator accounts cannot place orders'
      using errcode = 'P0001';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'EMPTY_CART' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_phone), '') = '' then
    raise exception 'PHONE_REQUIRED' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_shipping_address), '') = '' then
    raise exception 'ADDRESS_REQUIRED' using errcode = 'P0001';
  end if;

  -- payment: Cash on Delivery needs nothing, bKash requires the "Send Money"
  -- transaction id so an administrator can verify the transfer
  v_method := coalesce(nullif(trim(p_payment_method), ''), 'cod');
  if v_method not in ('cod', 'online', 'bkash') then
    raise exception 'UNSUPPORTED_PAYMENT_METHOD: %', v_method using errcode = 'P0001';
  end if;

  v_trxid := nullif(trim(coalesce(p_transaction_id, '')), '');

  if v_method = 'bkash' then
    if v_trxid is null or length(v_trxid) < 4 then
      raise exception 'TRXID_REQUIRED: enter the bKash transaction id' using errcode = 'P0001';
    end if;
    if length(v_trxid) > 60 then
      raise exception 'TRXID_INVALID' using errcode = 'P0001';
    end if;
    v_payment_status := 'pending_verification';
  else
    v_payment_status := 'unpaid';
  end if;

  -- 1. price every line from the database — never from the client
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := greatest(coalesce((v_item ->> 'quantity')::int, 0), 1);

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
    end if;

    if not v_product.is_active then
      raise exception 'PRODUCT_UNAVAILABLE: "%" is no longer for sale', v_product.title
        using errcode = 'P0001';
    end if;

    v_total := v_total + (v_product.price * v_qty);
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_product.id,
      'title',      v_product.title,
      'image',      v_product.image_url,
      'quantity',   v_qty,
      'price',      v_product.price
    );
  end loop;

  -- 2. the order is born with its final total, so checkout never UPDATEs the
  --    row it has just created. That is essential: the tamper guard in 5.4
  --    rejects customer-driven changes to orders.total_amount, so computing the
  --    total with a follow-up UPDATE would make every checkout fail with
  --    ORDER_UPDATE_FORBIDDEN.
  insert into public.orders
    (user_id, customer_name, phone, shipping_address, payment_method, payment_status,
     transaction_id, notes, total_amount, status)
  values
    -- resolved above: a signed-in shopper with a profile row, or we never got here
    (v_user_id,
     coalesce(nullif(trim(p_customer_name), ''), 'Guest'),
     trim(p_phone),
     trim(p_shipping_address),
     v_method::public.payment_method,
     v_payment_status,
     v_trxid,
     nullif(trim(coalesce(p_notes, '')), ''),
     v_total,
     'pending')
  returning id into v_order_id;

  -- 3. these inserts fire trg_order_items_decrement_stock, which locks each
  --    product row (FOR UPDATE) and reserves the stock atomically
  for v_line in select * from jsonb_array_elements(v_lines)
  loop
    insert into public.order_items
      (order_id, product_id, product_title, product_image, quantity, unit_price)
    values
      (v_order_id,
       (v_line ->> 'product_id')::uuid,
       coalesce(v_line ->> 'title', ''),
       v_line ->> 'image',
       (v_line ->> 'quantity')::int,
       (v_line ->> 'price')::numeric(12,2));
  end loop;

  return v_order_id;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. nothing else moves
-- ---------------------------------------------------------------------------
-- Still administrator-only, by design and by this file's silence:
--   admin_set_user_role    — the only way a role ever changes
--   admin_set_user_active  — block / unblock
--   admin_delete_user      — remove the auth account
-- Operators keep everything 0009 granted them (orders, products, categories,
-- stock, verify_payment, admin_dashboard_stats), because those policies gate on
-- is_staff() and are not touched here.
