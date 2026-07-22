import { Student, DailyPoint, TrophyWinner, AppSettings, AppState } from "../types";

// Generate a random ID
export const generateId = () => Math.random().toString(36).substring(2, 9);

// ---------------------------------------------------------------------------
// Dates
//
// Everything in this app is a calendar date ("2026-07-16"), never an instant.
// `new Date("2026-07-16")` parses as UTC midnight while `new Date()` is local,
// so mixing the two shifted cycle boundaries by a day for anyone east or west
// of UTC. These helpers keep every comparison in local time.
// ---------------------------------------------------------------------------

/** Formats a Date as a local "YYYY-MM-DD" calendar date. */
export const formatDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** Parses "YYYY-MM-DD" into local midnight. */
export const parseDateOnly = (value: string): Date => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

/** Local midnight of the current day. */
export const startOfToday = (): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Whole days from `a` to `b`, both treated as calendar dates. */
export const daysBetween = (a: Date, b: Date): number =>
  Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

// ---------------------------------------------------------------------------
// Offline cache
//
// Supabase is the source of truth. This mirror exists only so the app can
// render something when the network is down; it is overwritten by every
// successful fetch and is never treated as authoritative.
// ---------------------------------------------------------------------------

const CACHE_KEY = "classpoints_offline_cache_v2";

/** The key the pre-Supabase build used as its only storage. */
export const LEGACY_STORAGE_KEY = "classroom_points_tracker_state";

export const readCachedState = (): AppState | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isAppStateShaped(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const writeCachedState = (state: AppState) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    // Quota or private-mode failures must never break the app: the cache is
    // an optimisation, not storage.
  }
};

export const clearCachedState = () => {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
};

