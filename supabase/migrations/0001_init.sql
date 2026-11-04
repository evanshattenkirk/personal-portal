-- Personal Portal: initial schema.
-- Single-user app. Every row carries user_id (defaults to the signed-in
-- user), and RLS policies restrict all access to rows the user owns.
-- Apply with the Supabase SQL editor or `supabase db push`.

create table if not exists public.trips (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug text not null unique,
  name text not null,
  destination text not null,
  start_date date,
  end_date date,
  date_label text not null,
  status text not null default 'planning'
    check (status in ('booked', 'researching', 'planning', 'completed')),
  travelers int,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_slug text not null references public.trips (slug) on delete cascade,
  kind text not null default 'other'
    check (kind in ('hotel', 'flight', 'car', 'activity', 'other')),
  name text not null,
  provider text not null,
  start_date date not null,
  end_date date not null,
  details text not null default '',
  confirmation text,
  secondary_ref text,
  cost_paid numeric(12, 2),
  cost_net numeric(12, 2),
  cost_note text,
  points_cost int,
  points_program text,
  cancel_by text,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.deadlines (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  due_date date not null,
  status text not null default 'open'
    check (status in ('open', 'done', 'watching')),
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.points_balances (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  program text not null,
  balance int not null default 0,
  owner text not null default 'Evan',
  approximate boolean not null default false,
  as_of date not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.links (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  url text,
  description text not null default '',
  category text not null default 'Links',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists bookings_trip_slug_idx on public.bookings (trip_slug);
create index if not exists deadlines_due_date_idx on public.deadlines (due_date);

-- Row level security: enabled on every table, single-user owner policies.
alter table public.trips enable row level security;
alter table public.bookings enable row level security;
alter table public.deadlines enable row level security;
alter table public.points_balances enable row level security;
alter table public.links enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['trips', 'bookings', 'deadlines', 'points_balances', 'links']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format(
      'create policy %I on public.%I for select using (auth.uid() = user_id)',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert with check (auth.uid() = user_id)',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete using (auth.uid() = user_id)',
      t || '_delete_own', t);
  end loop;
end $$;
