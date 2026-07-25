import { useCallback, useEffect, useState } from "react";

/**
 * "Who is using this phone?"
 *
 * Students have no password. They pick their name once and the device
 * remembers it, which is enough to key bookmarks to a person. It is a
 * convenience, never a permission: nothing sensitive is gated on it, and the
 * database treats these visitors as anonymous regardless of the name chosen.
 */

const KEY = "fluence_student_id";

const read = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

export function useStudentIdentity() {
  const [studentId, setStudentId] = useState<string | null>(read);

  // Keep tabs on the same device in step.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setStudentId(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const choose = useCallback((id: string | null) => {
    try {
      if (id) localStorage.setItem(KEY, id);
      else localStorage.removeItem(KEY);
    } catch {
      // Private mode: the choice just won't survive a reload.
    }
    setStudentId(id);
  }, []);

  return { studentId, choose };
}
