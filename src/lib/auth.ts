import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * Accounts.
 *
 * Nobody types an email. A username is turned into an internal address that
 * only Supabase Auth ever sees, so students with no inbox can still have real
 * logins and there are no confirmation links to chase.
 *
 * Authority does not come from being signed in. Every write policy asks
 * `is_teacher()`, which reads a role off a profiles row only the teacher can
 * create — so an account without a profile can sign in and see precisely what
 * a logged-out visitor sees.
 */

const STUDENT_DOMAIN = "students.fluence.local";

/** Usernames are the visible identity, so keep them predictable. */
export const normaliseUsername = (raw: string): string =>
  raw.trim().toLowerCase().replace(/\s+/g, "");

export const usernameToEmail = (username: string): string =>
  `${normaliseUsername(username)}@${STUDENT_DOMAIN}`;

export const USERNAME_RULE = /^[a-z0-9][a-z0-9._-]{2,19}$/;

export const validateUsername = (raw: string): string | null => {
  const u = normaliseUsername(raw);
  if (u.length < 3) return "At least 3 characters.";
  if (u.length > 20) return "At most 20 characters.";
  if (!USERNAME_RULE.test(u)) return "Letters and numbers only (dots, dashes and underscores allowed).";
  return null;
};

export type Role = "teacher" | "student";

export interface Profile {
  id: string;
  username: string;
  studentId: string | null;
  role: Role;
  createdAt: string;
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,student_id,role,created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    username: data.username,
    studentId: data.student_id,
    role: data.role,
    createdAt: data.created_at,
  };
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    const apply = async (next: Session | null) => {
      if (!active) return;
      setSession(next);
      setProfile(next ? await loadProfile(next.user.id) : null);
      if (active) setReady(true);
    };

    supabase.auth.getSession().then(({ data }) => void apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, next) => void apply(next));

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    profile,
    ready,
    /** Drives every edit control. The database checks this again on each write. */
    isTeacher: profile?.role === "teacher",
    isStudent: profile?.role === "student",
    studentId: profile?.studentId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Signing in
// ---------------------------------------------------------------------------

const friendly = (message: string): string => {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That username or password is not right.";
  if (m.includes("email not confirmed")) return "That account still needs confirming in Supabase.";
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Wait a minute before trying again.";
  }
  return message;
};

/**
 * One sign-in for everybody.
 *
 * There is no separate teacher door, because there is no longer anything to
 * distinguish at this point: whether you are the teacher is a role on your
 * profile, read after the session exists. An address is passed through as
 * typed; anything else is treated as a student username and expanded to its
 * internal address.
 *
 * The teacher's address used to be a build-time constant, which meant a
 * project whose owner signed up under any other address got "that password is
 * not right" forever, with no way to tell it apart from a genuinely wrong
 * password. Nothing is hardcoded now.
 */
export async function signIn(identifier: string, password: string): Promise<string | null> {
  const id = identifier.trim();
  const email = id.includes("@") ? id.toLowerCase() : usernameToEmail(id);

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? friendly(error.message) : null;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function changeOwnPassword(newPassword: string): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return error ? error.message : null;
}

// ---------------------------------------------------------------------------
// Provisioning (teacher only)
//
// Accounts are created in the Supabase dashboard, not from here, and the app
// links them afterwards. That is not a shortcut — the browser sign-up endpoint
// cannot do this job:
//
//   * It rejects any address whose domain has no MX records, so the synthetic
//     @students.fluence.local addresses are refused outright.
//   * It is rate limited to a couple of sign-ups an hour, so provisioning a
//     class through it would take most of a day.
//
// The dashboard uses the admin API, which is subject to neither. The admin API
// needs the service_role key, and that key must never reach a browser — so the
// account is made there, and the part that confers membership is done here.
// ---------------------------------------------------------------------------

const UUID_RULE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Links an account created in the dashboard to a student on the roster.
 *
 * The profile row *is* the membership: until it exists the account can sign in
 * and see exactly what a logged-out visitor sees.
 */
export async function linkStudentAccount(
  userId: string,
  username: string,
  studentId: string
): Promise<{ error: string | null }> {
  const id = userId.trim().toLowerCase();
  if (!UUID_RULE.test(id)) {
    return { error: "That does not look like a user UID. Copy it from Authentication → Users." };
  }

  const invalid = validateUsername(username);
  if (invalid) return { error: invalid };

  const { error } = await supabase.from("profiles").insert({
    id,
    username: normaliseUsername(username),
    student_id: studentId,
    role: "student",
  });

  if (!error) return { error: null };

  const m = error.message.toLowerCase();
  if (m.includes("profiles_username_key")) return { error: "That username is already taken." };
  if (m.includes("profiles_student_key")) return { error: "That student already has an account." };
  if (m.includes("profiles_pkey") || m.includes("duplicate key"))
    return { error: "That account is already linked." };
  if (m.includes("foreign key") || m.includes("violates foreign key"))
    return { error: "No account with that UID exists. Create it in the dashboard first." };

  return { error: error.message };
}

export interface StudentAccount {
  id: string;
  username: string;
  studentId: string | null;
}

export async function fetchStudentAccounts(): Promise<StudentAccount[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,student_id")
    .eq("role", "student")
    .order("username");

  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id,
    username: r.username,
    studentId: r.student_id,
  }));
}

/**
 * Removes the profile, which is what membership is. The auth account is left
 * behind — deleting it needs the service_role key, which must never reach the
 * browser — but without a profile it grants nothing and shows up nowhere.
 */
export async function revokeStudentAccount(profileId: string): Promise<string | null> {
  const { error } = await supabase.from("profiles").delete().eq("id", profileId);
  return error ? error.message : null;
}

// ---------------------------------------------------------------------------
// Login throttling
//
// Client-side, so it is a speed bump rather than a wall — anyone who knows how
// can call the auth endpoint directly, where Supabase's own rate limiting is
// the thing that actually stops them. Its job is to make casual guessing at the
// teacher password from inside the app tedious enough to give up on.
// ---------------------------------------------------------------------------

const ATTEMPTS_KEY = "fluence_login_attempts";

interface Attempts {
  count: number;
  until: number;
}

const readAttempts = (): Attempts => {
  try {
    return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) ?? '{"count":0,"until":0}');
  } catch {
    return { count: 0, until: 0 };
  }
};

const writeAttempts = (a: Attempts) => {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a));
  } catch {
    /* ignore */
  }
};

/** Seconds still to wait, or 0. */
export const lockoutRemaining = (): number => {
  const { until } = readAttempts();
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
};

export const noteFailedLogin = (): number => {
  const a = readAttempts();
  const count = a.count + 1;
  // Free for the first three — a typo should not cost anything. After that it
  // doubles: 5s, 10s, 20s … capped at five minutes.
  const delay = count <= 3 ? 0 : Math.min(300, 5 * 2 ** (count - 4));
  writeAttempts({ count, until: Date.now() + delay * 1000 });
  return delay;
};

export const clearFailedLogins = () => writeAttempts({ count: 0, until: 0 });
