-- ============================================================================
--  0013_remove_facebook_identity.sql
--
--  Facebook sign-in has been removed from the application, and the provider is
--  switched off in Supabase (Authentication → Providers → Facebook). This
--  migration finishes the job in the database by dropping the now-unusable
--  `facebook` rows from `auth.identities`, so no account advertises a login
--  method the app no longer offers and cannot perform.
--
--  Why it is safe
--    * Only rows with `provider = 'facebook'` are touched.
--    * The statement refuses to touch any account whose *only* identity is
--      Facebook — such an account would lose its last way in, and is a case for
--      a human, not a DELETE. (Checked against the live project before this file
--      was written: the single affected account also holds a `google` identity,
--      so the guard is currently a no-op safety net rather than a filter.)
--    * A disabled provider cannot authenticate anything, so leaving these rows
--      in place is not a security hole. Running this is housekeeping — it is
--      what makes "Facebook has been removed" true of the *data*, not just the
--      code and the dashboard.
--
--  Every statement is idempotent: re-running this file is safe.
--
--  Apply with the Supabase SQL editor, like every other file in this directory.
-- ============================================================================

-- ---------------------------------------------------------------- 1. unlink --
-- Drop facebook identities, but never for a user whose only identity it is.
delete from auth.identities i
 where i.provider = 'facebook'
   and exists (
     select 1
       from auth.identities other
      where other.user_id = i.user_id
        and other.provider <> 'facebook'
   );


-- ------------------------------------------------------------------- 2. note --
-- `public.oauth_avatar_url()` deliberately keeps its nested `picture` branch.
-- Rows written while Facebook sign-in existed may still carry that shape, and
-- the function is only consulted at sign-up and on the first sight of an
-- account — leaving it costs nothing and rewriting an applied migration would
-- desynchronise it from the database that already ran it.
