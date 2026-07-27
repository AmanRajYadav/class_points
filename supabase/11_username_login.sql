-- ============================================================================
-- Fluence — sign in with just a username, whatever your role
--
-- Run after 09_roles.sql. Safe to re-run.
--
-- THE PROBLEM THIS FIXES
-- 09 gave each role its own domain so an account says what it is on its face.
-- That was right for the database and wrong for the login box: the app turned a
-- bare username into <name>@students.fluence.local and nothing else, so the two
-- people who use the app most had to type a full address, and typing their own
-- name gave them "that username or password is not right" — indistinguishable
-- from a wrong password.
--
-- Usernames are already globally unique (profiles_username_key, on
-- lower(username)), so a bare name identifies exactly one account. This
-- resolves it server-side.
--
-- ON THE OBVIOUS OBJECTION
-- This does let anyone with the anon key ask whether a username exists. That is
-- information they effectively already have: the addresses follow a published
-- pattern, the roster is on the public board, and the class was told their own
-- usernames. What it does not do is reveal a password, and the password is the
-- only thing standing between a guess and an account either way. Supabase's
-- auth rate limits and the app's own backoff are what answer guessing.
--
-- It returns the address and nothing else — no role, no student id, no
-- indication of what the account can do.
-- ============================================================================

create or replace function public.email_for_username(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(trim(coalesce(p_username, '')))
  limit 1;
$$;

revoke execute on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- CHECKS
-- ---------------------------------------------------------------------------

-- Every account should resolve from its bare username. Expect no rows.
select p.username, p.role
from public.profiles p
where public.email_for_username(p.username) is null;

-- Spot check: the head and the teacher, who are the ones this was breaking.
select 'aman'   as typed, public.email_for_username('aman')   as resolves_to
union all
select 'jitesh' as typed, public.email_for_username('jitesh') as resolves_to
union all
select 'nobody' as typed, public.email_for_username('nobody') as resolves_to;
