# Nexus Commerce

A production-ready, real-time e-commerce storefront **and** an automated admin panel.
Built with **Next.js 14 (App Router) · TypeScript · Tailwind CSS · Zustand · Supabase (Postgres, RLS, Realtime)**.

The whole point of this codebase is **zero daily hassle for the owner**:

| Business problem | How it is solved here |
| --- | --- |
| Stock must never oversell | `place_order()` locks each product row (`SELECT … FOR UPDATE`) inside the checkout transaction |
| Cancelling an order must put stock back | A Postgres `BEFORE UPDATE` trigger restores **exactly** the ordered quantity, and is idempotent |
| Owner must not refresh the dashboard | Supabase Realtime pushes new orders, status changes and stock moves over websockets |
| Customers must trust the stock number on screen | The product page subscribes to its own row — the counter updates live |
| Prices must not be tamperable | Checkout sends only `product_id` + `quantity`; the database reads the real price |
| Nobody should be able to self-promote to admin | The role is set to `customer` on signup, `role` column is revoked from `authenticated`, and a trigger blocks role edits |
| Sign-up must not stall on a confirmation e-mail | A trigger confirms new accounts on insert and the form signs the shopper straight in |
| Manual bKash transfers must be verifiable | Checkout captures the TrxID; `/admin/orders` shows it and verifies the payment in one click |
| Every page must feel instant | `loading.tsx` skeletons, `<Link prefetch>` and tagged `unstable_cache` reads (busted by admin writes) |
| It has to look good at night | `next-themes` dark mode with a deep slate/zinc palette and a header switcher |
| Prices must read correctly in Bangladesh | Every amount renders through one `formatCurrency()` → **৳ BDT** (`lib/utils.ts`) |
| Shoppers ask questions before buying | Floating **WhatsApp + Facebook Messenger** bubbles (pulsing, bottom-right) on every public page — and nowhere near `/admin` or `/checkout` |
| An order total must be what the customer pays | `place_order()` charges the goods **plus delivery by area** (৳60 inside / ৳120 outside Dhaka) and stores the fee, so `total_amount`, revenue and *Lifetime spend* reconcile with the courier's cash |
| Delivery must be priced by destination | Checkout asks **Inside Dhaka (৳60)** or **Outside Dhaka (৳120)** — Inside by default — and the cart, order summary, order card and invoice all recalculate from that one choice |
| Staff must land in the console, not the shop | After sign-in an `admin` / `operator` is sent to `/admin`, and any staff member who reaches `/` is redirected back — the rest of the catalogue stays browsable |
| Signing up should not mean filling a form | Google / Facebook one-tap sign-in; the provider's **name and picture** are written straight onto the profile |
| An order must belong to an account | `/checkout` is gated three times — middleware redirect, page gate, and `place_order()` raises `AUTH_REQUIRED`. `EXECUTE` is revoked from `anon` |
| Staff should not all be superusers | Three roles: an **operator** runs orders, products and stock and adds customer accounts but can never change a role; only an **admin** touches roles, blocking and deletion - enforced in SQL, not in the UI |
| A returning customer must not lose their history | Blocking is reversible (`is_active`), deleting detaches the orders (`user_id = null`) instead of erasing revenue, and the last admin can never be removed |
| A shared product link must look like a shop, not a bare URL | Default 1200×630 Open Graph card plus a per-product `og:image`, canonical URLs, `robots.txt` and a live `sitemap.xml` — see §5 |
| A customer should hear that the order landed | The moment `place_order()` resolves, a Resend confirmation e-mail goes out with the same invoice breakdown the order page shows — fire-and-forget, and off until a provider key is set (§8) |

---

## 1 · Quick start

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start   # production build, served on :3000
```

Then apply the database (below) — the app boots either way, and tells you in the
admin dashboard if the schema is missing.

> **Never run `npm run build` while `npm run dev` is running.**
> Both write to the same `.next` folder, and the server that writes last wins —
> which corrupts the build manifests (`Cannot find module for page: /login`,
> `ENOENT … _app.js.nft.json`). Stop the dev server first, or point the build at
> its own folder:
>
> ```powershell
> $env:NEXT_DIST_DIR='.next-build'; npm run build; Remove-Item Env:NEXT_DIST_DIR
> ```
>
> ```bash
> NEXT_DIST_DIR=.next-build npm run build
> ```

### Step 1 — Create the schema

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the entire contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and press **Run**.
3. *(Optional)* Paste [`supabase/migrations/0002_seed.sql`](supabase/migrations/0002_seed.sql) for a demo catalogue (5 categories, 12 products with real images).
4. **Upgrading an existing project?** Run these once, in order:
   - [`supabase/migrations/0005_bkash_payments.sql`](supabase/migrations/0005_bkash_payments.sql)
     — the `bkash` payment method, `orders.transaction_id`, the admin
     `verify_payment()` RPC and the *instant sign-up* trigger.
   - [`supabase/migrations/0006_profile_avatars.sql`](supabase/migrations/0006_profile_avatars.sql)
     — `profiles.avatar_url` + `profiles.shipping_address`, social-login
     name/picture capture at sign-up, a backfill for existing accounts, and the
     public `avatars` Storage bucket.
   - [`supabase/migrations/0007_require_auth_for_checkout.sql`](supabase/migrations/0007_require_auth_for_checkout.sql)
     — closes guest checkout: `place_order()` now raises `AUTH_REQUIRED` without a
     session, its `EXECUTE` grant is removed from `anon`, and the `orders` insert
     policy becomes owner-only.
   - [`supabase/migrations/0008_staff_roles.sql`](supabase/migrations/0008_staff_roles.sql)
     — adds the **`operator`** role to the `user_role` enum and the
     `profiles.is_active` column (the block switch).
   - [`supabase/migrations/0009_user_management.sql`](supabase/migrations/0009_user_management.sql)
     — the whole user-management layer: `is_staff()`, the four
     `admin_*` RPCs, the role/state guard trigger, the staff-wide RLS policies and
     the `profiles` realtime publication.
   - [`supabase/migrations/0010_operator_scope.sql`](supabase/migrations/0010_operator_scope.sql)
     — widens `admin_list_users()` to the whole staff (so an operator can open
     `/admin/users` and add customer accounts) and closes operator checkout:
     `place_order()` now raises `STAFF_CANNOT_ORDER`.
   - [`supabase/migrations/0011_order_totals.sql`](supabase/migrations/0011_order_totals.sql)
     — adds `orders.shipping_fee` and makes `place_order()` charge the goods
     **plus** the delivery fee, so the stored total is what the customer actually
     pays. Revenue, *Lifetime spend* and *Total spent* were light on every order
     before this.
   - [`supabase/migrations/0012_delivery_area.sql`](supabase/migrations/0012_delivery_area.sql)
     — prices delivery by destination and retires the flat fee: **৳60 Inside
     Dhaka**, **৳120 Outside Dhaka**, default Inside. Adds `orders.delivery_area`,
     teaches the tamper guard about it, and teaches `place_order()` to charge by
     area instead of the old ৳80 / free-over-৳1,000 rule.

   Every statement in these files is idempotent, so re-running them is harmless.
   (`0007`–`0012` are already folded into `0001_init.sql`, so a fresh install needs
   none of them.)

   > **`0008` and `0009` must be run one at a time, in that order.** Postgres will
   > not let a transaction *use* a value it added to an enum in the same
   > transaction, and the Supabase SQL editor wraps a multi-statement paste in
   > one. `0008` adds `'operator'`; `0009` is the first script allowed to use it.
   > Running `0009` first fails with
   > `invalid input value for enum user_role: "operator"`.

> **Social login is one switch away.** Google / Facebook buttons are rendered on
> `/login` and `/register`, but Supabase must be told about the providers:
> **Authentication → Providers → Google / Facebook** → paste the client ID and
> secret from the Google Cloud / Meta developer console, then add
> `https://<your-supabase-ref>.supabase.co/auth/v1/callback` to the provider's
> authorised redirect list. Nothing else is needed — the avatar and display name
> are copied onto the profile automatically (see §2.4).

> **Admin panel shows "No orders yet" although orders exist?**
> Your database was created by an older revision of the migration, so
> `orders.user_id` still points at `auth.users` instead of `public.profiles`,
> and PostgREST refuses to embed the customer. Run
> [`supabase/migrations/0004_fix_orders_profiles_fk.sql`](supabase/migrations/0004_fix_orders_profiles_fk.sql)
> once — it re-points the foreign key and reloads the schema cache.
> Re-running `0001_init.sql` does the same thing.

