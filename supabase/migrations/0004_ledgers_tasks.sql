-- Personal Portal: ledgers + tasks
-- ledgers/ledger_entries power the Ledgers section (Hard Rock Bet, Robinhood).
-- tasks is a synced, filtered mirror of the Linear KIR board: Evan's portal
-- shows "needs you" items first, agent-owned work below. Synced by Muse.
-- Apply with the Supabase SQL editor or `supabase db push`.

create table if not exists public.ledgers (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null unique,
  name text not null,
  icon text,
  total_in numeric,
  total_out numeric,
  net numeric,
  net_label text,
  balance_label text,
  balance_value numeric,
  entries_count integer,
  as_of text,
  summary text,
  sort_order integer not null default 0
);

create table if not exists public.ledger_entries (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  ledger_slug text not null references public.ledgers (slug) on delete cascade,
  entry_date date not null,
  direction text not null check (direction in ('in', 'out')),
  amount numeric not null,
  fee numeric,
  note text,
  sort_order integer not null default 0
);
create index if not exists ledger_entries_slug_date_idx
  on public.ledger_entries (ledger_slug, entry_date);

create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  external_id text not null,
  title text not null,
  status text not null,
  status_type text,
  owner_label text,
  needs_evan boolean not null default false,
  action_note text,
  due_date date,
  url text,
  source_updated_at timestamptz,
  sort_order integer not null default 0
);

alter table public.ledgers enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.tasks enable row level security;

drop policy if exists ledgers_select_own on public.ledgers;
drop policy if exists ledgers_insert_own on public.ledgers;
drop policy if exists ledgers_update_own on public.ledgers;
drop policy if exists ledgers_delete_own on public.ledgers;
create policy ledgers_select_own on public.ledgers
  for select using (auth.uid() = user_id);
create policy ledgers_insert_own on public.ledgers
  for insert with check (auth.uid() = user_id);
create policy ledgers_update_own on public.ledgers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy ledgers_delete_own on public.ledgers
  for delete using (auth.uid() = user_id);

drop policy if exists ledger_entries_select_own on public.ledger_entries;
drop policy if exists ledger_entries_insert_own on public.ledger_entries;
drop policy if exists ledger_entries_update_own on public.ledger_entries;
drop policy if exists ledger_entries_delete_own on public.ledger_entries;
create policy ledger_entries_select_own on public.ledger_entries
  for select using (auth.uid() = user_id);
create policy ledger_entries_insert_own on public.ledger_entries
  for insert with check (auth.uid() = user_id);
create policy ledger_entries_update_own on public.ledger_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy ledger_entries_delete_own on public.ledger_entries
  for delete using (auth.uid() = user_id);

drop policy if exists tasks_select_own on public.tasks;
drop policy if exists tasks_insert_own on public.tasks;
drop policy if exists tasks_update_own on public.tasks;
drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_select_own on public.tasks
  for select using (auth.uid() = user_id);
create policy tasks_insert_own on public.tasks
  for insert with check (auth.uid() = user_id);
create policy tasks_update_own on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tasks_delete_own on public.tasks
  for delete using (auth.uid() = user_id);
