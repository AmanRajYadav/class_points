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
