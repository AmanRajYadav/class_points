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
}

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
// Hub — the Park tree
// ---------------------------------------------------------------------------

export interface Board {
  id: string; // 'CBSE' | 'CG'
  name: string;
  sortOrder: number;
}

export interface Subject {
  id: string;
  boardId: string;
  classLevel: number;
  name: string;
  sortOrder: number;
}

export interface Chapter {
  id: string;
  subjectId: string;
  number: number | null;
  name: string;
  sortOrder: number;
}

// ---------------------------------------------------------------------------
// Hub — content
//
// Every content tool is a filtered view of Resource. Games, Notes and Notices
// filter by `kind`; Park filters by `chapterId`. Adding a tool means adding a
// filter, not a table.
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

/** Teacher-only daily teaching log. Students cannot read these at all. */
export interface ClassSummary {
  id: string;
  date: string; // YYYY-MM-DD
  branch: Branch | null;
  subjectId: string | null;
  chapterId: string | null;
  transcript: string | null;
  audioPath: string | null;
  durationSeconds: number | null;
  createdAt: string;
}

export interface Bookmark {
  id: string; // studentId_resourceId
  studentId: string;
  resourceId: string;
  createdAt: string;
}
