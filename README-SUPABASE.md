# ClassPoints — database setup

The scoreboard stores everything in Supabase. Points marked on your phone show
up on the classroom laptop, only you can change them, and scoring periods roll
over on their own.

## 1. Run the schema

1. Open **SQL Editor → New query** in your project.
2. Paste all of [`supabase/schema.sql`](supabase/schema.sql) and press **Run**.

Re-running is safe and is how you upgrade — the script drops the old columns
and the old wide-open policies, then recreates everything in its current form.

## 2. Create the head account

Editing is protected by a real Supabase Auth user, not by a PIN in the page.

1. **Authentication → Users → Add user → Create new user**.
2. Email: `aman@admin.fluence.local`.
3. Pick a password, and tick **Auto Confirm User**.

Nothing is hardcoded — the address is only a convention (see **Roles** below).
`09_roles.sql` promotes whichever account it finds to `admin`, and aborts
rather than continuing if it cannot find one.

You can change your password from the app at any time: **Settings → Profile**.

## 3. Credentials

`.env.local` holds the project URL and **anon** key. `.env.local` is gitignored.

Anything prefixed `VITE_` is compiled into the JavaScript every visitor
downloads. The anon key is designed for that; the **service_role key is not** —
it bypasses row level security entirely. Since you pasted it into a chat, treat
it as exposed and rotate it under **Project Settings → API → service_role →
Reset**.

When you deploy, set the same variables in the host's environment. They are
read at build time, so rebuild after changing them.

## 4. Run

```bash
npm run dev
```

## How scoring periods work

Scoring runs in fixed half-month periods: **1st–15th**, then **16th–end of
month** (February and leap years included). At the end of each period the top
student in each branch is crowned and filed in the Hall of Fame, and the live
scoreboard starts again from zero.

Nothing is ever deleted. Scores "reset" because the scoring window moves, so
every past period stays fully reconstructable — that is what the **Past
Records** browser in the Hall of Fame tab shows: full standings for any period,
recomputed from the daily marks.

Two things drive the rollover, and both call the same function:

- `close_due_cycles()` runs whenever the app loads (once per calendar day per
  device), so the board is correct the moment anyone opens it.
- A `pg_cron` job runs it hourly, so the Hall of Fame fills in even if nobody
  opens the app for a month.

It is idempotent — a unique index on `(branch, cycle_start_date,
cycle_end_date)` means the same period can never be crowned twice, no matter
how many devices call it at once. If several periods have passed since the last
run, it closes each one in turn rather than skipping to the present.

The "when is it the 16th" question is answered in the timezone stored in
`app_settings.timezone` (default `Asia/Kolkata`), not in UTC.

## Security model

Row level security enforces this in the database, so a student who flips
`editorMode` in devtools gets buttons whose writes are rejected server-side.
See **Roles** below for who can do what.

## Tables

| Table | Holds |
| --- | --- |
| `students` | Roster: name, avatar, branch |
| `daily_points` | One row per student per day (`on_time`, `homework`, `quiz`, `bonus`) |
| `trophy_winners` | Hall of Fame, one champion per branch per period |
| `app_settings` | Single row: live period dates, timezone |

## Functions

| Function | Purpose |
| --- | --- |
| `cycle_start_for(date)` / `cycle_end_for(date)` | The 1st–15th / 16th–EOM rule |
| `close_due_cycles()` | Crowns and advances every finished period; returns the new winners |

---

# Student accounts, roles and XP

Run `supabase/05_accounts.sql` **after** the earlier files. It does something
the others did not: it **replaces every existing security policy**.

## Why it has to

Every policy written before it said *"writes allowed to `authenticated`"* —
which was safe only because exactly one person could authenticate. Giving
students logins makes them `authenticated` too, so under the old policies every
student could edit points, delete classmates and wipe the register.

After `05_accounts.sql`, being signed in grants nothing on its own. Authority
comes from the `role` on your row in `public.profiles`, checked inside each
policy. An auth account with no profile row can sign in and see exactly what a
logged-out visitor sees.

That also means **an account is only a member of the class once you create its
profile** — so a stray or unwanted signup is inert rather than dangerous.

---

# Roles

`supabase/09_roles.sql` splits the old two-role model (teacher = everything)
into four. Addresses carry the role, so an account says what it is on its face:

| Role | Address | Can do |
| --- | --- | --- |
| `admin` | `aman@admin.fluence.local` | Everything. Accounts, settings, the trophy period, deletions. |
| `editor` | `<name>@editor.fluence.local` | The day-to-day: roster, whole library, Park tree, activity screen — plus everything a teacher can do. |
| `teacher` | `jitesh@teacher.fluence.local` | Four surfaces: daily points, attendance, homework, and the teaching log. |
| `student` | `<name>@students.fluence.local` | Read the board; their own bookmarks, games and password. |
| — | no login | Read the board. |

None of these domains can receive mail. That is the point: no inbox to
compromise, and no confirmation link to chase.

## Why a teacher gets homework but not notes

Homework, notes, notices and resources are all rows in one `resources` table,
separated by `kind`. RLS is per row, so the teacher's policy carries
`kind = 'homework'` in **both** `USING` and `WITH CHECK`. `USING` decides which
existing rows they may touch; `WITH CHECK` decides what they may leave behind.
Either half alone would let them relabel their way into posting notices.

## Three predicates

