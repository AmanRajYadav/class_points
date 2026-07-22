import React, { useMemo, useState } from "react";
import { Award, ChevronLeft, ChevronRight, Crown, History } from "lucide-react";
import { motion } from "motion/react";
import { AppState, Student } from "../types";
import { StudentAvatar } from "./StudentAvatar";
import {
  calculateScores,
  currentPeriod,
  earliestRecordedDate,
  formatPeriod,
  Period,
  periodsInRange,
  startOfToday,
} from "../lib/storage";

const BRANCHES: Array<Student["branch"]> = ["Mangla", "Sarkanda"];

/**
 * Browser for finished periods.
 *
 * Nothing here is stored separately: daily point rows are never deleted, so
 * any past 1st–15th or 16th–end-of-month window can be recomputed exactly as
 * it stood. `trophy_winners` only records who was crowned.
 */
export const PastRecords: React.FC<{ state: AppState }> = ({ state }) => {
  const periods = useMemo(
    () => periodsInRange(earliestRecordedDate(state), startOfToday()),
    [state]
  );

  const live = currentPeriod();
  const [index, setIndex] = useState<number>(() =>
    // Open on the most recently *finished* period when there is one.
    periods.length > 1 && periods[0].startDate === live.startDate ? 1 : 0
  );

  // Clamped rather than early-returned: an early return here would sit above
  // the useMemo below and change the hook order between renders.
  const period: Period = periods[Math.min(index, periods.length - 1)] ?? live;
  const isLive = period.startDate === live.startDate;

  const standings = useMemo(
    () => calculateScores(state.students, state.points, period.startDate, period.endDate),
    [state.students, state.points, period.startDate, period.endDate]
  );

  const winnersThisPeriod = state.history.filter(
    (w) => w.cycleStartDate === period.startDate && w.cycleEndDate === period.endDate
  );

  const totalAwarded = standings.reduce((sum, s) => sum + s.cyclePoints, 0);

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200 shadow-sm">
      <div className="flex items-center gap-3 mb-5">
        <div className="bg-slate-100 p-2.5 rounded-2xl text-slate-500 border border-slate-200">
          <History className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-lg font-black text-slate-900 leading-tight">Past Records</h3>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
            Every 1st–15th and 16th–end of month
          </p>
        </div>
      </div>

      {/* Period stepper */}
      <div className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2">
        <button
          onClick={() => setIndex((i) => Math.min(periods.length - 1, i + 1))}
          disabled={index >= periods.length - 1}
          className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
          aria-label="Earlier period"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="text-center flex-1 min-w-0">
          <span className="block text-sm font-black text-slate-800 truncate">
            {formatPeriod(period)}
          </span>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {isLive ? "Running now" : `${totalAwarded} pts awarded`}
          </span>
        </div>

        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 cursor-pointer"
          aria-label="Later period"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Champions of this period */}
      {winnersThisPeriod.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
          {winnersThisPeriod.map((winner) => (
            <div
              key={winner.id}
              className="bg-gradient-to-br from-amber-500/5 to-yellow-500/10 border-2 border-yellow-200 rounded-2xl p-4 flex items-center gap-3"
            >
              <StudentAvatar presetId={winner.avatarId} size="sm" className="ring-2 ring-yellow-300" />
              <div className="min-w-0">
                <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-600">
                  <Crown className="w-3 h-3" /> {winner.branch} champion
                </span>
                <span className="block font-black text-slate-800 text-sm truncate">
                  {winner.studentName}
                </span>
                <span className="text-[11px] font-black font-mono text-indigo-600">
                  {winner.score} pts
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {isLive && (
        <p className="text-[11px] text-slate-400 font-semibold mt-4 text-center">
          This period is still running. Champions are crowned automatically when it ends.
        </p>
      )}

      {/* Full standings for the period, per branch */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
        {BRANCHES.map((branch) => {
          const ranked = standings
            .filter((s) => s.student.branch === branch)
            .sort((a, b) => b.cyclePoints - a.cyclePoints);

          return (
            <div key={branch}>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                {branch} Branch
              </h4>

              {ranked.every((s) => s.cyclePoints === 0) ? (
                <p className="text-slate-400 text-xs font-bold py-4 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  No points recorded.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {ranked.map((summary, rank) => (
                    <motion.div
                      key={summary.student.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 text-center font-black text-slate-400 font-mono text-[11px]">
                          {["🥇", "🥈", "🥉"][rank] ?? `#${rank + 1}`}
                        </span>
                        <StudentAvatar presetId={summary.student.avatarId} size="xs" />
                        <span className="font-extrabold text-slate-700 text-xs truncate">
                          {summary.student.name}
                        </span>
                      </div>
                      <span className="font-black font-mono text-indigo-600 text-sm shrink-0">
                        {summary.cyclePoints}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {periods.length === 1 && (
        <p className="text-[11px] text-slate-400 font-semibold mt-5 text-center flex items-center justify-center gap-1.5">
          <Award className="w-3.5 h-3.5" /> Earlier periods appear here as they finish.
        </p>
      )}
    </div>
  );
};
