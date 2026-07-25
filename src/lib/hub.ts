import { supabase } from "./supabase";
import {
  AttendanceRecord,
  AttendanceStatus,
  Board,
  Bookmark,
  Chapter,
  ClassSummary,
  Resource,
  ResourceKind,
  Subject,
} from "../types";

// ---------------------------------------------------------------------------
// Row mapping. Postgres is snake_case, the app is camelCase.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

const toBoard = (r: any): Board => ({ id: r.id, name: r.name, sortOrder: r.sort_order });

const toSubject = (r: any): Subject => ({
  id: r.id,
  boardId: r.board_id,
  classLevel: r.class_level,
  name: r.name,
  sortOrder: r.sort_order,
});

const toChapter = (r: any): Chapter => ({
  id: r.id,
  subjectId: r.subject_id,
  number: r.number,
  name: r.name,
  sortOrder: r.sort_order,
});

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

const toSummary = (r: any): ClassSummary => ({
  id: r.id,
  date: r.date,
  branch: r.branch,
  subjectId: r.subject_id,
  chapterId: r.chapter_id,
  transcript: r.transcript,
  audioPath: r.audio_path,
  durationSeconds: r.duration_seconds,
  createdAt: r.created_at,
});

const toBookmark = (r: any): Bookmark => ({
  id: r.id,
  studentId: r.student_id,
  resourceId: r.resource_id,
  createdAt: r.created_at,
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
// Park tree
// ---------------------------------------------------------------------------

export async function fetchTree(): Promise<{
  boards: Board[];
  subjects: Subject[];
  chapters: Chapter[];
}> {
  const [boards, subjects, chapters] = await Promise.all([
    supabase.from("boards").select("*").order("sort_order"),
    supabase.from("subjects").select("*").order("class_level").order("sort_order").order("name"),
    supabase.from("chapters").select("*").order("sort_order").order("number"),
  ]);

  guard(boards.error);
  guard(subjects.error);
  guard(chapters.error);

  return {
    boards: (boards.data ?? []).map(toBoard),
    subjects: (subjects.data ?? []).map(toSubject),
    chapters: (chapters.data ?? []).map(toChapter),
  };
}

export async function upsertSubject(s: Partial<Subject>): Promise<void> {
  const { error } = await supabase.from("subjects").upsert({
    ...(s.id ? { id: s.id } : {}),
    board_id: s.boardId,
    class_level: s.classLevel,
    name: s.name,
    sort_order: s.sortOrder ?? 0,
  });
  guard(error);
}

export async function upsertChapter(c: Partial<Chapter>): Promise<void> {
  const { error } = await supabase.from("chapters").upsert({
    ...(c.id ? { id: c.id } : {}),
    subject_id: c.subjectId,
    number: c.number ?? null,
    name: c.name,
    sort_order: c.sortOrder ?? 0,
  });
  guard(error);
}

export async function deleteSubject(id: string): Promise<void> {
  guard((await supabase.from("subjects").delete().eq("id", id)).error);
}

export async function deleteChapter(id: string): Promise<void> {
  guard((await supabase.from("chapters").delete().eq("id", id)).error);
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export interface ResourceQuery {
  kinds?: ResourceKind[];
  chapterId?: string;
  subjectId?: string;
  /** Matched against title and description, case-insensitively. */
  search?: string;
  limit?: number;
}

export async function fetchResources(q: ResourceQuery = {}): Promise<Resource[]> {
  let query = supabase.from("resources").select("*");

  if (q.kinds?.length) query = query.in("kind", q.kinds);
  if (q.chapterId) query = query.eq("chapter_id", q.chapterId);
  if (q.subjectId) query = query.eq("subject_id", q.subjectId);

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
// Teaching summary (teacher-only)
// ---------------------------------------------------------------------------

export async function fetchSummaries(limit = 60): Promise<ClassSummary[]> {
  const { data, error } = await supabase
    .from("class_summaries")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  guard(error);
  return (data ?? []).map(toSummary);
}

export async function saveSummary(s: Partial<ClassSummary>): Promise<string> {
  const { data, error } = await supabase
    .from("class_summaries")
    .upsert({
      ...(s.id ? { id: s.id } : {}),
      date: s.date,
      branch: s.branch ?? null,
      subject_id: s.subjectId ?? null,
      chapter_id: s.chapterId ?? null,
      transcript: s.transcript ?? null,
      audio_path: s.audioPath ?? null,
      duration_seconds: s.durationSeconds ?? null,
    })
    .select("id")
    .single();

  guard(error);
  return (data as { id: string }).id;
}

export async function deleteSummary(id: string): Promise<void> {
  guard((await supabase.from("class_summaries").delete().eq("id", id)).error);
}

/** Uploads a recording and returns its storage path. */
export async function uploadAudio(blob: Blob, date: string): Promise<string> {
  const ext = blob.type.includes("mp4") ? "m4a" : "webm";
  const path = `${date}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("class-audio")
    .upload(path, blob, { contentType: blob.type, upsert: false });

  if (error) throw new Error(error.message);
  return path;
}

/** The bucket is private, so playback needs a short-lived signed URL. */
export async function signedAudioUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from("class-audio").createSignedUrl(path, 3600);
  return error ? null : data.signedUrl;
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

export async function fetchBookmarks(studentId: string): Promise<Bookmark[]> {
  const { data, error } = await supabase
    .from("student_bookmarks")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  guard(error);
  return (data ?? []).map(toBookmark);
}

export async function addBookmark(studentId: string, resourceId: string): Promise<void> {
  const { error } = await supabase.from("student_bookmarks").upsert({
    id: `${studentId}_${resourceId}`,
    student_id: studentId,
    resource_id: resourceId,
  });
  guard(error);
}

export async function removeBookmark(studentId: string, resourceId: string): Promise<void> {
  guard(
    (await supabase.from("student_bookmarks").delete().eq("id", `${studentId}_${resourceId}`)).error
  );
}
