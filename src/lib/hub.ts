import { supabase } from "./supabase";
import {
  AttendanceRecord,
  AttendanceStatus,
  Resource,
  ResourceKind,
} from "../types";

// ---------------------------------------------------------------------------
// Row mapping. Postgres is snake_case, the app is camelCase.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

const toResource = (r: any): Resource => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  description: r.description,
  url: r.url,
  body: r.body,
  boardId: r.board_id,
  classLevel: r.class_level,
  subjectId: r.subject_id,
  chapterId: r.chapter_id,
  branch: r.branch,
  dueDate: r.due_date,
  pinned: r.pinned,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const fromResource = (r: Partial<Resource>) => ({
  ...(r.id ? { id: r.id } : {}),
  kind: r.kind,
  title: r.title,
  description: r.description ?? null,
  url: r.url ?? null,
  body: r.body ?? null,
  board_id: r.boardId ?? null,
  class_level: r.classLevel ?? null,
  subject_id: r.subjectId ?? null,
  chapter_id: r.chapterId ?? null,
  branch: r.branch ?? null,
  due_date: r.dueDate ?? null,
  pinned: r.pinned ?? false,
});

const toAttendance = (r: any): AttendanceRecord => ({
  id: r.id,
  studentId: r.student_id,
  date: r.date,
  status: r.status,
  note: r.note,
});

/** Distinguishes "the Hub tables aren't installed yet" from a real failure. */
export class HubSchemaMissingError extends Error {
  constructor() {
    super("The Hub tables were not found. Run supabase/02_hub.sql in the Supabase SQL editor.");
    this.name = "HubSchemaMissingError";
  }
}

const MISSING = new Set(["42P01", "PGRST205", "PGRST106"]);

const guard = (error: any) => {
  if (!error) return;
  if (MISSING.has(error.code)) throw new HubSchemaMissingError();

  // 42501 is an RLS refusal, which for this app means exactly one thing: the
  // teacher session is gone. Reaching it mid-task is plausible — a token
  // refresh can fail after the screen has already been unlocked — and the raw
  // Postgres wording explains nothing to the person holding the phone.
  if (error.code === "42501") {
    throw new Error("Your teacher session has expired. Unlock again to save this.");
  }

  throw new Error(error.message ?? String(error));
};

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export interface ResourceQuery {
  kinds?: ResourceKind[];
  /** Matched against title and description, case-insensitively. */
  search?: string;
  limit?: number;
}

export async function fetchResources(q: ResourceQuery = {}): Promise<Resource[]> {
  let query = supabase.from("resources").select("*");

  if (q.kinds?.length) query = query.in("kind", q.kinds);

  if (q.search?.trim()) {
    // Escape PostgREST's or() delimiters so a comma or paren in the query
    // cannot break out of the filter expression.
    const term = q.search.trim().replace(/[,()\\]/g, " ");
    query = query.or(`title.ilike.%${term}%,description.ilike.%${term}%,body.ilike.%${term}%`);
  }

  const { data, error } = await query
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(q.limit ?? 200);

  guard(error);
  return (data ?? []).map(toResource);
}

export async function saveResource(r: Partial<Resource>): Promise<void> {
  guard((await supabase.from("resources").upsert(fromResource(r))).error);
}

export async function deleteResource(id: string): Promise<void> {
  guard((await supabase.from("resources").delete().eq("id", id)).error);
}

