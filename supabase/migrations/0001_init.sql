-- ============================================================================
--  NEXUS COMMERCE  ·  Database Migration 0001
--  Target : Supabase (PostgreSQL 15+)
--  Paste this whole file into  Supabase Dashboard -> SQL Editor -> New query -> Run
--
--  Contents
--   1. Extensions & Enums
--   2. Tables          (profiles, categories, products, orders, order_items)
--   3. Helper functions (is_admin, is_staff, updated_at, role/active guard)
--   4. Auth -> profile sync trigger (+ automatic e-mail confirmation)
--   5. AUTOMATION: stock decrement on order + auto-restore on cancellation
--   6. RPC: place_order(), cancel_order(), track_order(), verify_payment(),
--           admin_dashboard_stats(), admin_list_users(), admin_set_user_role(),
--           admin_set_user_active(), admin_delete_user()
--   7. Row Level Security policies
--   8. Realtime publication
--   9. Storage bucket for product images (optional but enabled)
--  10. PostgREST schema-cache reload
--
--  ROLES (RBAC)
--    admin     the shop owner — everything, including users and roles
--    operator  staff/assistant — orders, products, categories, stock
--    customer  shopper — own orders only
--  `is_staff()` (admin or operator) gates the running of the shop; `is_admin()`
--  gates user management and every role change. See 0008 + 0009 for the upgrade
--  path that introduces `operator` and `profiles.is_active` on a live database.
--
--  The script is idempotent: it can be re-run safely.
--  §2.7 also repairs an `orders.user_id` foreign key left pointing at
--  auth.users by an older revision of this file — see 0004_*.sql for a
--  stand-alone version of that repair, 0005_*.sql for the bKash + auto-confirm
--  upgrade, and 0007/0008/0009 for the account-only checkout and RBAC upgrades.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. EXTENSIONS & ENUMS
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;          -- gen_random_uuid()
create extension if not exists pg_trgm;           -- fuzzy product search (gin_trgm_ops)

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    -- 'admin'    — the shop owner: everything, including users and roles
    -- 'customer' — shopper
    -- 'operator' — staff/assistant: orders, products, categories, stock
    -- Deliberately in this order: `0008_staff_roles.sql` appends 'operator' to an
    -- existing database with ALTER TYPE, and ALTER TYPE can only append. Keeping
    -- the two paths identical means an upgraded database and a fresh install are
    -- byte-for-byte the same. Enum order carries no meaning here — roles are only
    -- ever compared for equality.
    create type public.user_role as enum ('admin', 'customer', 'operator');
  end if;
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type public.order_status as enum ('pending', 'processing', 'shipped', 'delivered', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    -- 'bkash' = manual mobile-wallet transfer (Send Money + TrxID verification)
    create type public.payment_method as enum ('cod', 'online', 'bkash');
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------------

-- 2.1 profiles : 1-1 mirror of auth.users, carries the role ------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text not null default '',
  full_name        text,
  role             public.user_role not null default 'customer',
  phone            text,
  -- Avatar: either the URL handed back by an OAuth provider (Google) or the
  -- public URL of a file the shopper uploaded to the `avatars` bucket (§9).
  avatar_url       text,
  -- Default shipping address, carried over to the checkout form.
  shipping_address text,
  -- false = the account is blocked (see admin_set_user_active): it keeps its
  -- history and may browse, but it cannot sign into the gated areas and
  -- place_order() refuses to take an order from it.
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Self-healing upgrade: `create table if not exists` is a no-op on a database
-- that already holds `profiles`, so bring older installs up to date here too.
alter table public.profiles add column if not exists avatar_url       text;
alter table public.profiles add column if not exists shipping_address text;
alter table public.profiles add column if not exists is_active
  boolean not null default true;

-- 2.2 categories -------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  image_url   text,
  created_at  timestamptz not null default now()
);

