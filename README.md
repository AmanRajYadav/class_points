<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/139f67df-46f7-4952-8513-f3a9347427ad

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create the database tables — see [README-SUPABASE.md](README-SUPABASE.md).
   The app stores all points in Supabase and will show a setup screen until the
   schema exists.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in [.env.local](.env.local)
4. Run the app:
   `npm run dev`
