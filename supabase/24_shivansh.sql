-- 26 Nov 2026: Shivansh (Class 7, one-to-one) gets his own page in the app: his own points (on time: the 9 am
-- call / coming on time; homework) and his own homework, behind a password he alone knows.
-- Step 1 (this file, part A): the student row. Branch 'Personal' keeps him off the Class 10 boards and trophies.
insert into public.students (id, name, avatar_id, branch)
values ('std_shivansh', 'Shivansh', 7, 'Personal')
on conflict (id) do nothing;
-- Step 2 (Aman, in the Supabase dashboard): Authentication -> Users -> Add user -> email
--   shivansh@students.fluence.local, the password he chose, tick Auto Confirm User.
-- Step 3 (part B, run after step 2): link that login to the student row.
-- insert into public.profiles (id, username, student_id, role)
-- select id, 'shivansh', 'std_shivansh', 'student' from auth.users where email = 'shivansh@students.fluence.local'
-- on conflict (id) do update set username = excluded.username, student_id = excluded.student_id, role = 'student';
