-- ============================================================================
-- Fluence — seed the maths games into the resource library
--
-- Run after 02_hub.sql. Safe to re-run: matched on url, so a second run
-- updates the existing rows instead of duplicating them.
-- ============================================================================

-- The Swipe Maths game is built into the app rather than hosted elsewhere, so
-- it is reachable from the master menu directly and is not listed here — a
-- resource row needs a URL to open.

do $$
declare
  v_id uuid;
begin
  -- Maths Foundation 1
  select id into v_id from public.resources
   where url = 'https://amanrajyadav.github.io/fluence-math-foundation-1/math-arcade.html';

  if v_id is null then
    insert into public.resources (kind, title, description, url, pinned)
    values (
      'game',
      'Maths Foundation 1 — Arcade',
      'Arcade drills for the number foundations: operations, tables and mental maths.',
      'https://amanrajyadav.github.io/fluence-math-foundation-1/math-arcade.html',
      true
    );
  else
    update public.resources
       set kind = 'game',
           title = 'Maths Foundation 1 — Arcade',
           description = 'Arcade drills for the number foundations: operations, tables and mental maths.',
           pinned = true,
           updated_at = now()
     where id = v_id;
  end if;

  -- Maths Foundation 2
  select id into v_id from public.resources
   where url = 'https://amanrajyadav.github.io/number-arcade-10-july/';

  if v_id is null then
    insert into public.resources (kind, title, description, url, pinned)
    values (
      'game',
      'Maths Foundation 2 — Number Arcade',
      'The follow-on arcade: larger numbers, mixed operations and speed rounds.',
      'https://amanrajyadav.github.io/number-arcade-10-july/',
      true
    );
  else
    update public.resources
       set kind = 'game',
           title = 'Maths Foundation 2 — Number Arcade',
           description = 'The follow-on arcade: larger numbers, mixed operations and speed rounds.',
           pinned = true,
           updated_at = now()
     where id = v_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- CBSE Class X Maths 2026-27 syllabus, for the Park tree.
--
-- Chapter names and ordering follow the official course structure (subject
-- code 041/241). This gives the Legend chapter picker something real to work
-- against, and gives you somewhere to file notes and PDFs per chapter.
--
-- Only inserted if that board/class/subject has no chapters yet, so your own
-- edits are never overwritten by a re-run.
-- ---------------------------------------------------------------------------

do $$
declare
  v_subject uuid;
  v_rows    integer;
begin
  insert into public.subjects (board_id, class_level, name, sort_order)
  values ('CBSE', 10, 'Mathematics', 0)
  on conflict (board_id, class_level, name) do nothing;

  select id into v_subject from public.subjects
   where board_id = 'CBSE' and class_level = 10 and name = 'Mathematics';

  select count(*) into v_rows from public.chapters where subject_id = v_subject;
  if v_rows > 0 then
    raise notice 'CBSE Class 10 Mathematics already has % chapters; leaving them alone.', v_rows;
    return;
  end if;

  insert into public.chapters (subject_id, number, name, sort_order) values
    (v_subject,  1, 'Real Numbers',                        1),
    (v_subject,  2, 'Polynomials',                         2),
    (v_subject,  3, 'Pair of Linear Equations in Two Variables', 3),
    (v_subject,  4, 'Quadratic Equations',                 4),
    (v_subject,  5, 'Arithmetic Progressions',             5),
    (v_subject,  6, 'Coordinate Geometry',                 6),
    (v_subject,  7, 'Triangles',                           7),
    (v_subject,  8, 'Circles',                             8),
    (v_subject,  9, 'Introduction to Trigonometry',        9),
    (v_subject, 10, 'Trigonometric Identities',           10),
    (v_subject, 11, 'Heights and Distances',              11),
    (v_subject, 12, 'Areas Related to Circles',           12),
    (v_subject, 13, 'Surface Areas and Volumes',          13),
    (v_subject, 14, 'Statistics',                         14),
    (v_subject, 15, 'Probability',                        15);
end $$;
