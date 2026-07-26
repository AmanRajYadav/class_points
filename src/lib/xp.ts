import { supabase } from "./supabase";

/**
 * XP, levels and ranks.
 *
 * The XP number itself is computed in the database when a session is recorded
 * and stored on the row — see record_game_session in 05_accounts.sql. Changing
 * the formula later therefore cannot silently rewrite history and move
 * everyone's totals overnight.
 *
 * What lives here is the presentation of that number: how it maps to a level,
 * what the level is called, and how far the next one is.
 */

/**
 * XP needed to *reach* a level, growing quadratically.
 *
 * Linear thresholds make the tenth level as easy as the first, and the ladder
 * stops meaning anything. Quadratic keeps early levels quick — a student
 * should see level 2 in their first sitting — while making the high ones worth
 * something.
 */
export const xpForLevel = (level: number): number =>
  level <= 1 ? 0 : 100 * (level - 1) * level;

export const levelForXp = (xp: number): number => {
  let level = 1;
  while (xpForLevel(level + 1) <= xp && level < 200) level++;
  return level;
};

export interface LevelProgress {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. */
  span: number;
  /** 0–1. */
  fraction: number;
  toNext: number;
}

export const levelProgress = (xp: number): LevelProgress => {
  const level = levelForXp(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const span = Math.max(1, next - base);
  const into = xp - base;

  return {
    level,
    into,
    span,
    fraction: Math.min(1, into / span),
    toNext: Math.max(0, next - xp),
  };
};

/** Rank titles, so a level is something to say out loud rather than a number. */
const RANKS: { from: number; title: string; tint: string }[] = [
  { from: 1, title: "Rookie", tint: "bg-slate-100 text-slate-600 border-slate-200" },
  { from: 4, title: "Cadet", tint: "bg-sky-50 text-sky-700 border-sky-200" },
  { from: 8, title: "Sharp", tint: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { from: 13, title: "Ace", tint: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { from: 19, title: "Veteran", tint: "bg-violet-50 text-violet-700 border-violet-200" },
  { from: 26, title: "Elite", tint: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  { from: 35, title: "Legend", tint: "bg-amber-50 text-amber-700 border-amber-200" },
];

export const rankFor = (level: number) =>
  [...RANKS].reverse().find((r) => level >= r.from) ?? RANKS[0];

export interface LeaderboardRow {
  studentId: string;
  studentName: string;
  avatarId: number;
  branch: string;
  xp: number;
  sessions: number;
}

export type Scope = "week" | "all";

/**
 * Reads the leaderboard through a function rather than the tables, because
 * game_sessions is teacher-only: this exposes the aggregate everyone may see
 * and nothing about anyone's individual answers.
 */
export async function fetchLeaderboard(scope: Scope): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc("leaderboard", { p_scope: scope });
  if (error) throw new Error(error.message);

  return ((data ?? []) as any[]).map((r) => ({
    studentId: r.student_id,
    studentName: r.student_name,
    avatarId: r.avatar_id,
    branch: r.branch,
    xp: Number(r.xp ?? 0),
    sessions: Number(r.sessions ?? 0),
  }));
}

/** Milliseconds until the weekly table resets (Monday 00:00 local). */
export const msUntilWeeklyReset = (): number => {
  const now = new Date();
  const next = new Date(now);
  const daysAhead = (8 - now.getDay()) % 7 || 7; // Sunday is 0, so Monday is 1
  next.setDate(now.getDate() + daysAhead);
  next.setHours(0, 0, 0, 0);
  return next.getTime() - now.getTime();
};

export const formatCountdown = (ms: number): string => {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
};
