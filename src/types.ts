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