/** Reads data left behind by the browser-only version, for one-time upload. */
export const readLegacyState = (): AppState | null => {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isAppStateShaped(parsed)) return null;
    if (parsed.students.length === 0 && Object.keys(parsed.points).length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const clearLegacyState = () => {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

export function isAppStateShaped(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<AppState>;
  return (
    Array.isArray(v.students) &&
    Array.isArray(v.history) &&
    !!v.points &&
    typeof v.points === "object" &&
    !Array.isArray(v.points) &&
    !!v.settings &&
    typeof v.settings === "object" &&
    typeof (v.settings as AppSettings).cycleStartDate === "string" &&
    typeof (v.settings as AppSettings).cycleEndDate === "string"
  );
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface StudentScoreSummary {
  student: Student;
  cyclePoints: number;
  lifetimePoints: number;
  categories: {
    onTime: number;
    homework: number;
    quiz: number;
    bonus: number;
  };
}

export const calculateScores = (
  students: Student[],
  points: Record<string, DailyPoint>,
  cycleStartDate: string,
  cycleEndDate: string
): StudentScoreSummary[] => {
  const start = parseDateOnly(cycleStartDate).getTime();
  const end = parseDateOnly(cycleEndDate).getTime();

  const summaries = new Map<string, StudentScoreSummary>(
    students.map((student) => [
      student.id,
      {
        student,
        cyclePoints: 0,
        lifetimePoints: 0,
        categories: { onTime: 0, homework: 0, quiz: 0, bonus: 0 },
      },
    ])
  );

  // One pass over the points instead of one pass per student.
  for (const p of Object.values(points)) {
    const summary = summaries.get(p.studentId);
    if (!summary) continue; // orphaned record for a deleted student

    const total = p.onTime + p.homework + p.quiz + p.bonus;
    summary.lifetimePoints += total;

    const day = parseDateOnly(p.date).getTime();
    if (day >= start && day <= end) {
      summary.cyclePoints += total;
      summary.categories.onTime += p.onTime;
      summary.categories.homework += p.homework;
      summary.categories.quiz += p.quiz;
      summary.categories.bonus += p.bonus;
    }
  }

  return students.map((s) => summaries.get(s.id)!);
};

// ---------------------------------------------------------------------------
// Semi-monthly periods
//
// Scoring runs 1st–15th and 16th–end of month. This mirrors cycle_start_for /
// cycle_end_for in supabase/schema.sql — the database is what actually advances
// the live window; these helpers are for display and for browsing history.
// ---------------------------------------------------------------------------

export interface Period {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export const periodForDate = (date: Date): Period => {
  const year = date.getFullYear();
  const month = date.getMonth();

  if (date.getDate() <= 15) {
    return {
      startDate: formatDateString(new Date(year, month, 1)),
      endDate: formatDateString(new Date(year, month, 15)),
    };
  }

  // Day 0 of the following month is the last day of this one, which handles
  // February and leap years without a special case.
  return {
    startDate: formatDateString(new Date(year, month, 16)),
    endDate: formatDateString(new Date(year, month + 1, 0)),
  };
};

export const currentPeriod = (): Period => periodForDate(startOfToday());

export const nextPeriod = (period: Period): Period =>
  periodForDate(addDays(parseDateOnly(period.endDate), 1));

export const previousPeriod = (period: Period): Period =>
  periodForDate(addDays(parseDateOnly(period.startDate), -1));

/** "1–15 Jul 2026" / "16–31 Jul 2026" */
export const formatPeriod = (period: Period): string => {
  const start = parseDateOnly(period.startDate);
  const end = parseDateOnly(period.endDate);
  const month = start.toLocaleDateString(undefined, { month: "short" });
  return `${start.getDate()}–${end.getDate()} ${month} ${start.getFullYear()}`;
};

/** Every period from `oldest` up to and including the one holding `newest`,
 *  most recent first. */
export const periodsInRange = (oldest: Date, newest: Date): Period[] => {
  const first = periodForDate(oldest);
  const periods: Period[] = [];
  let cursor = periodForDate(newest);

  // 40 years of half-months; a runaway loop here would hang the render.
  for (let i = 0; i < 1000; i++) {
    periods.push(cursor);
    if (cursor.startDate <= first.startDate) break;
    cursor = previousPeriod(cursor);
  }

  return periods;
};

// ---------------------------------------------------------------------------
// Trophies
// ---------------------------------------------------------------------------

const BRANCHES: Array<Student["branch"]> = ["Mangla", "Sarkanda"];

/** Top scorer per branch, skipping branches where nobody scored. */
export const pickCycleWinners = (
  summaries: StudentScoreSummary[],
  period: Period
): TrophyWinner[] => {
  const awardedAt = new Date().toISOString();

  return BRANCHES.flatMap((branch) => {
    const top = summaries
      .filter((s) => s.student.branch === branch)
      .sort((a, b) => b.cyclePoints - a.cyclePoints)[0];

    if (!top || top.cyclePoints <= 0) return [];

    return [
      {
        // Matches the id close_due_cycles() builds, so a manual award and the
        // scheduled one can never produce two rows for the same period.
        id: `w_${branch}_${period.startDate}`,
        studentId: top.student.id,
        studentName: top.student.name,
        avatarId: top.student.avatarId,
        score: top.cyclePoints,
        branch,
        cycleStartDate: period.startDate,
        cycleEndDate: period.endDate,
        awardedAt,
      },
    ];
  });
};

/** The period a set of points should be scored against, given the settings. */
export const settingsPeriod = (settings: AppSettings): Period => ({
  startDate: settings.cycleStartDate,
  endDate: settings.cycleEndDate,
});

/** Oldest date the scoreboard has any record of, for the history browser. */
export const earliestRecordedDate = (state: AppState): Date => {
  let oldest: string | null = null;

  for (const p of Object.values(state.points)) {
    if (!oldest || p.date < oldest) oldest = p.date;
  }
  for (const w of state.history) {
    if (!oldest || w.cycleStartDate < oldest) oldest = w.cycleStartDate;
  }

  return oldest ? parseDateOnly(oldest) : startOfToday();
};
