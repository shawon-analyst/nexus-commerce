-- ===========================================================================
-- 0009 — user management & Role-Based Access Control (RBAC)
-- ===========================================================================
--
-- RUN 0008 FIRST. This file *uses* the `operator` enum label that 0008 adds, and
-- PostgreSQL refuses to use a new enum value in the transaction that creates it.
--
-- THE MODEL
--   admin     — the shop owner. Everything, including users and roles.
--   operator  — staff/assistant. Orders (status + bKash verification), products,
--               categories and stock. Never users, never roles.
--   customer  — shopper. Own orders only, and may cancel a pending one.
--
--   Only an `admin` can promote or demote anyone, and the rule is enforced here
--   in the database — not in the UI — so it holds even if somebody calls the RPC
--   straight from a REST client with their own token.
--
-- WHAT CHANGES
--   1. `is_staff()` (admin or operator) joins `is_admin()`.
--   2. Every policy that said "admin may manage orders/products/categories"
--      now says "staff may manage them", so an operator is genuinely useful.
--      One area stays admin-only: the users list and everything that writes to
--      a role. Operators get the dashboard too — it is the same shop data they
--      already see order by order.
--   3. `profiles.is_active` is enforced: `place_order()` refuses a blocked
--      account outright, and a non-admin can neither change a role nor flip
--      `is_active` (trigger + column-level REVOKE + no DELETE policy at all).
--   4. `admin_list_users`, `admin_set_user_role`, `admin_set_user_active` and
--      `admin_delete_user` — the only ways to manage accounts.
--   5. `profiles` joins the realtime publication, so a new sign-up or a role
--      change appears in the console without a refresh.
--
-- Idempotent: safe to run twice, and on top of a database at 0001–0008.
-- ===========================================================================


-- ===========================================================================
-- 1. ROLE HELPERS
-- ===========================================================================

-- 1.1 is_staff(): admin *or* operator — the "may run the shop" test.
--     SECURITY DEFINER for the same reason is_admin() is: it reads profiles from
--     inside policies on profiles, which would otherwise recurse.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('admin', 'operator')
      and is_active
  );
$$;

-- 1.2 is_admin(): redefined so that a *blocked* administrator loses the role
--     immediately. Without `and is_active` a blocked admin would keep every
--     administrator power (only the UI would hide the console from them), which
--     is exactly the wrong way round.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

comment on function public.is_admin() is
  'True when the caller''s profile is an ACTIVE admin. Super-admin: the only role that may manage users or change a role.';
comment on function public.is_staff() is
  'True when the caller''s profile is an active admin or operator: may run orders, products and categories.';


-- ===========================================================================
-- 2. GUARD TRIGGERS
-- ===========================================================================

-- 2.1 profiles: a profile owner can edit their name, phone, avatar and address —
--     never their role, and never the `is_active` block flag.
--     (The column-level REVOKE in §5.3 and in 0001 is the second layer.)
create or replace function public.fn_guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- auth.uid() is null for direct SQL-editor / service-role sessions. RLS already
  -- prevents anon from reaching any row, and customers always carry a uid, so
  -- this escape hatch only ever applies to privileged server-side operations.
  if auth.uid() is null or public.is_admin() then
    new.updated_at := now();
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'ROLE_CHANGE_FORBIDDEN: only an administrator can change roles'
      using errcode = 'P0001';
  end if;

  if new.is_active is distinct from old.is_active then
    raise exception 'ACCOUNT_STATE_FORBIDDEN: only an administrator can block or unblock an account'
      using errcode = 'P0001';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- 2.2 orders: customers may only perform pending -> cancelled. Staff may do
