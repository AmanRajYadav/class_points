import { useCallback, useEffect, useState } from "react";
import { recordVisit } from "./hub";

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

  // Daily heartbeat. Once per calendar day per device rather than on every
  // render or route change: the question the teacher is asking is "did they
  // open it today", and a request per navigation would answer that no better
  // while making the visit count meaningless.
  useEffect(() => {
    if (!studentId) return;

    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
    const marker = `fluence_visit_marked_${studentId}`;
    let already: string | null = null;
    try {
      already = localStorage.getItem(marker);
    } catch {
      /* private mode: the beat just repeats */
    }
    if (already === today) return;

    void recordVisit(studentId).then(() => {
      try {
        localStorage.setItem(marker, today);
      } catch {
        /* ignore */
      }
    });
  }, [studentId]);

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