### Step 2 — Create your admin account

1. Start the app and register at `/register` (or add a user in **Authentication → Users**).
2. Open [`supabase/migrations/0003_promote_admin.sql`](supabase/migrations/0003_promote_admin.sql), replace the e-mail, and run it.
3. Log in and open **`/admin`**.

After that, staff are managed from the app itself: **`/admin/users`** →
*Add user* creates an `operator` or an `admin` (with `SUPABASE_SERVICE_ROLE_KEY`),
and the **Role** picker on any row promotes or demotes — both administrator-only
actions. An operator can open the same page and add **customer** accounts, but
never staff. See *Roles and the user-management module* in §2.

### Step 3 — Environment

`.env.local` is already populated for this project:

```env
NEXT_PUBLIC_SUPABASE_URL=https://rwxttlwnjgwkiavepmtu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_BeVBSWnT14RKxkpjAdI2xQ_B8NszMl9
NEXT_PUBLIC_SITE_URL=http://localhost:3000
# bKash "Send Money" wallet shown at checkout (defaults to 01789138295)
# NEXT_PUBLIC_BKASH_NUMBER=01789138295
# SUPABASE_SERVICE_ROLE_KEY=   ← optional, server-side only
# RESEND_API_KEY=re_…                           ← optional: order e-mails (§8)
# ORDER_FROM_EMAIL=orders@your-domain.com       ← optional: verified in Resend
```

`NEXT_PUBLIC_*` values are inlined into the bundle at **build** time. In
production `NEXT_PUBLIC_SITE_URL` must be the real `https://` origin — the Open
Graph share cards, the `<link rel="canonical">` tags and `sitemap.xml` are all
built from it, so leaving it at `localhost` makes shared links advertise a dev
machine. `SUPABASE_SERVICE_ROLE_KEY` is only needed for *Add user* and *Delete*
on `/admin/users`; it must never be given a `NEXT_PUBLIC_` prefix.

---

## 2 · SQL architecture

```
auth.users ──1:1──> profiles (role: admin|operator|customer, is_active, avatar_url, shipping_address)
categories ──1:N──> products            (stock, low_stock_threshold, featured, is_active)
profiles   ──1:N──> orders              (status, total_amount, shipping_fee, delivery_area,
                                         stock_restored, payment_method, payment_status,
                                         transaction_id)
orders     ──1:N──> order_items         (quantity, unit_price, product_title snapshot)
```

Payment states on `orders`:

| `payment_method` | `payment_status` after checkout | Meaning |
| --- | --- | --- |
| `cod` *(default)* | `unpaid` | Pay the courier. No extra fields at checkout. |
| `bkash` | `pending_verification` | Shopper sent money to the shop wallet and pasted the TrxID → an admin clicks **Verify payment**. |
| `online` | `unpaid` | Card/wallet provider placeholder. |

`verify_payment(order_id)` moves a bKash order to `paid` and — if it is still
`pending` — to `processing`. Both columns are protected by the tamper guard, so a
customer cannot mark their own order paid.

> **`orders.user_id` must reference `public.profiles(id)`** (not `auth.users`).
> The admin console reads orders with
> `.select('*, order_items(*), profiles(full_name, email)')`, and PostgREST can
> only embed `profiles` through that foreign key. `create table if not exists`
> keeps an existing table untouched, which is exactly how a stale key survives a
> re-run — §2.7 of the migration (and `0004_fix_orders_profiles_fk.sql`)
> converges it.

### The automation layer (section 5 of `0001_init.sql`)

**A. Stock decrement** — `trg_order_items_decrement_stock` (AFTER INSERT on `order_items`)

```sql
select stock, title into v_stock, v_title
from public.products where id = new.product_id for update;   -- row lock ⇒ no oversell

if v_stock < new.quantity then
  raise exception 'INSUFFICIENT_STOCK: only % left of "%"', v_stock, v_title;
end if;

update public.products set stock = stock - new.quantity where id = new.product_id;
```

The row lock serialises concurrent checkouts on the same product: the second
transaction waits, re-reads the committed stock, and fails cleanly instead of
selling the last unit twice.

**B. Stock auto-restore** — `trg_orders_02_restore_stock` (BEFORE UPDATE on `orders`)

```sql
if new.status = 'cancelled' and old.status <> 'cancelled' and old.stock_restored = false then
  update public.products p set stock = p.stock + oi.quantity
    from public.order_items oi
   where oi.order_id = new.id and oi.product_id = p.id;
  new.stock_restored := true;              -- idempotent: never restores twice
end if;
```

The same trigger handles the reverse case: re-opening a cancelled order
(`cancelled → pending`) takes the stock back out. `trg_orders_01_delete_restore`
does the same when an order row is hard-deleted.

**C. Tamper guard** — `trg_orders_00_guard_update` (fires first; trigger names are
numerically prefixed because Postgres fires BEFORE triggers in alphabetical order).
Non-admins may perform exactly one transition: `pending → cancelled`. Everything
else — `total_amount`, `shipping_fee`, `delivery_area`, the delivery address,
`payment_method`, `payment_status`, `transaction_id` — raises `ORDER_UPDATE_FORBIDDEN` /
`ORDER_STATUS_FORBIDDEN`, so nobody can mark their own order paid, rewrite the
amount, or zero the delivery fee.

Because the guard also rejects any customer-driven change to `total_amount`,
`place_order()` prices the cart **first** and inserts the order with its final
total in a single statement — it never updates the row it just created (doing so
would make every checkout fail with `ORDER_UPDATE_FORBIDDEN`). The same reason is
why the TrxID and delivery notes are parameters of `place_order()` rather than a
follow-up `UPDATE`.

**C2. Delivery is part of the total, priced by area.** `place_order()` charges the
goods **plus** the courier fee and writes both numbers:

```sql
-- constants inside place_order(), mirrored in lib/utils.ts
v_shipping := case v_area when 'outside' then 120 else 60 end;
v_total    := v_subtotal + v_shipping;
```

`orders.total_amount` is therefore the amount the courier collects,
`orders.shipping_fee` is the delivery slice of it, and `orders.delivery_area`
(`'inside'` | `'outside'`) records which charge applied. Three things follow:

* the cart, the order card and the database all show the same three lines —
  *Subtotal* / *Delivery* / *Total*. The order card derives *Items* as
  `total_amount - shipping_fee`, so a legacy row written before `0011`
  (`shipping_fee = 0`, goods-only total) still reads correctly;
* every roll-up that sums `total_amount` — revenue on the dashboard, *Lifetime
  spend* on `/account`, *Total spent* in the users console — matches what was
  actually paid;
* the fee follows the destination, so the same basket costs exactly ৳60 more when
  it leaves Dhaka.

The ৳60 / ৳120 rule exists twice: as `DELIVERY_AREA_META` in `lib/utils.ts` (read
by the cart and the checkout) and as `c_delivery_inside` / `c_delivery_outside`
inside `place_order()` (which cannot read TypeScript). **Move both or neither** —
the comments in both places say so.

**D. Instant sign-up** — `on_auth_user_auto_confirm` (AFTER INSERT on `auth.users`)
sets `email_confirmed_at` on the new row, so registration works whether or not
*Confirm email* is enabled in the dashboard. The register form also signs the
shopper in immediately and only falls back to a "sign in manually" panel if that
still fails. Accounts created before `0005` can be backfilled with:

```sql
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;
```

**E. Social sign-in & avatars** — Google and Facebook hand back a *name* and a
*picture*. `handle_new_user()` copies both onto the profile row, through
`oauth_avatar_url()`:

```sql
select coalesce(
  case when jsonb_typeof(meta -> 'avatar_url') = 'string' then meta ->> 'avatar_url' end,
  case when jsonb_typeof(meta -> 'picture' -> 'data' -> 'url') = 'string'
       then meta -> 'picture' -> 'data' ->> 'url' end,   -- Facebook: {"data":{"url":…}}
  case when jsonb_typeof(meta -> 'picture') = 'string' then meta ->> 'picture' end
) ...
where candidate like 'http%';                            -- junk is rejected outright
```

