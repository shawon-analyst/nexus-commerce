-- ============================================================================
--  0006_profile_avatars.sql
--  Incremental upgrade for a database that already ran 0001_init.sql.
--
--  What it adds
--    1. profiles.avatar_url + profiles.shipping_address
--    2. social sign-in: name + picture from Google / Facebook are captured at
--       sign-up by handle_new_user() (via the oauth_avatar_url() helper)
--    3. a one-off backfill of avatars and display names for existing accounts
--    4. an `avatars` Storage bucket with owner-only write policies
--    5. a PostgREST schema-cache reload
--
--  Every statement is idempotent: re-running this file is safe.
--  A fresh install does not need it — 0001_init.sql already contains all of it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. the two new profile columns
-- ---------------------------------------------------------------------------
--  avatar_url       : OAuth picture URL *or* the public URL of an uploaded file
--  shipping_address : default address, offered as a prefill at checkout
alter table public.profiles add column if not exists avatar_url       text;
alter table public.profiles add column if not exists shipping_address text;


-- ---------------------------------------------------------------------------
-- 2. social avatars + name, now synced at sign-up
--    Google puts the picture in `avatar_url` (mirrored to `picture`); Facebook
--    sends `picture` as {"data":{"url":…}}. Two traps are handled here:
--      * `->> 'picture'` on an *object* returns its JSON text, which would win a
--        naive coalesce and store `{"is_silhouette":true}` as the avatar;
--      * anything that is not an http(s) URL is rejected outright.
-- ---------------------------------------------------------------------------
create or replace function public.oauth_avatar_url(meta jsonb)
returns text
language sql
immutable
as $$
  select nullif(trim(candidate), '')
  from (
    select coalesce(
      case when jsonb_typeof(meta -> 'avatar_url') = 'string'
           then meta ->> 'avatar_url' end,
      case when jsonb_typeof(meta -> 'picture' -> 'data' -> 'url') = 'string'
           then meta -> 'picture' -> 'data' ->> 'url' end,
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
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), ''),
    public.oauth_avatar_url(new.raw_user_meta_data),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. backfill — accounts created before this migration (or by a social
--    provider) get their picture adopted. Only rows with a NULL avatar are
--    touched, so a deliberately uploaded picture is never overwritten.
-- ---------------------------------------------------------------------------
update public.profiles p
   set avatar_url = public.oauth_avatar_url(u.raw_user_meta_data)
  from auth.users u
 where u.id = p.id
   and p.avatar_url is null
   and public.oauth_avatar_url(u.raw_user_meta_data) is not null;

-- …and social sign-ups that only ever supplied a `name` get a real display name
-- instead of the e-mail local part the original trigger fell back to.
update public.profiles p
   set full_name = coalesce(
         u.raw_user_meta_data ->> 'full_name',
         u.raw_user_meta_data ->> 'name'
       )
  from auth.users u
 where u.id = p.id
   and u.raw_user_meta_data ? 'name'
   and (p.full_name is null or p.full_name = split_part(coalesce(p.email, ''), '@', 1));


-- ---------------------------------------------------------------------------
-- 4. Storage bucket for uploaded avatars
--    Read is public (the header renders it for everyone); writes are confined
--    to `avatars/<own uid>/…` so nobody can overwrite someone else's picture.
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- 5. PostgREST must learn about the new columns
-- ---------------------------------------------------------------------------
-- The OAuth helper is an internal detail of the sign-up trigger, not API surface.
revoke execute on function public.oauth_avatar_url(jsonb) from public;

notify pgrst, 'reload schema';
