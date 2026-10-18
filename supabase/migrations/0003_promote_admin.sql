-- ============================================================================
--  0003_promote_admin.sql
--  Creates the first administrator.
--
--  HOW TO USE
--  1. Start the app (`npm run dev`) and register normally at /register
--     — or add the user in Dashboard -> Authentication -> Users -> Add user.
--  2. Put that email in the query below and run this file.
--  3. Log in and open /admin
-- ============================================================================

update public.profiles
   set role = 'admin'
 where lower(email) = lower('idris.shawon@gmail.com');   -- <-- CHANGE THIS EMAIL

-- Optional: also treat the account as verified so no confirmation e-mail is needed
-- update auth.users set email_confirmed_at = now() where lower(email) = lower('admin@example.com');

-- Verify ---------------------------------------------------------------------
select id, email, full_name, role, created_at
from public.profiles
order by created_at;