The type checks matter: `->> 'picture'` on a *Facebook object* returns its JSON
text, so a naive coalesce would store `{"is_silhouette":true}` as the avatar URL.
`lib/queries.ts` carries the same logic (`oauthAvatarFor`) for accounts that
predate the trigger — `loadCurrentProfile()` adopts the picture the first time
the user is seen, and never overwrites one they uploaded themselves.

The **callback** (`app/auth/callback/route.ts`) is the only landing strip for
both flows. It exchanges the PKCE `code` for a session cookie and forwards the
shopper to `redirectTo` — but only after checking the path starts with a single
`/` (so `//evil.com` can never become a redirect target). Provider refusals
(`error=access_denied`) and expired links (`error_code=otp_expired`) arrive
without a `code`; they are passed back to `/login` as a short code and spelled
out in plain English by `friendlyAuthError()`, instead of stranding the shopper
on a blank page.

Uploads go to the **public-read `avatars` bucket**, where the write policies
confine every file to `avatars/<uid>/…` (`storage.foldername(name)[1] =
auth.uid()`, 2 MB, image MIME types only). Replacing a picture deletes the
previous *uploaded* file — an external Google/Facebook URL is never deleted.

#### Password recovery

`/forgot-password` never builds a link by hand: it calls
`supabase.auth.resetPasswordForEmail()` with `redirectTo` pointing at
`/auth/callback?redirectTo=/reset-password`, so the **same** landing strip that
handles OAuth also mints the recovery session. The callback additionally accepts
the `token_hash` + `type=recovery` shape Supabase's default mail template sends
(`verifyOtp`), and it knows a *recovery* failure belongs back on
`/forgot-password` rather than `/login`.

`/reset-password` reads the session server-side, so a used or expired link says
so before any markup ships; the browser client re-checks on mount to also catch
the implicit (`#access_token=…`) flow. The new password goes nowhere but
`supabase.auth.updateUser()` — Supabase Auth hashes and stores it, and nothing is
written to a log, a toast, or an analytics call. The confirmation screen is
deliberately vague ("if that address has an account…") so it can never be used to
probe which e-mails are registered.

### RPC endpoints

| Function | Who can call it | Purpose |
| --- | --- | --- |
| `place_order(name, phone, address, method, items, trxid?, notes?, area?)` | authenticated **only** | Atomic checkout, server-side pricing, stock reservation. Charges the goods **plus delivery by area** (৳60 inside / ৳120 outside Dhaka) and stores `total_amount` + `shipping_fee` + `delivery_area`. Stores the bKash TrxID and delivery notes with the insert. Returns the order id. Raises `AUTH_REQUIRED` / `PROFILE_REQUIRED` without a session, `ACCOUNT_DISABLED` for a blocked one, `STAFF_CANNOT_ORDER` for an `operator`, and `INVALID_DELIVERY_AREA` for an unknown area — before it prices or reserves anything. |
| `cancel_order(order_id)` | owner or staff | Cancels (any status for staff, `pending` for the customer). Stock restore is automatic. |
| `track_order(order_id, phone)` | anon + authenticated | Order tracking. A signed-in owner always passes; for a legacy **guest** order the checkout phone number is the shared secret. |
| `verify_payment(order_id)` | staff | Confirms a manual bKash transfer: `payment_status='paid'`, and `pending → processing`. |
| `admin_dashboard_stats()` | staff | Every dashboard number + low-stock list + 7-day revenue in one call. |
| `admin_list_users(limit)` | **staff** | The user table: every profile with `order_count`, `total_spent` and `last_order_at` in one round trip. An operator reads it (the page they add accounts from); a customer gets `NOT_AUTHORIZED`. |
| `admin_set_user_role(user_id, role)` | **admin only** | `customer ↔ operator ↔ admin`. Refuses `CANNOT_CHANGE_OWN_ROLE`, `LAST_ADMIN`, `USER_NOT_FOUND`. |
| `admin_set_user_active(user_id, is_active)` | **admin only** | Block / unblock. Refuses `CANNOT_BLOCK_SELF`, `LAST_ADMIN`. |
| `admin_delete_user(user_id)` | **admin only** | Removes the auth account → the profile cascades, the orders survive with `user_id = null`. Refuses `CANNOT_DELETE_SELF`, `LAST_ADMIN`, `USER_NOT_FOUND`. |
| `oauth_avatar_url(meta)` | *nobody* — internal | Extracts the picture from provider metadata. `EXECUTE` is revoked from `PUBLIC`; only the sign-up trigger and the backfill call it. |
| `is_admin()` / `is_staff()` | everyone | `SECURITY DEFINER`, used by every RLS policy (no policy recursion). `is_admin()` = `role='admin' and is_active`; `is_staff()` = an active admin *or* operator, so a blocked admin loses their powers the moment the flag is flipped. |

### Row Level Security

| Table | anon | customer | operator | admin |
| --- | --- | --- | --- | --- |
| `profiles` | — | read/update own row | read all | read all, plus `row` writes through the `admin_*` RPCs |
| `categories` | read | read | full | full |
| `products` | read (active only) | read (active only) | full | full |
| `orders` | — (checkout needs an account) | read own, insert own, cancel own pending | full | full |
| `order_items` | via RPC only | read own | full | full |
| Storage (`product-images`, `avatars`) | read | read + own folder | write | write |

Reading the directory is ordinary staff work — an operator sees the same rows the
orders console already embeds. **Writing** it is not: `role` and `is_active` are
the two columns an attacker would want, so they are shielded twice over. A **guard
trigger** (`fn_guard_profile_role`) fires on every `UPDATE` of `profiles` and
raises `ROLE_CHANGE_FORBIDDEN` / `ACCOUNT_STATE_FORBIDDEN` unless the caller is a
*real* administrator, and the columns are also revoked from
`anon`/`authenticated`. Supabase grants `UPDATE` on the whole table, and a
table-level grant outranks a column-level revoke — so the trigger is the barrier
that always holds; the revoke is there for a deployment that narrows its grants.
A customer promoting themselves therefore fails with `ROLE_CHANGE_FORBIDDEN`, not
with a silent success.

### Roles and the user-management module

Three roles, one enum (`user_role`):

| Role | Storefront | Order console | Products · categories · stock | Users (`/admin/users`) |
| --- | --- | --- | --- | --- |
| `customer` | own cart, orders, account, **can buy** | — | — | — |
| `operator` | browsing only — **checkout is refused** | ✔ full | ✔ full | ✔ read the list + add **customer** accounts |
| `admin` | as above | ✔ full | ✔ full | ✔ full, including roles, blocking and deletion |

- **Only an administrator may change a role.** `admin_set_user_role()` is
  `SECURITY DEFINER` and starts with `if not public.is_admin() then raise
  'NOT_AUTHORIZED'`, so an operator calling it — from the UI *or* from a REST
  client with their own token — is refused by the database, not by a hidden
  button. An operator can never promote themselves to admin.
- **An operator is a real staff member, everywhere.** Every entry point opens for
  `operator`: the middleware's staff gate, the admin layout's server guard, the
  console sidebar (Users included), the *Admin panel* links in the storefront
  header and on `/account`, the post-login destination, and the cache-busting
  `POST /api/revalidate` (gating that one on `admin` alone used to leave an
  operator's product edit invisible on the storefront until the cache window
  expired). `components/providers/auth-provider.tsx` exposes both `isAdmin` and
  `isStaff` so no component has to re-derive the rule by hand.
- **An operator can add accounts, never staff.** The *Add user* form is on
  `/admin/users` for them too, with no role picker: `creatableRole()` in
  `lib/utils.ts` is the one rule the dialog and `POST /api/admin/users` share, and
  it caps an operator at `customer`. Asking for `operator` or `admin` is refused
  (`403 ROLE_NOT_ALLOWED`) rather than quietly downgraded — creating an account
  means choosing its password, so an operator who could mint an `admin` could
  simply sign in as the admin they just made. Everything else on that page
  (role picker, **Block**, **Delete**) is not rendered for them and would be
  refused by SQL anyway.