-- 2.3 products ---------------------------------------------------------------
create table if not exists public.products (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  description          text,
  price                numeric(12,2) not null default 0 check (price >= 0),
  stock                integer not null default 0 check (stock >= 0),
  category_id          uuid references public.categories(id) on delete set null,
  image_url            text,
  -- additive columns that power the admin panel (featured rail + low-stock badge)
  featured             boolean not null default false,
  low_stock_threshold  integer not null default 5 check (low_stock_threshold >= 0),
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 2.4 orders -----------------------------------------------------------------
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  -- Points at profiles (which itself references auth.users) so PostgREST can
  -- embed the customer on an order: orders?select=*,profiles(full_name,email)
  user_id           uuid references public.profiles(id) on delete set null,
  customer_name     text not null default 'Guest',
  -- What the customer pays: goods + delivery. `shipping_fee` is the delivery
  -- slice of it, stored separately so the order page can break the total down
  -- and so a later change to the fee can never rewrite history.
  total_amount      numeric(12,2) not null default 0 check (total_amount >= 0),
  shipping_fee      numeric(12,2) not null default 0 check (shipping_fee >= 0),
  -- Which delivery charge applied: 'inside' (৳60) or 'outside' (৳120) Dhaka.
  delivery_area     text not null default 'inside'
                      check (delivery_area in ('inside', 'outside')),
  status            public.order_status not null default 'pending',
  shipping_address  text not null,
  phone             text not null,
  payment_method    public.payment_method not null default 'cod',
  -- 'unpaid' (COD / pay later) · 'pending_verification' (bKash, awaiting admin)
  -- · 'paid' · 'refunded'
  payment_status    text not null default 'unpaid',
  -- bKash "Send Money" transaction id the shopper pasted at checkout
  transaction_id    text,
  notes             text,
  -- automation bookkeeping: guarantees stock is restored exactly once
  stock_restored    boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Self-healing upgrade: `create table if not exists` is a no-op on a database
-- that already holds `orders`, so bring older installs up to date here too.
-- Orders placed before this column existed keep `shipping_fee = 0` and their
-- goods-only total, which is exactly how they were charged.
alter table public.orders add column if not exists shipping_fee
  numeric(12,2) not null default 0;
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

-- 0012: delivery is priced by area, so the order records which one was used.
alter table public.orders add column if not exists delivery_area text not null default 'inside';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname  = 'orders_delivery_area_check'
  ) then
    alter table public.orders
      add constraint orders_delivery_area_check check (delivery_area in ('inside', 'outside'));
  end if;
end $$;

-- 2.5 order_items ------------------------------------------------------------
create table if not exists public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders(id) on delete cascade,
  product_id     uuid references public.products(id) on delete set null,
  -- immutable snapshot so historical orders survive product edits/deletes
  product_title  text not null default '',
  product_image  text,
  quantity       integer not null check (quantity > 0),
  unit_price     numeric(12,2) not null check (unit_price >= 0),
  created_at     timestamptz not null default now()
);

-- 2.6 indexes ----------------------------------------------------------------
create index if not exists profiles_role_idx          on public.profiles(role);
create index if not exists products_category_idx      on public.products(category_id);
create index if not exists products_created_idx       on public.products(created_at desc);
create index if not exists products_title_trgm_idx    on public.products using gin (title gin_trgm_ops);
create index if not exists orders_user_idx            on public.orders(user_id);
create index if not exists orders_status_idx          on public.orders(status);
create index if not exists orders_payment_status_idx  on public.orders(payment_status);
create index if not exists orders_created_idx         on public.orders(created_at desc);
create index if not exists order_items_order_idx      on public.order_items(order_id);
create index if not exists order_items_product_idx    on public.order_items(product_id);


-- ---------------------------------------------------------------------------
-- 2.7 orders -> profiles : self-healing foreign key
--
--     The admin order console embeds the customer with
--       .select('*, order_items(*), profiles(full_name, email)')
--     PostgREST can only do that when `orders.user_id` has a FOREIGN KEY
--     pointing at public.profiles(id).
--
--     `create table if not exists` above silently keeps an already existing
--     `orders` table, so a database first created by an earlier revision of
--     this file can still point `user_id` at auth.users(id). The auth schema is
--     not exposed, so every embedded select then fails with
--         PGRST200 "Could not find a relationship between 'orders' and 'profiles'"
--     and the admin console renders empty. This block converges any existing
--     state onto the intended constraint, and is safe to re-run.
-- ---------------------------------------------------------------------------

-- a) make sure every auth user has a profile, so the FK can be validated
insert into public.profiles (id, email, full_name, role)
select u.id,
       coalesce(u.email, ''),
       coalesce(u.raw_user_meta_data ->> 'full_name', split_part(coalesce(u.email, ''), '@', 1)),
       'customer'
from auth.users u
on conflict (id) do nothing;

-- b) detach whatever single-column FK currently sits on orders.user_id
do $$
declare
  v_attnum smallint;
  v_con    text;
