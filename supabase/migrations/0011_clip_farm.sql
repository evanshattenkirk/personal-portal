-- Clip Farm: campaigns, social accounts, clips and payouts for the /clips
-- dashboard. Additive and safe to run more than once. The rest of the portal
-- keeps working before this runs; /clips shows a "run the migration" notice.

create table if not exists public.clip_campaigns (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  source text not null default 'Content Rewards',
  kind text not null default 'cpm' check (kind in ('cpm', 'pool', 'platform')),
  status text not null default 'watching'
    check (status in ('watching', 'applied', 'active', 'paused', 'ended')),
  cpm numeric,
  min_payout numeric,
  max_payout numeric,
  fee_pct numeric not null default 10,
  budget_total numeric,
  budget_used numeric,
  budget_checked_at timestamptz,
  active_clippers integer,
  pool_views_required bigint,
  platforms text[] not null default '{}',
  earn_days integer not null default 7,
  hold_days integer not null default 3,
  no_ai boolean not null default false,
  opens_on date,
  ends_on date,
  url text,
  rules text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.clip_accounts (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  handle text not null,
  platform text not null
    check (platform in ('tiktok', 'instagram', 'youtube', 'facebook', 'x')),
  theme text not null default '',
  status text not null default 'warming'
    check (status in ('warming', 'active', 'paused', 'killed')),
  followers integer,
  views30d bigint,
  views90d bigint,
  stats_as_of timestamptz,
  url text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.clips (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null,
  hook text,
  format text,
  campaign_id text references public.clip_campaigns (id) on delete set null,
  account_id text references public.clip_accounts (id) on delete set null,
  status text not null default 'review'
    check (status in ('review', 'approved', 'posted', 'submitted', 'rejected', 'archived')),
  verdict text check (verdict in ('pass', 'warn', 'fail')),
  check_notes text,
  source_url text,
  source_at text,
  preview_url text,
  duration_sec integer,
  caption text,
  fingerprint text,
  post_url text,
  posted_at timestamptz,
  submitted_at timestamptz,
  review text not null default 'pending'
    check (review in ('pending', 'accepted', 'denied')),
  approved_at timestamptz,
  views bigint not null default 0,
  views24h bigint,
  likes bigint not null default 0,
  comments bigint not null default 0,
  shares bigint not null default 0,
  stats_as_of timestamptz,
  reject_reason text,
  created_at timestamptz not null default now()
);
create index if not exists clips_user_status on public.clips (user_id, status);
create index if not exists clips_fingerprint on public.clips (user_id, fingerprint);

create table if not exists public.clip_payouts (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  source text not null default 'Content Rewards',
  campaign_id text references public.clip_campaigns (id) on delete set null,
  amount numeric not null,
  status text not null default 'pending'
    check (status in ('pending', 'hold', 'withdrawable', 'paid')),
  available_on date,
  paid_on date,
  note text,
  created_at timestamptz not null default now()
);

-- Same walls as every other table: per-user rows, plus the owner-only
-- restrictive policy from 0009, and no anon access.
do $$
declare
  t text;
begin
  foreach t in array array['clip_campaigns', 'clip_accounts', 'clips', 'clip_payouts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format(
      'create policy own_rows on public.%I for all to authenticated '
      'using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
    execute format('drop policy if exists owner_only on public.%I', t);
    execute format(
      'create policy owner_only on public.%I as restrictive for all to public '
      'using (public.portal_is_owner()) with check (public.portal_is_owner())',
      t
    );
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end;
$$;
