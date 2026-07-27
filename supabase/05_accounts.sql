-- ============================================================================
-- Fluence — student accounts, roles, and XP
--
-- Run after 04_activity.sql. Safe to re-run.
--
-- READ THIS FIRST
-- ---------------
-- Every policy written before this file said "writes allowed to authenticated",
-- because exactly one person could authenticate: the teacher. Giving students
-- real logins makes them `authenticated` too, which under those policies would
-- hand every one of them the ability to edit points, delete students and wipe
-- the register.
--
-- So this file re-cuts every existing policy around an explicit role. Nothing
-- is additive here — the old policies are dropped and replaced. After running
-- it, `authenticated` on its own grants nothing; authority comes from a row in
-- public.profiles saying you are the teacher.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROFILES
--
-- One row per login. An auth account with no profile row is inert: it can sign
-- in and see exactly what a logged-out visitor sees. That is deliberate — it
-- means a stray or unwanted signup grants nothing, and membership of the class
-- is something the teacher confers, not something anyone can claim.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null,
  student_id text references public.students(id) on delete set null,
  role       text not null default 'student' check (role in ('student', 'teacher')),
  created_at timestamptz not null default now()
);

-- Usernames are compared case-insensitively so "Aman" and "aman" cannot both exist.
create unique index if not exists profiles_username_key on public.profiles (lower(username));
-- One login per student on the roster.
create unique index if not exists profiles_student_key on public.profiles (student_id)
  where student_id is not null;

-- ---------------------------------------------------------------------------
-- 2. ROLE HELPERS
--
-- security definer so the check itself is not subject to RLS on profiles —
-- otherwise every policy that calls it would recurse into the policy on
-- profiles and deadlock the whole thing.
-- ---------------------------------------------------------------------------

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
  );
$$;

/** The roster id of whoever is signed in, or null. */
create or replace function public.current_student_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select student_id from public.profiles where id = auth.uid();
$$;

grant execute on function public.is_teacher() to anon, authenticated;
grant execute on function public.current_student_id() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. PROMOTE THE EXISTING TEACHER
--
-- The account created before roles existed becomes the teacher. This has to
-- succeed before the next section runs: section 4 rewrites every policy to
-- demand is_teacher(), so reaching it with no teacher profile would lock the
-- owner out of their own database with no route back except the SQL editor.
-- ---------------------------------------------------------------------------

-- The configured address first.
insert into public.profiles (id, username, role)
select u.id, coalesce(nullif(split_part(u.email, '@', 1), ''), 'teacher'), 'teacher'
from auth.users u
where u.email = 'teacher@classpoints.app'
on conflict (id) do update set role = 'teacher';

-- Failing that, a project with exactly one account has an unambiguous owner —
-- which covers anyone who signed up under a different address than the README
-- suggested. Two or more accounts is genuinely ambiguous, so it is left alone
-- and the check below stops the migration.
do $$
begin
  if not exists (select 1 from public.profiles where role = 'teacher')
     and (select count(*) from auth.users) = 1 then
    insert into public.profiles (id, username, role)
    select u.id, coalesce(nullif(split_part(u.email, '@', 1), ''), 'teacher'), 'teacher'
    from auth.users u
    on conflict (id) do update set role = 'teacher';
  end if;
end $$;

-- Abort rather than warn. A warning does not stop execution, so the previous
-- version of this file would have carried on and locked the account out.
do $$
begin
  if not exists (select 1 from public.profiles where role = 'teacher') then
    raise exception
      'No teacher profile could be created, so this migration has been rolled back rather than locking you out. Sign in to the app once as the teacher, then run this file again. If your teacher account uses an address other than teacher@classpoints.app, insert its profile manually first: insert into public.profiles (id, username, role) select id, ''teacher'', ''teacher'' from auth.users where email = ''<your address>'';';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. RE-CUT EVERY POLICY
--
-- Public read stays as it was: the board, the library and the register are
-- visible to anyone with the link. Writing now requires is_teacher().
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'students', 'daily_points', 'trophy_winners', 'app_settings',
    'boards', 'subjects', 'chapters', 'resources', 'attendance'
  ]
  loop
    -- Drop every name any earlier version of these files created.
    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read',   t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_read', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.is_teacher()))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.is_teacher())) with check ((select public.is_teacher()))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.is_teacher()))',
      t || '_delete', t);
  end loop;
end $$;

-- The teaching log stays teacher-only in both directions.
drop policy if exists class_summaries_all on public.class_summaries;
create policy class_summaries_all on public.class_summaries
  for all to authenticated using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- Activity and sessions: teacher reads, nobody else.
drop policy if exists student_activity_teacher on public.student_activity;
create policy student_activity_teacher on public.student_activity
  for all to authenticated using ((select public.is_teacher())) with check ((select public.is_teacher()));

