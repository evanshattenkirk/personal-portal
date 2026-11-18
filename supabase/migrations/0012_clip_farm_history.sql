-- Clip Farm v1.1: stats history and experiments. Additive, safe to re-run.
-- Requires 0011_clip_farm.sql. Before this runs, /clips keeps working and
-- simply shows no runway, pace or refit numbers.

-- One row each time a clip's views are recorded (pipeline or by hand).
-- Feeds the day-7 projection refit and pool pace.
create table if not exists public.clip_snapshots (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  clip_id text not null references public.clips (id) on delete cascade,
  captured_at timestamptz not null default now(),
  views bigint not null
);
create index if not exists clip_snapshots_clip_time
  on public.clip_snapshots (user_id, clip_id, captured_at);

-- One row each time a campaign's budget is checked. Feeds burn rate and runway.
create table if not exists public.campaign_snapshots (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  campaign_id text not null references public.clip_campaigns (id) on delete cascade,
  captured_at timestamptz not null default now(),
  budget_used numeric not null,
  active_clippers integer
);
create index if not exists campaign_snapshots_campaign_time
  on public.campaign_snapshots (user_id, campaign_id, captured_at);

-- Experiments: which variable a clip tests and which arm it's in.
alter table public.clips add column if not exists experiment text;
alter table public.clips add column if not exists variant text;

-- Posting cap per account per day (null = the platform default).
alter table public.clip_accounts add column if not exists daily_cap integer;

do $$
declare
  t text;
begin
  foreach t in array array['clip_snapshots', 'campaign_snapshots']
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

-- Private bucket for clip previews the pipeline uploads, so the review card
-- can play a cut on Evan's phone. Files live at <user id>/<clip id>.mp4.
-- The pipeline uploads through signed URLs; the portal hands out short-lived
-- signed read URLs after checking the owner session.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clip-previews', 'clip-previews', false, 52428800, array['video/mp4'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists clip_previews_owner_read on storage.objects;
create policy clip_previews_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'clip-previews' and (storage.foldername(name))[1] = auth.uid()::text);
