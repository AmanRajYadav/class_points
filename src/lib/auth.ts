import { useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase, TEACHER_EMAIL } from "./supabase";

/**
 * Teacher session.
 *
 * `isTeacher` drives every edit control in the UI, but it is not the thing
 * protecting the data — row level security is. A student who flips this flag
 * in devtools gets buttons that fail server-side, which is the whole point of
 * moving off the PIN.
 */
export function useTeacherSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { session, isTeacher: session !== null, ready };
}

export async function signInAsTeacher(password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({
    email: TEACHER_EMAIL,
    password,
  });

  if (!error) return null;

  // Supabase returns the same message for a wrong password and an unknown
  // account; say something a teacher can act on.
  if (error.message.toLowerCase().includes("invalid login credentials")) {
    return "That password is not right.";
  }
  if (error.message.toLowerCase().includes("email not confirmed")) {
    return "The teacher account still needs confirming in the Supabase dashboard.";
  }
  return error.message;
}

export async function signOutTeacher(): Promise<void> {
  await supabase.auth.signOut();
}

export async function changeTeacherPassword(newPassword: string): Promise<string | null> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return error ? error.message : null;
}
