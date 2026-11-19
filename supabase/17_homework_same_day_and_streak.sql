-- ============================================================================
-- Fluence — homework: same day only, 200 for three in a row, and a wall
--
-- Run after 16_homework_upload.sql. Safe to re-run. Aman's words, 19 Nov 2026:
--   "homework ko usi din bhej diye to point dena hai"
--   "lagataar homework bheje 3 din to uska 200 bonus point"
--   "ek aisa wall ... jo kar rahe hain unke mein crown ... jo nahi kar rahe ..."
--
-- 1. ON TIME is now the homework's own date in India, nothing after it. The
--    12-noon grace of script 16 is gone.
-- 2. THE STREAK replaces the never-applied rule of 15_homework_streak.sql
--    (100 for five). Same machinery, new numbers: every third homework day in
--    a row adds 200 to that day. Counted in homework days of the branch, as in
--    15: a day exists only if somebody in the branch has the homework point,
--    so a holiday cannot break a streak and missing a day classmates did can.
--    It starts on 19 Nov 2026, the day it was announced.
--    Do NOT run 15 after this: it would put the old numbers back.
-- 3. THE WALL: homework_wall() gives every student's last days as
--    on time / late / nothing. It returns no file paths and no notes, so it is
--    safe for any signed-in or signed-out reader, like the scoreboard.
-- ============================================================================

create or replace function public.submit_homework(p_hw_date date, p_files text[])
returns public.homework_submissions
language plpgsql security definer set search_path to ''
as $$
declare
  v_student text := public.current_student_id();
  v_today   date := (now() at time zone 'Asia/Kolkata')::date;
  v_file    text;
  v_row     public.homework_submissions;
begin
  if v_student is null then raise exception 'Only a signed-in student can send homework.'; end if;
  if p_files is null or cardinality(p_files) = 0 or cardinality(p_files) > 20 then raise exception 'Send 1 to 20 pages.'; end if;
  if p_hw_date > v_today or p_hw_date < v_today - 7 then raise exception 'This homework date is not open.'; end if;
  foreach v_file in array p_files loop
    if v_file not like v_student || '/' || p_hw_date::text || '/%' then raise exception 'A file is not in your own folder.'; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'homework' and o.name = v_file) then
      raise exception 'A file did not finish uploading. Please send again.';
    end if;
  end loop;
  insert into public.homework_submissions (student_id, hw_date, files, status)
  values (v_student, p_hw_date, p_files, case when p_hw_date = v_today then 'accepted' else 'late' end)
  on conflict (student_id, hw_date) do update
    set files = excluded.files, submitted_at = now(),
        status = case when public.homework_submissions.status = 'accepted' then 'accepted' else excluded.status end,
        note = null, reviewed_at = null, ai = null, ai_checked_at = null
  returning * into v_row;
  if v_row.status = 'accepted' then
    insert into public.daily_points (id, student_id, date, homework)
    values (v_student || '_' || p_hw_date::text, v_student, p_hw_date, 1)
    on conflict (student_id, date) do update set homework = 1, updated_at = now();
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- The streak: 200 on every third homework day in a row.
-- ---------------------------------------------------------------------------
alter table public.daily_points add column if not exists streak integer not null default 0;

create or replace function public.recompute_homework_streaks(p_branch text)
returns void
language sql
set search_path to ''
as $$
  with hw_days as (
    select distinct dp.date
    from public.daily_points dp
    join public.students st on st.id = dp.student_id
    where st.branch = p_branch and dp.homework > 0 and dp.date >= date '2026-11-19'
  ),
  grid as (
    select st.id as student_id, d.date, coalesce(dp.homework, 0) > 0 as did
    from public.students st
    cross join hw_days d
    left join public.daily_points dp on dp.student_id = st.id and dp.date = d.date
    where st.branch = p_branch
  ),
  islands as (
    select *, count(*) filter (where not did) over (partition by student_id order by date) as misses
    from grid
  ),
  runs as (
    select student_id, date, did,
      count(*) filter (where did) over (partition by student_id, misses order by date) as run
    from islands
  ),
  earned as (
    select student_id, date from runs where did and run % 3 = 0
  )
  update public.daily_points dp
     set streak = case when exists (
                    select 1 from earned e where e.student_id = dp.student_id and e.date = dp.date
                  ) then 200 else 0 end
   where dp.date >= date '2026-11-19'
     and dp.student_id in (select id from public.students where branch = p_branch)
     and dp.streak is distinct from case when exists (
                    select 1 from earned e where e.student_id = dp.student_id and e.date = dp.date
                  ) then 200 else 0 end;
$$;

revoke execute on function public.recompute_homework_streaks(text) from public, anon;
grant execute on function public.recompute_homework_streaks(text) to authenticated;

-- SECURITY DEFINER here, unlike 15: the point is now also written by
-- submit_homework() on behalf of a student, who cannot update daily_points.
create or replace function public.homework_streak_changed()
returns trigger
language plpgsql security definer set search_path to ''
as $$
declare
  v_student text;
  v_branch  text;
begin
  if tg_op = 'DELETE' then v_student := old.student_id; else v_student := new.student_id; end if;
  select branch into v_branch from public.students where id = v_student;
  if v_branch is null then
    perform public.recompute_homework_streaks(b.branch) from (select distinct branch from public.students) b;
  else
    perform public.recompute_homework_streaks(v_branch);
  end if;
  return null;
end;
$$;

drop trigger if exists daily_points_streak_insert on public.daily_points;
create trigger daily_points_streak_insert
  after insert on public.daily_points
  for each row when (new.homework > 0)
  execute function public.homework_streak_changed();

drop trigger if exists daily_points_streak_update on public.daily_points;
create trigger daily_points_streak_update
  after update of homework on public.daily_points
  for each row when (old.homework is distinct from new.homework)
  execute function public.homework_streak_changed();

drop trigger if exists daily_points_streak_delete on public.daily_points;
create trigger daily_points_streak_delete
  after delete on public.daily_points
  for each row when (old.homework > 0)
  execute function public.homework_streak_changed();

-- ---------------------------------------------------------------------------
-- The wall.
-- ---------------------------------------------------------------------------
create or replace function public.homework_wall(p_days integer default 7)
returns table (student_id text, hw_date date, status text)
language sql stable security definer set search_path to ''
as $$
  select h.student_id, h.hw_date, h.status
  from public.homework_submissions h
  where h.status in ('accepted', 'late')
    and h.hw_date > (now() at time zone 'Asia/Kolkata')::date - least(greatest(p_days, 1), 31);
$$;

revoke all on function public.homework_wall(integer) from public;
grant execute on function public.homework_wall(integer) to anon, authenticated;
