-- ============================================================================
-- Fluence — Hub schema (Park, Resources, Attendance, Teaching Summary)
--
-- Additive: run this AFTER supabase/schema.sql. It does not touch students,
-- daily_points, trophy_winners or app_settings.
--
-- Paste into: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run.
-- ============================================================================

-- pg_trgm is enabled ready for the search indexes described further down; it
-- costs nothing while unused. Wrapped because a restricted project may refuse
-- the extension, and that must not stop the rest of the schema installing.
-- Into `extensions`, not `public`: an extension in the exposed schema puts its
-- functions on the Data API surface, which is what the database linter flags.
do $$
begin
  create extension if not exists pg_trgm with schema extensions;
exception when others then
  raise notice 'pg_trgm unavailable (%).', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- 1. THE PARK TREE  (board -> class -> subject -> chapter)
--
-- Only the shape lives here. The actual syllabus is data you fill in from the
-- app, not something hardcoded in a migration.
-- ---------------------------------------------------------------------------

create table if not exists public.boards (
  id         text primary key,              -- 'CBSE', 'CG'
  name       text not null,
  sort_order integer not null default 0
);

create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  board_id    text not null references public.boards(id) on delete cascade,
  class_level integer not null check (class_level between 1 and 12),
  name        text not null,
  sort_order  integer not null default 0,
  -- One "Science" per board per class.
  unique (board_id, class_level, name)
);

create index if not exists subjects_board_class_idx
  on public.subjects (board_id, class_level, sort_order);

create table if not exists public.chapters (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  number     integer,                       -- chapter number, nullable for extras
  name       text not null,
  sort_order integer not null default 0
);

create index if not exists chapters_subject_idx
  on public.chapters (subject_id, sort_order, number);

-- ---------------------------------------------------------------------------
-- 2. RESOURCES — one table behind every content tool
--
-- Notes, Games, Notices, videos, PDFs and homework are all rows here. The Hub
-- tools filter by `kind`; Park filters by `chapter_id`. Same data, two routes
-- through it — which is why adding a tool later costs a filter, not a table.
-- ---------------------------------------------------------------------------

create table if not exists public.resources (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('note', 'game', 'notice', 'video', 'pdf', 'link', 'homework')),
  title       text not null,
  description text,
  url         text,
  body        text,                          -- for notes written inline, no link

  -- Placement in the Park tree. All nullable: a notice belongs nowhere in the
  -- syllabus, and a resource can sit at subject level without a chapter.
  board_id    text references public.boards(id)   on delete set null,
  class_level integer check (class_level between 1 and 12),
  subject_id  uuid references public.subjects(id) on delete set null,
  chapter_id  uuid references public.chapters(id) on delete set null,

  -- null branch = shown to both branches.
  branch      text check (branch in ('Mangla', 'Sarkanda')),

  due_date    date,                          -- homework
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists resources_kind_idx    on public.resources (kind, created_at desc);
create index if not exists resources_chapter_idx on public.resources (chapter_id);
create index if not exists resources_subject_idx on public.resources (subject_id);
create index if not exists resources_due_idx     on public.resources (due_date) where due_date is not null;
create index if not exists resources_pinned_idx  on public.resources (pinned) where pinned;

-- No search index, deliberately.
--
-- An earlier version indexed the expression (title || ' ' || description) with
-- trigrams. Nothing could use it: the client filters the columns separately, and
-- an expression index only serves a query filtering on that same expression. It
-- charged GIN maintenance on every write and returned nothing.
--
-- Search is also done in memory today — both callers of fetchResources omit the
-- search argument — which is the right call for a few hundred items. Once the
-- library passes roughly two thousand, wire the search argument through and add
-- either per-column trigram indexes or a stored tsvector. 08_cleanup.sql spells
-- out both.

-- ---------------------------------------------------------------------------
-- 3. ATTENDANCE
--
-- Deliberately the same shape as daily_points: one row per student per day.
-- ---------------------------------------------------------------------------

create table if not exists public.attendance (
  id         text primary key,               -- "<student_id>_<YYYY-MM-DD>"
  student_id text not null references public.students(id) on delete cascade,
  date       date not null,
  status     text not null check (status in ('present', 'absent', 'late')),
  note       text,
  updated_at timestamptz not null default now(),
  unique (student_id, date)
);

create index if not exists attendance_date_idx    on public.attendance (date);
create index if not exists attendance_student_idx on public.attendance (student_id);

-- ---------------------------------------------------------------------------
-- 4. TEACHING SUMMARY (voice log)
--
-- Teacher-only, in both directions: students cannot read this table at all.
-- The ai_* columns are empty on purpose — they are where an n8n workflow or a
-- Whisper/LLM pass writes back later, so the future SRS app has a place to put
-- its output without a migration. Nothing in the app writes them today.
-- ---------------------------------------------------------------------------

