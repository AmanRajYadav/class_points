import { useEffect, useMemo, useState } from "react";
import { Activity, Gamepad2, Loader2, Lock, TriangleAlert } from "lucide-react";
import { Student } from "../types";
import { ActivityDay, fetchActivity, fetchGameSessions, GameSessionRow } from "../lib/hub";
import { addDays, formatDateString, startOfToday } from "../lib/storage";
import { StudentAvatar } from "./StudentAvatar";

const WINDOWS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
] as const;

const STRIP_DAYS = 14;

interface Props {
  students: Student[];
  editorMode: boolean;
  onUnlockRequest: () => void;
}

interface Row {
  student: Student;
  daysSeen: number;
  visits: number;
  streak: number;
  lastSeen: string | null;
  sessions: GameSessionRow[];
  questionsAnswered: number;
  accuracy: number | null;
  recent: boolean[];
}

const relative = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
};

export const ActivityView = ({ students, editorMode, onUnlockRequest }: Props) => {
  const [days, setDays] = useState<number>(7);
  const [activity, setActivity] = useState<ActivityDay[] | null>(null);
  const [sessions, setSessions] = useState<GameSessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const today = startOfToday();
  const from = formatDateString(addDays(today, -(days - 1)));
  const to = formatDateString(today);

  useEffect(() => {
    if (!editorMode) return;
    let active = true;
    setActivity(null);
    setError(null);

    Promise.all([fetchActivity(from, to), fetchGameSessions(from)])
      .then(([a, s]) => {
        if (!active) return;
        setActivity(a);
        setSessions(s);
      })
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
        setActivity([]);
      });

    return () => {
      active = false;
    };
  }, [from, to, editorMode]);

  const stripDates = useMemo(
    () =>
      Array.from({ length: STRIP_DAYS }, (_, i) =>
        formatDateString(addDays(today, -(STRIP_DAYS - 1 - i)))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [to]
  );

  const rows: Row[] | null = useMemo(() => {
    if (!activity) return null;

    const byStudent = new Map<string, ActivityDay[]>();
    for (const a of activity) {
      if (!byStudent.has(a.studentId)) byStudent.set(a.studentId, []);
      byStudent.get(a.studentId)!.push(a);
    }

    const sessionsByStudent = new Map<string, GameSessionRow[]>();
    for (const s of sessions) {
      if (!s.studentId) continue;
      if (!sessionsByStudent.has(s.studentId)) sessionsByStudent.set(s.studentId, []);
      sessionsByStudent.get(s.studentId)!.push(s);
    }

    return students
      .map((student) => {
        const mine = byStudent.get(student.id) ?? [];
        const seenDates = new Set(mine.map((d) => d.date));

        // Current streak, counting back from today. Yesterday is allowed as the
        // start so a streak is not shown as broken before the day is over.
        let streak = 0;
        for (let i = 0; i < 400; i++) {
          const d = formatDateString(addDays(today, -i));
          if (seenDates.has(d)) streak++;
          else if (i > 0) break;
        }

        const mySessions = sessionsByStudent.get(student.id) ?? [];
        const answered = mySessions.reduce((sum, s) => sum + s.total, 0);
        const right = mySessions.reduce((sum, s) => sum + s.score, 0);
        const lastSeen = mine.map((d) => d.lastSeen).sort().at(-1) ?? null;

        return {
          student,
          daysSeen: seenDates.size,
          visits: mine.reduce((sum, d) => sum + d.visits, 0),
          streak,
          lastSeen,
          sessions: mySessions,
          questionsAnswered: answered,
          accuracy: answered === 0 ? null : Math.round((right / answered) * 100),
          recent: stripDates.map((d) => seenDates.has(d)),
        };
      })
      // Quietest first: this screen exists to surface who is not showing up.
      .sort((a, b) => a.daysSeen - b.daysSeen || a.questionsAnswered - b.questionsAnswered);
  }, [activity, sessions, students, stripDates, today]);

  const unattributed = sessions.filter((s) => !s.studentId).length;
  const activeToday = rows?.filter((r) => r.recent.at(-1)).length ?? 0;
  const practised = rows?.filter((r) => r.sessions.length > 0).length ?? 0;

  if (!editorMode) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/60 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-black text-slate-900 mt-3">Teacher only</h2>
        <p className="text-xs text-slate-400 font-semibold mt-1 max-w-xs mx-auto">
          Unlock editor mode to see who is using the app.
        </p>
        <button
          onClick={onUnlockRequest}
          className="mt-4 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs rounded-xl shadow transition-all active:scale-95 cursor-pointer"
        >
          Unlock
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 leading-tight">Activity</h2>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
                Who is opening it, who is practising
              </p>
            </div>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60 select-none">
            {WINDOWS.map((w) => (
              <button
                key={w.days}
                onClick={() => setDays(w.days)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                  days === w.days ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {rows && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            <Stat label="Opened today" value={`${activeToday}/${students.length}`} />
            <Stat label="Practised" value={`${practised}/${students.length}`} />
            <Stat label="Sessions" value={`${sessions.length}`} />
          </div>
        )}
      </div>

      {/* The honesty note. Without it these numbers read as harder evidence
          than they are. */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
        <TriangleAlert className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
          Students have no password — the app knows a name because one was picked on
          that device. Treat this as a signal about engagement, not proof about a
          particular student.
          {unattributed > 0 && (
            <>
              {" "}
              <span className="text-amber-700 font-bold">
                {unattributed} session{unattributed === 1 ? "" : "s"} came from a device
                that never picked a name.
              </span>
            </>
          )}
        </p>
      </div>

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

      {rows && (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5 space-y-3.5">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Quietest first
          </h3>

          {rows.map((row) => (
            <div key={row.student.id} className="flex items-center gap-3">
              <StudentAvatar presetId={row.student.avatarId} size="xs" />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-extrabold text-slate-800 text-sm truncate">
                    {row.student.name}
                  </span>
                  {row.streak >= 2 && (
                    <span className="text-[9px] font-black uppercase tracking-wider text-orange-600 bg-orange-50 px-1.5 rounded shrink-0">
                      {row.streak}-day streak
                    </span>
                  )}
                  {row.daysSeen === 0 && (
                    <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 rounded shrink-0">
                      never opened
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-[3px] mt-1">
                  {row.recent.map((seen, i) => (
                    <span
                      key={i}
                      title={`${stripDates[i]}: ${seen ? "opened" : "not opened"}`}
                      className={`h-2 flex-1 max-w-[10px] rounded-full ${
                        seen ? "bg-indigo-500" : "bg-slate-200"
                      }`}
                    />
                  ))}
                </div>

                <p className="text-[10px] font-bold text-slate-400 mt-1">
                  {row.lastSeen ? `Last seen ${relative(row.lastSeen)}` : "No visits recorded"}
                  {row.sessions.length > 0 && (
                    <>
                      {" · "}
                      <span className="text-fuchsia-600">
                        {row.sessions.length} game{row.sessions.length === 1 ? "" : "s"},{" "}
                        {row.questionsAnswered} questions
                        {row.accuracy !== null && ` at ${row.accuracy}%`}
                      </span>
                    </>
                  )}
                </p>
              </div>

              <div className="text-right shrink-0">
                <span
                  className={`block text-base font-black font-mono leading-none ${
                    row.daysSeen === 0 ? "text-slate-300" : "text-indigo-600"
                  }`}
                >
                  {row.daysSeen}
                </span>
                <span className="text-[9px] uppercase font-black text-slate-400 tracking-widest">
                  of {days} days
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Session history */}
      {rows && sessions.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <Gamepad2 className="w-3.5 h-3.5" /> Recent games
          </h3>

          <div className="space-y-2">
            {sessions.slice(0, 40).map((s) => {
              const who = students.find((st) => st.id === s.studentId);
              const pct = s.total === 0 ? 0 : Math.round((s.score / s.total) * 100);
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-2.5 py-1.5 border-b border-slate-50 last:border-0"
                >
                  {who ? (
                    <StudentAvatar presetId={who.avatarId} size="xs" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[9px] font-black text-slate-400 shrink-0">
                      ?
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-extrabold text-slate-700 truncate">
                      {who?.name ?? "Unidentified device"}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 capitalize">
                      {s.mode ?? "?"} · {s.level ?? "?"} · {relative(s.finishedAt)}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`block text-sm font-black font-mono leading-none ${
                        pct >= 75 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-rose-600"
                      }`}
                    >
                      {s.score}/{s.total}
                    </span>
                    {s.bestStreak > 2 && (
                      <span className="text-[9px] uppercase font-black text-orange-500 tracking-widest">
                        {s.bestStreak} streak
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {rows && sessions.length === 0 && (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center">
          <p className="text-sm font-extrabold text-slate-600">No games played yet.</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            Sessions appear here as soon as anyone finishes a round of Swipe Maths.
          </p>
        </div>
      )}
    </div>
  );
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200/60 rounded-2xl px-3 py-2.5 text-center">
      <span className="block text-lg font-black font-mono text-slate-800 leading-none">{value}</span>
      <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">
        {label}
      </span>
    </div>
  );
}
