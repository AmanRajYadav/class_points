-- ============================================================================
-- Fluence — four roles instead of two
--
-- Run after 08_cleanup.sql. Safe to re-run.
--
-- Until now `teacher` meant "can do everything", because there was one of you.
-- Hiring splits that into a ladder:
--
--   admin    Aman, head of the institution. Everything, as before.
--   editor   a future hire who runs the day-to-day. Everything except the
--            things that decide who has access and what the money rules are:
--            accounts, the trophy period, the settings panel, and deletions.
--   teacher  Jitesh and any other subject teacher. Four surfaces only —
--            daily points, the register, homework, and the teaching log.
--   student  unchanged.
--
-- WHY A TEACHER GETS HOMEWORK BUT NOT NOTES
-- Homework, notes, notices and resources are all rows in one table, separated
-- by `kind`. Row level security is per row, not per table, so the teacher's
-- policy carries `kind = 'homework'` in both directions: they cannot write a
-- notice, and they cannot take a homework row they own and turn it into one.
--
-- The order below matters. Section 4 rewrites every policy to demand a role, so
-- section 2 must have produced an admin first — otherwise this migration would
-- lock the owner out of his own database. It aborts rather than continuing.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. ALLOW THE NEW ROLES
-- ---------------------------------------------------------------------------

-- Drop-then-add rather than the usual "if not exists in pg_constraint" dance.
-- That pattern is for adding a constraint that may already be there; this one
-- is *changing* an existing constraint from two roles to four, so a guard that
-- skips when the name exists would leave the old two-role check in place and
-- every insert below would fail. Re-running this pair is still idempotent.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('student', 'teacher', 'editor', 'admin'));

-- ---------------------------------------------------------------------------
-- 2. PROMOTE THE HEAD
--
-- The account that has been running the place becomes admin. Matched on either
-- address it may be using — the original one, or the one 10_staff_logins.sql
-- moves it to — and failing that, on being the only staff profile that exists,
-- which is true right up until the first hire is added.
-- ---------------------------------------------------------------------------

update public.profiles p
   set role = 'admin'
  from auth.users u
 where u.id = p.id
   and u.email in ('teacher@classpoints.app', 'aman@admin.fluence.local')
   and p.role <> 'admin';

do $$
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    -- Exactly one staff profile: unambiguous, promote it.
    if (select count(*) from public.profiles where student_id is null) = 1 then
      update public.profiles set role = 'admin' where student_id is null;
    end if;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    raise exception
      'No admin profile exists, so this migration has been rolled back rather than locking you out. Promote your own account first: update public.profiles set role = ''admin'' where id = (select id from auth.users where email = ''<your address>'');';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. THE THREE PREDICATES
--
-- is_admin()    the head. Accounts, settings, trophies, deletions.
-- can_manage()  admin + editor. The roster, the library, the Park tree.
-- can_teach()   admin + editor + teacher. Points, register, homework, log.
--
-- is_teacher() is kept as an alias for is_admin() so nothing that still calls
-- it silently widens: a hire must not inherit full rights because one policy
-- was missed. It fails closed, loudly, rather than opening quietly.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

create or replace function public.can_manage()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin', 'editor')
  );
$$;

create or replace function public.can_teach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('admin', 'editor', 'teacher')
  );
$$;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin();
$$;

-- can_mark_points() was the name an earlier draft of this file used, before
-- the teacher's remit grew past points. Dropped so nothing keeps calling a
-- predicate that no longer describes what a teacher may do.
drop function if exists public.can_mark_points();

-- Postgres grants EXECUTE to PUBLIC on every new function, which makes a
-- security definer function in a public schema a callable API by default. That
-- is harmless for these four — each answers "what am I?" about the caller and
-- returns false to a stranger — but the grant should still be named rather
-- than inherited, so a later function added beside them does not get one by
-- accident.
revoke execute on function public.is_admin()   from public;
revoke execute on function public.can_manage() from public;
revoke execute on function public.can_teach()  from public;
revoke execute on function public.is_teacher() from public;

grant execute on function public.is_admin()   to anon, authenticated, service_role;
grant execute on function public.can_manage() to anon, authenticated, service_role;
grant execute on function public.can_teach()  to anon, authenticated, service_role;
grant execute on function public.is_teacher() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RE-CUT THE POLICIES
--
-- Reads stay public throughout, as before — the board and the library are
-- visible to anyone with the link. Only the write side changes.
--
-- Calls are wrapped in (select ...) so they are evaluated once per statement
-- rather than once per row — see 07_performance.sql.
-- ---------------------------------------------------------------------------