/** Counts per kind, for the badges on the master menu tiles. */
export async function fetchKindCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("resources").select("kind");
  guard(error);

  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { kind: string }[]) {
    counts[row.kind] = (counts[row.kind] ?? 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export async function fetchAttendance(from: string, to: string): Promise<AttendanceRecord[]> {
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .gte("date", from)
    .lte("date", to);
  guard(error);
  return (data ?? []).map(toAttendance);
}

/** One day's punctuality signal for one student, read from the points table. */
export interface PunctualityRow {
  studentId: string;
  date: string;
  onTime: number;
}

/**
 * On-time points over a range.
 *
 * A student marked present whose row here has `on_time = 0` arrived late — the
 * two tables already record the same fact, so the register can report lateness
 * without it being entered twice. The row has to exist: a day with no points
 * entered at all means unknown, not late.
 */
export async function fetchPunctuality(from: string, to: string): Promise<PunctualityRow[]> {
  const { data, error } = await supabase
    .from("daily_points")
    .select("student_id,date,on_time")
    .gte("date", from)
    .lte("date", to);
  guard(error);
  return ((data ?? []) as { student_id: string; date: string; on_time: number }[]).map((r) => ({
    studentId: r.student_id,
    date: r.date,
    onTime: r.on_time,
  }));
}

export async function markAttendance(
  studentId: string,
  date: string,
  status: AttendanceStatus
): Promise<void> {
  const { error } = await supabase.from("attendance").upsert({
    id: `${studentId}_${date}`,
    student_id: studentId,
    date,
    status,
  });
  guard(error);
}

/** One round trip for "everyone present", rather than one per student. */
export async function markAttendanceBulk(
  studentIds: string[],
  date: string,
  status: AttendanceStatus
): Promise<void> {
  if (studentIds.length === 0) return;
  const { error } = await supabase.from("attendance").upsert(
    studentIds.map((studentId) => ({
      id: `${studentId}_${date}`,
      student_id: studentId,
      date,
      status,
    }))
  );
  guard(error);
}

// ---------------------------------------------------------------------------
// Activity
//
// Both writes go through security-definer functions, so a student's anonymous
// session needs no table privileges. Neither can be read back without the
// teacher session.
// ---------------------------------------------------------------------------

/** Fire-and-forget: a failed heartbeat must never interrupt anything. */
export async function recordVisit(studentId: string): Promise<void> {
  try {
    await supabase.rpc("record_visit", { p_student_id: studentId });
  } catch {
    /* ignore */
  }
}

export interface GameSessionInput {
  studentId: string | null;
  mode: "practice" | "survival";
  level: string;
  topics: string[];
  score: number;
  total: number;
  bestStreak: number;
  durationSeconds: number;
}

export async function recordGameSession(input: GameSessionInput): Promise<void> {
  try {
    await supabase.rpc("record_game_session", {
      p_student_id: input.studentId,
      p_game: "swipe_maths",
      p_mode: input.mode,
      p_level: input.level,
      p_topics: input.topics,
      p_score: input.score,
      p_total: input.total,
      p_best_streak: input.bestStreak,
      p_duration_seconds: input.durationSeconds,
    });
  } catch {
    /* a lost session record is not worth showing an error over */
  }
}

export interface ActivityDay {
  studentId: string;
  date: string;
  visits: number;
  lastSeen: string;
}

export interface GameSessionRow {
  id: string;
  studentId: string | null;
  mode: string | null;
  level: string | null;
  topics: string[] | null;
  score: number;
  total: number;
  bestStreak: number;
  durationSeconds: number | null;
  finishedAt: string;
}

export async function fetchActivity(from: string, to: string): Promise<ActivityDay[]> {
  const { data, error } = await supabase
    .from("student_activity")
    .select("student_id,date,visits,last_seen")
    .gte("date", from)
    .lte("date", to);
  guard(error);
  return ((data ?? []) as any[]).map((r) => ({
    studentId: r.student_id,
    date: r.date,
    visits: r.visits,
    lastSeen: r.last_seen,
  }));
}

export async function fetchGameSessions(from: string, limit = 300): Promise<GameSessionRow[]> {
  const { data, error } = await supabase
    .from("game_sessions")
    .select("*")
    .gte("finished_at", from)
    .order("finished_at", { ascending: false })
    .limit(limit);
  guard(error);
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    studentId: r.student_id,
    mode: r.mode,
    level: r.level,
    topics: r.topics,
    score: r.score,
    total: r.total,
    bestStreak: r.best_streak,
    durationSeconds: r.duration_seconds,
    finishedAt: r.finished_at,
  }));
}
