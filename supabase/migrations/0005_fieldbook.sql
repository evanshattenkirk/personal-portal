-- Fieldbook: additive migration. Preserve every original record and reference.
begin;
alter table public.trips add column if not exists selected_scenario_id text;
alter table public.bookings add column if not exists status text not null default 'needs_review' check(status in ('needs_review','awaiting_confirmation','confirmed','cancelled'));
alter table public.bookings add column if not exists confirmation_checked_at date;
alter table public.bookings add column if not exists cancel_at timestamptz;
alter table public.bookings add column if not exists credits_posted numeric(12,2) not null default 0 check(credits_posted>=0);
alter table public.bookings add column if not exists source_suggestion_id text;
alter table public.trip_suggestions add column if not exists scenario_id text;
alter table public.trip_suggestions add column if not exists item_type text not null default 'idea' check(item_type in ('idea','task','reference'));
alter table public.trip_suggestions add column if not exists verification text not null default 'needs_recheck' check(verification in ('modeled','needs_recheck','checked'));
alter table public.trip_suggestions add column if not exists checked_at date;
alter table public.deadlines add column if not exists snoozed_until date;
alter table public.deadlines add column if not exists trip_slug text;
alter table public.points_balances add column if not exists earmarked int not null default 0 check(earmarked>=0);
alter table public.points_balances add column if not exists trip_slug text;
alter table public.links add column if not exists pinned boolean not null default false;
alter table public.links add column if not exists location text;
create table if not exists public.portal_tasks (
 id text primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null, trip_slug text references public.trips(slug), booking_id text references public.bookings(id),
 due_date date, status text not null default 'todo' check(status in ('todo','waiting','done')), notes text, snoozed_until date
);
create table if not exists public.trip_scenarios (
 id text primary key,user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 trip_slug text not null references public.trips(slug), title text not null,destination text not null,start_date date,end_date date,
 summary text,points_estimate text,cash_estimate text,availability text not null default 'modeled' check(availability in ('modeled','needs_recheck','checked')),
 checked_at date,notes text,status text not null default 'considering' check(status in ('considering','selected','ruled_out')),check(end_date>=start_date)
);
create table if not exists public.itinerary_items (
 id text primary key,user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 trip_slug text not null references public.trips(slug),date date not null,time text,title text not null,location text,notes text,
 booking_id text references public.bookings(id),kind text not null default 'plan' check(kind in ('plan','reservation')),status text not null default 'planned' check(status in ('planned','removed'))
);
create table if not exists public.credit_periods (
 id text primary key,user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null,period text not null,"limit" numeric(12,2) not null,used numeric(12,2) not null default 0,posted numeric(12,2) not null default 0,
 reset_date date not null,notes text,check(posted>=0 and used>=posted and "limit">=used)
);
do $$ declare t text; begin
 foreach t in array array['portal_tasks','trip_scenarios','itinerary_items','credit_periods'] loop
 execute format('alter table public.%I enable row level security',t);
 if not exists(select 1 from pg_policies where schemaname='public' and tablename=t and policyname='owner_access') then
 execute format('create policy owner_access on public.%I for all using (auth.uid()=user_id) with check (auth.uid()=user_id)',t);
 end if;
 end loop;
end $$;
-- Existing data stays in Supabase. No personal trip content is bundled in migrations.
commit;