--     anything. `auth.uid() is null` covers the service-role path — the
--     referential action that clears `orders.user_id` when a deleted user's
--     profile goes away (ON DELETE SET NULL) fires this trigger, and RLS has
--     already decided whether that caller is allowed to touch orders at all.
create or replace function public.fn_guard_order_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;

  if new.user_id        is distinct from old.user_id
     or new.total_amount is distinct from old.total_amount
     or new.shipping_address is distinct from old.shipping_address
     or new.phone       is distinct from old.phone
     or new.customer_name is distinct from old.customer_name
     or new.payment_method is distinct from old.payment_method
     or new.payment_status is distinct from old.payment_status
     or new.transaction_id is distinct from old.transaction_id
     or new.stock_restored is distinct from old.stock_restored
     or new.created_at  is distinct from old.created_at then
    raise exception 'ORDER_UPDATE_FORBIDDEN: customers may only cancel pending orders'
      using errcode = 'P0001';
  end if;

  if new.status <> old.status
     and not (old.status = 'pending' and new.status = 'cancelled') then
    raise exception 'ORDER_STATUS_FORBIDDEN: invalid transition % -> %', old.status, new.status
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;


-- ===========================================================================
-- 3. place_order() — unchanged, except that a blocked account cannot order
-- ===========================================================================
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

  select p.id, p.is_active into v_user_id, v_active
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
  --    row it has just created (the tamper guard in §2.2 rejects customer edits
  --    to orders.total_amount, so a follow-up UPDATE would break every checkout)
  insert into public.orders
    (user_id, customer_name, phone, shipping_address, payment_method, payment_status,
     transaction_id, notes, total_amount, status)
  values
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


-- ===========================================================================
-- 4. ORDER / DASHBOARD RPCS — "admin" widens to "staff"
-- ===========================================================================

-- 4.1 cancel_order: the customer (own + pending) or any staff member (any order)
create or replace function public.cancel_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_staff boolean := public.is_staff();
begin
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not v_staff and v_order.user_id is distinct from auth.uid() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if v_order.status = 'cancelled' then
    return v_order;                        -- already cancelled: idempotent
  end if;

  if not v_staff and v_order.status <> 'pending' then
    raise exception 'ORDER_NOT_CANCELLABLE: order is already %', v_order.status
      using errcode = 'P0001';
  end if;

  update public.orders
     set status = 'cancelled'
   where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$$;

