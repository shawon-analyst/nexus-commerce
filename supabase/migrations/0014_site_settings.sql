-- ===========================================================================
-- 0014_site_settings.sql — the shop's prices and copy move into the database
--
-- WHY
--   Delivery charges, the bKash wallet and the announcement bar were constants
--   compiled into the app (`DELIVERY_AREA_META`, `BKASH_NUMBER`, the ticker's
--   message list). Changing any of them meant a code change and a redeploy, and
--   the delivery fee was *also* duplicated in `place_order()` — two numbers that
--   had to be moved together by hand or the checkout would quote one amount and
--   the order would record another.
--
--   Now there is exactly one row and one number:
--
--     public.site_settings  (singleton: id = 'site')
--       inside_dhaka_charge   ৳60
--       outside_dhaka_charge  ৳120
--       bkash_number          01789138295
--       top_announcement_text / top_announcement_enabled
--
-- WHAT CHANGES
--   1. The table, its RLS (public read, administrator write) and its seed row.
--   2. `place_order()` reads the two charges from that row instead of the
--      `c_delivery_inside` / `c_delivery_outside` constants. A missing row still
--      falls back to 60/120, so an un-migrated database keeps working.
--   3. `place_order()` refuses the retired `online` payment method outright.
--      The option stays in the enum so historical orders still render, but no
--      new order can be created with it — the checkout disables the radio, and
--      this is the layer a hand-rolled RPC call cannot skip.
--
-- `free_shipping_threshold` is deliberately reserved: it is stored so the schema
-- is complete, but it is NOT applied anywhere. The shop's free-delivery
-- threshold was retired in 0012 and the fee applies to every order. `place_order`
-- ignores the column, and the admin form does not expose it — a control that
-- silently changes nothing would be worse than no control.
--
-- Idempotent, like every migration here. Run once, after `0013`, in its own
-- query window. Fresh installs get the table from this file too.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 1. the table — one row, enforced
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  -- A text key with a single legal value is the clearest way to say "singleton"
  -- without a magic numeric id: every read is `where id = 'site'`.
  id                       text primary key default 'site'
                             check (id = 'site'),
  inside_dhaka_charge      numeric(12,2) not null default 60
                             check (inside_dhaka_charge >= 0 and inside_dhaka_charge <= 100000),
  outside_dhaka_charge     numeric(12,2) not null default 120
                             check (outside_dhaka_charge >= 0 and outside_dhaka_charge <= 100000),
  -- Reserved (see the header). Nullable on purpose; never read by place_order().
  free_shipping_threshold  numeric(12,2)
                             check (free_shipping_threshold is null or free_shipping_threshold >= 0),
  bkash_number             text not null default '01789138295',
  top_announcement_text    text not null default '',
  top_announcement_enabled boolean not null default true,
  updated_at               timestamptz not null default now(),
  updated_by               uuid references public.profiles(id) on delete set null
);

comment on table  public.site_settings is
  'Singleton storefront configuration (delivery fees, bKash wallet, announcement bar). Read by the shop, written by /admin/settings.';
comment on column public.site_settings.free_shipping_threshold is
  'Reserved. Stored for schema completeness but deliberately NOT applied — the free-delivery threshold was retired in 0012.';

-- The seed. `on conflict do nothing` means re-running the file never overwrites
-- whatever an administrator has already saved.
insert into public.site_settings
  (id, inside_dhaka_charge, outside_dhaka_charge, bkash_number,
   top_announcement_text, top_announcement_enabled)
values
  ('site', 60, 120, '01789138295',
   '🚚 CASH ON DELIVERY AVAILABLE ALL OVER BANGLADESH — FAST 24-48 HOUR DELIVERY!'
   ' | 💳 BKASH & NAGAD PAYMENTS ACCEPTED WITH INSTANT CONFIRMATION'
   ' | 💯 100% GENUINE PRODUCTS WITH 7-DAYS EASY REPLACEMENT GUARANTEE'
   ' | 📞 NEED HELP ORDERING? CHAT WITH US ON WHATSAPP OR MESSENGER!',
   true)
on conflict (id) do nothing;

-- `touch_updated_at()` already exists (0001 §3.3) and is generic.
drop trigger if exists trg_site_settings_touch on public.site_settings;
create trigger trg_site_settings_touch
  before update on public.site_settings
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- 2. RLS — the whole world may read it, only an administrator may write
-- ---------------------------------------------------------------------------
alter table public.site_settings enable row level security;

-- The storefront reads this on every page (announcement bar, delivery quote,
-- bKash wallet), including for signed-out visitors, so `anon` needs SELECT.
drop policy if exists "site_settings_public_read" on public.site_settings;
create policy "site_settings_public_read" on public.site_settings
  for select to anon, authenticated using (true);

