-- Owner lockdown: a second wall behind the per-user RLS policies.
-- Safe to run more than once.
--
-- 1. Turn on RLS for every table in public, including any added outside
--    these migrations.
-- 2. Add a RESTRICTIVE policy to each of them: whatever other policies say,
--    a row is visible or writable only when the signed-in user's verified
--    email is the owner's. A stray account, an anonymous session or a
--    leaked anon key sees nothing.
-- 3. Take table access away from the anon role. The app never reads data
--    while signed out.
-- 4. Make every storage bucket private and owner-only. The trip-notes
--    screenshot bucket (0008) is already private; its per-folder policies
--    still apply, and this adds the owner-email wall on top.
-- 5. Keep the sign-up guard function from being called directly.

create or replace function public.portal_is_owner()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(lower(auth.jwt() ->> 'email'), '') = 'shattenkirke@gmail.com'
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

do $$
declare
  t text;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists owner_only on public.%I', t);
    execute format(
      'create policy owner_only on public.%I as restrictive for all to public '
      'using (public.portal_is_owner()) with check (public.portal_is_owner())',
      t
    );
    execute format('revoke all on table public.%I from anon', t);
  end loop;
end;
$$;

-- Tables created later also start with no anon access.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Storage: no public buckets, and objects only for the owner.
update storage.buckets set public = false where public;
drop policy if exists portal_owner_only on storage.objects;
create policy portal_owner_only on storage.objects
  as restrictive for all to public
  using (public.portal_is_owner())
  with check (public.portal_is_owner());

-- The sign-up guard is a trigger function only.
revoke execute on function public.portal_only_owner_signups() from public, anon, authenticated;
