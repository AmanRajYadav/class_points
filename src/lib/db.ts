import { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { AppSettings, AppState, DailyPoint, Student, TrophyWinner } from "../types";
import { currentPeriod } from "./storage";

const currentPeriodDates = () => {
  const period = currentPeriod();
  return { cycleStartDate: period.startDate, cycleEndDate: period.endDate };
};

// ---------------------------------------------------------------------------
// Row <-> app-model mapping. Postgres columns are snake_case, the app is camel.
// `date` columns come back from PostgREST already formatted as "YYYY-MM-DD".
// ---------------------------------------------------------------------------

interface StudentRow {
  id: string;
  name: string;
  avatar_id: number;
  branch: "Mangla" | "Sarkanda";
  created_at: string;
}

interface DailyPointRow {
  id: string;
  student_id: string;
  date: string;
  on_time: number;
  homework: number;
  quiz: number;
  bonus: number;
}

interface TrophyWinnerRow {
  id: string;
  student_id: string | null;
  student_name: string;
  avatar_id: number;
  score: number;
  branch: "Mangla" | "Sarkanda";
  cycle_start_date: string;
  cycle_end_date: string;
  awarded_at: string;
}

interface AppSettingsRow {
  id: number;
  cycle_start_date: string;
  cycle_end_date: string;
  timezone: string;
  teacher_avatar_id: number;
}

const toStudent = (r: StudentRow): Student => ({
  id: r.id,
  name: r.name,
  avatarId: r.avatar_id,
  branch: r.branch,
  createdAt: r.created_at,
});

const fromStudent = (s: Student): StudentRow => ({
  id: s.id,
  name: s.name,
  avatar_id: s.avatarId,
  branch: s.branch,
  created_at: s.createdAt,
});

const toDailyPoint = (r: DailyPointRow): DailyPoint => ({
  id: r.id,
  studentId: r.student_id,
  date: r.date,
  onTime: r.on_time,
  homework: r.homework,
  quiz: r.quiz,
  bonus: r.bonus,
});

const fromDailyPoint = (p: DailyPoint): DailyPointRow => ({
  id: p.id,
  student_id: p.studentId,
  date: p.date,
  on_time: p.onTime,
  homework: p.homework,
  quiz: p.quiz,
  bonus: p.bonus,
});

const toWinner = (r: TrophyWinnerRow): TrophyWinner => ({
  id: r.id,
  studentId: r.student_id ?? "",
  studentName: r.student_name,
  avatarId: r.avatar_id,
  score: r.score,
  branch: r.branch,
  cycleStartDate: r.cycle_start_date,
  cycleEndDate: r.cycle_end_date,
  awardedAt: r.awarded_at,
});

const fromWinner = (w: TrophyWinner): TrophyWinnerRow => ({
  id: w.id,
  student_id: w.studentId || null,
  student_name: w.studentName,
  avatar_id: w.avatarId,
  score: w.score,
  branch: w.branch,
  cycle_start_date: w.cycleStartDate,
  cycle_end_date: w.cycleEndDate,
  awarded_at: w.awardedAt,
});

const toSettings = (r: AppSettingsRow): AppSettings => ({
  cycleStartDate: r.cycle_start_date,
  cycleEndDate: r.cycle_end_date,
  // Defaulted rather than required: a project still on the first version of
  // schema.sql has no timezone column, and the board should still render.
  timezone: r.timezone ?? "Asia/Kolkata",
  teacherAvatarId: r.teacher_avatar_id ?? 0,
});

const fromSettings = (s: AppSettings): AppSettingsRow => ({
  id: 1,
  cycle_start_date: s.cycleStartDate,
  cycle_end_date: s.cycleEndDate,
  timezone: s.timezone,
  teacher_avatar_id: s.teacherAvatarId ?? 0,
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class SchemaMissingError extends Error {
  constructor() {
    super(
      "The ClassPoints tables were not found in your Supabase project. " +
        "Open the Supabase SQL Editor and run supabase/schema.sql once."
    );
    this.name = "SchemaMissingError";
  }
}

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205", "PGRST106"]);

const raise = (error: PostgrestError): never => {
  if (MISSING_TABLE_CODES.has(error.code)) throw new SchemaMissingError();
  throw new Error(error.message);
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS: AppSettings = {
  ...currentPeriodDates(),
  timezone: "Asia/Kolkata",
  teacherAvatarId: 0,
};

/**
 * Asks the database to close out every period that has finished, crowning the
 * top scorer in each branch. Idempotent, so calling it on every load is safe;
 * a scheduled job runs the same function hourly for when nobody opens the app.
 *
 * Returns only the winners created by this call.
 */
export async function closeDueCycles(): Promise<TrophyWinner[]> {
  const { data, error } = await supabase.rpc("close_due_cycles");
  if (error) {
    // An older schema without the function should not stop the board loading.
    if (MISSING_TABLE_CODES.has(error.code) || error.code === "PGRST202") return [];
    raise(error);
  }
  return ((data ?? []) as TrophyWinnerRow[]).map(toWinner);
}

/** Loads the entire scoreboard. The dataset is tiny, so a full read is both
 *  simplest and the most reliable way to stay in sync. */
export async function fetchAppState(): Promise<AppState> {
  const [students, points, winners, settings] = await Promise.all([
    supabase.from("students").select("*").order("branch").order("name"),
    supabase.from("daily_points").select("*"),
    supabase.from("trophy_winners").select("*").order("awarded_at", { ascending: false }),
    supabase.from("app_settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  if (students.error) raise(students.error);
  if (points.error) raise(points.error);
  if (winners.error) raise(winners.error);
  if (settings.error) raise(settings.error);

  const pointsById: Record<string, DailyPoint> = {};
  for (const row of (points.data ?? []) as DailyPointRow[]) {
    const p = toDailyPoint(row);
    pointsById[p.id] = p;
  }

  return {
    students: ((students.data ?? []) as StudentRow[]).map(toStudent),
    points: pointsById,
    history: ((winners.data ?? []) as TrophyWinnerRow[]).map(toWinner),
    settings: settings.data
      ? toSettings(settings.data as AppSettingsRow)
      : DEFAULT_SETTINGS,
  };
}

// ---------------------------------------------------------------------------
// Writes
//
// Every operation is an idempotent upsert keyed by a stable primary key, so a
// queued write can be replayed after a dropped connection without duplicating
// anything. That property is what makes the offline queue in useAppState safe.
// ---------------------------------------------------------------------------

export type WriteOp =
  | { kind: "upsertPoint"; point: DailyPoint }
  | { kind: "upsertStudent"; student: Student }
  | { kind: "deleteStudent"; studentId: string }
  | { kind: "insertWinners"; winners: TrophyWinner[] }
  | { kind: "updateSettings"; settings: AppSettings }
  | { kind: "replaceAll"; state: AppState }
  | { kind: "wipeAll" };

export async function applyWriteOp(op: WriteOp): Promise<void> {
  switch (op.kind) {
    case "upsertPoint": {
      const { error } = await supabase
        .from("daily_points")
        .upsert({ ...fromDailyPoint(op.point), updated_at: new Date().toISOString() });
      if (error) raise(error);
      return;
    }

    case "upsertStudent": {
      const { error } = await supabase.from("students").upsert(fromStudent(op.student));
      if (error) raise(error);
      return;
    }

    case "deleteStudent": {
      // daily_points cascades; trophy_winners keeps the row with a null fk.
      const { error } = await supabase.from("students").delete().eq("id", op.studentId);
      if (error) raise(error);
      return;
    }

    case "insertWinners": {
      if (op.winners.length === 0) return;
      // ignoreDuplicates leans on the (branch, cycle_start, cycle_end) unique
      // index so a re-render or a second device cannot crown the same cycle twice.
      const { error } = await supabase
        .from("trophy_winners")
        .upsert(op.winners.map(fromWinner), {
          onConflict: "branch,cycle_start_date,cycle_end_date",
          ignoreDuplicates: true,
        });
      if (error) raise(error);
      return;
    }

    case "updateSettings": {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ ...fromSettings(op.settings), updated_at: new Date().toISOString() });
      if (error) raise(error);
      return;
    }

    case "replaceAll": {
      await applyWriteOp({ kind: "wipeAll" });
      const { students, points, history, settings } = op.state;
      if (students.length > 0) {
        const { error } = await supabase.from("students").upsert(students.map(fromStudent));
        if (error) raise(error);
      }
      const pointRows = Object.values(points).map(fromDailyPoint);
      if (pointRows.length > 0) {
        const { error } = await supabase.from("daily_points").upsert(pointRows);
        if (error) raise(error);
      }
      if (history.length > 0) {
        const { error } = await supabase.from("trophy_winners").upsert(history.map(fromWinner), {
          onConflict: "branch,cycle_start_date,cycle_end_date",
          ignoreDuplicates: true,
        });
        if (error) raise(error);
      }
      await applyWriteOp({ kind: "updateSettings", settings });
      return;
    }

    case "wipeAll": {
      // `neq` on the primary key matches every row; PostgREST refuses an
      // unfiltered delete.
      const winners = await supabase.from("trophy_winners").delete().neq("id", "");
      if (winners.error) raise(winners.error);
      const points = await supabase.from("daily_points").delete().neq("id", "");
      if (points.error) raise(points.error);
      const students = await supabase.from("students").delete().neq("id", "");
      if (students.error) raise(students.error);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

/** Calls `onChange` whenever any device writes to the scoreboard. Returns an
 *  unsubscribe function. */
export function subscribeToChanges(onChange: () => void): () => void {
  const channel = supabase.channel("classpoints-sync");

  for (const table of ["students", "daily_points", "trophy_winners", "app_settings"]) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
  }

  channel.subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