| Function | True for | Guards |
| --- | --- | --- |
| `is_admin()` | admin | `profiles`, `app_settings`, `trophy_winners`, every delete of a student or a day's marks |
| `can_manage()` | admin, editor | `students`, `boards`, `subjects`, `chapters`, the library, `student_activity`, `game_sessions` |
| `can_teach()` | admin, editor, teacher | `daily_points`, `attendance`, `class_summaries`, homework rows |

`is_teacher()` still exists as an **alias for `is_admin()`**. It is kept rather
than deleted so that anything still calling it fails closed — a hire must not
inherit full rights because one policy was missed.

Deleting is admin-only on points and attendance. Deleting a day's marks is not
marking them; a mis-tap should overwrite a record, never erase it.

## Adding a hire

**Settings → Institution Control Panel → Staff → Add a hire.** Create the login
in **Authentication → Users** first, then paste the UID.

`admin` is deliberately not offered in that dropdown. Promoting somebody to head
of the institution is done in the SQL editor, because it is not a thing to do by
mis-tap:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = '<their address>');
```

Only an admin can write to `profiles` at all, which is the hinge the whole model
turns on: every other permission is a row in that table, so anyone who could
write there could grant themselves anything.

## A deadline baked into 09: Data API grants

Supabase is removing automatic exposure of public tables to the Data API. New
projects have worked this way since **2026-05-30**; it is enforced on every
remaining project on **2026-10-30**. This project predates the change and has
been running on implicit grants — so on that date every read in the app would
start returning a permission error at once.

`09_roles.sql` grants the same access explicitly, by name. It is not a
loosening: RLS decides who may do what, and a grant with no matching policy
still returns nothing. `anon` gets `SELECT` on the public surface and no write
anywhere; `authenticated` gets writes that the policies then narrow.

The script's last two checks exist because of those grants: every public table
must have RLS **on** (or the grant is the only thing between a student's login
and the roster) and must have **at least one policy** (RLS on with no policy
denies everything, which takes the app down just as thoroughly).

## Two Supabase settings you must change

**Authentication → Sign In / Providers → Email:**

| Setting | Value | Why |
| --- | --- | --- |
| Confirm email | **Off** | Usernames become internal addresses like `misti@students.fluence.local`. No inbox exists, so a confirmation link could never be clicked and every account would stay locked. |
| Allow new users to sign up | **Off** | Accounts are created in the dashboard and linked from Settings, so nothing in the app needs the sign-up endpoint. Leaving it on lets anybody with the anon key create a login — which gets them nothing, since a login with no profile row is inert, but there is no reason to allow it. |

## Signing in

One form, one field: a username or an email address. Students type just the
username you gave them — anything without an `@` gets the students domain. Staff
type their address in full, since the domain is what says which role they hold.
The role itself comes off the profile after the session exists, so there is no
staff-specific address configured anywhere — an earlier version hardcoded one, and any project
whose owner had signed up under a different address got "that password is not
right" forever, indistinguishable from a genuinely wrong password.

## Creating accounts

**Settings → Institution Control Panel**, signed in as admin. Create the login
under **Authentication → Users** in the dashboard, then link it here — the
browser cannot do the first step, because Supabase refuses any address whose
domain has no mail servers and rate limits sign-ups to about two an hour.

**Write the password down.** There is no email on the account, so there is no
reset link — if it is forgotten, set a new one from the dashboard.

Everyone can change their own password under **Settings → Profile**, which is
how a hire replaces the starter one you give them.

## Hardening the teacher login

Students trying passwords on your login is worth answering properly, because
the app is public and the anon key is in the bundle by design.

What actually protects you, in order:

1. **A long admin password.** This is the whole game. Four unrelated words
   beat a short complicated one, and neither is guessable at Supabase's request
   rate. Change it under Settings → Profile.
2. **Supabase's own rate limiting** on the auth endpoint, which applies no
   matter how anyone calls it. Tune it under **Authentication → Rate Limits**.
3. **Leaked-password protection** — **Authentication → Policies** — refuses
   passwords found in known breaches.
4. **MFA**, under Authentication → Providers, if you want the teacher account
   to need a code as well.

The app also backs off after three failed attempts, doubling from 5 seconds up
to five minutes. That is a deterrent inside the UI, not a security control —
anyone who knows how can call the endpoint directly, which is why the four
points above are what matter.

## How XP works

Awarded when a session is recorded, and **stored on the row** — so changing the
formula later cannot silently rewrite history and move everyone's totals.

```
XP = correct answers
   × (survival ? 15 : 10)      -- a mistake ends a survival run
   × (legend ? 3 : hard ? 2 : 1)  -- so Easy is not the efficient way to farm
   + best streak × 5           -- rewards sustained accuracy over guessing
```

Levels grow quadratically (`100 × (n−1) × n`), so level 2 arrives in a first
sitting while the high ones stay worth something. Ranks: Rookie, Cadet, Sharp,
Ace, Veteran, Elite, Legend.

The leaderboard is **weekly, resetting Monday**. That is the part of the
Duolingo mechanic that brings people back — a permanent all-time table tells
whoever is behind that catching up is hopeless, and they stop trying. An
all-time view is there as a second tab.

`game_sessions` is teacher-only, so the board is served by a `leaderboard()`
function that exposes exactly the aggregate everyone may see — name, XP,
level — and nothing about anyone's individual answers.

## One thing that got more trustworthy

`record_visit` and `record_game_session` used to believe whatever student id the
browser sent. They now take identity from the session token, falling back to the
parameter only for visitors who have not signed in. Activity figures for
signed-in students are therefore no longer device-claimed.
