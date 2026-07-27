-- ============================================================================
-- Fluence — the on-time point takes the register
--
-- Run after 12_hardening.sql. Safe to re-run.
--
-- Already applied to the live project on 28 Jul 2026.
--
-- The two screens were asking the same question twice. Points get given first,
-- student by student, and then the register opened and asked about the same
-- people again. On time implies present — nobody is punctual and absent — so
-- that half of the roster was already answered, and answering it a second time
-- was pure duplicate work.
--
-- The implication runs one way only. A late student is present without being on
-- time, so this writes nothing but `present`, and `on conflict do nothing` means
-- it can never overwrite a mark made by hand. Whatever the register says wins;
-- this only ever fills in blanks. Removing the point again does not take the
-- mark away either — undoing a tap on one screen should not silently rewrite
-- the other.
--
-- WHY A TRIGGER AND NOT THE CLIENT
-- Points are written from three places: the quick-mark deck, the points grid,
-- and the offline queue when it flushes hours later. A rule enforced in one of
-- them is a rule that is wrong in the other two.
--
-- SECURITY INVOKER (the default) on purpose. The insert runs as whoever wrote
-- the point, and attendance_insert already demands can_teach() — the same bar
-- daily_points_insert sets. Anyone allowed to award a point is already allowed
-- to take the register, so nothing here borrows privilege it did not have.
-- ============================================================================

create or replace function public.attendance_follows_on_time()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if coalesce(new.on_time, 0) > 0 then
    insert into public.attendance (id, student_id, date, status)
    values (new.student_id || '_' || new.date::text, new.student_id, new.date, 'present')
    on conflict (student_id, date) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists daily_points_marks_present on public.daily_points;

-- Fires on every write rather than `update of on_time`, because the client
-- upserts the whole row each time and a no-op conflict costs nothing.
create trigger daily_points_marks_present
  after insert or update on public.daily_points
  for each row execute function public.attendance_follows_on_time();