begin
  select attnum into v_attnum
  from pg_attribute
  where attrelid = 'public.orders'::regclass
    and attname = 'user_id';

  for v_con in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.orders'::regclass
      and c.contype = 'f'
      and c.conkey = array[v_attnum]
  loop
    execute format('alter table public.orders drop constraint %I', v_con);
  end loop;
end $$;

-- c) an order whose owner has no profile becomes a guest order
update public.orders o
   set user_id = null
 where o.user_id is not null
   and not exists (select 1 from public.profiles p where p.id = o.user_id);

-- d) the constraint PostgREST needs in order to embed the customer
alter table public.orders
  add constraint orders_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;


-- ---------------------------------------------------------------------------
-- 3. HELPER FUNCTIONS
-- ---------------------------------------------------------------------------

-- 3.1 is_admin(): SECURITY DEFINER so it can read profiles without recursion.
--     `is_active` is part of the test on purpose: blocking an administrator
--     (admin_set_user_active) must strip their power immediately, not just hide
--     the console from them.
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

-- 3.2 is_staff(): admin *or* operator — the "may run the shop" test.
--     Orders, products, categories and stock all hinge on this; the users console
--     and every role change hinge on `is_admin()` instead.
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

-- 3.3 generic updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 3.4 privilege-escalation shield: only admins may change a profile role, and
--     nobody may flip their own `is_active` block flag back on.
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

drop trigger if exists trg_profiles_guard_role on public.profiles;
create trigger trg_profiles_guard_role
  before update on public.profiles
  for each row execute function public.fn_guard_profile_role();

drop trigger if exists trg_products_touch on public.products;
create trigger trg_products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_orders_touch on public.orders;
create trigger trg_orders_touch
  before update on public.orders
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------------------------
-- 4. AUTH -> PROFILE SYNC
--    Every new auth.users row gets a profile. Role is ALWAYS 'customer':
--    taking it from raw_user_meta_data would let anyone self-promote to admin.
-- ---------------------------------------------------------------------------

