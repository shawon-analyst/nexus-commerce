-- ===========================================================================
-- 0011_order_totals.sql — the order total is what the customer actually pays
--
-- WHY
--   The storefront quotes a basket as goods + delivery: ৳80 flat, free from
--   ৳1,000 up. `place_order()` then recorded `total_amount` as the *goods only*,
--   so the number on the order was ৳80 short of what the shopper paid. Three
--   things read that number and all three were wrong:
--
--     * "Lifetime spend" on /account, which is the sum of `total_amount`
--     * revenue on the admin dashboard, same sum
--     * `total_spent` per customer in the users console
--
--   The order card papered over it by printing "Shipping: Included", which was
--   untrue — the courier collects the fee with the parcel.
--
-- WHAT CHANGES
--   1. `orders.shipping_fee` — the delivery slice of the total, stored on the
--      row so the order page can break the total back down and so a later change
--      to the fee can never rewrite what was already charged.
--   2. `place_order()` charges goods + delivery with the same rule the cart
--      uses, and writes both columns.
--   3. The order tamper guard covers `shipping_fee`, so a customer cannot edit
--      the fee any more than they can edit the total.
--
--   Orders placed before this migration keep `shipping_fee = 0` and their
--   goods-only total — that is exactly how they were charged, so nothing is
--   rewritten and no history is invented.
--
-- Idempotent, like every migration here. Run once, after `0010`, in its own
-- query window. Fresh installs get all of this from `0001_init.sql`.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. orders.shipping_fee
-- ---------------------------------------------------------------------------
alter table public.orders add column if not exists shipping_fee
  numeric(12,2) not null default 0;

-- Named `orders_shipping_fee_check` so it matches the inline column check in
-- `0001_init.sql` byte for byte: the fresh install and the upgrade chain must
-- produce the same schema.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname  = 'orders_shipping_fee_check'
  ) then
    alter table public.orders
      add constraint orders_shipping_fee_check check (shipping_fee >= 0);
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. the tamper guard learns about the new column
-- ---------------------------------------------------------------------------
-- Otherwise `shipping_fee` would be the one field of an order a customer could
-- still edit by hand (the UPDATE policy lets an owner touch their own row; this
-- trigger is what keeps that to `pending -> cancelled`).
create or replace function public.fn_guard_order_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- `auth.uid() is null` is the service-role / direct-SQL path. It matters here
  -- because deleting an account makes the orders FK clear `user_id`
  -- (ON DELETE SET NULL), and that referential action fires this very trigger.
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;

  if new.user_id        is distinct from old.user_id
     or new.total_amount is distinct from old.total_amount
     or new.shipping_fee is distinct from old.shipping_fee
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


-- ---------------------------------------------------------------------------
-- 3. place_order(): price the delivery, store the whole amount
-- ---------------------------------------------------------------------------
-- Only the pricing block changes. Everything above it — the account-only gate
-- (0007), the blocked-account gate and the operator gate (0010) — is unchanged,
-- and the guards still run *before* the pricing loop, so a refused attempt never
-- locks a product row or touches stock.
--
-- The fee rule is duplicated here in SQL because the function cannot read
-- `lib/utils.ts`. `c_free_shipping` / `c_shipping_fee` mirror
-- `FREE_SHIPPING_THRESHOLD` / `SHIPPING_FEE` there; move both or neither.
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
  -- Delivery pricing, mirrored from lib/utils.ts (SHIPPING_FEE /
  -- FREE_SHIPPING_THRESHOLD). The cart quotes the JS copy and this stores the
  -- SQL copy, so when one moves the other must move with it.
  c_free_shipping constant numeric(12,2) := 1000;
  c_shipping_fee  constant numeric(12,2) := 80;

  v_order_id  uuid;
  v_user_id   uuid;
  v_active    boolean;
  v_role      public.user_role;
  v_subtotal  numeric(12,2) := 0;   -- goods only, priced from the database
  v_shipping  numeric(12,2) := 0;   -- the delivery slice of the total
  v_total     numeric(12,2) := 0;   -- what the customer actually pays
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

  -- Staff accounts browse and administer; they do not buy. Only `operator` is
  -- refused: an administrator cannot demote themselves (§6.6.2 refuses
  -- CANNOT_CHANGE_OWN_ROLE), so blocking admin accounts outright would wedge the
  -- owner out of checkout with no way back. The guard reads the live role, so
  -- demoting the account to 'customer' restores checkout on the next order.
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

    v_subtotal := v_subtotal + (v_product.price * v_qty);
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_product.id,
      'title',      v_product.title,
      'image',      v_product.image_url,
      'quantity',   v_qty,
      'price',      v_product.price
    );
  end loop;

  -- 2. delivery is part of what the customer pays, so it is part of the order
  --    total — the cart already quotes subtotal + delivery, and recording the
  --    goods alone made "lifetime spend" and the admin revenue understate every
  --    order by the fee. The threshold matches the storefront's "free shipping
  --    over ৳1,000" rule exactly (an empty basket never reaches here).
  v_shipping := case
                  when v_subtotal >= c_free_shipping then 0
                  else c_shipping_fee
                end;
  v_total := v_subtotal + v_shipping;

  -- 3. the order is born with its final total, so checkout never UPDATEs the
  --    row it has just created. That is essential: the tamper guard in 5.4
  --    rejects customer-driven changes to orders.total_amount, so computing the
  --    total with a follow-up UPDATE would make every checkout fail with
  --    ORDER_UPDATE_FORBIDDEN.
  insert into public.orders
    (user_id, customer_name, phone, shipping_address, payment_method, payment_status,
     transaction_id, notes, total_amount, shipping_fee, status)
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
     v_shipping,
     'pending')
  returning id into v_order_id;

  -- 4. these inserts fire trg_order_items_decrement_stock, which locks each
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
-- 4. the roll-ups follow automatically
-- ---------------------------------------------------------------------------
-- `admin_dashboard_stats()` and `admin_list_users()` both sum `total_amount`
-- rather than hard-coding a figure, so revenue and `total_spent` pick the
-- delivery fee up with no change here. Nothing else in the schema moves: no
-- policy, no grant, no other function.

notify pgrst, 'reload schema';
