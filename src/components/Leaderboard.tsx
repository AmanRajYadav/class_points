import { useEffect, useMemo, useState } from "react";
import { Crown, Flame, Loader2, Medal, Timer, TrendingUp, Zap } from "lucide-react";
import { motion } from "motion/react";
import {
  fetchLeaderboard,
  formatCountdown,
  LeaderboardRow,
  levelProgress,
  msUntilWeeklyReset,
  rankFor,
  Scope,
} from "../lib/xp";
import { StudentAvatar } from "./StudentAvatar";

interface Props {
  /** Highlights the signed-in student's own row. */
  studentId: string | null;
}

const MEDALS = ["🥇", "🥈", "🥉"];

export const Leaderboard = ({ studentId }: Props) => {
  const [scope, setScope] = useState<Scope>("week");
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetIn, setResetIn] = useState<number>(msUntilWeeklyReset);

  useEffect(() => {
    let active = true;
    setRows(null);
    setError(null);

    fetchLeaderboard(scope)
      .then((r) => active && setRows(r))
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
        setRows([]);
      });

    return () => {
      active = false;
    };
  }, [scope]);

  // Ticks once a minute: the countdown is measured in hours, so a per-second
  // timer would re-render sixty times for nothing.
  useEffect(() => {
    const t = window.setInterval(() => setResetIn(msUntilWeeklyReset()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const me = useMemo(
    () => (studentId ? rows?.find((r) => r.studentId === studentId) : undefined),
    [rows, studentId]
  );
  const myRank = useMemo(
    () => (me && rows ? rows.filter((r) => r.xp > 0).findIndex((r) => r.studentId === me.studentId) + 1 : 0),
    [rows, me]
  );

  const scored = rows?.filter((r) => r.xp > 0) ?? [];
  const unscored = rows?.filter((r) => r.xp === 0) ?? [];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 leading-tight">XP Leaderboard</h2>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
                {scope === "week" ? "This week" : "All time"}
              </p>
            </div>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60 select-none">
            {(["week", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  scope === s ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
                }`}
              >
                {s === "week" ? "Week" : "All time"}
              </button>
            ))}
          </div>
        </div>

        {/* The weekly reset is the point of the weekly table: everyone starts
            level again, so being behind is never permanent. */}
        {scope === "week" && (
          <p className="mt-3 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 shrink-0" />
            Resets in {formatCountdown(resetIn)} — everyone starts from zero again.
          </p>
        )}
      </div>

      {/* Your own standing, pinned so it is never buried down the list. */}
      {me && (
        <MyCard row={me} rank={myRank} scope={scope} />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 text-xs font-bold text-red-700">
          {error}
        </div>
      )}

      {!rows && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      )}

      {rows && scored.length === 0 && (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center">
          <Zap className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-extrabold text-slate-600 mt-3">
            No XP {scope === "week" ? "this week" : "yet"}.
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            Play a round of Swipe Maths to get on the board.
          </p>
        </div>
      )}

      {scored.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5 space-y-1">
          {scored.map((row, i) => {
            const mine = row.studentId === studentId;
            const rank = rankFor(levelProgress(row.xp).level);

            return (
              <motion.div
                key={row.studentId}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i, 12) * 0.025 }}
                className={`flex items-center gap-3 py-2 px-2 rounded-2xl ${
                  mine ? "bg-indigo-50 ring-2 ring-indigo-200" : ""
                }`}
              >
                <span className="w-7 text-center font-black font-mono text-sm shrink-0">
                  {i < 3 ? (
                    <span className="text-base">{MEDALS[i]}</span>
                  ) : (
                    <span className="text-slate-400">{i + 1}</span>
                  )}
                </span>

                <StudentAvatar presetId={row.avatarId} size="xs" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`font-extrabold text-sm truncate ${mine ? "text-indigo-800" : "text-slate-800"}`}>
                      {row.studentName}
                    </span>
                    {mine && (
                      <span className="text-[9px] font-black uppercase tracking-wider text-indigo-600">
                        you
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">
                    {row.branch} · {row.sessions} game{row.sessions === 1 ? "" : "s"}
                  </span>
                </div>

                <span
                  className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg border shrink-0 ${rank.tint}`}
                >
                  {rank.title}
                </span>

                <div className="text-right shrink-0 w-16">
                  <span className="block text-base font-black font-mono text-amber-600 leading-none">
                    {row.xp.toLocaleString()}
                  </span>
                  <span className="text-[9px] uppercase font-black text-slate-400 tracking-widest">
                    XP
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Named but at zero. Being visibly absent is part of what makes the
          board work, but it stays plain — no red, no shaming. */}
      {unscored.length > 0 && scored.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5">
            Not on the board {scope === "week" ? "this week" : "yet"}
          </h3>
          <div className="flex flex-wrap gap-2">
            {unscored.map((row) => (
              <span
                key={row.studentId}
                className={`flex items-center gap-1.5 text-[11px] font-bold px-2 py-1.5 rounded-xl border ${
                  row.studentId === studentId
                    ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                    : "bg-slate-50 border-slate-200 text-slate-500"
                }`}
              >
                <StudentAvatar presetId={row.avatarId} size="xs" />
                {row.studentName}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function MyCard({ row, rank, scope }: { row: LeaderboardRow; rank: number; scope: Scope }) {
  const progress = levelProgress(row.xp);
  const title = rankFor(progress.level);

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-3xl p-5 shadow-lg">
      <div className="flex items-center gap-3">
        <StudentAvatar presetId={row.avatarId} size="sm" className="ring-2 ring-white/40" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-black text-base truncate">{row.studentName}</span>
            <span className="text-[9px] font-black uppercase tracking-wider bg-white/20 px-1.5 py-0.5 rounded">
              {title.title}
            </span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-200">
            Level {progress.level}
            {rank > 0 && ` · ${scope === "week" ? "#" + rank + " this week" : "#" + rank + " all time"}`}
          </span>
        </div>
        <div className="text-right shrink-0">
          <span className="block text-2xl font-black font-mono leading-none">
            {row.xp.toLocaleString()}
          </span>
          <span className="text-[9px] uppercase font-black tracking-widest text-indigo-200">XP</span>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-1">
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Level {progress.level}
          </span>
          <span>{progress.toNext.toLocaleString()} XP to {progress.level + 1}</span>
        </div>
        <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress.fraction * 100}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="bg-amber-400 h-full rounded-full"
          />
        </div>
      </div>

      {rank === 1 && (
        <p className="mt-3 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 text-amber-300">
          <Crown className="w-3.5 h-3.5" /> Top of the class
        </p>
      )}
      {rank > 1 && rank <= 3 && (
        <p className="mt-3 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 text-amber-200">
          <Medal className="w-3.5 h-3.5" /> On the podium
        </p>
      )}
      {row.sessions >= 3 && (
        <p className="mt-2 text-[11px] font-bold flex items-center gap-1.5 text-indigo-100">
          <Flame className="w-3.5 h-3.5 text-amber-300" /> {row.sessions} games{" "}
          {scope === "week" ? "this week" : "played"}
        </p>
      )}
    </div>
  );
}
