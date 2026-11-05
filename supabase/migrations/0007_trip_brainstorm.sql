-- Trip brainstorming: notes for your AI, a per-trip brief, and idea tags.
-- Additive and safe to run more than once. The portal keeps working before it
-- runs; notes and the brief just can't be saved until it does.
begin;
alter table public.trip_suggestions add column if not exists tags text;
create table if not exists public.trip_notes (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_slug text not null references public.trips(slug),
  body text not null,
  kind text not null default 'note' check (kind in ('note','ask_ai','preference')),
  status text not null default 'open' check (status in ('open','done')),
  ai_reply text,
  created_at timestamptz not null default now()
);
create index if not exists trip_notes_trip_status on public.trip_notes (trip_slug, status);
create table if not exists public.trip_briefs (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_slug text not null unique references public.trips(slug),
  "window" text,
  nights text,
  styles text,
  vibes text,
  avoid text,
  budget text,
  origin text,
  who text,
  must_haves text
);
do $$ declare t text; begin
  foreach t in array array['trip_notes','trip_briefs'] loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='owner_access') then
      execute format('create policy owner_access on public.%I for all using (auth.uid()=user_id) with check (auth.uid()=user_id)', t);
    end if;
  end loop;
end $$;
commit;
