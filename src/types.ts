export interface Student {
  id: string;
  name: string;
  avatarId: number; // Index from 0 to 15
  createdAt: string; // ISO string
  branch: 'Mangla' | 'Sarkanda';
}

export interface DailyPoint {
  id: string; // studentId_date
  studentId: string;
  date: string; // YYYY-MM-DD
  onTime: number; // 0 or 1
  homework: number; // 0 or 1
  quiz: number; // 0 or 1
  bonus: number; // 0 to 5
  /**
   * The homework-streak bonus for this day. Awarded by the database (see
   * supabase/15_homework_streak.sql) and never written from here. Missing on a
   * project that has not run that script, and in a cache saved before it.
   */
  streak?: number;
}

/** The parts of a day a teacher sets by hand. */
export type PointField = "onTime" | "homework" | "quiz" | "bonus";

export interface TrophyWinner {
  id: string;
  studentId: string;
  studentName: string;
  avatarId: number;
  score: number;
  branch: 'Mangla' | 'Sarkanda';
  cycleStartDate: string;
  cycleEndDate: string;
  awardedAt: string; // ISO string
}

export interface AppSettings {
  /**
   * The live scoring window. Always a semi-monthly period: the 1st–15th or the
   * 16th–end of month. Advanced by the database, not by hand.
   */
  cycleStartDate: string; // YYYY-MM-DD
  cycleEndDate: string; // YYYY-MM-DD
  /** IANA zone deciding when "the 16th" begins. Default Asia/Kolkata. */
  timezone: string;
  teacherAvatarId?: number; // teacher's selected avatar
}

export interface AppState {
  students: Student[];
  points: Record<string, DailyPoint>; // Keyed by studentId_date
  history: TrophyWinner[];
  settings: AppSettings;
}

export type Branch = Student["branch"];

// ---------------------------------------------------------------------------
// Hub — content
//
// Only `game` is still in use: the Games screen is a list of practice links.
// The other kinds stay in the type because rows of them still exist in the
// table from when Notes, Notices and the rest had screens of their own.
// ---------------------------------------------------------------------------

export type ResourceKind = "note" | "game" | "notice" | "video" | "pdf" | "link" | "homework";

export interface Resource {
  id: string;
  kind: ResourceKind;
  title: string;
  description: string | null;
  url: string | null;
  body: string | null;
  boardId: string | null;
  classLevel: number | null;
  subjectId: string | null;
  chapterId: string | null;
  /** null means both branches. */
  branch: Branch | null;
  dueDate: string | null; // YYYY-MM-DD
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AttendanceStatus = "present" | "absent" | "late";

export interface AttendanceRecord {
  id: string; // studentId_date
  studentId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  note: string | null;
}
