import { useEffect } from "react";
import { recordVisit } from "./hub";

/**
 * Daily "they opened it" heartbeat.
 *
 * Fires once per calendar day per device. More often would answer the question
 * no better while making the visit count meaningless, and the server derives
 * identity from the session token anyway — the id passed here is only a hint.
 */
export function useVisitLog(studentId: string | null) {
  useEffect(() => {
    if (!studentId) return;

    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
    const marker = `fluence_visit_marked_${studentId}`;

    let already: string | null = null;
    try {
      already = localStorage.getItem(marker);
    } catch {
      /* private mode: the beat just repeats, which is harmless */
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
}
