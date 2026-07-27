-- ============================================================================
-- Fluence — RLS and index tuning
--
-- Run after 05_accounts.sql. Safe to re-run. Changes no behaviour: every policy
-- grants exactly what it granted before.
--
-- HONEST FRAMING
-- At today's size — eleven students, a few hundred rows — none of this is
-- measurable. It is here because the tables that grow are the ones queried
-- most (attendance and daily_points gain ~2,200 rows a year each, game_sessions
-- faster than that), and because two of the missing indexes sit on cascade
-- paths where the cost is paid during a delete rather than a read.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. EVALUATE POLICY FUNCTIONS ONCE PER QUERY, NOT ONCE PER ROW
--
-- `using (public.is_teacher())` re-runs the function for every row scanned.
-- Wrapping it as `using ((select public.is_teacher()))` makes Postgres treat it
-- as an InitPlan: evaluated once, cached for the statement. Same result, same
-- permissions, one call instead of N.
--
-- Every policy is dropped and rebuilt because a policy expression cannot be
-- altered in place.
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
    execute format('drop policy if exists %I on public.%I', t || '_read',   t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    -- Reading stays public: the board, the library and the register are
    -- visible to anyone with the link.
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

drop policy if exists class_summaries_all on public.class_summaries;
create policy class_summaries_all on public.class_summaries
  for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

drop policy if exists student_activity_teacher on public.student_activity;
create policy student_activity_teacher on public.student_activity
  for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

drop policy if exists game_sessions_teacher on public.game_sessions;
create policy game_sessions_teacher on public.game_sessions
  for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

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

drop policy if exists profiles_self_read   on public.profiles;
drop policy if exists profiles_teacher_all on public.profiles;

create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_teacher()));
create policy profiles_teacher_all on public.profiles
  for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- ---------------------------------------------------------------------------
-- 2. HARDEN THE POLICY HELPERS
--
-- An empty search_path means an unqualified name cannot be resolved at all, so
-- nobody can shadow `profiles` with their own table and change what the
-- function returns. Every reference inside is already schema-qualified, so this
-- is a tightening with no behavioural change.
-- ---------------------------------------------------------------------------

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'teacher'
  );
$$;

create or replace function public.current_student_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select student_id from public.profiles where id = (select auth.uid());
$$;

-- Both are called from inside policies, which execute as the querying role, so
-- anon and authenticated must keep EXECUTE. Neither reveals anything beyond the
-- caller's own role and roster id.
grant execute on function public.is_teacher() to anon, authenticated;
grant execute on function public.current_student_id() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. INDEX THE REMAINING FOREIGN KEYS
--
-- Postgres does not index foreign keys for you. Two of these are the ones that
-- bite: an unindexed FK makes the *parent* delete scan the whole child table
-- while holding a lock, so removing one resource scans every bookmark, and
-- removing one student scans every trophy row.
--
-- Plain CREATE INDEX rather than CONCURRENTLY: these tables are small, and
-- CONCURRENTLY cannot run inside the transaction the SQL editor wraps around a
-- script.
-- ---------------------------------------------------------------------------

create index if not exists student_bookmarks_resource_idx
  on public.student_bookmarks (resource_id);            -- ON DELETE CASCADE path

create index if not exists trophy_winners_student_idx
  on public.trophy_winners (student_id);                -- ON DELETE SET NULL path

create index if not exists resources_board_idx
  on public.resources (board_id);

create index if not exists class_summaries_subject_idx
  on public.class_summaries (subject_id);

create index if not exists class_summaries_chapter_idx
  on public.class_summaries (chapter_id);

-- ---------------------------------------------------------------------------
-- 4. CHECK
-- ---------------------------------------------------------------------------

-- Should return no rows: every foreign key now has an index it can lead with.
select
  c.conrelid::regclass::text as table_name,
  a.attname                  as unindexed_fk_column
from pg_constraint c
join pg_attribute a
  on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
where c.contype = 'f'
  and c.connamespace = 'public'::regnamespace
  and not exists (
    select 1 from pg_index i
    where i.indrelid = c.conrelid
      and a.attnum = i.indkey[0]       -- leading column only; a trailing
  )                                    -- position does not serve the FK
order by 1, 2;

-- Should return no rows: no policy still calls a helper unwrapped.
--
-- Plain LIKE rather than a lookbehind regex: Postgres deparses a stored policy
-- rather than echoing what was typed, so matching the literal text written here
-- would be guesswork. A wrapped call always deparses with SELECT in it.
select polrelid::regclass::text as table_name, polname as policy_name
from pg_policy
where (
        coalesce(pg_get_expr(polqual, polrelid), '') like '%is_teacher%'
        and coalesce(pg_get_expr(polqual, polrelid), '') not like '%SELECT%'
      )
   or (
        coalesce(pg_get_expr(polwithcheck, polrelid), '') like '%is_teacher%'
        and coalesce(pg_get_expr(polwithcheck, polrelid), '') not like '%SELECT%'
      )
order by 1, 2;