- **A staff account does not shop.** `place_order()` raises
  `STAFF_CANNOT_ORDER` for `role = 'operator'` **before** it prices a line or
  locks a product row, so stock is provably untouched (the SQL suite asserts the
  count is identical either side of a refused attempt). `/checkout` renders the
  notice instead of the form — *"Staff/Operator accounts cannot place orders.
  Switch to a customer account to purchase."* — and the cart swaps its checkout
  button for the same notice inline. The check reads the **live** profile, so an
  administrator setting the account back to `customer` restores checkout on the
  very next order: there is nothing cached at sign-in to invalidate. Only
  `operator` is refused, deliberately — an administrator cannot demote themselves
  (`CANNOT_CHANGE_OWN_ROLE`), so blocking admin accounts would wedge the owner out
  of their own shop with no way back. Widen it with one predicate
  (`v_role <> 'customer'`) if that ever changes.
- **The console is the staff home page.** When a staff member signs in with no
  explicit `?redirectTo`, the login form sends them to `/admin`; `middleware.ts`
  is the second net, bouncing any active staff member who reaches the storefront
  **home** back to `/admin`, so an old bookmark to `/` no longer drops a shop
  keeper into the shop. Only `/` is redirected — `/products`, `/cart`, `/account`
  and `/orders` still render for staff, which is exactly what the administrator's
  *Browse catalogue* link previews. A blocked account is signed out on the
  protected-route pass *before* the staff check, so a blocked administrator cannot
  be pushed into an `/admin → / → /admin` loop.
- **Blocking is the reversible action.** `is_active = false` keeps the profile and
  every order; the account simply cannot sign in to `/checkout`, `/account` or
  `/admin` (the middleware clears its `sb-*` cookies and sends it to
  `/login?error=account-disabled`), and `place_order()` refuses it with
  `ACCOUNT_DISABLED`. A blocked **admin** loses `is_admin()` at once — and with it
  the users list, which is staff-gated.
- **Deleting keeps the revenue.** `admin_delete_user()` deletes the `auth.users`
  row; the profile cascades away while the orders stay, detached
  (`user_id = null`), so the sales history never develops a hole. There is
  deliberately **no `DELETE` policy** on `profiles`, so a REST delete cannot orphan
  an account behind the RPC's back.
- **Two invariants are enforced in SQL, not in the UI:** nobody may change their
  own role, block themselves or delete themselves (`CANNOT_CHANGE_OWN_ROLE`,
  `CANNOT_BLOCK_SELF`, `CANNOT_DELETE_SELF`), and the last active administrator can
  never be demoted, blocked or deleted (`LAST_ADMIN`) — the shop cannot lock
  itself out.
- **Creating an account** is the one action SQL cannot do: it needs the
  Supabase **Auth Admin API**. `POST /api/admin/users` re-checks `is_staff()` (and
  falls back to `is_admin()` on a pre-0008 database, so the answer stays a
  truthful 403 instead of a 500), resolves the role through `creatableRole()`, and
  then uses `SUPABASE_SERVICE_ROLE_KEY` **on the server only**. Without the key the
  route answers `503 SERVICE_ROLE_REQUIRED` and the dialog says so up front, with
  the alternative that always works: the person registers (instantly) and an
  administrator changes their role from the table. Deleting is administrator-only
  and tries the SQL RPC first, so the invariants above always apply, falling back
  to the Admin API only when the database refuses to touch `auth.users` itself
  (`AUTH_DELETE_FORBIDDEN` — some projects restrict that).


### Checkout is account-only (three layers)

An order must belong to a profile, so a signed-out shopper is stopped three
times over — each layer works on its own, so bypassing one changes nothing:

1. **`middleware.ts`** redirects `/checkout` to
   `/login?redirectTo=%2Fcheckout` before the page renders. The login page
   notices the destination and says *Sign in to check out*; the return path is
   sanitised (single leading `/`, no `//host`).
2. **`app/(shop)/checkout/page.tsx`** calls `getCurrentProfileResult()` and
   renders `<CheckoutGate>` instead of the form unless the profile is real. A
   stale session cookie therefore still gets a *Sign in to check out* card (with
   a one-line hint that the session expired) rather than a form that only fails
   on submit. The client form keeps its own guard too, in case the session
   expires while the tab is open.
3. **`place_order()`** raises `AUTH_REQUIRED` when `auth.uid()` is null and
   `PROFILE_REQUIRED` when the signed-in user has no profile row;
   `EXECUTE` is revoked from `PUBLIC` + `anon`, and the `orders` insert policy is
   `for insert to authenticated with check (user_id = auth.uid())`. Calling the
   RPC straight from a REST client with the publishable key returns
   `permission denied for function place_order`.

A **staff account is a fourth case**, and it has its own three layers: the page
renders `<StaffOrderNotice>` (the exact wording is one constant,
`STAFF_ORDER_BLOCKED_MESSAGE`), the cart replaces its checkout button with the same
inline notice, and `place_order()` raises `STAFF_CANNOT_ORDER` — before pricing, so
no stock is ever locked by a refused attempt. A signed-in operator is *not*
redirected by the middleware, precisely so the explanation can appear on
`/checkout` where they were heading. See *Roles and the user-management module*.

Browsing and `track_order()` stay open to guests, so an order placed before
`0007` can still be found with its id + phone — but a phone number can no longer
reach an order that belongs to an account (only the owner or an admin can).

---

## 3 · File structure

```
.
├─ app/
│  ├─ (shop)/                       # storefront shell (header + footer)
│  │  ├─ page.tsx                   # homepage: hero, categories, featured, new arrivals
│  │  ├─ loading.tsx                # streamed skeleton (same for every route below)
│  │  ├─ products/page.tsx          # catalogue: search + category + sort + stock filters
│  │  ├─ products/[id]/page.tsx     # PDP: image viewer, live stock counter, buy now
│  │  ├─ cart/page.tsx              # full cart page
│  │  ├─ checkout/page.tsx          # delivery form (Inside/Outside Dhaka) + COD / bKash TrxID
│  │  │                             # (account-only: renders CheckoutGate when signed out)
│  │  ├─ orders/page.tsx            # my orders (live) / guest tracking
│  │  ├─ orders/[id]/page.tsx       # order detail + timeline + cancel
│  │  ├─ account/page.tsx           # profile dashboard: avatar upload + personal details
│  │  └─ not-found.tsx
│  ├─ (auth)/
│  │  ├─ layout.tsx                 # split-screen auth shell
│  │  ├─ login/page.tsx             # Google / Facebook + e-mail, plus the recovery link
│  │  ├─ register/page.tsx          # instant sign-in, no e-mail confirmation step
│  │  ├─ forgot-password/page.tsx    # request a single-use recovery e-mail
│  │  └─ reset-password/page.tsx     # choose a new password (dead-link state included)
│  ├─ admin/                        # gated staff panel (admin, or operator)
│  │  ├─ layout.tsx                 # server-side staff guard + AdminShell
│  │  ├─ page.tsx                   # dashboard: KPIs, revenue chart, low stock, live feed
│  │  ├─ orders/page.tsx            # order console: payment badges + TrxID + verify payment
│  │  ├─ products/page.tsx          # inventory: inline stock +/-, uploads, CRUD
│  │  ├─ categories/page.tsx        # category CRUD
│  │  └─ users/page.tsx             # user management: list + add (staff reads; admin writes)
│  ├─ api/revalidate/route.ts       # staff cache-tag invalidation (admin or operator)
│  ├─ api/admin/users/route.ts      # create (Auth Admin API) / delete (RPC first) an account
│  ├─ api/orders/[id]/notify/route.ts  # best-effort order-confirmation e-mail (owner-only)
│  ├─ auth/callback/route.ts        # OAuth / e-mail confirmation exchange (code → session)
│  ├─ robots.ts                     # /robots.txt: blocks /admin + /api, points at the sitemap
│  ├─ sitemap.ts                    # /sitemap.xml: home + catalogue + every active product
│  ├─ layout.tsx                    # root: fonts, theme provider, auth bootstrap, metadata
│  ├─ icon.svg · icon.png · favicon.ico · apple-icon.png   # the shopping-bag mark
│  ├─ providers.tsx                 # Theme + Auth + Cart hydration + Toaster
│  ├─ error.tsx · not-found.tsx · globals.css
├─ components/
│  ├─ ui/                           # shadcn-style primitives + UserAvatar + TrxIdChip + skeletons
│  ├─ auth/                         # login-form, register-form, social-auth-buttons,
│  │                                # forgot-password-form, reset-password-form
│  ├─ seo/json-ld.tsx               # schema.org <script> emitter (escapes `<`)
│  ├─ account/                      # profile-dashboard, avatar-uploader, edit-profile-dialog
│  ├─ layout/                       # site-header, site-footer, announcement-bar,
│  │                                # support-widgets (WhatsApp + Messenger), theme-toggle
│  ├─ storefront/                   # cart-sheet, product-card, product-detail, checkout-form,
│  │                                # checkout-gate (sign-in prompt), staff-order-notice,
│  │                                # order-card, order-status-timeline, track-order-form…
│  ├─ admin/                        # admin-shell, dashboard-client, orders-client,
│  │                                # products-client, product-form-dialog,
│  │                                # users-client, user-role-control, invite-staff-dialog,
│  │                                # payment-verify-button, stat-card…
│  └─ providers/                    # auth-provider, cart-hydrator, theme-provider
├─ hooks/use-realtime.ts            # useRealtimeOrders · useRealtimeProducts · useLiveProduct
│                                   # · useRealtimeUsers
├─ lib/
│  ├─ supabase/{client,server,public,middleware}.ts
│  ├─ queries.ts                    # server-side reads (React cache + unstable_cache)
│  ├─ cache-tags.ts                 # shared cache-tag names
│  ├─ storefront-refresh.ts         # client helper → /api/revalidate
│  ├─ types.ts                      # Database type (mirrors the SQL schema)
│  ├─ utils.ts                      # cn, BDT currency, delivery-area pricing, role metadata,
│                                   # creatableRole, date/error helpers
│  ├─ category-icons.ts             # slug/name → lucide icon for the category pills
│  ├─ seo.ts                        # canonical origin, share card, descriptions, NO_INDEX
│  ├─ structured-data.ts            # schema.org builders: Organization, WebSite, Product, Breadcrumb
│  └─ email/{resend,order-confirmation}.ts  # fail-soft transport + invoice template
├─ store/cart-store.ts              # Zustand + persist (skipHydration) + totals
├─ public/og-default.png            # 1200x630 default Open Graph card (committed)
├─ scripts/make-og-image.ps1        # re-renders it with GDI+ — no extra dependencies
├─ scripts/qa/                      # rls-probe · seo-probe · email-probe · image-probe (+ README)
├─ supabase/migrations/             # 0001_init · 0002_seed · 0003_promote_admin
│                                  # 0004_fix_orders_profiles_fk · 0005_bkash_payments
│                                  # 0006_profile_avatars · 0007_require_auth_for_checkout
│                                  # 0008_staff_roles · 0009_user_management
│                                  # 0010_operator_scope · 0011_order_totals
│                                  # 0012_delivery_area
└─ middleware.ts                    # session refresh + account-state + staff `/`→`/admin`,
                                    # /admin, /account, /checkout gates
```

