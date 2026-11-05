-- Trip assistant: chat replies, screenshot attachments, and proposals that
-- only apply after the owner confirms them. Additive; safe to run again.
begin;
alter table public.trip_notes add column if not exists author text not null default 'evan';
alter table public.trip_notes add column if not exists attachments text;
alter table public.trip_notes add column if not exists source text;
create index if not exists trip_notes_author_status on public.trip_notes (author, status);

create table if not exists public.trip_proposals (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  trip_slug text references public.trips(slug), -- null for portal-wide finds
  title text not null,
  body text,
  kind text not null default 'info' check (kind in ('plan_change','idea','event','deal','price_drop','bonus','info')),
  changes text, -- JSON list of proposed changes, see src/lib/proposals.ts
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  author text,
  url text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  feedback text
);
create index if not exists trip_proposals_status on public.trip_proposals (status, trip_slug);
alter table public.trip_proposals enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trip_proposals' and policyname='owner_access') then
    create policy owner_access on public.trip_proposals for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
  end if;
end $$;

-- Private bucket for note screenshots. Files live under <user id>/<trip>/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-notes', 'trip-notes', false, 10485760,
        array['image/png','image/jpeg','image/webp','image/gif','image/heic','image/heif'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='trip_notes_owner_read') then
    create policy trip_notes_owner_read on storage.objects for select to authenticated
      using (bucket_id = 'trip-notes' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='trip_notes_owner_insert') then
    create policy trip_notes_owner_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'trip-notes' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='trip_notes_owner_delete') then
    create policy trip_notes_owner_delete on storage.objects for delete to authenticated
      using (bucket_id = 'trip-notes' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
commit;