-- 4.0 social avatars -----------------------------------------------------------
--     Google puts the picture in `avatar_url` (and mirrors it to `picture`),
--     while Facebook sends `picture` as a nested object: {"data":{"url":…}}.
--     Two traps this function avoids:
--       * `->> 'picture'` on an *object* returns its JSON text, which would win a
--         naive coalesce and store `{"is_silhouette":true}` as the avatar;
--       * providers occasionally send junk, so anything that is not an http(s)
--         URL is rejected outright.
--     The TypeScript twin lives in `lib/queries.ts` (oauthAvatarFor).
create or replace function public.oauth_avatar_url(meta jsonb)
returns text
language sql
immutable
as $$
  select nullif(trim(candidate), '')
  from (
    select coalesce(
      -- Google (and Supabase's normalisation): a plain string
      case when jsonb_typeof(meta -> 'avatar_url') = 'string'
           then meta ->> 'avatar_url' end,
      -- Facebook: {"data":{"url":"…"}}
      case when jsonb_typeof(meta -> 'picture' -> 'data' -> 'url') = 'string'
           then meta -> 'picture' -> 'data' ->> 'url' end,
      -- generic OIDC: a plain string
      case when jsonb_typeof(meta -> 'picture') = 'string'
           then meta ->> 'picture' end,
      case when jsonb_typeof(meta -> 'image') = 'string'
           then meta ->> 'image' end,
      case when jsonb_typeof(meta -> 'avatar') = 'string'
           then meta ->> 'avatar' end
    ) as candidate
  ) c
  where candidate like 'http%';
$$;

-- 4.1 profile on sign-up -------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, phone, avatar_url, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    -- optional phone captured by the sign-up form
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    -- Google / Facebook profile picture, adopted automatically
    public.oauth_avatar_url(new.raw_user_meta_data),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4.2 auto-confirm ------------------------------------------------------------
--     GoTrue can be configured to require an e-mail confirmation link before a
--     new account may sign in. That makes sign-up feel broken ("which link?")
--     and breaks the immediate-login flow. Marking the address confirmed at
--     insert time lets the account be used straight away, whether or not
--     "Confirm email" is enabled in the dashboard.
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

-- Accounts registered before this migration (they never clicked the link):
--   update auth.users set email_confirmed_at = now() where email_confirmed_at is null;


-- ===========================================================================
-- 5. AUTOMATION LAYER  ·  the "zero hassle" stock engine
-- ===========================================================================

-- 5.1 DECREMENT on order line insert -----------------------------------------
--     Locks the product row (FOR UPDATE) so two simultaneous checkouts on the
--     last unit can never oversell: the 2nd transaction waits for the 1st to
--     commit, then re-reads the fresh stock value and fails cleanly.
create or replace function public.fn_order_item_decrement_stock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stock integer;
  v_title text;
begin
  if new.product_id is null then
    return new;                       -- product was deleted, nothing to reserve
  end if;

  select stock, title into v_stock, v_title
  from public.products
  where id = new.product_id
  for update;

  if not found then
    raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_stock < new.quantity then
    raise exception 'INSUFFICIENT_STOCK: only % left of "%"', v_stock, v_title
      using errcode = 'P0001';
  end if;

  update public.products
     set stock = stock - new.quantity
   where id = new.product_id;

  return new;
end;
$$;

drop trigger if exists trg_order_items_decrement_stock on public.order_items;
create trigger trg_order_items_decrement_stock
  after insert on public.order_items
  for each row execute function public.fn_order_item_decrement_stock();


-- 5.2 RESTORE on cancellation / re-open -------------------------------------
--     BEFORE UPDATE so it can flip stock_restored inside the same statement,
--     making the operation idempotent (a cancelled order restored twice would
--     otherwise inflate inventory).
--     Trigger names are numerically prefixed: Postgres fires BEFORE triggers
--     in alphabetical order, so the tamper guard runs before this one.
create or replace function public.fn_order_restore_stock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Case A: active order becomes cancelled  -> give the stock back
  if new.status = 'cancelled'
     and old.status <> 'cancelled'
     and coalesce(old.stock_restored, false) = false then

    update public.products p
       set stock = p.stock + oi.quantity
      from public.order_items oi
     where oi.order_id = new.id
       and oi.product_id = p.id;

    new.stock_restored := true;

  -- Case B: cancelled order is re-opened -> take the stock again
  elsif new.status <> 'cancelled'
        and old.status = 'cancelled'
        and coalesce(old.stock_restored, false) = true then

    update public.products p
       set stock = greatest(p.stock - oi.quantity, 0)
      from public.order_items oi
     where oi.order_id = new.id
       and oi.product_id = p.id;

    new.stock_restored := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_02_restore_stock on public.orders;
create trigger trg_orders_02_restore_stock
  before update on public.orders
  for each row execute function public.fn_order_restore_stock();


-- 5.3 RESTORE when an order row is hard-deleted ------------------------------
create or replace function public.fn_order_delete_restore_stock()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status <> 'cancelled' and coalesce(old.stock_restored, false) = false then
    update public.products p
       set stock = p.stock + oi.quantity
      from public.order_items oi
     where oi.order_id = old.id
       and oi.product_id = p.id;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_orders_01_delete_restore on public.orders;
create trigger trg_orders_01_delete_restore
  before delete on public.orders
  for each row execute function public.fn_order_delete_restore_stock();


-- 5.4 TAMPER GUARD -----------------------------------------------------------
--     Customers may only perform one transition: pending -> cancelled.
--     Everything else (editing totals, marking a parcel "delivered",
--     resurrecting a cancelled order) is staff-only.
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
     or new.delivery_area is distinct from old.delivery_area
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

drop trigger if exists trg_orders_00_guard_update on public.orders;
create trigger trg_orders_00_guard_update
  before update on public.orders
  for each row execute function public.fn_guard_order_update();


-- ===========================================================================
-- 6. RPC ENDPOINTS
-- ===========================================================================

-- 6.1 place_order -------------------------------------------------------------
--     Atomic, server-priced checkout. The client only sends product ids and
--     quantities; prices and stock come from the database, so a tampered
--     localStorage cart cannot change what is charged.
--
--     Legacy overloads are dropped first: with defaults added, an older-arity
--     call would otherwise be ambiguous ("function is not unique").
drop function if exists public.place_order(text, text, text, text, jsonb);
drop function if exists public.place_order(text, text, text, text, jsonb, text, text);

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
  -- Delivery pricing, mirrored from lib/utils.ts (DELIVERY_AREA_META). The cart
  -- quotes the JS copy and this stores the SQL copy, so when one moves the
  -- other must move with it.
  c_delivery_inside  constant numeric(12,2) := 60;
  c_delivery_outside constant numeric(12,2) := 120;

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
  --    total — the cart already quotes subtotal + delivery by area, and
  --    recording the goods alone made "lifetime spend" and the admin revenue
  --    understate every order by the fee.
  v_shipping := case v_area
                  when 'outside' then c_delivery_outside
                  else c_delivery_inside
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


-- 6.2 cancel_order ------------------------------------------------------------
--     One call, works for the customer (own + pending) and for any staff member
--     (any order). Stock restoration is handled by the trigger from section 5.2.
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


-- 6.3 admin_dashboard_stats ---------------------------------------------------
--     Single round-trip for every number on the dashboard, including the
--     low-stock alert list. Available to the whole staff (admin + operator).
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


-- 6.4 track_order ------------------------------------------------------------
--     Guest order tracking without an account: the phone number used at
--     checkout acts as the shared secret. Returns the order plus its lines.
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


-- 6.5 verify_payment ----------------------------------------------------------
--     Staff-only: confirms a manual bKash transfer. Marks the money as received
--     and, when the order is still pending, moves it into fulfilment. A
--     cancelled order is never resurrected.
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


-- 6.6 USER MANAGEMENT ---------------------------------------------------------
--     Four functions. Three of them — the role change, the block flag and the
--     delete — are gated on `is_admin()`, and the role rule the whole module
--     hinges on ("an operator can never promote or demote anybody, least of all
--     to or from admin") is enforced *there*, so it survives a hand-rolled REST
--     call with an operator's own token. Only the directory in §6.6.1 is
--     readable by the whole staff, because an operator opens the console and
--     creates accounts from it.

-- 6.6.1 admin_list_users ------------------------------------------------------
--       The console's table: every profile plus its order history, one round
--       trip. Admin-only (NOT_AUTHORIZED otherwise) — it carries e-mails.
-- 6.6.1 admin_list_users -------------------------------------------------------
--       The directory behind `/admin/users`. Readable by the whole staff (an
--       operator opens the console and creates accounts from it); every write
--       stays in §6.6.2–§6.6.4.
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

-- 6.6.2 admin_set_user_role ---------------------------------------------------
--       The only way a role ever changes. `is_admin()` makes the operator
--       restriction absolute; on top of that nobody may demote themselves and the
--       last active administrator can never be demoted.
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
  v_current      public.profiles;
  v_updated      public.profiles;
  v_other_admins integer;
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

-- 6.6.3 admin_set_user_active -------------------------------------------------
--       Block / unblock. Reversible: the profile and every order are kept, the
--       account is simply refused at the door (middleware + place_order()).
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

-- 6.6.4 admin_delete_user -----------------------------------------------------
--       Deletes the *auth* account: the profile follows (on delete cascade) and
--       the customer's orders are kept with `user_id = null` (on delete set
--       null), so revenue history outlives the account. There is deliberately no
--       DELETE policy on public.profiles (§7.1): a REST delete would leave the
--       auth user alive, and the app would quietly re-create the profile on the
--       next sign-in.
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


-- 6.7 grants -----------------------------------------------------------------
revoke execute on function public.verify_payment(uuid) from public;
-- internal helper for the sign-up trigger: never part of the public API
revoke execute on function public.oauth_avatar_url(jsonb) from public;
grant execute on function public.is_admin()                                   to anon, authenticated;
grant execute on function public.is_staff()                                   to anon, authenticated;
-- checkout is account-only: the RPC is not part of the anonymous API surface
revoke execute on function public.place_order(text, text, text, text, jsonb, text, text, text)
                                                          from public, anon;
grant execute on function public.place_order(text, text, text, text, jsonb, text, text, text)
                                                                             to authenticated;
grant execute on function public.cancel_order(uuid)                           to anon, authenticated;
grant execute on function public.track_order(uuid, text)                      to anon, authenticated;
grant execute on function public.admin_dashboard_stats()                      to authenticated;
grant execute on function public.verify_payment(uuid)                         to authenticated;

-- user management: POSTGRES grants EXECUTE to PUBLIC on every new function, so
-- each of these is revoked explicitly. With the publishable key alone none of
-- them is even reachable; an operator's token reaches them but is turned away by
-- the `is_admin()` check inside.
revoke execute on function public.admin_list_users(integer)                   from public, anon;
revoke execute on function public.admin_set_user_role(uuid, public.user_role) from public, anon;
revoke execute on function public.admin_set_user_active(uuid, boolean)        from public, anon;
revoke execute on function public.admin_delete_user(uuid)                     from public, anon;

grant execute on function public.admin_list_users(integer)                    to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.user_role)  to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean)         to authenticated;
grant execute on function public.admin_delete_user(uuid)                      to authenticated;


