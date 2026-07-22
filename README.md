<div align="center">
  <img src="public/fluence_logo.png" width="96" alt="Fluence" />

  <h1>FLUENCE</h1>
  <p><em>Question Everything</em></p>
</div>

Classroom scoreboard for the Mangla and Sarkanda branches. Daily points for
punctuality, homework, quizzes and bonuses; branch leaderboards; and a trophy
awarded at the end of every half-month period.

Built with React, Vite and Tailwind, backed by Supabase.

## Run locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create the database tables and the teacher account — see
   [README-SUPABASE.md](README-SUPABASE.md). The app shows a setup screen until
   the schema exists.
3. Copy [.env.example](.env.example) to `.env.local` and fill in
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Start the dev server:
   ```bash
   npm run dev
   ```

The app is served from a sub-path (`http://localhost:3000/class_points/`),
matching how GitHub Pages hosts it. That is deliberate — serving dev from `/`
hides path bugs until they reach production. Vite prints the full URL on
startup.

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml).

**One-time setup:**

1. **Settings → Pages → Source: GitHub Actions**

   This one matters more than it looks. While the source is set to *Deploy from
   a branch*, GitHub runs its own `pages build and deployment` workflow that
   publishes the repository root verbatim — meaning the unbuilt `index.html`,
   whose `<script src="/src/main.tsx">` does not exist on a static host. The
   symptom is a blank page with `404` on `/src/main.tsx` and `/manifest.json`.

   Both workflows run on every push, so which one you get is a race. Switching
   the source to *GitHub Actions* removes the built-in one; nothing else does.

2. **Settings → Secrets and variables → Actions → Variables** — add:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | your anon public key |

   Repository *variables*, not secrets: Vite inlines these into the bundle at
   build time, so they are public either way, and secrets would be masked in
   the build logs for no benefit. Row level security is what protects the data
   — see [README-SUPABASE.md](README-SUPABASE.md#security-model).

   The workflow fails the build if these are missing rather than deploying an
   app stuck on its "not configured" screen.

   Adding or changing a variable does **not** rebuild anything on its own.
   Re-run the deploy afterwards: **Actions → Deploy to GitHub Pages → Run
   workflow**.

**Hosting somewhere else?** Set `BASE_PATH=/` when building, or edit the
default in [vite.config.ts](vite.config.ts).

## Layout

| Path | What it holds |
| --- | --- |
| `src/lib/db.ts` | Supabase reads, writes, and the realtime subscription |
| `src/lib/useAppState.ts` | Loads the board; optimistic edits + durable write queue |
| `src/lib/storage.ts` | Score maths, half-month period rules, offline cache |
| `src/lib/auth.ts` | Teacher session |
| `supabase/schema.sql` | Tables, RLS policies, rollover function, cron job |