-- 4.2 verify_payment: staff confirms a manual bKash transfer
create or replace function public.verify_payment(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
begin
  if not public.is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  update public.orders
     set payment_status = 'paid',
         status = case when status = 'pending' then 'processing' else status end
   where id = p_order_id
  returning * into v_order;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  return v_order;
end;
$$;

-- 4.3 track_order: the owner, the guest who knows the phone, or any staff member
create or replace function public.track_order(p_order_id uuid, p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
begin
  select * into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    return jsonb_build_object('error', 'ORDER_NOT_FOUND');
  end if;

  -- a signed-in owner may always read their order; otherwise the phone must match
  if v_order.user_id is not null and v_order.user_id = auth.uid() then
    null;
  elsif v_order.user_id is null and regexp_replace(v_order.phone, '\D', '', 'g')
        = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') then
    null;
  elsif public.is_staff() then
    null;
  else
    return jsonb_build_object('error', 'NOT_AUTHORIZED');
  end if;

  return jsonb_build_object(
    'order', to_jsonb(v_order),
    'items', coalesce((
      select jsonb_agg(to_jsonb(oi) order by oi.created_at)
      from public.order_items oi
      where oi.order_id = v_order.id
    ), '[]'::jsonb)
  );
end;
$$;

-- 4.4 admin_dashboard_stats: the whole shop at a glance — staff only.
--     `total_customers` deliberately counts role = 'customer', so the figure on
--     the dashboard stays "shoppers", not "accounts".
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'total_revenue', coalesce((
       select sum(total_amount) from public.orders
        where status <> 'cancelled'
    ), 0),
    'revenue_30d', coalesce((
       select sum(total_amount) from public.orders
        where status <> 'cancelled' and created_at >= now() - interval '30 days'
    ), 0),
    'total_orders', (select count(*) from public.orders),
    'pending_orders', (select count(*) from public.orders where status = 'pending'),
    'active_orders', (select count(*) from public.orders where status in ('pending','processing','shipped')),
    'delivered_orders', (select count(*) from public.orders where status = 'delivered'),
    'cancelled_orders', (select count(*) from public.orders where status = 'cancelled'),
    'total_products', (select count(*) from public.products),
    'out_of_stock', (select count(*) from public.products where stock = 0),
    'low_stock_count', (select count(*) from public.products where stock > 0 and stock <= low_stock_threshold),
    'total_customers', (select count(*) from public.profiles where role = 'customer'),
    'low_stock_products', coalesce((
       select jsonb_agg(jsonb_build_object(
                'id', p.id, 'title', p.title, 'stock', p.stock,
                'threshold', p.low_stock_threshold, 'image_url', p.image_url))
       from (
         select * from public.products
          where stock <= low_stock_threshold
          order by stock asc, title asc
          limit 8
       ) p
    ), '[]'::jsonb),
    'revenue_by_day', coalesce((
       select jsonb_agg(row_to_json(t))
       from (
         select to_char(d.day, 'YYYY-MM-DD') as day,
                coalesce(sum(o.total_amount), 0) as revenue,
                count(o.id) as orders
           from generate_series(current_date - interval '6 days', current_date, interval '1 day') as d(day)
           left join public.orders o
                  on o.created_at::date = d.day and o.status <> 'cancelled'
          group by d.day
          order by d.day
       ) t
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;


-- ===========================================================================
-- 5. USER MANAGEMENT RPCS  — every one of them requires `admin`
-- ===========================================================================

-- 5.1 admin_list_users: the console's table, with each shopper's order history
--     rolled up in the same round trip.
--
--     An operator cannot call this (NOT_AUTHORIZED): the list carries customer
--     e-mail addresses, and user administration is admin-only by design.
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
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED: only an administrator can list users'
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

-- 5.2 admin_set_user_role: the ONLY way a role ever changes.
--
--     The operator restriction lives right here: this function demands
--     `is_admin()`, so an operator token cannot promote *anybody* to or from
--     `admin` — it cannot change a role at all. On top of that the last active
--     administrator is protected, and nobody may demote themselves (which would
--     otherwise be an easy way to lock the shop out of its own console).
create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role    public.user_role
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current       public.profiles;
  v_updated       public.profiles;
  v_other_admins  integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED: only an administrator can change roles'
      using errcode = 'P0001';
  end if;

  select * into v_current from public.profiles where id = p_user_id;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_current.role = p_role then
    return v_current;                      -- nothing to do: idempotent
  end if;

  if p_user_id = auth.uid() then
    raise exception 'CANNOT_CHANGE_OWN_ROLE: ask another administrator'
      using errcode = 'P0001';
  end if;

  -- never leave the shop without a way in
  if v_current.role = 'admin' then
    select count(*) into v_other_admins
      from public.profiles
     where role = 'admin' and is_active and id <> p_user_id;

    if v_other_admins = 0 then
      raise exception 'LAST_ADMIN: promote another administrator first'
        using errcode = 'P0001';
    end if;
  end if;

  update public.profiles
     set role = p_role
   where id = p_user_id
  returning * into v_updated;

  return v_updated;
end;
$$;

-- 5.3 admin_set_user_active: block / unblock an account.
--     Blocking is a soft, reversible action: the profile (and every order) is
--     kept, but the account is signed out of the gated areas by the middleware
--     and `place_order()` refuses to take money from it.
create or replace function public.admin_set_user_active(
  p_user_id   uuid,
  p_is_active boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current      public.profiles;
  v_updated      public.profiles;
  v_other_admins integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED: only an administrator can block an account'
      using errcode = 'P0001';
  end if;

  select * into v_current from public.profiles where id = p_user_id;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_current.is_active = p_is_active then
    return v_current;                      -- idempotent
  end if;

  if p_user_id = auth.uid() and not p_is_active then
    raise exception 'CANNOT_BLOCK_SELF: ask another administrator'
      using errcode = 'P0001';
  end if;

  if not p_is_active and v_current.role = 'admin' then
    select count(*) into v_other_admins
      from public.profiles
     where role = 'admin' and is_active and id <> p_user_id;

    if v_other_admins = 0 then
      raise exception 'LAST_ADMIN: promote another administrator first'
        using errcode = 'P0001';
    end if;
  end if;

  update public.profiles
     set is_active = p_is_active
   where id = p_user_id
  returning * into v_updated;

  return v_updated;
end;
$$;

-- 5.4 admin_delete_user: remove the account for good.
--
--     There is deliberately NO delete policy on public.profiles, so a stray
--     `.delete()` from a browser cannot orphan an account (the app re-creates a
--     missing profile on the next sign-in, which would make a REST delete a
--     no-op anyway). Deletion goes through here, and it removes the *auth*
--     account: the profile goes with it (`on delete cascade`) while the
--     customer's orders are kept with `user_id = null` (`on delete set null`),
--     so revenue history survives.
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current      public.profiles;
  v_other_admins integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_AUTHORIZED: only an administrator can delete a user'
      using errcode = 'P0001';
  end if;

  select * into v_current from public.profiles where id = p_user_id;
  if not found then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'CANNOT_DELETE_SELF: ask another administrator'
      using errcode = 'P0001';
  end if;

  if v_current.role = 'admin' and v_current.is_active then
    select count(*) into v_other_admins
      from public.profiles
     where role = 'admin' and is_active and id <> p_user_id;

    if v_other_admins = 0 then
      raise exception 'LAST_ADMIN: promote another administrator first'
        using errcode = 'P0001';
    end if;
  end if;

  delete from auth.users where id = p_user_id;

  if exists (select 1 from auth.users where id = p_user_id) then
    raise exception
      'AUTH_DELETE_FORBIDDEN: the auth account could not be removed — delete it from the Supabase dashboard, or set SUPABASE_SERVICE_ROLE_KEY so the app can use the Auth Admin API'
      using errcode = 'P0001';
  end if;

  -- heals an orphan profile (a profiles row whose auth account was already gone)
  delete from public.profiles where id = p_user_id;
end;
$$;


-- ===========================================================================
-- 6. GRANTS
--     EXECUTE is granted to PUBLIC on every new function by default, so each of
--     these is revoked first: with the publishable key alone none of them is
--     even reachable, and an operator token reaches the staff ones but not the
--     user-management ones (which re-check `is_admin()` anyway).
-- ===========================================================================
grant execute on function public.is_staff() to anon, authenticated;

revoke execute on function public.admin_list_users(integer)                     from public, anon;
revoke execute on function public.admin_set_user_role(uuid, public.user_role)   from public, anon;
revoke execute on function public.admin_set_user_active(uuid, boolean)          from public, anon;
revoke execute on function public.admin_delete_user(uuid)                       from public, anon;

grant execute on function public.admin_list_users(integer)                      to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.user_role)    to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean)           to authenticated;
grant execute on function public.admin_delete_user(uuid)                        to authenticated;

-- re-state the checkout gate: a blocked account must not reach place_order
revoke execute on function public.place_order(text, text, text, text, jsonb, text, text)
  from public, anon;
grant execute on function public.place_order(text, text, text, text, jsonb, text, text)
  to authenticated;


-- ===========================================================================
-- 7. ROW LEVEL SECURITY — admin widens to staff, users stay admin-only
-- ===========================================================================

-- 7.1 profiles ---------------------------------------------------------------
--     Reading: yourself, or any member of staff (an operator working the order
--     queue has to see who the customer is — the orders console embeds this row).
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

-- Writing your own row is still fine (name, phone, avatar, address); the guard
-- trigger + the column REVOKEs are what keep `role` and `is_active` out of reach.
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- NOTE the missing piece: `profiles_admin_all` (which granted DELETE) is gone on
-- purpose. Deleting an account is `admin_delete_user()` or the Auth Admin API —
-- never a REST delete, which would leave the auth user behind and let the
-- auto-heal re-create the profile on the next sign-in.
drop policy if exists "profiles_admin_all" on public.profiles;

-- belt & braces, exactly like `role`: Supabase grants UPDATE on the whole table
-- and a table-level grant outranks a column-level revoke, so this is not the
-- barrier that stops a customer from unblocking themselves — the guard trigger
-- in §2.1 is. It does hold wherever the blanket grants are narrowed.
revoke update (role)      on public.profiles from anon, authenticated;
revoke update (is_active) on public.profiles from anon, authenticated;

-- 7.2 categories (public read, staff write) ----------------------------------
drop policy if exists "categories_admin_write" on public.categories;
drop policy if exists "categories_staff_write" on public.categories;
create policy "categories_staff_write" on public.categories
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- 7.3 products (public read of active items, staff write incl. stock) --------
drop policy if exists "products_public_read" on public.products;
create policy "products_public_read" on public.products
  for select to anon, authenticated
  using (is_active or public.is_staff());

drop policy if exists "products_admin_write" on public.products;
drop policy if exists "products_staff_write" on public.products;
create policy "products_staff_write" on public.products
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- 7.4 orders -----------------------------------------------------------------
drop policy if exists "orders_select_own_or_admin" on public.orders;
drop policy if exists "orders_select_own_or_staff" on public.orders;
create policy "orders_select_own_or_staff" on public.orders
  for select to authenticated
  using (user_id = auth.uid() or public.is_staff());

-- an order must belong to the signed-in shopper: a direct REST insert as `anon`
-- (or on somebody else's behalf) is refused outright
drop policy if exists "orders_insert_own_or_guest" on public.orders;
drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert to authenticated
  with check (user_id = auth.uid());

-- customers may cancel their own pending order; §2.2 blocks every other edit
drop policy if exists "orders_customer_cancel_own" on public.orders;
create policy "orders_customer_cancel_own" on public.orders
  for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid());

drop policy if exists "orders_admin_all" on public.orders;
drop policy if exists "orders_staff_all" on public.orders;
create policy "orders_staff_all" on public.orders
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- 7.5 order_items ------------------------------------------------------------
drop policy if exists "order_items_select_own_or_admin" on public.order_items;
drop policy if exists "order_items_select_own_or_staff" on public.order_items;
create policy "order_items_select_own_or_staff" on public.order_items
  for select to authenticated
  using (
    public.is_staff()
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );

drop policy if exists "order_items_admin_all" on public.order_items;
drop policy if exists "order_items_staff_all" on public.order_items;
create policy "order_items_staff_all" on public.order_items
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- 7.6 storage: product images are edited by whoever runs the catalogue -------
drop policy if exists "product_images_admin_write" on storage.objects;
drop policy if exists "product_images_staff_write" on storage.objects;
create policy "product_images_staff_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'product-images' and public.is_staff())
  with check (bucket_id = 'product-images' and public.is_staff());


-- ===========================================================================
-- 8. REALTIME — profiles joins the stream
--     A new sign-up, a role change or a block shows up in the users console (and
--     a renamed customer shows up on their orders) without a refresh. Supabase
--     Realtime evaluates the SELECT policies per subscriber, so a customer only
--     ever receives their own row.
-- ===========================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- send full row images on UPDATE/DELETE so the console can reconcile reliably
alter table public.profiles replica identity full;


-- ===========================================================================
-- 9. POSTGREST SCHEMA CACHE
-- ===========================================================================
notify pgrst, 'reload schema';
