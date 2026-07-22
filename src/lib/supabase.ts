import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * The single teacher account. Only the password is ever typed — the unlock
 * screen keeps the one-field feel of the old PIN box while the check happens
 * in Supabase Auth rather than in the browser.
 */
export const TEACHER_EMAIL =
  (import.meta.env.VITE_TEACHER_EMAIL as string | undefined) ?? "teacher@classpoints.app";

/**
 * True when the app was built with Supabase credentials. When false the UI
 * shows a setup screen instead of silently falling back to browser-only
 * storage — silent fallback is exactly what made data look "saved" when it
 * wasn't.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient = createClient(
  url ?? "https://placeholder.supabase.co",
  anonKey ?? "placeholder",
  {
    auth: {
      // The teacher signs in once per device and stays signed in.
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "classpoints-auth",
    },
    realtime: { params: { eventsPerSecond: 5 } },
  }
);
