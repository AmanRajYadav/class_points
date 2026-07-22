import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * An unset GitHub Actions variable arrives as an empty string, not as
 * undefined, so `??` would happily pass "" straight through to createClient —
 * which throws "supabaseUrl is required" at module load and takes the whole
 * app down before it can render the setup screen. Treat blank as absent.
 */
const configured = (value: unknown): string | undefined => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
};

const url = configured(import.meta.env.VITE_SUPABASE_URL);
const anonKey = configured(import.meta.env.VITE_SUPABASE_ANON_KEY);

/**
 * The single teacher account. Only the password is ever typed — the unlock
 * screen keeps the one-field feel of the old PIN box while the check happens
 * in Supabase Auth rather than in the browser.
 */
export const TEACHER_EMAIL =
  configured(import.meta.env.VITE_TEACHER_EMAIL) ?? "teacher@classpoints.app";

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
