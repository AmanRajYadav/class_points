-- ============================================================================
-- ClassPoints — Supabase schema
-- Paste this whole file into: Supabase Dashboard -> SQL Editor -> New query -> Run
-- Safe to re-run: every statement is idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------------

create table if not exists public.students (
  id          text primary key,
  name        text not null,
  avatar_id   integer not null default 0,
  branch      text not null check (branch in ('Mangla', 'Sarkanda')),
  created_at  timestamptz not null default now()
);

create table if not exists public.daily_points (
  id          text primary key,                    -- "<student_id>_<YYYY-MM-DD>"
  student_id  text not null references public.students(id) on delete cascade,
  date        date not null,
  on_time     integer not null default 0,
  homework    integer not null default 0,
  quiz        integer not null default 0,
  bonus       integer not null default 0,
  updated_at  timestamptz not null default now(),
  unique (student_id, date)
);

create index if not exists daily_points_student_idx on public.daily_points (student_id);
create index if not exists daily_points_date_idx    on public.daily_points (date);

create table if not exists public.trophy_winners (
  id                text primary key,
  student_id        text references public.students(id) on delete set null,
  student_name      text not null,
  avatar_id         integer not null default 0,
  score             integer not null default 0,
  branch            text not null check (branch in ('Mangla', 'Sarkanda')),
  cycle_start_date  date not null,
  cycle_end_date    date not null,
  awarded_at        timestamptz not null default now(),
  -- One champion per branch per period. This is what stops two devices, or a
  -- cron run racing a page load, from crowning the same period twice.
  unique (branch, cycle_start_date, cycle_end_date)
);

-- Single-row table. The `id = 1` check keeps it a true singleton.
create table if not exists public.app_settings (
  id                integer primary key default 1 check (id = 1),
  cycle_start_date  date not null,
  cycle_end_date    date not null,
  timezone          text not null default 'Asia/Kolkata',
  teacher_avatar_id integer not null default 0,
  updated_at        timestamptz not null default now()
);

-- Upgrades from the first version of this schema.
alter table public.app_settings add column if not exists timezone text not null default 'Asia/Kolkata';
alter table public.app_settings drop column if exists pin;
alter table public.app_settings drop column if exists auto_reset_enabled;
alter table public.app_settings drop column if exists quick_mark_enabled;
alter table public.app_settings drop column if exists cycle_duration_days;

-- ---------------------------------------------------------------------------
-- 2. PERIOD MATH
--
-- A period is the 1st–15th of a month, or the 16th–end of month. These two
-- functions are the single definition of that rule; the app mirrors them.
-- ---------------------------------------------------------------------------

create or replace function public.cycle_start_for(d date)
returns date language sql immutable as $$
  select case
    when extract(day from d) <= 15 then date_trunc('month', d)::date
    else (date_trunc('month', d) + interval '15 days')::date
  end;
$$;

create or replace function public.cycle_end_for(d date)
returns date language sql immutable as $$
  select case
    when extract(day from d) <= 15 then (date_trunc('month', d) + interval '14 days')::date
    else (date_trunc('month', d) + interval '1 month' - interval '1 day')::date
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3. AUTOMATIC PERIOD ROLLOVER
--
-- Closes every period that has finished since the last run: crowns the top
-- scorer in each branch, files them in trophy_winners, then moves the live
-- window to the current period. Daily point rows are never deleted, so scores
-- "reset to zero" simply by the window moving — and every past period stays
-- fully reconstructable.
--
-- Idempotent: the deterministic winner id plus the unique index mean running
-- it twice, or from two devices at once, changes nothing.
-- ---------------------------------------------------------------------------

create or replace function public.close_due_cycles()
returns jsonb
language plpgsql
security definer
set search_path = public
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
        coalesce(sum(dp.on_time + dp.homework + dp.quiz + dp.bonus), 0) as score,
        row_number() over (
          partition by st.branch
          order by coalesce(sum(dp.on_time + dp.homework + dp.quiz + dp.bonus), 0) desc, st.name
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

grant execute on function public.close_due_cycles() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
--
-- Reading is public: students and the classroom screen see the board with no
-- login. Writing requires a signed-in Supabase Auth user — the teacher.
-- ---------------------------------------------------------------------------

alter table public.students       enable row level security;
alter table public.daily_points   enable row level security;
alter table public.trophy_winners enable row level security;
alter table public.app_settings   enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['students', 'daily_points', 'trophy_winners', 'app_settings']
  loop
    -- Drop the permissive policy the first version of this file created.
    execute format('drop policy if exists %I on public.%I', t || '_anon_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_read', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (true)',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (true) with check (true)',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (true)',
      t || '_delete', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. REALTIME (a change on the teacher's phone appears on the classroom screen)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['students', 'daily_points', 'trophy_winners', 'app_settings']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

alter table public.students       replica identity full;
alter table public.daily_points   replica identity full;
alter table public.trophy_winners replica identity full;
alter table public.app_settings   replica identity full;

-- ---------------------------------------------------------------------------
-- 6. SEED DATA (only inserted if the tables are still empty)
-- ---------------------------------------------------------------------------

insert into public.app_settings (id, cycle_start_date, cycle_end_date)
values (1, public.cycle_start_for(current_date), public.cycle_end_for(current_date))
on conflict (id) do nothing;

insert into public.students (id, name, avatar_id, branch) values
  ('s1', 'Ashi',      0, 'Mangla'),
  ('s2', 'Misti',     1, 'Mangla'),
  ('s3', 'Alankreet', 2, 'Mangla'),
  ('s4', 'Pariza',    3, 'Mangla'),
  ('s5', 'Shourya',   4, 'Sarkanda'),
  ('s6', 'Sourabh',   5, 'Sarkanda'),
  ('s7', 'Aman',      6, 'Sarkanda'),
  ('s8', 'Amogh',     7, 'Sarkanda')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. SCHEDULED ROLLOVER
--
-- The app also calls close_due_cycles() every time it loads, so the board is
-- correct the moment anyone opens it. This cron job is the belt-and-braces
-- version: the Hall of Fame gets filled on the 1st and the 16th even if nobody
-- opens the app for a month.
--
-- It runs hourly rather than at midnight on purpose — the function only acts
-- when a period has actually ended, so the exact hour never matters and no
-- timezone conversion can make it fire on the wrong day.
-- ---------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('classpoints-close-cycles', '7 * * * *', 'select public.close_due_cycles();');
exception when others then
  raise notice 'pg_cron not available (%). The app still rolls periods over on load.', sqlerrm;
end $$;