-- ===========================================================================
-- 7. ROW LEVEL SECURITY
-- ===========================================================================
alter table public.profiles    enable row level security;
alter table public.categories  enable row level security;
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- 7.1 profiles ---------------------------------------------------------------
-- Reading: yourself, or any member of staff — an operator working the order
-- queue has to see who the customer is (the orders console embeds this row).
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_select_own_or_staff" on public.profiles;
create policy "profiles_select_own_or_staff" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_staff());

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

-- Writing your own row (name, phone, avatar, address) is fine for anyone; the
-- trigger in §3.4 + the two REVOKEs below keep `role` and `is_active` out of
-- everybody's reach, admins included.
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- NOTE the missing piece: there is deliberately no DELETE policy on profiles.
-- Deleting an account goes through `admin_delete_user()` (§6.6.4) or the Auth
-- Admin API. A REST delete would leave the auth user alive, and the app would
-- silently re-create the profile on the next sign-in.
drop policy if exists "profiles_admin_all" on public.profiles;

-- belt & braces: Supabase grants UPDATE on the whole table, and a table-level
-- grant outranks a column-level revoke — so this is *not* the barrier that stops
-- a customer from promoting themselves (the guard trigger in §3.4 is). It does
-- hold for any deployment that narrows the blanket grants to column scope.
revoke update (role)      on public.profiles from anon, authenticated;
revoke update (is_active) on public.profiles from anon, authenticated;

