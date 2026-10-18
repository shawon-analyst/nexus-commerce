-- ===========================================================================
-- 0007 — checkout requires an authenticated account
-- ===========================================================================
--
-- WHY
--   Until now `place_order()` happily wrote an order with `user_id = null`
--   when no session was present, i.e. guest checkout. The storefront now asks a
--   signed-out shopper to sign in (middleware redirect + page-level gate), so
--   the database is brought in line: an order must belong to a profile.
--
--   Browsing and `track_order()` stay open to anonymous visitors — only a *new*
--   order is gated. Existing guest orders (if any) are untouched and still
--   readable with their id + phone via `track_order()`.
--
-- WHAT CHANGES
--   1. `place_order()` raises `AUTH_REQUIRED` when `auth.uid()` is null and
--      `PROFILE_REQUIRED` when the signed-in user has no profile row yet.
--   2. EXECUTE on `place_order()` is revoked from `public` / `anon`, so the
--      RPC cannot be reached with the publishable key alone.
--   3. The `orders` insert policy becomes owner-only, so a hand-rolled REST
--      `insert` cannot forge a guest order either.
--
-- This migration is idempotent and safe to run on a database that is already
-- at 0001–0006.  It is already baked into `0001_init.sql` for fresh installs.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. place_order(): same atomic, server-priced checkout — now account-only
-- ---------------------------------------------------------------------------
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

  select p.id into v_user_id from public.profiles p where p.id = auth.uid();
  if v_user_id is null then
    raise exception 'PROFILE_REQUIRED: your profile is not ready yet'
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
-- 2. the RPC is no longer part of the anonymous API surface
-- ---------------------------------------------------------------------------
revoke execute on function public.place_order(text, text, text, text, jsonb, text, text)
  from public, anon;
grant execute on function public.place_order(text, text, text, text, jsonb, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. direct inserts must belong to the caller (no forged guest orders)
-- ---------------------------------------------------------------------------
drop policy if exists "orders_insert_own_or_guest" on public.orders;
drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert to authenticated
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
