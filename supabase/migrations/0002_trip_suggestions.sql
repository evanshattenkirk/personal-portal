-- Personal Portal: trip suggestions (flights, food, activities, stays).
-- Rows are curated picks per trip, written by Evan or by Muse from live
-- research; the trip page groups them by category. Same single-user RLS
-- owner pattern as 0001_init.sql.
-- Apply with the Supabase SQL editor or `supabase db push`.

create table if not exists public.trip_suggestions (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_slug text not null references public.trips (slug) on delete cascade,
  category text not null
    check (category in ('flight', 'food', 'activity', 'stay')),
  title text not null,
  subtitle text,
  detail text,
  price_label text,
  url text,
  source text,
  status text not null default 'suggested'
    check (status in ('suggested', 'saved', 'booked', 'dismissed')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists trip_suggestions_trip_slug_idx
  on public.trip_suggestions (trip_slug);

alter table public.trip_suggestions enable row level security;

drop policy if exists trip_suggestions_select_own on public.trip_suggestions;
drop policy if exists trip_suggestions_insert_own on public.trip_suggestions;
drop policy if exists trip_suggestions_update_own on public.trip_suggestions;
drop policy if exists trip_suggestions_delete_own on public.trip_suggestions;

create policy trip_suggestions_select_own on public.trip_suggestions
  for select using (auth.uid() = user_id);
create policy trip_suggestions_insert_own on public.trip_suggestions
  for insert with check (auth.uid() = user_id);
create policy trip_suggestions_update_own on public.trip_suggestions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy trip_suggestions_delete_own on public.trip_suggestions
  for delete using (auth.uid() = user_id);