-- Money and shop-wide copy are administrator territory, not operator: an
-- operator runs orders and stock, an administrator owns the prices.
drop policy if exists "site_settings_admin_update" on public.site_settings;
create policy "site_settings_admin_update" on public.site_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No INSERT / DELETE policy: the row is seeded above and must never be removed
-- or duplicated from the API. An administrator can only UPDATE it.

grant select on public.site_settings to anon, authenticated;
grant update on public.site_settings to authenticated;


-- ---------------------------------------------------------------------------
-- 3. place_order() — read the fees from the row, refuse `online`
-- ---------------------------------------------------------------------------
-- Signature unchanged, so the existing grant survives `create or replace`.
-- Everything above the pricing block (account-only gate, blocked account,
-- operator gate) and the tamper rules are untouched.
create or replace function public.place_order(
  p_customer_name    text,
  p_phone            text,
  p_shipping_address text,
  p_payment_method   text,
  p_items            jsonb,
  p_transaction_id   text default null,
  p_notes            text default null,
  p_delivery_area    text default 'inside'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Fallbacks only: the live values come from public.site_settings below. They
  -- match the column defaults, so a database that has the table but somehow no
  -- row still charges the documented ৳60 / ৳120.
  c_fallback_inside  constant numeric(12,2) := 60;
  c_fallback_outside constant numeric(12,2) := 120;

  v_delivery_inside  numeric(12,2) := c_fallback_inside;
  v_delivery_outside numeric(12,2) := c_fallback_outside;

  v_order_id  uuid;
  v_user_id   uuid;
  v_active    boolean;
  v_role      public.user_role;
  v_subtotal  numeric(12,2) := 0;   -- goods only, priced from the database
  v_shipping  numeric(12,2) := 0;   -- the delivery slice of the total
  v_total     numeric(12,2) := 0;   -- what the customer actually pays
  v_area      text;
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

  -- Where the parcel goes decides the fee, so an unrecognised value is refused
  -- rather than quietly defaulted (a tampered client must not pick its price).
  v_area := coalesce(nullif(trim(p_delivery_area), ''), 'inside');
  if v_area not in ('inside', 'outside') then
    raise exception 'INVALID_DELIVERY_AREA: %', v_area using errcode = 'P0001';
  end if;

  -- payment: Cash on Delivery needs nothing, bKash requires the "Send Money"
  -- transaction id so an administrator can verify the transfer.
  v_method := coalesce(nullif(trim(p_payment_method), ''), 'cod');
  if v_method not in ('cod', 'online', 'bkash') then
    raise exception 'UNSUPPORTED_PAYMENT_METHOD: %', v_method using errcode = 'P0001';
  end if;

  -- `online` (card / wallet) is displayed as "Coming soon" and its radio is
  -- disabled. Refusing it here is the real barrier: the enum value survives only
  -- so historical orders keep rendering.
  if v_method = 'online' then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE: online card payments are not available yet'
      using errcode = 'P0001';
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

  -- The one source of truth for the two charges. `not found` covers a missing
  -- row; the constants above stay in place in that case.
  select s.inside_dhaka_charge, s.outside_dhaka_charge
    into v_delivery_inside, v_delivery_outside
  from public.site_settings s
  where s.id = 'site';

  if not found then
    v_delivery_inside  := c_fallback_inside;
    v_delivery_outside := c_fallback_outside;
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
  --    total — the cart already quotes subtotal + delivery by area, and
  --    recording the goods alone made "lifetime spend" and the admin revenue
  --    understate every order by the fee.
  v_shipping := case v_area
                  when 'outside' then v_delivery_outside
                  else v_delivery_inside
                end;
  v_total := v_subtotal + v_shipping;

  -- 3. the order is born with its final total, so checkout never UPDATEs the
  --    row it has just created. That is essential: the tamper guard in 5.4
  --    rejects customer-driven changes to orders.total_amount, so computing the
  --    total with a follow-up UPDATE would make every checkout fail with
  --    ORDER_UPDATE_FORBIDDEN.
  insert into public.orders
    (user_id, customer_name, phone, shipping_address, payment_method, payment_status,
     transaction_id, notes, total_amount, shipping_fee, delivery_area, status)
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
     v_area,
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

revoke execute on function public.place_order(text, text, text, text, jsonb, text, text, text)
                                                          from public, anon;
grant execute on function public.place_order(text, text, text, text, jsonb, text, text, text)
                                                                             to authenticated;


notify pgrst, 'reload schema';
