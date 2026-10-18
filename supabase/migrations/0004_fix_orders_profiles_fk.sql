-- ============================================================================
--  0004_fix_orders_profiles_fk.sql   ·   ONE-OFF REPAIR  (run once)
--
--  SYMPTOM
--    Admin dashboard + /admin/orders render with "No orders yet" even though
--    orders exist, and the browser console / server log shows:
--      PGRST200 "Could not find a relationship between 'orders' and 'profiles'"
--
--  CAUSE
--    The admin order console embeds the customer with
--      .select('*, order_items(*), profiles(full_name, email)')
--    PostgREST needs a FOREIGN KEY on orders.user_id -> public.profiles(id).
--    `create table if not exists` keeps an existing table as-is, so a database
--    created by an earlier revision of 0001_init.sql can still point
--    orders.user_id at auth.users(id) — and auth is not an exposed schema.
--
--  This is exactly the §2.7 block of 0001_init.sql, packaged on its own so an
--  existing database can be repaired without re-running the whole migration.
--  Safe to re-run (idempotent).
-- ============================================================================

-- 1. every auth user gets a profile, so the constraint can be validated ------
insert into public.profiles (id, email, full_name, role)
select u.id,
       coalesce(u.email, ''),
       coalesce(u.raw_user_meta_data ->> 'full_name', split_part(coalesce(u.email, ''), '@', 1)),
       'customer'
from auth.users u
on conflict (id) do nothing;

-- 2. detach whatever single-column FK currently sits on orders.user_id -------
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
    raise notice 'dropping old foreign key %', v_con;
    execute format('alter table public.orders drop constraint %I', v_con);
  end loop;
end $$;

-- 3. an order whose owner has no profile becomes a guest order --------------
update public.orders o
   set user_id = null
 where o.user_id is not null
   and not exists (select 1 from public.profiles p where p.id = o.user_id);

-- 4. the constraint PostgREST needs in order to embed the customer ----------
alter table public.orders
  add constraint orders_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

-- 5. tell PostgREST to refresh its schema cache -----------------------------
notify pgrst, 'reload schema';

-- Verify ---------------------------------------------------------------------
-- Expect exactly one row: orders.user_id -> profiles.id
select c.conname                     as constraint_name,
       src.relname                   as table_name,
       (select attname from pg_attribute
         where attrelid = c.conrelid and attnum = c.conkey[1]) as column_name,
       tgt.relname                   as references_table,
       (select attname from pg_attribute
         where attrelid = c.confrelid and attnum = c.confkey[1]) as references_column
from pg_constraint c
join pg_class src on src.oid = c.conrelid
join pg_class tgt on tgt.oid = c.confrelid
join pg_namespace n on n.oid = src.relnamespace
where n.nspname = 'public'
  and c.contype = 'f'
  and src.relname = 'orders'
  and tgt.relname = 'profiles';
