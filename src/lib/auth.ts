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
 * Authority does not come from being signed in. Every write policy asks the
 * database for a role off a profiles row only the head can create — so an
 * account without a profile can sign in and see precisely what a logged-out
 * visitor sees.
 *
 * There are four roles, and the split between them is the whole point: a hired
 * subject teacher runs their lessons and touches nothing else.
 *
 *   admin    the head of the institution. Everything.
 *   editor   the day-to-day: roster, library, Park tree, and all of the below.
 *   teacher  four surfaces — points, the register, homework, the teaching log.
 *   student  no writes beyond their own bookmarks and game sessions.
 */

/**
 * The address carries the role, so an account says what it is on its face.
 * None of these domains can receive mail — that is deliberate: no inbox to
 * compromise, no confirmation link to chase.
 */
export const ROLE_DOMAIN: Record<Role, string> = {
  admin: "admin.fluence.local",
  editor: "editor.fluence.local",
  teacher: "teacher.fluence.local",
  student: "students.fluence.local",
};

/** Usernames are the visible identity, so keep them predictable. */
export const normaliseUsername = (raw: string): string =>
  raw.trim().toLowerCase().replace(/\s+/g, "");

/**
 * A bare username is a student — eleven of the thirteen accounts, and the only
 * people who should never have to remember a domain. Staff type their address
 * in full, which is unambiguous and is what `signIn` passes through untouched.
 */
export const usernameToEmail = (username: string, role: Role = "student"): string =>
  `${normaliseUsername(username)}@${ROLE_DOMAIN[role]}`;

export const USERNAME_RULE = /^[a-z0-9][a-z0-9._-]{2,19}$/;

export const validateUsername = (raw: string): string | null => {
  const u = normaliseUsername(raw);
  if (u.length < 3) return "At least 3 characters.";
  if (u.length > 20) return "At most 20 characters.";
  if (!USERNAME_RULE.test(u)) return "Letters and numbers only (dots, dashes and underscores allowed).";
  return null;
};

export type Role = "admin" | "editor" | "teacher" | "student";

/** How a role is described to the person holding it. */
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Head of institution",
  editor: "Editor",
  teacher: "Teacher",
  student: "Student",
};

/** What each role can actually reach, in one line, for the profile screen. */
export const ROLE_SCOPE: Record<Role, string> = {
  admin: "Full access, including accounts and settings",
  editor: "Roster, library and Park — everything except accounts and settings",
  teacher: "Points, attendance, homework and the teaching log",
  student: "Your own profile, bookmarks and games",
};

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

  const role = profile?.role ?? null;

  return {
    session,
    profile,
    ready,
    /**
     * These decide which controls are drawn; the database decides what
     * actually saves, and it checks the same three predicates by the same
     * names (`is_admin`, `can_manage`, `can_teach` in 09_roles.sql).
     *
     * Three booleans rather than one `isTeacher`, because the old single flag
     * meant "can do everything" — reusing it for a hire would have handed them
     * the roster, the accounts and the trophy period along with their lessons.
     */
    isAdmin: role === "admin",
    canManage: role === "admin" || role === "editor",
    canTeach: role === "admin" || role === "editor" || role === "teacher",
    isStudent: role === "student",
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
 * There is no separate staff door, because there is nothing to distinguish at
 * this point: your role is a row on your profile, read after the session
 * exists.
 *
 * Everybody types their name. Splitting the roles onto their own domains was
 * right for the database and wrong here — it meant a bare username only ever
 * resolved to the students domain, so the head typing "aman" got "that
 * username or password is not right", which is indistinguishable from a wrong
 * password. Usernames are globally unique, so the database resolves the name
 * to its address; the students domain is only a fallback for when that call
 * cannot be made.
 *
 * An address typed in full is still passed through untouched.
 *
 * The teacher's address used to be a build-time constant, which meant a
 * project whose owner signed up under any other address got "that password is
 * not right" forever, with no way to tell it apart from a genuinely wrong
 * password. Nothing is hardcoded now.
 */
export async function signIn(identifier: string, password: string): Promise<string | null> {
  const id = identifier.trim();
  const email = id.includes("@") ? id.toLowerCase() : await resolveUsername(id);

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? friendly(error.message) : null;
}

/**
 * Username to internal address.
 *
 * Falls back to the students domain rather than failing, for two reasons: it is
 * where eleven of the thirteen accounts live, and a project that has not run
 * 11_username_login.sql yet still signs students in exactly as before.
 */
async function resolveUsername(username: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc("email_for_username", {
      p_username: normaliseUsername(username),
    });
    if (!error && typeof data === "string" && data.includes("@")) return data.toLowerCase();
  } catch {
    /* offline, or the function is not installed — fall through */
  }
  return usernameToEmail(username);
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

/** The roles a hire can be given from the app. */
export type StaffRole = "editor" | "teacher";

/**
 * Links a dashboard-created account to a member of staff.
 *
 * Never creates an `admin`. Making somebody head of the institution is a
 * deliberate act and belongs in the SQL editor, where it cannot be a mis-tap
 * in a dropdown. The database agrees: writing to profiles demands admin, so
 * this call fails outright for anyone else — which is what stops a hire
 * promoting themselves.
 */
export async function linkStaffAccount(
  userId: string,
  username: string,
  role: StaffRole
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
    student_id: null,
    role,
  });

  if (!error) return { error: null };

  const m = error.message.toLowerCase();
  if (m.includes("profiles_username_key")) return { error: "That username is already taken." };
  if (m.includes("profiles_pkey") || m.includes("duplicate key"))
    return { error: "That account is already linked." };
  if (m.includes("foreign key"))
    return { error: "No account with that UID exists. Create it in the dashboard first." };
  if (m.includes("row-level security"))
    return { error: "Only the head of the institution can add staff." };

  return { error: error.message };
}

export interface StaffAccount {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
}

export async function fetchStaffAccounts(): Promise<StaffAccount[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,username,role,created_at")
    .in("role", ["admin", "teacher"])
    .order("role")
    .order("username");

  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id,
    username: r.username,
    role: r.role,
    createdAt: r.created_at,
  }));
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
export async function revokeAccount(profileId: string): Promise<string | null> {
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