-- 4a. The roster and the Park tree: editor and above.
--     Deleting a student is admin-only; it cascades their whole history.
do $$
declare
  t text;
begin
  foreach t in array array['students', 'boards', 'subjects', 'chapters']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.can_manage()))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.can_manage())) with check ((select public.can_manage()))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      t || '_delete', t,
      case when t = 'students' then '(select public.is_admin())' else '(select public.can_manage())' end);
  end loop;
end $$;

-- 4b. The two ledgers a subject teacher keeps: points and the register.
--     Delete stays with the head on both. Removing a day's marks is not
--     marking them; a mis-tap should only ever overwrite a record, not erase it.
do $$
declare
  t text;
begin
  foreach t in array array['daily_points', 'attendance']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.can_teach()))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.can_teach())) with check ((select public.can_teach()))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))',
      t || '_delete', t);
  end loop;
end $$;

-- 4c. Trophies and settings: the head alone. These are the trophy period and
--     the Hall of Fame — the record of who won what, and the rule that decides
--     it. Nobody else needs to touch either.
do $$
declare
  t text;
begin
  foreach t in array array['trophy_winners', 'app_settings']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))',
      t || '_delete', t);
  end loop;
end $$;

-- 4d. The library. One table, four tools, split by `kind`.
--
--     `kind = 'homework'` appears in USING and WITH CHECK both, and that is the
--     whole mechanism: USING decides which existing rows a teacher may touch,
--     WITH CHECK decides what they may leave behind. Either half alone would
--     let them relabel their way into posting notices.
drop policy if exists resources_insert on public.resources;
drop policy if exists resources_update on public.resources;
drop policy if exists resources_delete on public.resources;

create policy resources_insert on public.resources
  for insert to authenticated
  with check (
    (select public.can_manage())
    or ((select public.can_teach()) and kind = 'homework')
  );

create policy resources_update on public.resources
  for update to authenticated
  using (
    (select public.can_manage())
    or ((select public.can_teach()) and kind = 'homework')
  )
  with check (
    (select public.can_manage())
    or ((select public.can_teach()) and kind = 'homework')
  );

create policy resources_delete on public.resources
  for delete to authenticated
  using (
    (select public.can_manage())
    or ((select public.can_teach()) and kind = 'homework')
  );

-- 4e. The teaching log. Staff-only in both directions — students cannot read
--     it at all — and shared between staff, because a class covered by one of
--     you is a class the other needs to know about.
drop policy if exists class_summaries_all on public.class_summaries;
create policy class_summaries_all on public.class_summaries
  for all to authenticated
  using ((select public.can_teach())) with check ((select public.can_teach()));

-- 4f. Who is opening the app and who is practising. Editor and above: this is
--     oversight of children, not something a subject teacher needs to run a
--     lesson.
drop policy if exists student_activity_teacher on public.student_activity;
create policy student_activity_teacher on public.student_activity
  for all to authenticated
  using ((select public.can_manage())) with check ((select public.can_manage()));

drop policy if exists game_sessions_teacher on public.game_sessions;
create policy game_sessions_teacher on public.game_sessions
  for all to authenticated
  using ((select public.can_manage())) with check ((select public.can_manage()));

-- 4g. Bookmarks belong to whoever made them.
drop policy if exists student_bookmarks_read   on public.student_bookmarks;
drop policy if exists student_bookmarks_insert on public.student_bookmarks;
drop policy if exists student_bookmarks_delete on public.student_bookmarks;

create policy student_bookmarks_read on public.student_bookmarks
  for select to authenticated
  using ((select public.can_manage()) or student_id = (select public.current_student_id()));
create policy student_bookmarks_insert on public.student_bookmarks
  for insert to authenticated
  with check ((select public.can_manage()) or student_id = (select public.current_student_id()));
create policy student_bookmarks_delete on public.student_bookmarks
  for delete to authenticated
  using ((select public.can_manage()) or student_id = (select public.current_student_id()));

-- 4h. Accounts. Only the head hires, and only the head promotes.
--
--     This is the hinge the whole file turns on: every other permission is a
--     role in this table, so anyone who can write here can grant themselves
--     anything. An editor may read the list — they need to know who is who —
--     and may change nothing.
drop policy if exists profiles_self_read   on public.profiles;
drop policy if exists profiles_teacher_all on public.profiles;
drop policy if exists profiles_admin_all   on public.profiles;

