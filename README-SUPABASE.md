# ClassPoints — database setup

The scoreboard stores everything in Supabase. Points marked on your phone show
up on the classroom laptop, only you can change them, and scoring periods roll
over on their own.

## 1. Run the schema

1. Open **SQL Editor → New query** in your project.
2. Paste all of [`supabase/schema.sql`](supabase/schema.sql) and press **Run**.

Re-running is safe and is how you upgrade — the script drops the old columns
and the old wide-open policies, then recreates everything in its current form.

## 2. Create the teacher account

Editing is protected by a real Supabase Auth user, not by a PIN in the page.

1. **Authentication → Users → Add user → Create new user**.
2. Email: `teacher@classpoints.app` (this exact address — the app fills it in
   so you only ever type a password).
3. Pick a password, and tick **Auto Confirm User**.

To use a different address, set `VITE_TEACHER_EMAIL` in `.env.local` to match.

You can change the password later from the app: **Settings → Teacher Password**.

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

| Who | Can do |
| --- | --- |
| Anyone with the link | Read the board. No login. |
| Signed-in teacher | Everything else. |

Row level security enforces this in the database, so a student who flips
`editorMode` in devtools gets buttons whose writes are rejected server-side.

To add a second teacher, create another Supabase Auth user — the policies allow
any authenticated user to edit. Switch the unlock modal to collect an email as
well if you do.

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
comes from a row in `public.profiles` saying you are the teacher, checked by
`is_teacher()` inside each policy. An auth account with no profile row can sign
in and see exactly what a logged-out visitor sees.

That also means **an account is only a member of the class once you create its
profile** — so a stray or unwanted signup is inert rather than dangerous.

## Two Supabase settings you must change

**Authentication → Sign In / Providers → Email:**

| Setting | Value | Why |
| --- | --- | --- |
| Confirm email | **Off** | Usernames become internal addresses like `aman@students.fluence.local`. No inbox exists, so a confirmation link could never be clicked and every account would stay locked. |
| Allow new users to sign up | **On** | The app creates accounts through the normal sign-up call. Leaving it off means "Create account" fails. |

Sign-up being on does mean somebody with the anon key could create a login. It
gets them nothing — no profile, no membership, no leaderboard entry, no write
access. If you would rather close that off entirely, turn sign-ups off and
create users under **Authentication → Users** instead, then link each one in
Settings.

## Signing in

One form, one field: a username or an email address. Students type the username
you gave them; you type whatever address your own account uses. The role comes
off the profile after the session exists, so there is no teacher-specific
address configured anywhere — an earlier version hardcoded one, and any project
whose owner had signed up under a different address got "that password is not
right" forever, indistinguishable from a genuinely wrong password.

## Creating accounts

**Settings → Student Accounts**, with editor mode unlocked. Pick a student,
accept the suggested username, set a password.

**Write the password down.** There is no email on the account, so there is no
reset link — if it is forgotten, you create the account again.

## Hardening the teacher login

Students trying passwords on your login is worth answering properly, because
the app is public and the anon key is in the bundle by design.

What actually protects you, in order:

1. **A long teacher password.** This is the whole game. Four unrelated words
   beat a short complicated one, and neither is guessable at Supabase's request
   rate. Change it under Settings → Teacher Password.
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
