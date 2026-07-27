-- ============================================================================
-- Fluence — audit of the earlier scripts
--
-- Run after 07_performance.sql. Safe to re-run. No behaviour changes.
--
-- 07 covered 05_accounts.sql. This covers what came before it: schema.sql,
-- 02_hub.sql and 04_activity.sql. Two things are fixed, two are deliberately
-- left alone and written down at the bottom so the reasoning is not lost.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. REMOVE A SEARCH INDEX THAT NO QUERY CAN USE
--
-- 02_hub.sql built a trigram index over an expression:
--
--     using gin ((title || ' ' || coalesce(description, '')) gin_trgm_ops)
--
-- An expression index only serves a query filtering on that same expression.
-- The client filters the columns separately —
--
--     title ilike '%x%' or description ilike '%x%' or body ilike '%x%'
--
-- — so Postgres could never use it. It has been paying GIN maintenance on every
-- resource insert and update since it was created, for nothing.
--
-- It is dropped rather than corrected because the search it was meant to serve
-- does not run server-side either: both callers of fetchResources omit the
-- search argument and filter in memory, which is the right choice for a library
-- of a few hundred items. An index nobody can use, guarding a path nobody
-- takes, is worse than no index — someone will eventually trust it.
--
-- WHEN TO BRING IT BACK: once the library passes roughly two thousand items,
-- in-memory filtering stops being reasonable. At that point wire the search
-- argument through and add EITHER matching column indexes:
--
--     create index resources_title_trgm on public.resources
--       using gin (title gin_trgm_ops);
--     create index resources_desc_trgm on public.resources
--       using gin (description gin_trgm_ops);
--
-- OR, better for word-based search with ranking, a stored tsvector:
--
--     alter table public.resources add column search_vector tsvector
--       generated always as (
--         to_tsvector('english',
--           coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(body,''))
--       ) stored;
--     create index resources_fts on public.resources using gin (search_vector);
-- ---------------------------------------------------------------------------

drop index if exists public.resources_search_idx;

-- ---------------------------------------------------------------------------
-- 2. PIN THE REMAINING SECURITY DEFINER FUNCTIONS TO AN EMPTY SEARCH PATH
--
-- A security definer function runs with its owner's rights. If it resolves a
-- name through a search path someone else can influence, that is the classic
-- privilege-escalation route. 07 hardened is_teacher() and current_student_id();
-- these four were still on `search_path = public`.
--
-- ALTER rather than CREATE OR REPLACE: it changes only the setting, so there is
-- no chance of a transcription error in a body that is already correct. Every
-- table reference inside all four is schema-qualified — checked — so an empty
-- path resolves everything it needs and nothing it does not.
-- ---------------------------------------------------------------------------

alter function public.close_due_cycles() set search_path = '';
alter function public.record_visit(text) set search_path = '';
alter function public.record_game_session(text, text, text, text, text[], integer, integer, integer, integer)
  set search_path = '';
alter function public.leaderboard(text) set search_path = '';

-- ---------------------------------------------------------------------------
-- 3. INDEX THE HALL OF FAME SORT
--
-- fetchAppState orders trophy_winners by awarded_at on every single app load.
-- The table is small, but this is the one query that runs for every visitor on
-- every visit, so it is the cheapest possible win.
-- ---------------------------------------------------------------------------

create index if not exists trophy_winners_awarded_idx
  on public.trophy_winners (awarded_at desc);

-- ---------------------------------------------------------------------------
-- 4. TWO THINGS DELIBERATELY NOT CHANGED
--
-- (a) Four tables carry a synthetic text primary key that duplicates an
--     adjacent unique constraint:
--
--       daily_points      id = "<student>_<date>"     + unique (student_id, date)
--       attendance        id = "<student>_<date>"     + unique (student_id, date)
--       student_activity  id = "<student>_<date>"     + unique (student_id, date)
--       student_bookmarks id = "<student>_<resource>" + unique (student_id, resource_id)
--
--     That is two btree indexes enforcing one rule, so every insert maintains an
--     index it does not need. The tidy form makes (student_id, date) the primary
--     key and drops the text column.
--
--     Left alone because the client upserts by that id, so changing it means
--     touching src/lib/hub.ts and src/lib/db.ts, rewriting live rows, and
--     switching PostgREST to on_conflict targeting. The cost today is one extra
--     small index per table on tables measured in hundreds of rows. The risk of
--     the migration is larger than the saving. Revisit only if these tables
--     reach a scale where write throughput actually matters.
--
-- (b) Primary keys are text ('s1', 'std_a7ppvid', 'CBSE') where the guidance
--     prefers bigint identity or a time-ordered UUID. These are natural keys
--     already referenced by eleven foreign keys and by seeded data, and the
--     fragmentation argument for random UUIDs does not apply to short stable
--     strings. Changing them would be a rewrite of the whole schema to win
--     nothing at this size.
--
--     The guidance is right for new tables. Anything added from here — probes,
--     assessments, report days — should use `bigint generated always as
--     identity` or `uuid`.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5. CHECKS
-- ---------------------------------------------------------------------------

-- Every security definer function should now show search_path=. Expect no rows.
select p.proname as function_name,
       coalesce(array_to_string(p.proconfig, ', '), '(none)') as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and (p.proconfig is null or not ('search_path=' = any (p.proconfig)))
order by 1;

-- The dead index should be gone. Expect no rows.
select indexname from pg_indexes
where schemaname = 'public' and indexname = 'resources_search_idx';
