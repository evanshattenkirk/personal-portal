-- Owner-only accounts. Google sign-in can create a Supabase user for any
-- Google account; this trigger refuses every new auth user except the owner,
-- so a stranger can't even get an empty account. Existing users are untouched.
-- Change the address here if the owner email ever changes.
create or replace function public.portal_only_owner_signups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.email, '')) not in ('shattenkirke@gmail.com') then
    raise exception 'Sign-ups are closed for this portal.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists portal_only_owner_signups on auth.users;
create trigger portal_only_owner_signups
  before insert on auth.users
  for each row execute function public.portal_only_owner_signups();