create table if not exists public.class_summaries (
  id               uuid primary key default gen_random_uuid(),
  date             date not null default current_date,
  branch           text check (branch in ('Mangla', 'Sarkanda')),
  subject_id       uuid references public.subjects(id) on delete set null,
  chapter_id       uuid references public.chapters(id) on delete set null,

  transcript       text,                     -- speech-to-text result, editable
  audio_path       text,                     -- object path in the class-audio bucket
  duration_seconds integer,

  -- Reserved for downstream AI processing.
  ai_processed_at  timestamptz,
  ai_summary       text,
  ai_topics        jsonb,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists class_summaries_date_idx on public.class_summaries (date desc);
create index if not exists class_summaries_unprocessed_idx
  on public.class_summaries (created_at) where ai_processed_at is null;

-- ---------------------------------------------------------------------------
-- 4b. BOOKMARKS
--
-- Keyed by student, with no student login: the app remembers which name was
-- picked on that device. See the RLS note below — this is the one table
-- anonymous visitors may write to, and it is scoped so that is harmless.
-- ---------------------------------------------------------------------------

create table if not exists public.student_bookmarks (
  id          text primary key,              -- "<student_id>_<resource_id>"
  student_id  text not null references public.students(id)  on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (student_id, resource_id)
);

create index if not exists student_bookmarks_student_idx
  on public.student_bookmarks (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
--
-- Same model as the scoreboard: anyone may read, only the signed-in teacher
-- may write. class_summaries is the exception — teacher-only to read as well.
-- ---------------------------------------------------------------------------

alter table public.boards            enable row level security;
alter table public.subjects          enable row level security;
alter table public.chapters          enable row level security;
alter table public.resources         enable row level security;
alter table public.attendance        enable row level security;
alter table public.class_summaries   enable row level security;
alter table public.student_bookmarks enable row level security;

-- Publicly readable, teacher-writable.
do $$
declare
  t text;
begin
  foreach t in array array['boards', 'subjects', 'chapters', 'resources', 'attendance']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_read',   t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    execute format('create policy %I on public.%I for select to anon, authenticated using (true)',
                   t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (true)',
                   t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)',
                   t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (true)',
                   t || '_delete', t);
  end loop;
end $$;

-- Teacher-only, including reads.
drop policy if exists class_summaries_all on public.class_summaries;
create policy class_summaries_all on public.class_summaries
  for all to authenticated using (true) with check (true);

-- Bookmarks: the one place anonymous visitors may write.
--
-- Students have no login, so the app cannot prove which student is asking —
-- anyone could in principle add or remove a bookmark under someone else's
-- name. That is acceptable precisely because of what this table is: two
-- foreign keys and a timestamp, holding no private information and affecting
-- nothing but one person's shortcut list. Update is not granted (a bookmark
-- is only ever created or removed), and the shape means it cannot be used to
-- store arbitrary data. Nothing else in the schema is open like this.
drop policy if exists student_bookmarks_read   on public.student_bookmarks;
drop policy if exists student_bookmarks_insert on public.student_bookmarks;
drop policy if exists student_bookmarks_delete on public.student_bookmarks;

create policy student_bookmarks_read on public.student_bookmarks
  for select to anon, authenticated using (true);
create policy student_bookmarks_insert on public.student_bookmarks
  for insert to anon, authenticated with check (true);
create policy student_bookmarks_delete on public.student_bookmarks
  for delete to anon, authenticated using (true);

-- ---------------------------------------------------------------------------
-- 6. REALTIME
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['boards', 'subjects', 'chapters', 'resources',
                           'attendance', 'class_summaries', 'student_bookmarks']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

alter table public.resources  replica identity full;
alter table public.attendance replica identity full;

-- ---------------------------------------------------------------------------
-- 7. STORAGE for the raw voice recordings
--
-- Private bucket: the audio is reachable only through a signed URL the
-- teacher's session requests, never by a public link.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'class-audio', 'class-audio', false,
  52428800,   -- 50 MB per clip
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
)
on conflict (id) do nothing;

do $$
begin
  drop policy if exists class_audio_teacher_all on storage.objects;
  create policy class_audio_teacher_all on storage.objects
    for all to authenticated
    using (bucket_id = 'class-audio')
    with check (bucket_id = 'class-audio');
exception when insufficient_privilege then
  raise notice 'Could not create the storage policy from SQL. Add it under Storage -> class-audio -> Policies instead.';
end $$;

-- ---------------------------------------------------------------------------
-- 8. SEED — the two boards only
--
-- Classes, subjects and chapters are yours to add from the app. Seeding a
-- guessed CBSE syllabus here would just be wrong data you then have to delete.
-- ---------------------------------------------------------------------------

insert into public.boards (id, name, sort_order) values
  ('CBSE', 'CBSE',                  1),
  ('CG',   'CG Board (Chhattisgarh)', 2)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 9. UPDATED-AT TRIGGERS
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['resources', 'attendance', 'class_summaries']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at()',
      t || '_touch', t);
  end loop;
end $$;
