import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { DailyPoint, Student } from "../types";

/**
 * The homework wall: every student's last seven homework days, in the open.
 *
 * Aman, 19 Nov 2026: the class should feel it. Whoever sends on time wears a
 * crown; whoever sends late or not at all is seen too. Kept playful on purpose
 * (a tortoise, a sleeping face), because these are fifteen-year-olds who have
 * to walk back into the same room tomorrow.
 *
 * A day is "on time" if the homework was uploaded on its own date or before
 * 4 pm the next day, or if Sir
 * ticked the homework point by hand for that date (a notebook shown in class).
 * "Late" is an upload after the date. Anything else, once the day is over, is
 * a miss. Today is never shown as a miss before it ends.
 */

export type DayMark = "ontime" | "late" | "miss" | "open";

interface WallRow { student_id: string; hw_date: string; status: "accepted" | "late" }

const ist = (offset = 0): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + offset * 86400000));

/** The counting starts the day the wall was announced. */
const WALL_START = "2026-11-20";

export function useHomeworkWall(): Map<string, "accepted" | "late"> {
  const [rows, setRows] = useState<WallRow[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () =>
      void supabase.rpc("homework_wall", { p_days: 8 }).then(({ data }) => {
        if (alive && data) setRows(data as WallRow[]);
      });
    load();
    const timer = window.setInterval(load, 60000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  return useMemo(() => new Map(rows.map((r) => [`${r.student_id}_${r.hw_date}`, r.status])), [rows]);
}

export function marksFor(
  studentId: string,
  wall: Map<string, "accepted" | "late">,
  points: Record<string, DailyPoint>,
  days = 7
): { date: string; mark: DayMark }[] {
  const today = ist();
  // Yesterday's homework can still come in on time until 4 pm today.
  const beforeFour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date())) < 16;
  const out: { date: string; mark: DayMark }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = ist(-i);
    if (date < WALL_START) continue;
    const key = `${studentId}_${date}`;
    const upload = wall.get(key);
    const ticked = (points[key]?.homework ?? 0) > 0;
    const mark: DayMark =
      upload === "accepted" || ticked ? "ontime" : upload === "late" ? "late" : date === today || (date === ist(-1) && beforeFour) ? "open" : "miss";
    out.push({ date, mark });
  }
  return out;
}

/** On-time days in a row, counting back from the latest finished or done day. */
export const currentRun = (marks: { mark: DayMark }[]): number => {
  let run = 0;
  for (let i = marks.length - 1; i >= 0; i--) {
    if (marks[i].mark === "open") continue;
    if (marks[i].mark !== "ontime") break;
    run++;
  }
  return run;
};

const FACE: Record<DayMark, { icon: string; label: string; cls: string }> = {
  ontime: { icon: "👑", label: "On time", cls: "bg-amber-50 border-amber-200" },
  late: { icon: "🐢", label: "Late", cls: "bg-orange-50 border-orange-200" },
  miss: { icon: "😴", label: "Not sent", cls: "bg-slate-100 border-slate-200 grayscale" },
  open: { icon: "·", label: "Still open", cls: "bg-white border-dashed border-slate-200 text-slate-300" },
};

const dayLetter = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" }).slice(0, 2);

export const HomeworkStrip: React.FC<{ marks: { date: string; mark: DayMark }[] }> = ({ marks }) => (
  <div className="flex gap-1">
    {marks.map(({ date, mark }) => (
      <div key={date} title={`${date}: ${FACE[mark].label}`} className="flex flex-col items-center gap-0.5">
        <span className={`w-7 h-7 rounded-lg border flex items-center justify-center text-sm ${FACE[mark].cls}`}>
          {FACE[mark].icon}
        </span>
        <span className="text-[8px] font-black uppercase text-slate-300">{dayLetter(date)}</span>
      </div>
    ))}
  </div>
);

export const HomeworkWall: React.FC<{
  students: Student[];
  points: Record<string, DailyPoint>;
  highlightId?: string | null;
}> = ({ students, points, highlightId }) => {
  const wall = useHomeworkWall();
  const branches: string[] = ["Sarkanda", "Mangla", "Personal"];

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 p-4 space-y-4">
      <div>
        <h2 className="text-xl font-black text-slate-900 leading-tight">Homework Wall</h2>
        <p className="text-xs text-slate-400 font-semibold mt-0.5">
          👑 on time · 🐢 late · 😴 not sent · 3 days in a row 👑 = +200
        </p>
      </div>

      {branches.map((branch) => {
        const list = students
          .filter((s) => (s.branch as string) === branch)
          .map((s) => {
            const marks = marksFor(s.id, wall, points);
            return { s, marks, run: currentRun(marks), done: marks.filter((m) => m.mark === "ontime").length };
          })
          .sort((a, b) => b.run - a.run || b.done - a.done || a.s.name.localeCompare(b.s.name));
        if (list.length === 0) return null;
        return (
          <div key={branch}>
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">{branch}</h3>
            <div className="divide-y divide-slate-100">
              {list.map(({ s, marks, run }) => {
                const lastTwoMissed = marks.filter((m) => m.mark !== "open").slice(-2).every((m) => m.mark === "miss") && marks.filter((m) => m.mark !== "open").length >= 2;
                return (
                  <div key={s.id} className={`py-2 flex items-center justify-between gap-2 ${s.id === highlightId ? "bg-indigo-50/60 -mx-2 px-2 rounded-xl" : ""}`}>
                    <div className="min-w-0">
                      <p className="font-black text-slate-800 text-sm truncate">
                        {run >= 3 ? "👑 " : lastTwoMissed ? "😴 " : ""}
                        {s.name}
                      </p>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {run >= 3 ? `${run} days in a row · King` : run > 0 ? `${run} day${run > 1 ? "s" : ""} in a row` : lastTwoMissed ? "Homework is sleeping" : "Start today"}
                      </p>
                    </div>
                    <HomeworkStrip marks={marks} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