create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.can_manage()));
create policy profiles_admin_all on public.profiles
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 4i. THE RECORDINGS
--
-- 02_hub.sql granted this bucket to `authenticated` with no role check, back
-- when the only authenticated user was the teacher. Eleven students later that
-- is a hole: any of them could list and download every class recording. The
-- table holding the transcripts was locked down in 05; the audio behind it was
-- not. Same predicate as the teaching log it belongs to.
-- ---------------------------------------------------------------------------

do $$
begin
  drop policy if exists class_audio_teacher_all on storage.objects;
  create policy class_audio_teacher_all on storage.objects
    for all to authenticated
    using (bucket_id = 'class-audio' and (select public.can_teach()))
    with check (bucket_id = 'class-audio' and (select public.can_teach()));
exception when insufficient_privilege then
  raise notice 'Could not replace the storage policy from SQL. Set it under Storage -> class-audio -> Policies: allow all for authenticated where bucket_id = ''class-audio'' AND can_teach().';
end $$;

-- ---------------------------------------------------------------------------
-- 5. TABLE GRANTS — A DEADLINE, NOT A PREFERENCE
--
-- Supabase is removing automatic exposure of public tables to the Data API.
-- New projects have worked this way since 2026-05-30; it is enforced on every
-- remaining project on **2026-10-30**. This project predates the change and is
-- currently running on the old implicit grants, which means that on that date
-- every read in the app starts returning a permission error at once — the
-- board, the library, the register, all of it.
--
-- Granting explicitly now costs nothing and is not a loosening: RLS is what
-- decides who may do what, and a grant without a matching policy still returns
-- nothing. This only restores, by name, the access the platform is about to
-- stop assuming.
--
-- Least privilege is kept: anon may read the public surface and write nothing
-- at all, anywhere.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

-- Public to read: the board, the library, the register.
grant select on
  public.students, public.daily_points, public.trophy_winners, public.app_settings,
  public.boards, public.subjects, public.chapters, public.resources, public.attendance
to anon, authenticated;

-- Signed-in only, and then still filtered by policy: the teaching log, the
-- activity tables, bookmarks, and the account list.
grant select on
  public.class_summaries, public.student_activity, public.game_sessions,
  public.student_bookmarks, public.profiles
to authenticated;

-- Writes are granted to `authenticated` as a whole and narrowed by policy —
-- that is the Supabase model, and it is why every table above has RLS on.
-- Section 6 verifies that none of them slipped through with it off.
grant insert, update, delete on
  public.students, public.daily_points, public.trophy_winners, public.app_settings,
  public.boards, public.subjects, public.chapters, public.resources, public.attendance,
  public.class_summaries, public.student_activity, public.game_sessions,
  public.student_bookmarks, public.profiles
to authenticated;

-- No sequence grants: every primary key here is a text key or a
-- gen_random_uuid() default, so there is no sequence to advance.

-- ---------------------------------------------------------------------------
-- 6. CHECKS
-- ---------------------------------------------------------------------------

-- Who holds what. Expect exactly one admin.
select p.role, p.username, coalesce(s.name, '—') as student, u.email
from public.profiles p
left join public.students s on s.id = p.student_id
join auth.users u on u.id = p.id
order by case p.role when 'admin' then 1 when 'editor' then 2 when 'teacher' then 3 else 4 end,
         p.username;

-- What a subject teacher can write. Expect exactly six rows: insert and update
-- on daily_points and attendance, and insert/update/delete on resources — the
-- resources ones qualified by kind = 'homework'.
select polrelid::regclass::text as table_name,
       polname                  as policy_name,
       polcmd                   as cmd
from pg_policy
where coalesce(pg_get_expr(polqual, polrelid), '') like '%can_teach%'
   or coalesce(pg_get_expr(polwithcheck, polrelid), '') like '%can_teach%'
order by 1, 2;

-- Nothing should still be gated on the old everything-predicate except by way
-- of is_teacher(), which now means admin. Expect no rows.
select polrelid::regclass::text as table_name, polname as policy_name
from pg_policy
where coalesce(pg_get_expr(polqual, polrelid), '') like '%is_teacher%'
   or coalesce(pg_get_expr(polwithcheck, polrelid), '') like '%is_teacher%'
order by 1, 2;

-- Section 5 just granted write access to `authenticated` on fourteen tables.
-- Every one of them must have RLS on, or that grant is the only thing standing
-- between a student's login and the roster. Expect no rows.
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
order by 1;

-- And every one of them must actually have policies — RLS on with no policy
-- denies everything, which would take the app down just as thoroughly as no
-- RLS would expose it. Expect no rows.
select c.relname as table_with_rls_but_no_policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
order by 1;
