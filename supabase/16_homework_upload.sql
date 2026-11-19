-- ============================================================================
-- Fluence — students upload their homework, and the homework point marks itself
--
-- Run after 15_homework_streak.sql is in the folder (it does not need 15 to be
-- applied). Safe to re-run.
--
-- WHY
-- Aman checks seventeen homework PDFs a day by hand on WhatsApp and cannot keep
-- up (19 Nov 2026: "mere liye impossible ho raha hai daily check karna"). The
-- students already have this app. So: the student uploads here, the point is
-- given at once, and Aman gets one screen of who sent and who did not.
--
-- THE RULE
-- Homework is named by its date (the "17 Nov homework" PDF). It is on time if
-- it is uploaded on that date, or before 12:00 noon India time on the next day
-- (his words to the class: "kal 12 baje ke pehle PDF banakar bhej do").
-- On time  -> status 'accepted' and daily_points.homework = 1 on the HOMEWORK's
--             date, so one homework can never earn two points.
-- Later    -> status 'late', no point; Aman can accept it from his screen.
-- Rejected -> the point is taken back (a blank or copied upload).
--
-- WHY THE POINT IS WRITTEN HERE AND NOT FROM THE PHONE
-- daily_points_update demands can_teach(); a student cannot write that table
-- and must not be able to. submit_homework() is SECURITY DEFINER, takes the
-- student from current_student_id() and never from an argument, and is the
-- only path by which an upload reaches daily_points.
--
-- WHY THE GUARD TRIGGER
-- The teacher's app upserts the whole daily_points row (see fromDailyPoint in
-- src/lib/db.ts). A phone that loaded the day before the upload would write
-- homework = 0 back over the automatic point. The trigger keeps homework at 1
-- while an accepted upload exists for that student and date. To remove such a
-- point, reject the upload; un-ticking it on the mark sheet will not.
--
-- No on_time is written, so attendance_follows_on_time() records nothing: an
-- upload on a no-class day never looks like a class attended or missed.
-- ============================================================================

create table if not exists public.homework_submissions (
  id            uuid primary key default gen_random_uuid(),
  student_id    text not null references public.students(id) on delete cascade,
  hw_date       date not null,
  files         text[] not null,              -- object paths in the homework bucket
  submitted_at  timestamptz not null default now(),
  status        text not null default 'accepted'
                check (status in ('accepted', 'late', 'rejected')),
  note          text,                         -- Aman's line to the student
  reviewed_at   timestamptz,
  ai            jsonb,                        -- the automatic check, when there is one
  ai_checked_at timestamptz,
  unique (student_id, hw_date)
);

create index if not exists homework_submissions_date on public.homework_submissions (hw_date);

alter table public.homework_submissions enable row level security;

-- Read: staff see all; a student sees only their own. No insert/update/delete
-- policy for students at all: the two functions below are the only writers.
drop policy if exists homework_submissions_read on public.homework_submissions;
create policy homework_submissions_read on public.homework_submissions
  for select to authenticated
  using ((select public.can_teach()) or student_id = (select public.current_student_id()));

revoke all on public.homework_submissions from anon;
revoke insert, update, delete, truncate on public.homework_submissions from authenticated;
grant select on public.homework_submissions to authenticated;

-- ---------------------------------------------------------------------------
-- The files. Private bucket; path is <student_id>/<hw_date>/<file>.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('homework', 'homework', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists homework_student_insert on storage.objects;
create policy homework_student_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'homework'
    and (storage.foldername(name))[1] = (select public.current_student_id())
  );

drop policy if exists homework_read on storage.objects;
create policy homework_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'homework'
    and ((select public.can_teach())
         or (storage.foldername(name))[1] = (select public.current_student_id()))
  );

-- ---------------------------------------------------------------------------
-- The student's one call, after the files are in the bucket.
-- ---------------------------------------------------------------------------
create or replace function public.submit_homework(p_hw_date date, p_files text[])
returns public.homework_submissions
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_student text := public.current_student_id();
  v_now     timestamp := now() at time zone 'Asia/Kolkata';
  v_today   date := (now() at time zone 'Asia/Kolkata')::date;
  v_on_time boolean;
  v_file    text;
  v_row     public.homework_submissions;
begin
  if v_student is null then
    raise exception 'Only a signed-in student can send homework.';
  end if;
  if p_files is null or cardinality(p_files) = 0 or cardinality(p_files) > 20 then
    raise exception 'Send 1 to 20 pages.';
  end if;
  if p_hw_date > v_today or p_hw_date < v_today - 7 then
    raise exception 'This homework date is not open.';
  end if;
  foreach v_file in array p_files loop
    if v_file not like v_student || '/' || p_hw_date::text || '/%' then
      raise exception 'A file is not in your own folder.';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'homework' and o.name = v_file) then
      raise exception 'A file did not finish uploading. Please send again.';
    end if;
  end loop;

  v_on_time := p_hw_date = v_today
            or (p_hw_date = v_today - 1 and v_now::time < time '12:00');

  insert into public.homework_submissions (student_id, hw_date, files, status)
  values (v_student, p_hw_date, p_files, case when v_on_time then 'accepted' else 'late' end)
  on conflict (student_id, hw_date) do update
    set files = excluded.files,
        submitted_at = now(),
        -- sending again never turns an on-time homework into a late one,
        -- and a rejected one is judged afresh
        status = case
                   when public.homework_submissions.status = 'accepted' then 'accepted'
                   else excluded.status
                 end,
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

revoke all on function public.submit_homework(date, text[]) from public, anon;
grant execute on function public.submit_homework(date, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Aman's call: accept a late one, or reject a blank one. The point follows.
-- ---------------------------------------------------------------------------
create or replace function public.review_homework(p_id uuid, p_status text, p_note text default null)
returns public.homework_submissions
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row public.homework_submissions;
begin
  if not public.can_teach() then
    raise exception 'Only staff can review homework.';
  end if;
  if p_status not in ('accepted', 'late', 'rejected') then
    raise exception 'Unknown status.';
  end if;
  update public.homework_submissions
     set status = p_status, note = nullif(trim(coalesce(p_note, '')), ''), reviewed_at = now()
   where id = p_id
  returning * into v_row;
  if v_row.id is null then
    raise exception 'No such homework.';
  end if;

  if p_status = 'accepted' then
    insert into public.daily_points (id, student_id, date, homework)
    values (v_row.student_id || '_' || v_row.hw_date::text, v_row.student_id, v_row.hw_date, 1)
    on conflict (student_id, date) do update set homework = 1, updated_at = now();
  else
    update public.daily_points set homework = 0, updated_at = now()
     where student_id = v_row.student_id and date = v_row.hw_date;
  end if;
  return v_row;
end;
$$;

revoke all on function public.review_homework(uuid, text, text) from public, anon;
grant execute on function public.review_homework(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A stale phone cannot wipe an automatic point.
-- ---------------------------------------------------------------------------
create or replace function public.homework_point_stays()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if coalesce(new.homework, 0) = 0 and exists (
       select 1 from public.homework_submissions h
       where h.student_id = new.student_id and h.hw_date = new.date and h.status = 'accepted'
     ) then
    new.homework := 1;
  end if;
  return new;
end;
$$;

drop trigger if exists daily_points_keeps_uploaded_homework on public.daily_points;
create trigger daily_points_keeps_uploaded_homework
  before insert or update on public.daily_points
  for each row execute function public.homework_point_stays();

-- The teacher's screen listens for new uploads.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'homework_submissions'
  ) then
    alter publication supabase_realtime add table public.homework_submissions;
  end if;
end $$;
