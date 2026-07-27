-- ============================================================================
-- Fluence — closing two holes the role split left open
--
-- Run after 11_username_login.sql. Safe to re-run.
--
-- Already applied to the live project on 27 Jul 2026. This file exists so the
-- repo still describes the database: rebuilding from 02 → 11 without it would
-- silently reopen both holes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ATTENDANCE IS STAFF-ONLY
--
-- The read policy was `using (true)` for anon, so every student's
-- present/absent/late history — and the free-text note beside it — sat behind
-- nothing but knowing the project URL. The publishable key ships inside the
-- browser bundle, so it is not a secret and never was.
--
-- Points being public is a deliberate choice: the scoreboard is the point.
-- Attendance is a different kind of record. A note reading "absent, father in
-- hospital" is not scoreboard material.
--
-- Nothing student-facing reads this table. fetchAttendance() has exactly two
-- callers, AttendanceView and AttendanceHistory, and both sit behind the
-- teacher gate — so staff-only costs the app nothing today.
-- ---------------------------------------------------------------------------
drop policy if exists attendance_read on public.attendance;

create policy attendance_read on public.attendance
  for select to authenticated
  using ((select public.can_teach()));

-- ---------------------------------------------------------------------------
-- 2. ACTIVITY WRITES TRUST THE SESSION, NOT THE CALLER
--
-- Both functions used to open with:
--
--     v_student := coalesce(public.current_student_id(), p_student_id);
--
-- For a signed-in student current_student_id() answers and the parameter is
-- ignored, which is why this looked right in testing. For anyone *not* signed
-- in it returns null and the caller's own p_student_id won — and EXECUTE is
-- granted to anon. Anybody able to read the bundle could post any score, at
-- the survival × legend multiplier, in any student's name. The XP leaderboard
-- was a suggestion rather than a record.
--
-- Identity now comes from the session token alone. The parameter stays in both
-- signatures so already-deployed clients keep working; it is simply not
-- trusted. This is what hub.ts has claimed all along: "the server derives
-- identity from the session token anyway — the id passed here is only a hint."
--
-- What this does NOT fix: `score` still comes from the client, so a signed-in
-- student can inflate their own total. That is inherent to scoring a game in
-- the browser, and it is a much smaller problem than forging someone else's.
-- ---------------------------------------------------------------------------
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
) returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_student text;
  v_score   integer := greatest(coalesce(p_score, 0), 0);
  v_streak  integer := greatest(coalesce(p_best_streak, 0), 0);
  v_xp      integer;
begin
  -- p_student_id is deliberately unused. See the note above before "fixing" it.
  v_student := public.current_student_id();
  if v_student is not null and not exists (select 1 from public.students where id = v_student) then
    v_student := null;
  end if;

  v_xp := v_score
        * (case when p_mode = 'survival' then 15 else 10 end)
        * (case p_level
             when 'legend' then 3
             when 'hard'   then 2
             else 1
           end)
        + v_streak * 5;

  -- A null student still records the round, as anonymous practice: the
  -- leaderboard joins on student_id, so it earns nobody anything.
  insert into public.game_sessions (
    student_id, game, mode, level, topics, score, total, best_streak, duration_seconds, xp
  )
  values (
    v_student, coalesce(p_game, 'swipe_maths'), p_mode, p_level, p_topics,
    v_score, greatest(coalesce(p_total, 0), 0), v_streak, p_duration_seconds, v_xp
  );

  return v_xp;
end;
$$;

create or replace function public.record_visit(p_student_id text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_student text;
  v_today   date;
begin
  -- p_student_id is deliberately unused. See the note above.
  v_student := public.current_student_id();
  if v_student is null then
    return;
  end if;
  if not exists (select 1 from public.students where id = v_student) then
    return;
  end if;

  select (now() at time zone coalesce((select timezone from public.app_settings where id = 1), 'Asia/Kolkata'))::date
    into v_today;

  insert into public.student_activity (id, student_id, date, visits, first_seen, last_seen)
  values (v_student || '_' || v_today::text, v_student, v_today, 1, now(), now())
  on conflict (student_id, date) do update
    set visits    = public.student_activity.visits + 1,
        last_seen = now();
end;
$$;
