-- ============================================================================
-- Fluence — five homework days in a row earns 100
--
-- Run after 13_attendance_from_points.sql. Safe to re-run.
--
-- NOT YET APPLIED to the live project. Until it is, the app behaves exactly as
-- before: the client reads `streak` as 0 when the column is missing.
--
-- THE RULE
-- Every fifth homework in a row adds 100 to that day. "In a row" is counted in
-- homework days, not calendar days: a day counts for a branch only if somebody
-- in that branch was marked for homework. Sundays, holidays, days with nothing
-- set and days nobody got round to marking are simply not there, so none of
-- them can break a streak. Missing a day that classmates handed in does.
--
-- It starts on 4 Oct 2026, the day it was announced. Counting from the first
-- ever row would have rewritten three months of totals behind everyone's back.
--
-- WHY A COLUMN AND NOT A SUM WORKED OUT ON THE PHONE
-- The trophy is awarded by close_due_cycles(), in the database, usually while
-- nobody has the app open. A bonus that only existed in the browser would be
-- on the scoreboard and missing from the trophy. Stored on the row, every
-- total — here, on the board, in an export — is the same addition.
--
-- WHY THE WHOLE BRANCH IS RECOUNTED
-- The first homework marked on a day is what makes it a homework day, and that
-- changes the count for everyone else in the branch, not only the student who
-- was tapped. Ten students and a few dozen days: recounting is cheaper than
-- being clever, and it means un-marking a day takes the bonus back with it.
--
-- The client never writes `streak` (see fromDailyPoint in src/lib/db.ts), so an
-- upsert from an old build or a stale offline queue cannot overwrite it.
--
-- SECURITY INVOKER on purpose, as in 13: the recount runs as whoever marked the
-- homework, and daily_points_update already demands can_teach().
-- ============================================================================

alter table public.daily_points
  add column if not exists streak integer not null default 0;

create or replace function public.recompute_homework_streaks(p_branch text)
returns void
language sql
set search_path to ''
as $$
  with hw_days as (
    select distinct dp.date
    from public.daily_points dp
    join public.students st on st.id = dp.student_id
    where st.branch = p_branch
      and dp.homework > 0
      and dp.date >= date '2026-10-04'
  ),
  grid as (
    select st.id as student_id, d.date, coalesce(dp.homework, 0) > 0 as did
    from public.students st
    cross join hw_days d
    left join public.daily_points dp on dp.student_id = st.id and dp.date = d.date
    where st.branch = p_branch
  ),
  -- Each miss starts a new island; the run is the count of homeworks since.
  islands as (
    select *,
      count(*) filter (where not did) over (partition by student_id order by date) as misses
    from grid
  ),
  runs as (
    select student_id, date, did,
      count(*) filter (where did) over (partition by student_id, misses order by date) as run
    from islands
  ),
  earned as (
    select student_id, date from runs where did and run % 5 = 0
  )
  update public.daily_points dp
     set streak = case when exists (
                    select 1 from earned e
                    where e.student_id = dp.student_id and e.date = dp.date
                  ) then 100 else 0 end
   where dp.date >= date '2026-10-04'
     and dp.student_id in (select id from public.students where branch = p_branch)
     and dp.streak is distinct from case when exists (
                    select 1 from earned e
                    where e.student_id = dp.student_id and e.date = dp.date
                  ) then 100 else 0 end;
$$;

revoke execute on function public.recompute_homework_streaks(text) from public, anon;
grant execute on function public.recompute_homework_streaks(text) to authenticated;

create or replace function public.homework_streak_changed()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_student text;
  v_branch  text;
begin
  if tg_op = 'DELETE' then
    v_student := old.student_id;
  else
    v_student := new.student_id;
  end if;

  select branch into v_branch from public.students where id = v_student;

  if v_branch is null then
    -- The student row is already gone: this is the cascade from deleting them,
    -- and their homework may have been what made a day count for the branch.
    perform public.recompute_homework_streaks(b.branch)
      from (select distinct branch from public.students) b;
  else
    perform public.recompute_homework_streaks(v_branch);
  end if;

  return null;
end;
$$;

-- Three triggers rather than one, so each can say when it matters. The recount
-- itself only ever sets `streak`, which none of these watch, so it cannot set
-- itself off again.
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

-- The trophy has to count the same points the scoreboard shows. Identical to
-- the version in schema.sql apart from `+ dp.streak` in the two sums.
create or replace function public.close_due_cycles()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s            public.app_settings%rowtype;
  today        date;
  guard        integer := 0;
  batch        jsonb;
  new_winners  jsonb := '[]'::jsonb;
begin
  select * into s from public.app_settings where id = 1 for update;
  if not found then
    return new_winners;
  end if;

  today := (now() at time zone s.timezone)::date;

  -- `guard` stops a runaway loop if the settings row ever holds a nonsense date.
  while s.cycle_end_date < today and guard < 120 loop
    with ranked as (
      select
        st.id,
        st.name,
        st.avatar_id,
        st.branch,
        coalesce(sum(dp.on_time + dp.homework + dp.quiz + dp.bonus + dp.streak), 0) as score,
        row_number() over (
          partition by st.branch
          order by coalesce(sum(dp.on_time + dp.homework + dp.quiz + dp.bonus + dp.streak), 0) desc, st.name
        ) as rn
      from public.students st
      left join public.daily_points dp
        on dp.student_id = st.id
       and dp.date between s.cycle_start_date and s.cycle_end_date
      group by st.id, st.name, st.avatar_id, st.branch
    ),
    inserted as (
      insert into public.trophy_winners (
        id, student_id, student_name, avatar_id, score, branch,
        cycle_start_date, cycle_end_date, awarded_at
      )
      select
        'w_' || ranked.branch || '_' || s.cycle_start_date::text,
        ranked.id, ranked.name, ranked.avatar_id, ranked.score, ranked.branch,
        s.cycle_start_date, s.cycle_end_date, now()
      from ranked
      where ranked.rn = 1 and ranked.score > 0
      on conflict (branch, cycle_start_date, cycle_end_date) do nothing
      returning *
    )
    select coalesce(jsonb_agg(to_jsonb(inserted)), '[]'::jsonb) into batch from inserted;

    new_winners := new_winners || batch;

    s.cycle_start_date := public.cycle_start_for(s.cycle_end_date + 1);
    s.cycle_end_date   := public.cycle_end_for(s.cycle_end_date + 1);
    guard := guard + 1;
  end loop;

  if guard > 0 then
    update public.app_settings
       set cycle_start_date = s.cycle_start_date,
           cycle_end_date   = s.cycle_end_date,
           updated_at       = now()
     where id = 1;
  end if;

  return new_winners;
end;
$$;