---

## 4 · Manual test checklist

1. **Add to cart → checkout → stock drops**
   Add a product, place an order with COD. The product's `stock` decreases and the PDP counter changes.
   (Checkout is account-only now, so this runs while signed in — a logged-in
   customer's checkout used to be rejected by the order tamper-guard.)
2. **Cancel → stock returns** (customer)
   `/orders` → *Cancel order* on a pending order → open the product page: the quantity is back.
3. **Cancel → stock returns** (admin)
   `/admin/orders` → set status to `Cancelled` → same result; the toast confirms the restore.
4. **Re-open a cancelled order**
   `/admin/orders` → set it back to `Pending` → stock is taken again.
5. **Realtime**
   Open `/admin` in one window and place an order in another: a toast appears and the row
   is inserted without a refresh.
6. **Oversell protection**
   Set a product's stock to 1, then check out twice (two browsers). The second checkout
   fails with *"Not enough stock — only 1 left of …"* and rolls back completely.
7. **RLS / roles**
   As a customer, visit `/admin` → redirected to the storefront with the *“That
   area is for staff”* strip. Call `cancel_order` on someone else's order →
   `NOT_AUTHORIZED`. As an operator, sign in and confirm you land in the console,
   the storefront header and `/account` both offer *Admin panel*, and the sidebar
   lists Dashboard, Orders, Products, Categories **and Users**. The only storefront
   link there is *Browse catalogue* (`/products`) — and that one is
   administrator-only, so an operator has no way back to the shop floor from the
   console.
   - Type `/` in the address bar: staff are handed to `/admin`, both right after
     signing in and on any later visit to the storefront home. `/products`, `/cart`,
     `/account` and `/orders` still render for staff, which is what the
     *Browse catalogue* preview relies on.
   - `/admin/orders`, `/admin/products` and `/admin/categories` all work in full;
     change a product's price and reload the storefront — the new price is already
     there (`POST /api/revalidate` accepts staff, not just admins).
   - `/admin/users` **opens**: you see the user table with roles as plain badges,
     no **Role** picker, no **Block**/**Delete**, a *View only* marker per row, and
     an *Add user* form that creates **customer** accounts only. Calling
     `admin_set_user_role()` — or `POST /api/admin/users` with `role: "admin"` —
     straight from a REST client still answers `NOT_AUTHORIZED` /
     `ROLE_NOT_ALLOWED`.
   - Fill a cart and open `/checkout`: the form is replaced by *“Staff/Operator
     accounts cannot place orders. Switch to a customer account to purchase.”*,
     and `/cart` shows the same notice where its checkout button was.
   - As an admin, `/admin/orders` lists every order with the customer attached,
     `+ / −` on `/admin/products` changes stock immediately, and `/admin/users`
     has the **Role** picker, **Block** and **Delete** back.
   - Back on `/admin/users` as the admin, set the operator's role to **Customer**:
     within a second or two (realtime) their sidebar shrinks to a shopper's, and
     their next `/checkout` renders the form — no sign-out needed. Set it back to
     **Operator** to restore the console.
8. **bKash checkout → verification**
   Checkout → *bKash (Send Money)*: the panel shows **01789138295** with a working
   *Copy Number* button, the instruction text and a required TrxID field. Placing the
   order with an empty TrxID is refused; with one it lands as
   `bkash / pending_verification`. `/admin/orders` shows the payment badge **and the
   TrxID** in the table and in the dialog, and *Verify payment* flips it to `paid` +
   `processing`. A customer calling `verify_payment` on their own order gets
   `NOT_AUTHORIZED`.
9. **Instant registration**
   `/register` → the account is usable straight away (no confirmation e-mail), with a
   success toast and a signed-in header. Re-loading `/admin` as that customer still
   redirects.
10. **Dark mode**
    Switch Light / Dark / System in the header (and the admin console). The choice
    survives a reload with no flash of the wrong theme, and stock/payment badges stay
    legible on the dark surface.
11. **BDT everywhere**
    Open the homepage, `/products`, a product page, the cart, checkout and an order
    summary: every amount reads `৳ 1,200` (no `$` anywhere). The announcement bar
    scrolls the four business lines (COD nationwide, bKash/Nagad, genuine products,
    chat with us) and the checkout quotes **৳60 inside / ৳120 outside Dhaka**.
    `/admin` KPIs, the orders table and the product form
    (label *Price (৳ BDT)*) are Taka too.
12. **Live-chat bubbles**
    Every public page shows two bubbles, bottom-right: the blue **Messenger** one
    opens `facebook.com/md.shawon.982336`, the green **WhatsApp** one opens
    `wa.me/8801934100750` with the greeting pre-filled. They bob gently inside a
    pulsing halo, grow slightly on hover, and reveal their tooltip. Both are
    **hidden inside `/admin` and on `/checkout`** (so the chat bubble never
    competes with the order form), and they stay put while animations are disabled
    (enabled *reduce motion* in the OS).
13. **Favicon**
    The browser tab shows the gradient shopping-bag mark (not the default globe) on
    `/`, `/products`, `/admin` and `/login`, in both themes. No `404 /favicon.ico`
    in the network panel.
14. **Social login + avatar sync**
    With the Google provider enabled, `/login` → *Continue with Google* → after the
    redirect the header shows the Google picture and name, and `/account` displays
    the same picture with the name pre-filled. Repeat with Facebook. Then upload a
    custom picture on `/account` — the header updates immediately and the uploaded
    file (not the Google one) is what the next visit shows.
15. **Profile editing**
    `/account` → *Edit profile*: change the name, phone and delivery address, save,
    and confirm the values persist after a reload, show up in the personal-details
    card, and pre-fill `/checkout`.
16. **Checkout needs an account**
    Signed out, open `/checkout` → the *Sign in to check out* card (never the form),
    and the URL becomes `/login?redirectTo=%2Fcheckout`; the login page says *Sign in
    to check out* and returns you to `/checkout` after signing in. The cart's button
    and the PDP *Buy now* read *Sign in to check out* as well. Then call
    `place_order` straight from the REST API with only the publishable key:
    `permission denied for function place_order`.
17. **Footer contact details**
    Every page's *Get in touch* column reads **Hemayetpur, Savar, Dhaka** and
    **01934100750**.
18. **User management (`/admin/users`)**
    As an admin, **MANAGE → Users** lists every account with its name, e-mail,
    role, creation date and order count (name/e-mail/phone search, role chips and
    a *Blocked only* toggle above it). Change a shopper to **Operator**, reload,
    open a new tab and sign in as them: the console opens, **Users is in the
    sidebar now**, and `/admin/users` shows the same table with the roles as plain
    badges, no **Role** picker, no **Block**/**Delete**, a *View only* marker per
    row, and an *Add user* form that only creates customers. `/checkout` shows the
    staff notice instead of the form. Back as the admin, open that operator and set
    **Customer**: their checkout works again on the very next order, no sign-out.
    Set them to **Administrator**: the console grows the write controls. Your
    *own* row has its role picker, **Block** and **Delete** disabled (the database
    refuses those regardless: `CANNOT_CHANGE_OWN_ROLE`), and so does the last
    remaining administrator (`LAST_ADMIN`).
19. **Block and delete**
    **Block** a customer: they can still browse, but their next sign-in to any
    protected page drops their session at `/login?error=account-disabled`, and
    checkout answers `ACCOUNT_DISABLED`. **Unblock** restores everything.
    Then **Delete** an account that has orders: the account disappears, the orders
    stay (as detached orders, so the revenue figures are unchanged), and the toast
    says so.
20. **Order total = goods + delivery by area**
    At checkout, leave **Inside Dhaka** selected and place a COD order: the order
    card's *Summary* reads **Items**, **Delivery (Inside Dhaka) ৳ 60** and
    **Total**, where the total is the goods *plus* the fee. Switch the radio to
    **Outside Dhaka** and the summary — and the bKash *amount to send* — becomes
    **৳ 120** before you submit. `/account`'s *Lifetime spend* and the dashboard's
    *Revenue* both rise by the fee too (they are sums of `total_amount`).
    Then, as that customer, `PATCH /rest/v1/orders?id=eq.<your order>` with
    `{"shipping_fee": 0}` **or** `{"delivery_area": "outside"}`: the guard answers
    `ORDER_UPDATE_FORBIDDEN`, exactly as it does for `total_amount`.
21. **Share previews, robots and the sitemap**
    `curl -s localhost:3000/robots.txt` blocks `/admin` and `/api/` and points at
    the sitemap. `curl -s localhost:3000/sitemap.xml` lists the home page,
    `/products` and every active product — and nothing private. View the source of
    `/` and `/products/<id>`: both carry `og:image`, `og:url` and `twitter:card`,
    the product one pointing at the product photo. `/cart` carries
    `<meta name="robots" content="noindex, nofollow">`. Once
    `NEXT_PUBLIC_SITE_URL` is the real domain, paste a product link into WhatsApp:
    the card renders with the photo, the title and the description.
22. **Order confirmation e-mail**
    With `RESEND_API_KEY` and `ORDER_FROM_EMAIL` set, place a COD order: the
    confirmation screen appears immediately and the e-mail lands with the same
    *Items / Delivery / Total* breakdown as the order card, plus the tracking
    button. Place a bKash order: the e-mail names the TrxID and reads
    *Awaiting review*. Then unset both variables and order again — the order still
    goes through and nothing is sent (that is the shipped default).
    `node scripts/qa/email-probe.mjs` asserts all of this, and
    `curl -X POST localhost:3000/api/orders/not-a-uuid/notify` answers
    `INVALID_ORDER_ID` (a stranger's order id answers `AUTH_REQUIRED`, the same as
    an unknown one).

---

## 5 · Performance, caching, SEO & hardening

**Navigation feels instant** because every route ships a `loading.tsx` skeleton —
Next streams it the moment a link is clicked, and in-viewport `<Link prefetch>` has
already warmed it. Writes are one round trip; reads are usually served from memory.

Cache layers in `lib/queries.ts`:

| Layer | Effect | Applied to |
| --- | --- | --- |
| React `cache()` | one query per request no matter how many components ask | `getCurrentProfileResult` (root *and* admin layout), `getCategories` (header, footer, page), `getProductById`, `getRelatedProducts` |
| `unstable_cache` + tags | one query per revalidate window *across* requests | product lists (60 s), categories (300 s), storefront counters (120 s) |
| Tag invalidation | a staff write drops the tag immediately | `lib/storefront-refresh.ts` → `POST /api/revalidate` (staff-verified server-side, tag allow-list) |

Catalogue reads go through a **cookie-free** client (`lib/supabase/public.ts`)
because `unstable_cache` executes outside the request scope — the request-scoped
client reads `cookies()`, which would either throw or cache one visitor's session.
Product detail deliberately stays live (an admin must be able to preview a hidden
product), and the PDP plus the admin tables remain realtime over Supabase channels.

**Dark mode** uses `next-themes` (`attribute="class"`, `defaultTheme="system"`,
`disableTransitionOnChange`) with a *Light / Dark / System* switcher in the
storefront header and the admin console. The palette lives in `app/globals.css`:
deep slate/zinc surfaces, hairline `white/10` card borders, a `.media-frame` sheen
behind product images and `.glow-text` for headline type. `darkMode: ['class']` is
already set in `tailwind.config.ts`, and `viewport.themeColor` follows the system
preference.

**Motion is CSS-only and opt-out friendly.** The announcement bar (drifting
`aurora` gradient, sweeping `sheen`, `marquee` text track) and the floating chat
bubbles (`float` + `glow-ring`) are keyframes in `tailwind.config.ts` —
no animation library, and nothing animates a layout property. Every one of them
is switched off under `prefers-reduced-motion`, so the bar keeps a readable static
frame and the bubble simply stops pulsing.

### SEO, share cards and search

Metadata lives in the route segments. Next merges them **shallowly**, so a page
that writes its own `openGraph` drops everything the root layout set — which is
why the shared fields are spread from `lib/seo.ts` instead of repeated.

| Piece | Where | Notes |
| --- | --- | --- |
| Canonical origin | `NEXT_PUBLIC_SITE_URL` via `lib/seo.ts` | trailing slash trimmed once, used everywhere |
| Title template | `app/layout.tsx` | `%s · Nexus Commerce`; the home page keeps the default title |
| Default share card | `public/og-default.png` | 1200×630, re-render with `scripts/make-og-image.ps1` |
| Per-product card | `app/(shop)/products/[id]/page.tsx` | product photo + `og:image:alt`, falling back to the default card |
| `robots.txt` | `app/robots.ts` | blocks `/admin` and `/api/`, advertises the sitemap |
| `sitemap.xml` | `app/sitemap.ts` | home + catalogue + every active product, rebuilt hourly |
| JSON-LD | `lib/structured-data.ts` → `components/seo/json-ld.tsx` | one `@graph` per page: `Organization` + `WebSite` (with a Google sitelinks search box) site-wide; `Product` + `BreadcrumbList` on a PDP. Prices are emitted as `BDT` with `InStock`/`OutOfStock` |
| `noindex` | cart, checkout, account, orders, login, register, forgot/reset password | private and per-visitor pages |

`alternates.canonical` is set **per page**, never in the root layout: a canonical
there would be inherited by every child segment and point the whole site at `/`.
The catalogue canonical deliberately drops its query string so `?q=…&category=…`
filter URLs never compete with `/products`.

Facebook, WhatsApp and other HTML-limited bots read `og:*` from the first
response — Next recognises `facebookexternalhit` and blocks rendering until
`generateMetadata` resolves, so the tags are in the initial HTML even though the
page itself is dynamic.

### Environment & security posture

Server-side hardening is in `next.config.mjs`: `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, a restrictive `Permissions-Policy` and
HSTS (inert over plain HTTP). No `Content-Security-Policy` yet — it needs the
Supabase realtime origin and the image hosts allow-listed first, so a wrong
policy would break the shop rather than protect it.

The `next/image` allow-list is **closed on purpose**: the seeded catalogue
(Unsplash), Google and Facebook avatars, Supabase Storage and `localhost`, instead
of `hostname: '**'`. The optimizer fetches whatever URL it is handed, which is
what every `/_next/image` advisory needs in order to be remotely exploitable
(SSRF, DoS, unbounded cache growth, and an unauthenticated RCE in the AVIF path).
`images.formats` is pinned to `image/webp` so an AVIF source is never handed over
either. Adding a fourth host is a one-line change — see §7.

Two framework notes: `npm audit` reports advisories against the pinned
**`next@14.2.35`**, including two critical ones, and the production image
optimizer warns that `sharp` is not installed. Both are follow-ups in §8.

Secrets: only `NEXT_PUBLIC_*` reaches the browser. `SUPABASE_SERVICE_ROLE_KEY` is
read solely in `lib/supabase/server.ts` and the user-management route, and no
token is committed anywhere in `app/`, `lib/`, `components/` or `supabase/`.

---

## 6 · Deployment (Vercel)

```bash
vercel                     # link the project
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add NEXT_PUBLIC_SITE_URL      # https://your-domain.com
vercel env add SUPABASE_SERVICE_ROLE_KEY # optional: "Add user" on /admin/users
vercel env add RESEND_API_KEY            # optional: order confirmation e-mails
vercel env add ORDER_FROM_EMAIL          # optional: verified sending address
vercel --prod
```

Then in Supabase → **Authentication → URL configuration**, add your production
domain to *Site URL* and *Redirect URLs* (`https://your-domain.com/auth/callback`).
The same URL must be accepted by each OAuth provider: in the Google Cloud console
(or Meta *Facebook Login → Settings*) add
`https://<your-supabase-ref>.supabase.co/auth/v1/callback` as an authorised
redirect URI, then switch the provider on in **Authentication → Providers**.

`NEXT_PUBLIC_SITE_URL` is inlined at **build** time, so set it to the final domain
*before* the first production build — or rerun `vercel --prod` after changing it.
That one value is what the share cards, the canonical tags and `sitemap.xml`
advertise, so a build made with the placeholder ships links pointing at
`localhost:3000`.

---

## 7 · Troubleshooting

| Symptom | Fix |
| --- | --- |
| Dashboard shows “Database not initialised” | Run `0001_init.sql`. |
| New users have no profile row | The `on_auth_user_created` trigger is missing — re-run section 4 of the migration. |
| Realtime updates never arrive | Re-run section 8 (adds the tables to the `supabase_realtime` publication) and make sure Realtime is enabled for the project. |
| Image upload fails | Re-run section 9 — it creates the public `product-images` bucket and its policies. |
| Avatar upload fails / “new row violates row-level security policy” | Run `0006_profile_avatars.sql` — it creates the public `avatars` bucket with owner-only write policies. Uploads must land in `avatars/<your-user-id>/…`. |
| The header shows initials even though the shopper signed in with Google | The trigger ran before `0006` was applied. Run `0006_profile_avatars.sql`: it backfills `avatar_url` from `auth.users` for every profile that has none. |
| *Continue with Google/Facebook* returns to `/login?error=…` | The provider is not enabled (or the redirect URI is missing). Configure it in Supabase → **Authentication → Providers**, and add `https://<ref>.supabase.co/auth/v1/callback` to the provider's allowed redirect list. |
| The password-reset e-mail never arrives | It is sent by **Supabase Auth**, not the Resend order mail — check spam, then the SMTP/sender under Supabase → **Authentication → Emails**. An address with no account gets no mail on purpose, and the screen stays deliberately vague either way. |
| The reset link reports expired, or `/reset-password` shows the dead-link screen | Recovery links are single-use and last an hour. Also allow-list the site: Supabase → **Authentication → URL Configuration** must include both the **Site URL** and `…/auth/callback`, otherwise the callback cannot mint the recovery session. |
| Choosing a new password fails with *Auth session missing* | `/reset-password` was opened directly instead of through the e-mailed link. Send the shopper to `/forgot-password` for a fresh one — the page says this itself. |
| “permission denied for table products” | You are not an admin: run `0003_promote_admin.sql` with your e-mail. |
| Admin panel loads but lists **no orders** (`PGRST200: Could not find a relationship between 'orders' and 'profiles'`) | `orders.user_id` is not pointing at `public.profiles`. Run `0004_fix_orders_profiles_fk.sql`, then reload. |
| New sign-ups are asked to confirm their e-mail / cannot sign in | Run `0005_bkash_payments.sql` (adds `on_auth_user_auto_confirm`). For accounts created earlier: `update auth.users set email_confirmed_at = now() where email_confirmed_at is null;` |
| No **bKash** option at checkout, or `column orders.transaction_id does not exist` | Run `0005_bkash_payments.sql` — it adds the enum value and the column. |
| `verify_payment` returns `NOT_AUTHORIZED` | You are signed in as a customer. Verify with an account whose `profiles.role = 'admin'` (`0003_promote_admin.sql`). |
| Checkout fails with `AUTH_REQUIRED` / *Please sign in to place your order* | Working as intended — an order needs an account. If the shopper **was** signed in, their session had expired; the page redirects them back to sign in. (The sorry path is the page gate, not a form error.) |
| `permission denied for function place_order` | Guest checkout is closed (`0007`). The signed-out surface has no `EXECUTE` on the RPC; sign in first. If a *signed-in* checkout hits this, re-run `0007_require_auth_for_checkout.sql` — it re-grants `EXECUTE` to `authenticated`. |
| A signed-in checkout returns `PROFILE_REQUIRED` | The profile row is missing (a manual user import?). The sign-up trigger creates it; otherwise re-run section 4 of `0001_init.sql` — or `update public.profiles` for the affected id. |
| The storefront shows a stale stock count after an admin edit | The catalogue is cached for 60 s. Confirm `POST /api/revalidate` succeeds (it needs a staff session — admin *or* operator) — the edit itself calls it. |
| `npm run build` fails with `Cannot find module for page: …` or `ENOENT … .nft.json` | A `next dev` server is running in this folder and overwriting `.next`. Stop it, or build with `NEXT_DIST_DIR=.next-build` (see §1). |
| `/admin/users` shows *“The user list came back empty”* | Migrations `0008`–`0010` are not applied. Run `0008_staff_roles.sql` first (it only adds the enum value and the column), then `0009_user_management.sql`, then `0010_operator_scope.sql`. |
| `invalid input value for enum user_role: "operator"` | `0009` ran before `0008`, or both were pasted into one query window: the SQL editor wraps a paste in a single transaction, and Postgres refuses to *use* an enum value added in that same transaction. Run them separately. |
| An operator cannot see *Users* in the console / the RPC answers `NOT_AUTHORIZED` | `0010_operator_scope.sql` is not applied — before it, `admin_list_users()` was administrator-only on purpose. Run it to open the directory to the whole staff; the writes on that page stay administrator-only either way. |
| *Add user* shows “Creating accounts needs the service role key” / the API answers `503 SERVICE_ROLE_REQUIRED` | Set `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` (Supabase → **Settings → API**) and restart. It is server-only and never reaches the browser. Without it, have the person register and promote them from the table — everything else works. |
| A role change answers `CANNOT_CHANGE_OWN_ROLE` | You are changing your own row. Ask another administrator — the same guard covers blocking and deleting yourself. |
| A role change answers `LAST_ADMIN` | That account is the last active administrator. Promote somebody else first, so the shop cannot lock itself out. |
| Delete answers `AUTH_DELETE_FORBIDDEN` | The `postgres` role of this project may not delete from `auth.users`. Add `SUPABASE_SERVICE_ROLE_KEY` and the route finishes the job through the Auth Admin API (the SQL attempt rolls back first, so nothing is half-deleted). |
| A signed-in shopper is thrown back to `/login?error=account-disabled` | Their account is blocked (`profiles.is_active = false`). Unblock it from `/admin/users`. The session is cleared on purpose, which is what lets the message render at all. |
| `/checkout` shows *“Staff/Operator accounts cannot place orders…”* and the cart has no checkout button | Working as intended — that account's role is `operator`. Staff run the shop; they do not buy with the account that runs it. Set the role back to **Customer** on `/admin/users` and checkout returns on the next order, with no sign-out. |
| Checkout answers `STAFF_CANNOT_ORDER` | The same rule, from the database side. This is what a hand-rolled REST call to `place_order()` gets; nothing was priced and no stock moved. |
| *Add user* answers `403 ROLE_NOT_ALLOWED` | An operator tried to create an `operator`/`admin` account. Only an administrator may create staff — creating an account sets its password, so an operator could otherwise mint an admin and sign in as it. Operators add **customers**; an administrator promotes them afterwards. |
| An operator on `/admin/users` sees no **Role** picker, **Block** or **Delete** | Working as intended — those are administrator-only (`is_admin()` in SQL). The list is theirs to read, the writes are not. |
| `column profiles.is_active does not exist` in the middleware log | `0008`/`0009` are not applied yet. The middleware falls back to reading `role` alone, so the staff gates and `/admin/users` already work; the block switch stays dormant until the SQL is in. |
| `column orders.delivery_area does not exist`, or checkout answers `INVALID_DELIVERY_AREA` / `PGRST202` | `0012_delivery_area.sql` is not applied. Run it — it adds the column, teaches the tamper guard about it, and makes `place_order()` charge ৳60/৳120 by area. Until it is applied, checkout fails and nothing is priced. |
| `column orders.shipping_fee does not exist` | `0011_order_totals.sql` is not applied (a fresh install gets it from `0001_init.sql`). Run it — it adds the column, teaches the tamper guard about it, and makes `place_order()` charge the goods **plus** delivery. |
| Every new order total, *Lifetime spend* and *Revenue* figure looks ৳80 light | `0011` is missing: before it, `place_order()` stored the goods only, so the recorded total was short of what the courier collected. After running it, new orders carry the fee; orders placed earlier keep their original number (`shipping_fee = 0`) on purpose — history is never rewritten. |
| Staff still land on the storefront after signing in | Two layers do this: `middleware.ts` sends staff from `/` to `/admin`, and the login form pushes `/admin` when no `?redirectTo` is given. If `profiles.is_active` is missing (`0008` not applied), the middleware reads `role` alone — apply `0008`/`0009` and sign in again. Remember only `/` is restricted: `/products`, `/cart`, `/account` and `/orders` stay open to staff on purpose. |
| The Messenger / WhatsApp bubble is missing on a page you expected it on | They render from the two storefront layouts (`app/(shop)` and `app/(auth)`) and are deliberately hidden on `/admin` and `/checkout`. A new public page nests under `(shop)` to inherit them. |
| A shared link previews as a bare URL, or advertises `localhost:3000` | `NEXT_PUBLIC_SITE_URL` is inlined at **build** time. Set it to the real `https://` origin and rebuild — the Open Graph cards, `<link rel="canonical">` and `sitemap.xml` are all built from it. |
| `/sitemap.xml` lists no products | It reads through the anon client, so RLS hides anything with `products.is_active = false` — activate the product first. The response is cached for an hour (`revalidate = 3600`). |
| A product page has no `og:image` of its own | The product has no `image_url`. The catalogue card (`/og-default.png`) is used instead, so the preview still renders. |
| `og:url` or the canonical tag looks wrong on an inner page | `alternates.canonical` is set per page, never on the root layout (a root canonical would be inherited by every route). If a *new* page needs one, add it to that page's `metadata`. |
| A product image pasted from a new host renders as a broken image | The `next/image` allow-list in `next.config.mjs` is closed on purpose. Add the hostname to `images.remotePatterns` (and restart) — the optimizer answers `400` for anything else, which is what keeps the SSRF/RCE advisories off the table. |
| The confirmation e-mail never arrives | Check the server log. `[email] RESEND_API_KEY is not set` (or `ORDER_FROM_EMAIL`) means mail is simply switched off — set both and restart. `[email] provider rejected the message:` carries Resend's own reason, most often an unverified domain in `ORDER_FROM_EMAIL`. |
| The e-mail arrives twice | Expected on a retry: the route has no "sent" marker, so a second request inside the one-hour freshness window sends again (see §8). |
| `POST /api/orders/<id>/notify` answers `AUTH_REQUIRED` | Working as intended. The call carries the shopper's own session; a stranger's order id answers exactly the same as an unknown one, so it cannot be used to probe for orders. |
| A bKash order's e-mail reads *Awaiting review* | Correct — an unverified transfer has `payment_status = pending_verification` until staff confirm it with `verify_payment()`. |

---

## 8 · Notifications & remaining follow-ups

### 1 · Order confirmation e-mails

Implemented and **dormant until a provider is configured**. The moment
`place_order()` resolves, the checkout form fires
`POST /api/orders/<id>/notify` *without* awaiting it; the route renders
`lib/email/order-confirmation.ts` and hands the result to Resend through
`lib/email/resend.ts`. With no key configured the send is a no-op — the shopper
still gets the confirmation screen (`/orders/<id>?placed=1`) and `/orders`, and
nothing in the checkout path depends on mail being available.

To switch it on, set two **server-side** variables (never `NEXT_PUBLIC_`):

```env
RESEND_API_KEY=re_…                        # Resend → API Keys
ORDER_FROM_EMAIL=orders@your-domain.com    # a domain verified in Resend
```

Decisions worth knowing before touching it:

| Decision | Why |
| --- | --- |
| The transport returns result objects and never throws | a fresh clone has to keep taking orders, so an unconfigured send is a `skipped` result and a provider failure is logged, never surfaced to a shopper |
| The route reads the order with the **caller's own cookies** | RLS decides ownership, so a foreign id and an unknown id get the same 404 — no existence leak, and the service-role key never enters the path |
| Fired *after* `place_order()`, fire-and-forget | a mail failure must never fail or roll back a committed order |
| A one-hour freshness window plus a cancelled-order check | a replayed request cannot mail about ancient history |
| No "sent" column | sending *exactly* once would need a column, a migration and a guard change; one call per checkout covers the normal path, so a client retry inside the hour could send twice |

The template mirrors the on-screen invoice: every line item, *Items / Delivery
(Inside Dhaka) / Total* with the ৳60 or ৳120 fee, payment method and status, the
bKash TrxID, the address, the phone and a tracking button. Shopper-typed fields
are HTML-escaped before they reach the markup, so a name like
`<script>…</script>` arrives as text. A "your order has shipped" note belongs in
the same module when `verify_payment()` or a status change runs.

`scripts/qa/email-probe.mjs` renders both variants (COD and bKash) and asserts
the money, the escaping and the route's guards.

### 2 · Smaller follow-ups

| Item | Why it is not done yet |
| --- | --- |
| **Upgrading Next.js** | `npm audit` flags the pinned `next@14.2.35` with two *critical* advisories plus a dozen others — notably an unauthenticated RCE in the Image Optimization API when AVIF files are used, and one that requires a **Windows**-hosted server (moot on Vercel, live on a Windows VM). The closed image allow-list above removes the practical vector, but the real fix is the upgrade. It is a **major** version jump (React 19, async `cookies()`/`params` in every route), so it deserves its own change with the whole QA suite re-run — not a hardening pass. |
| Installing `sharp` | Production logs *"the optional 'sharp' package is strongly recommended"*. Without it the built-in WASM encoder does the work: slower, and it is the path the AVIF advisory above concerns. One line, `npm i sharp`, and Next picks it up automatically. |
| Google / Facebook social sign-in | The buttons and `/auth/callback` are built and match the provider contract, but each provider has to be switched on in Supabase → **Authentication → Providers** with the callback URI registered. |
| A real support address in the footer | `support@nexuscommerce.dev` is a placeholder — point it at a mailbox somebody actually reads. |
| `Content-Security-Policy` | It needs the Supabase realtime origin, the image hosts and Next's inline runtime allow-listed. The headers already in `next.config.mjs` are the safe subset; a wrong CSP would break the shop rather than protect it. |
| A printable / PDF invoice | The order card and the confirmation e-mail are the invoice — items, delivery, total — but there is no print stylesheet or PDF export. `lib/email/order-confirmation.ts` already renders the whole document as HTML, so a print route can reuse it. |
| Deleting the QA account | `qa.avatar.1792296407@nexuscommerce.dev` is a test login (`role = customer`). Remove it from `/admin/users` — or **Authentication → Users** — before launch. |
| The Messenger bubble target | It opens the profile URL `https://www.facebook.com/md.shawon.982336`, which resolves signed-out. `https://www.messenger.com/t/100061747433746` opens the thread directly but expects a signed-in Messenger session. |

