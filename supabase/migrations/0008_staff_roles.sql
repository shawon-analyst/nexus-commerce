-- ===========================================================================
-- 0008 — staff roles: the `operator` label and the account-enabled flag
-- ===========================================================================
--
-- WHY
--   A two-role model (`admin` / `customer`) is too coarse once more than one
--   person runs the shop: an assistant has to work the order queue and the
--   inventory without being able to grant themselves more power. This file only
--   *adds* schema — it changes no behaviour on its own:
--
--     1. `user_role` gains the label `operator` — a member of staff who may run
--        orders, products and categories, but who can never touch users or roles.
--        Nothing is granted by this label yet; 0009 adds the helpers
--        (`is_staff()`), the policies and the RPCs that read it.
--     2. `profiles.is_active` — `false` blocks an account. 0009 is what enforces
--        it (middleware, `place_order()`), and what stops a blocked shopper from
--        simply flipping the flag back on their own row.
--
-- WHY IT IS SPLIT FROM 0009
--   PostgreSQL refuses to *use* a brand-new enum label in the same transaction
--   that adds it ("unsafe use of new value … of enum type"), and the Supabase SQL
--   editor runs a whole script as one implicit transaction. Adding the label here
--   and using it there keeps both files safe to paste, in order.
--   A fresh install gets everything at once: `0001_init.sql` declares the three
--   labels up front — in the same order this ADD VALUE produces, so an upgraded
--   database and a brand-new one are byte-for-byte identical.
--
-- Idempotent: safe to run twice, and on top of a database at 0001–0007.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. user_role: append the `operator` label
-- ---------------------------------------------------------------------------
-- Appended (not inserted) deliberately: `ADD VALUE` can only append, and enum
-- order carries no meaning here — roles are only ever compared for equality.
alter type public.user_role add value if not exists 'operator';

-- ---------------------------------------------------------------------------
-- 2. profiles: the account-enabled flag
-- ---------------------------------------------------------------------------
-- `not null default true` backfills every existing row in one pass, so nothing
-- changes for the accounts that already exist.
alter table public.profiles add column if not exists is_active boolean not null default true;

-- ---------------------------------------------------------------------------
-- 3. indexes
-- ---------------------------------------------------------------------------
-- Listing "all the operators" and checking "is there another active admin?"
-- both scan by role; the table is small, but this keeps it O(log n) as the shop
-- grows and costs nothing to maintain.
create index if not exists profiles_role_idx on public.profiles(role);

-- ---------------------------------------------------------------------------
-- 4. tell PostgREST about the new column + enum label
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