-- 7.2 categories (public read, staff write) ----------------------------------
drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read" on public.categories
  for select to anon, authenticated using (true);

drop policy if exists "categories_admin_write" on public.categories;
drop policy if exists "categories_staff_write" on public.categories;
create policy "categories_staff_write" on public.categories
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- 7.3 products (public read of active items, staff write incl. stock) ---------
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

-- an order must belong to the signed-in shopper: the previous "or guest" clause
-- is gone, so a direct REST insert as `anon` is refused outright
drop policy if exists "orders_insert_own_or_guest" on public.orders;
drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own" on public.orders
  for insert to authenticated
  with check (user_id = auth.uid());

-- customers may cancel their own pending order; the tamper-guard trigger
-- (section 5.4) blocks every other kind of edit.
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


-- ===========================================================================
-- 8. REALTIME
--    orders / order_items / products / profiles are broadcast over websockets so
--    the admin panel updates itself the moment a customer checks out or signs up.
-- ===========================================================================
do $$
declare
  t text;
begin
  foreach t in array array['orders', 'order_items', 'products', 'categories', 'profiles']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- send full row images on UPDATE/DELETE so the UI can reconcile reliably
alter table public.orders      replica identity full;
alter table public.order_items replica identity full;
alter table public.products    replica identity full;
alter table public.profiles    replica identity full;


-- ===========================================================================
-- 9. STORAGE  ·  product image uploads for the admin panel
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/png','image/jpeg','image/webp','image/avif','image/gif'])
on conflict (id) do nothing;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "product_images_admin_write" on storage.objects;
drop policy if exists "product_images_staff_write" on storage.objects;
create policy "product_images_staff_write" on storage.objects
  for all to authenticated
  using (bucket_id = 'product-images' and public.is_staff())
  with check (bucket_id = 'product-images' and public.is_staff());

-- 9.2 avatars ----------------------------------------------------------------
--     Anyone can *read* an avatar (the header renders it for signed-in users
--     and admins see them in the order list). Only the owner may write, and
--     only inside a folder named after their own uid: `avatars/<uid>/avatar.png`.
--     The `(storage.foldername(name))[1] = auth.uid()::text` check is what stops
--     one shopper from overwriting another shopper's picture.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/png','image/jpeg','image/webp','image/avif','image/gif'])
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ===========================================================================
-- 10. POSTGREST SCHEMA CACHE
--     PostgREST caches table + relationship metadata. Without this reload the
--     app can still be told "Could not find a relationship between 'orders' and
--     'profiles'" immediately after §2.7 created the constraint.
-- ===========================================================================
notify pgrst, 'reload schema';


-- ===========================================================================
--  DONE.
--  Next step: create your admin account (see 0002_promote_admin.sql)
-- ============================================================================
