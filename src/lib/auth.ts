import { useEffect, useState } from "react";
import { createClient, Session } from "@supabase/supabase-js";
import { supabase, TEACHER_EMAIL } from "./supabase";

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
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,student_id,role")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    id: data.id,
    username: data.username,
    studentId: data.student_id,
    role: data.role,
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

export async function signInTeacher(password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({
    email: TEACHER_EMAIL,
    password,
  });
  return error ? friendly(error.message) : null;
}

export async function signInStudent(username: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
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
// ---------------------------------------------------------------------------

/**
 * Creating an account signs you in as it. That would throw the teacher out of
 * their own session mid-task, so provisioning runs on a second client with its
 * own storage key and no persistence: it signs the new user in, in a scope
 * nothing reads, and the teacher's session is untouched.
 */
const provisioningClient = () =>
  createClient(
    import.meta.env.VITE_SUPABASE_URL as string,
    import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        storageKey: "fluence-provisioning",
      },
    }
  );

export interface CreateAccountResult {
  error: string | null;
}

/**
 * Creates a login and links it to a student on the roster.
 *
 * The auth account and the profile are separate steps, and the profile is what
 * grants membership — so if the second step fails, the leftover account can do
 * nothing until the teacher retries.
 */
export async function createStudentAccount(
  username: string,
  password: string,
  studentId: string
): Promise<CreateAccountResult> {
  const invalid = validateUsername(username);
  if (invalid) return { error: invalid };
  if (password.length < 6) return { error: "Password must be at least 6 characters." };

  const client = provisioningClient();
  const { data, error } = await client.auth.signUp({
    email: usernameToEmail(username),
    password,
  });

  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("already registered") || m.includes("already been registered")) {
      return { error: "That username is taken." };
    }
    if (m.includes("signups not allowed") || m.includes("signup is disabled")) {
      return {
        error:
          "Sign-ups are disabled in Supabase. Turn on Authentication → Sign In / Providers → Allow new users to sign up.",
      };
    }
    return { error: error.message };
  }

  const userId = data.user?.id;
  if (!userId) {
    return { error: "Supabase created no user. Check that email confirmation is turned off." };
  }

  // Written by the teacher's own session, so the row is created under their
  // rights rather than the new account's.
  const { error: profileError } = await supabase.from("profiles").insert({
    id: userId,
    username: normaliseUsername(username),
    student_id: studentId,
    role: "student",
  });

  await client.auth.signOut();

  if (profileError) {
    return {
      error: profileError.message.includes("duplicate")
        ? "That username or student already has an account."
        : profileError.message,
    };
  }

  return { error: null };
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
