-- ============================================================================
--  0005_bkash_payments.sql
--  Incremental upgrade for a database that already ran 0001_init.sql.
--
--  What it adds
--    1. payment_method 'bkash' + orders.transaction_id
--    2. place_order() now stores the TrxID, notes and payment_status
--       ('pending_verification' for bKash, 'unpaid' otherwise)
--    3. verify_payment() — admin-only: marks the transfer paid and moves a
--       pending order into 'processing'
--    4. instant sign-up: new auth users are e-mail confirmed automatically
--    5. a PostgREST schema-cache reload
--
--  Every statement is idempotent: re-running this file is safe.
--  A fresh install does not need it — 0001_init.sql already contains all of it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. bKash as a payment method + the shopper's transaction id
-- ---------------------------------------------------------------------------
-- NOTE: the new enum value is never *used* (cast) in this same transaction, so
-- this is safe even when the SQL editor wraps the file in one transaction.
alter type public.payment_method add value if not exists 'bkash';

alter table public.orders add column if not exists transaction_id text;

create index if not exists orders_payment_status_idx on public.orders(payment_status);


-- ---------------------------------------------------------------------------
-- 2. tamper guard: the transaction id is payment evidence, so it joins the
--    list of columns only an administrator may edit after checkout
-- ---------------------------------------------------------------------------
create or replace function public.fn_guard_order_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_admin() then
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


-- ---------------------------------------------------------------------------
-- 3. place_order(): the order is now born with its payment evidence attached
--    TrxID and notes arrive as parameters instead of a follow-up UPDATE —
--    the tamper guard above rejects any customer-driven change to
--    payment_method / payment_status / transaction_id, so a post-insert write
--    would make every bKash checkout fail with ORDER_UPDATE_FORBIDDEN.
--
--    The old 5-argument overload is dropped: with two defaults added, a
--    5-argument call would otherwise be ambiguous ("function is not unique").
-- ---------------------------------------------------------------------------
drop function if exists public.place_order(text, text, text, text, jsonb);

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
  --    row it has just created.
  insert into public.orders
    (user_id, customer_name, phone, shipping_address, payment_method, payment_status,
     transaction_id, notes, total_amount, status)
  values
    -- resolve through profiles so a missing profile silently degrades to a
    -- guest order instead of failing the foreign key
    ((select p.id from public.profiles p where p.id = auth.uid()),
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
-- 4. verify_payment(): admin-only confirmation of a manual bKash transfer
--    Marks the money as received and, when the order is still pending, moves it
--    into fulfilment. A cancelled order is never resurrected.
-- ---------------------------------------------------------------------------
create or replace function public.verify_payment(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
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

-- grants: never expose verify_payment to the public role
revoke execute on function public.verify_payment(uuid) from public;
grant execute on function public.place_order(text, text, text, text, jsonb, text, text)
                                                                             to anon, authenticated;
grant execute on function public.verify_payment(uuid)                        to authenticated;


-- ---------------------------------------------------------------------------
-- 5. instant sign-up
--    GoTrue can be configured to require an e-mail confirmation link before a
--    new account may sign in. That makes sign-up feel broken ("which link?")
--    and breaks the immediate-login flow. Marking the address confirmed at
--    insert time lets the account be used straight away, whether or not
--    "Confirm email" is enabled in the dashboard.
-- ---------------------------------------------------------------------------
create or replace function public.fn_auto_confirm_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email_confirmed_at is null then
    update auth.users
       set email_confirmed_at = now()
     where id = new.id
       and email_confirmed_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_auto_confirm on auth.users;
create trigger on_auth_user_auto_confirm
  after insert on auth.users
  for each row execute function public.fn_auto_confirm_new_user();

-- Keep the phone number the sign-up form collects (the original trigger only
-- copied the name).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Accounts created earlier that never clicked their link:
--   update auth.users set email_confirmed_at = now() where email_confirmed_at is null;


-- ---------------------------------------------------------------------------
-- 6. PostgREST must learn about the new column / enum value
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
