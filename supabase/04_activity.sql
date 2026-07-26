-- ============================================================================
-- Fluence — who is using the app, and what they are practising
--
-- Run after 02_hub.sql. Safe to re-run.
--
-- A note on what this data is worth. Students have no password: the app knows
-- who they are because a name was picked once on that device. So this measures
-- devices-claiming-to-be-a-student, not verified people. It is a reliable
-- engagement signal — is anyone practising, is anyone opening this — and it is
-- not evidence for anything that matters to a student's record.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. DAILY VISITS
--
-- One row per student per day, not per visit: the question is "did they open
-- it today", and a row per tap would make that harder to answer, not easier.
-- ---------------------------------------------------------------------------

create table if not exists public.student_activity (
  id         text primary key,               -- "<student_id>_<YYYY-MM-DD>"
  student_id text not null references public.students(id) on delete cascade,
  date       date not null,
  visits     integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  unique (student_id, date)
);

create index if not exists student_activity_date_idx
  on public.student_activity (date desc);

-- ---------------------------------------------------------------------------
-- 2. GAME SESSIONS
--
-- student_id is nullable on purpose. A session from a device that never picked
-- a name still gets recorded, so the Activity screen can show how much of the
-- picture is missing rather than quietly under-reporting.
-- ---------------------------------------------------------------------------

create table if not exists public.game_sessions (
  id               uuid primary key default gen_random_uuid(),
  student_id       text references public.students(id) on delete set null,
  game             text not null default 'swipe_maths',
  mode             text check (mode in ('practice', 'survival')),
  level            text,
  topics           text[],
  score            integer not null default 0,
  total            integer not null default 0,
  best_streak      integer not null default 0,
  duration_seconds integer,
  finished_at      timestamptz not null default now()
);

create index if not exists game_sessions_finished_idx on public.game_sessions (finished_at desc);
create index if not exists game_sessions_student_idx  on public.game_sessions (student_id, finished_at desc);

-- ---------------------------------------------------------------------------
-- 3. RECORDING
--
-- Both writes go through security-definer functions so anonymous visitors need
-- no table privileges at all. That keeps the surface to exactly two calls with
-- fixed shapes, rather than granting insert on a table and hoping.
-- ---------------------------------------------------------------------------

create or replace function public.record_visit(p_student_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date;
begin
  if p_student_id is null then
    return;
  end if;
  -- Unknown ids are ignored rather than erroring: a stale name on a device
  -- whose student was deleted should not break the app on load.
  if not exists (select 1 from public.students where id = p_student_id) then
    return;
  end if;

  select (now() at time zone coalesce((select timezone from public.app_settings where id = 1), 'Asia/Kolkata'))::date
    into v_today;

  insert into public.student_activity (id, student_id, date, visits, first_seen, last_seen)
  values (p_student_id || '_' || v_today::text, p_student_id, v_today, 1, now(), now())
  on conflict (student_id, date) do update
    set visits = public.student_activity.visits + 1,
        last_seen = now();
end;
$$;

create or replace function public.record_game_session(
  p_student_id       text,
  p_game             text,
  p_mode             text,
  p_level            text,
  p_topics           text[],
  p_score            integer,
  p_total            integer,
  p_best_streak      integer,
  p_duration_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student text;
begin
  -- Keep an unrecognised id out of the column rather than rejecting the row;
  -- the session still counts, it just lands as unidentified.
  select id into v_student from public.students where id = p_student_id;

  insert into public.game_sessions (
    student_id, game, mode, level, topics, score, total, best_streak, duration_seconds
  )
  values (
    v_student,
    coalesce(p_game, 'swipe_maths'),
    p_mode,
    p_level,
    p_topics,
    greatest(coalesce(p_score, 0), 0),
    greatest(coalesce(p_total, 0), 0),
    greatest(coalesce(p_best_streak, 0), 0),
    p_duration_seconds
  );
end;
$$;

grant execute on function public.record_visit(text) to anon, authenticated;
grant execute on function public.record_game_session(text, text, text, text, text[], integer, integer, integer, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
--
-- Reading is the teacher's alone. Students write through the functions above
-- and cannot query either table, so nobody can browse who has been practising
-- or compare themselves to the rest of the class.
-- ---------------------------------------------------------------------------

alter table public.student_activity enable row level security;
alter table public.game_sessions    enable row level security;

drop policy if exists student_activity_teacher on public.student_activity;
create policy student_activity_teacher on public.student_activity
  for all to authenticated using (true) with check (true);

drop policy if exists game_sessions_teacher on public.game_sessions;
create policy game_sessions_teacher on public.game_sessions
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 5. REALTIME — so the Activity screen updates while you watch it
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['student_activity', 'game_sessions']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
