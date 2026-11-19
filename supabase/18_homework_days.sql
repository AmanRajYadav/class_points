-- ============================================================================
-- Fluence — each day's homework questions and answers, for the AI first review
--
-- Run after 17. Safe to re-run. One row per class per day, holding the same
-- data make_homework.py prints from (the common ten, the swaps by rank or by
-- name, and which app student id is which name). The check-homework Edge
-- Function reads it with the service role. Students must never read it: the
-- answers are in it. Rows are written from Aman's computer by
-- F:/Math Hacking/HUB/_engine/homework_sets_sql.py.
-- ============================================================================
create table if not exists public.homework_days (
  hw_date date not null,
  branch text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (hw_date, branch)
);
alter table public.homework_days enable row level security;
drop policy if exists homework_days_staff_read on public.homework_days;
create policy homework_days_staff_read on public.homework_days
  for select to authenticated using ((select public.can_teach()));
revoke all on public.homework_days from anon;
revoke insert, update, delete, truncate on public.homework_days from authenticated;
grant select on public.homework_days to authenticated;