drop policy if exists game_sessions_teacher on public.game_sessions;
create policy game_sessions_teacher on public.game_sessions
  for all to authenticated using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- Bookmarks belong to their owner. Previously anyone could add or remove one
-- under any name, which was tolerable when nobody could prove who they were;
-- now that they can, there is no reason to keep it open.
drop policy if exists student_bookmarks_read   on public.student_bookmarks;
drop policy if exists student_bookmarks_insert on public.student_bookmarks;
drop policy if exists student_bookmarks_delete on public.student_bookmarks;

create policy student_bookmarks_read on public.student_bookmarks
  for select to authenticated
  using ((select public.is_teacher()) or student_id = (select public.current_student_id()));
create policy student_bookmarks_insert on public.student_bookmarks
  for insert to authenticated
  with check ((select public.is_teacher()) or student_id = (select public.current_student_id()));
create policy student_bookmarks_delete on public.student_bookmarks
  for delete to authenticated
  using ((select public.is_teacher()) or student_id = (select public.current_student_id()));

-- Profiles: you can read your own; the teacher reads and writes all. Students
-- cannot change their own row, or they could promote themselves to teacher.
alter table public.profiles enable row level security;

drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_teacher_all on public.profiles;

create policy profiles_self_read on public.profiles
  for select to authenticated using (id = (select auth.uid()) or (select public.is_teacher()));
create policy profiles_teacher_all on public.profiles
  for all to authenticated using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- ---------------------------------------------------------------------------
-- 5. TRUSTWORTHY ATTRIBUTION
--
-- These replace the earlier versions, which believed whatever student id the
-- browser sent. Now that students sign in, identity comes from the token, and
-- the parameter is only a fallback for a visitor who has not logged in. The
-- difference matters: the earlier numbers were device-claimed, these are not.
-- ---------------------------------------------------------------------------

create or replace function public.record_visit(p_student_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student text;
  v_today   date;
begin
  v_student := coalesce(public.current_student_id(), p_student_id);
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
    set visits = public.student_activity.visits + 1,
        last_seen = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. XP
--
-- Stored on the session rather than recomputed, so changing the formula later
-- cannot silently rewrite history and move everyone's totals.
-- ---------------------------------------------------------------------------

alter table public.game_sessions add column if not exists xp integer not null default 0;
create index if not exists game_sessions_xp_idx on public.game_sessions (finished_at desc, xp);

-- Dropped, not replaced. 04_activity.sql declared this `returns void`; it now
-- returns the XP it awarded, and Postgres refuses to change a return type
-- through `create or replace`. Without this line the migration halts here.
drop function if exists public.record_game_session(
  text, text, text, text, text[], integer, integer, integer, integer
);

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
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student text;
  v_score   integer := greatest(coalesce(p_score, 0), 0);
  v_streak  integer := greatest(coalesce(p_best_streak, 0), 0);
  v_xp      integer;
begin
  v_student := coalesce(public.current_student_id(), p_student_id);
  if v_student is not null and not exists (select 1 from public.students where id = v_student) then
    v_student := null;
  end if;

  -- Survival is worth more per answer because a mistake ends the run. The
  -- streak bonus rewards sustained accuracy over lucky guessing, and the
  -- difficulty multiplier stops Easy being the efficient way to farm XP.
  v_xp := v_score
        * (case when p_mode = 'survival' then 15 else 10 end)
        * (case p_level
             when 'legend' then 3
             when 'hard'   then 2
             else 1
           end)
        + v_streak * 5;

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

grant execute on function public.record_visit(text) to anon, authenticated;
grant execute on function public.record_game_session(text, text, text, text, text[], integer, integer, integer, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. THE LEADERBOARD
--
-- Weekly, because that is the part of the Duolingo mechanic that actually
-- brings people back: a permanent all-time table tells whoever is behind that
-- catching up is hopeless, and they stop trying. Monday-to-Sunday, so everyone
-- starts level again each week.
--
-- Returned by a function rather than a view: the underlying tables are
-- teacher-only, and this exposes exactly the aggregate everyone may see —
-- name, XP, level — and nothing about anyone's individual answers.
-- ---------------------------------------------------------------------------

create or replace function public.leaderboard(p_scope text default 'week')
returns table (
  student_id   text,
  student_name text,
  avatar_id    integer,
  branch       text,
  xp           bigint,
  sessions     bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.name,
    s.avatar_id,
    s.branch,
    coalesce(sum(g.xp), 0)::bigint as xp,
    count(g.id)::bigint            as sessions
  from public.students s
  left join public.game_sessions g
    on g.student_id = s.id
   and (
     p_scope <> 'week'
     or g.finished_at >= date_trunc('week', now())
   )
  group by s.id, s.name, s.avatar_id, s.branch
  order by xp desc, s.name;
$$;

grant execute on function public.leaderboard(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. REALTIME
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
