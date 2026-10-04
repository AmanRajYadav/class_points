import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Flame,
  Loader2,
  Lock,
  Mic,
  Square,
  UserRoundX,
} from "lucide-react";

import { AttendanceStatus, Branch, DailyPoint, PointField, Student } from "../types";
import { fetchAttendance, markAttendance, markAttendanceBulk } from "../lib/hub";
import {
  dayTotal,
  formatDateString,
  HOMEWORK_STREAK,
  homeworkRuns,
  parseDateOnly,
  POINT_VALUES,
  PointCategory,
} from "../lib/storage";
import { Arrival, parseQuickEntry, ParsedMark } from "../lib/quickEntry";
import { useDictation } from "../lib/useDictation";
import { StudentAvatar } from "./StudentAvatar";

/**
 * The whole day on one screen.
 *
 * Marking used to mean walking the class one card at a time, so giving the
 * fifteenth student their homework point cost fourteen taps of "next" first.
 * That is fine at the door, where everyone is marked in order, and hopeless in
 * the evening, when homework and quiz screenshots arrive on WhatsApp one at a
 * time and in no order at all. Here every student is one tap away, or one
 * sentence: "Shourya homework and quiz, Utsav homework".
 */

interface Props {
  students: Student[];
  points: Record<string, DailyPoint>;
  editorMode: boolean;
  onUnlockRequest: () => void;
  onUpdatePoints: (studentId: string, date: string, category: PointField, value: number) => void;
  /** Bonus points and the rest of the detail live on the student card. */
  onOpenStudent: (student: Student) => void;
}

type BranchFilter = "All" | Branch;
const FILTERS: BranchFilter[] = ["All", "Mangla", "Sarkanda"];

/** What the arrival chip shows. `present` is a register mark with no on-time
 *  point behind it, made on the Attendance screen. */
type ArrivalState = Arrival | "present" | null;

const ARRIVAL_STYLE: Record<Exclude<ArrivalState, null>, { label: string; cls: string }> = {
  onTime: { label: "On time", cls: "bg-blue-600 border-blue-600 text-white" },
  late: { label: "Late", cls: "bg-amber-500 border-amber-500 text-white" },
  absent: { label: "Absent", cls: "bg-rose-500 border-rose-500 text-white" },
  present: { label: "Present", cls: "bg-emerald-50 border-emerald-200 text-emerald-700" },
};

const CHIP_OFF = "bg-white border-slate-200 text-slate-400 hover:border-slate-300";

const describe = (mark: ParsedMark): string =>
  [
    mark.arrival && ARRIVAL_STYLE[mark.arrival].label,
    mark.homework && "Homework",
    mark.quiz && "Quiz",
  ]
    .filter(Boolean)
    .join(" + ");

export const MarkSheet: React.FC<Props> = ({
  students,
  points,
  editorMode,
  onUnlockRequest,
  onUpdatePoints,
  onOpenStudent,
}) => {
  const [date, setDate] = useState<string>(() => formatDateString(new Date()));
  const [filter, setFilter] = useState<BranchFilter>("All");
  const [marks, setMarks] = useState<Record<string, AttendanceStatus> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [applied, setApplied] = useState<string | null>(null);

  const dictation = useDictation((heard) => {
    setApplied(null);
    setText((prev) => (prev.trim() ? `${prev.trim()} ${heard}` : heard));
  });

  const roster = useMemo(
    () => (filter === "All" ? students : students.filter((s) => s.branch === filter)),
    [students, filter]
  );

  const load = useCallback(async () => {
    setMarks(null);
    setError(null);
    try {
      const rows = await fetchAttendance(date, date);
      const next: Record<string, AttendanceStatus> = {};
      for (const r of rows) next[r.studentId] = r.status;
      setMarks(next);
    } catch (e) {
      // Points still work without the register, so the sheet stays usable.
      setError(e instanceof Error ? e.message : String(e));
      setMarks({});
    }
  }, [date]);

  useEffect(() => {
    if (editorMode) void load();
  }, [load, editorMode]);

  const dayPoints = (student: Student) => points[`${student.id}_${date}`];

  // The streak bonus is awarded by the database. On a project that has not
  // been given the rule yet no row carries the field, and promising a bonus
  // that will never arrive would be worse than saying nothing.
  const streakRuleLive = useMemo(
    () => Object.values(points).some((p) => p.streak !== undefined),
    [points]
  );
  const runs = useMemo(
    () => (streakRuleLive ? homeworkRuns(students, points, date) : new Map<string, number>()),
    [streakRuleLive, students, points, date]
  );

  const arrivalOf = (student: Student): ArrivalState => {
    // The point outranks the register: on time is on time, whatever else the
    // register was told earlier.
    if ((dayPoints(student)?.onTime ?? 0) > 0) return "onTime";
    return marks?.[student.id] ?? null;
  };

  const setArrival = async (student: Student, arrival: Arrival) => {
    const onTimeNow = (dayPoints(student)?.onTime ?? 0) > 0;
    if (arrival === "onTime" && !onTimeNow) {
      onUpdatePoints(student.id, date, "onTime", POINT_VALUES.onTime);
    } else if (arrival !== "onTime" && onTimeNow) {
      onUpdatePoints(student.id, date, "onTime", 0);
    }

    // Written here rather than left to the database trigger, which only fills
    // in a blank: someone marked late by mistake and then corrected to on time
    // would otherwise stay late in the register.
    const status: AttendanceStatus = arrival === "onTime" ? "present" : arrival;
    const previous = marks?.[student.id];
    setMarks((prev) => ({ ...(prev ?? {}), [student.id]: status }));
    try {
      await markAttendance(student.id, date, status);
    } catch (e) {
      setMarks((prev) => {
        const next = { ...(prev ?? {}) };
        if (previous) next[student.id] = previous;
        else delete next[student.id];
        return next;
      });
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** One tap for the common case, two for late, three for absent. */
  const cycleArrival = (student: Student) => {
    const current = arrivalOf(student);
    void setArrival(student, current === "onTime" ? "late" : current === "late" ? "absent" : "onTime");
  };

  const toggle = (student: Student, category: Exclude<PointCategory, "onTime">) => {
    const on = (dayPoints(student)?.[category] ?? 0) > 0;
    onUpdatePoints(student.id, date, category, on ? 0 : POINT_VALUES[category]);
  };

  const unmarked = roster.filter((s) => arrivalOf(s) === null);

  const markRestAbsent = async () => {
    const ids = unmarked.map((s) => s.id);
    if (ids.length === 0) return;
    if (!window.confirm(`Mark ${ids.length} student${ids.length === 1 ? "" : "s"} absent for this day?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await markAttendanceBulk(ids, date, "absent");
      setMarks((prev) => {
        const next = { ...(prev ?? {}) };
        for (const id of ids) next[id] = "absent";
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // --- Speak or type ---
  const parsed = useMemo(() => parseQuickEntry(text, roster), [text, roster]);

  const applyParsed = () => {
    for (const mark of parsed.marks) {
      if (mark.arrival) void setArrival(mark.student, mark.arrival);
      // Only ever switches on. Saying the same thing twice must not undo it.
      for (const category of ["homework", "quiz"] as const) {
        if (mark[category] && !((dayPoints(mark.student)?.[category] ?? 0) > 0)) {
          onUpdatePoints(mark.student.id, date, category, POINT_VALUES[category]);
        }
      }
    }
    const n = parsed.marks.length;
    setApplied(`Marked ${n} student${n === 1 ? "" : "s"}.`);
    setText("");
  };

  if (!editorMode) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/60 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-black text-slate-900 mt-3">Teacher only</h2>
        <p className="text-xs text-slate-400 font-semibold mt-1 max-w-xs mx-auto">
          Sign in to mark the class.
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

  const count = (category: PointCategory) =>
    roster.filter((s) => (dayPoints(s)?.[category] ?? 0) > 0).length;
  const hasNotes =
    parsed.unknown.length > 0 || parsed.ambiguous.length > 0 || parsed.nothingSaid.length > 0;

  return (
    <div className="space-y-4">
      {/* Date + branch */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-slate-900 leading-tight">Mark the day</h2>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
              {parseDateOnly(date).toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60 select-none">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                filter === f ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500"
              }`}
            >
              {f === "All" ? "Both" : f}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-black uppercase tracking-wider">
          <span className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-xl border border-blue-100 whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5" /> {count("onTime")} on time
          </span>
          <span className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2.5 py-1.5 rounded-xl border border-amber-100 whitespace-nowrap">
            <BookOpen className="w-3.5 h-3.5" /> {count("homework")} homework
          </span>
          <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded-xl border border-emerald-100 whitespace-nowrap">
            <Award className="w-3.5 h-3.5" /> {count("quiz")} quiz
          </span>
        </div>
      </div>

      {/* Speak or type */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5 space-y-3">
        <div className="flex items-start gap-2">
          <textarea
            value={text}
            onChange={(e) => {
              setApplied(null);
              setText(e.target.value);
            }}
            rows={2}
            placeholder="Say or type: Shourya homework and quiz, Utsav homework"
            className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-base font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
          />
          {dictation.available && (
            <button
              onClick={dictation.listening ? dictation.stop : dictation.start}
              aria-label={dictation.listening ? "Stop listening" : "Speak"}
              className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-95 cursor-pointer border ${
                dictation.listening
                  ? "bg-rose-500 border-rose-500 text-white animate-pulse"
                  : "bg-slate-800 border-slate-800 text-white hover:bg-slate-900"
              }`}
            >
              {dictation.listening ? <Square className="w-4 h-4" /> : <Mic className="w-5 h-5" />}
            </button>
          )}
        </div>

        {!text.trim() && (
          <p className="text-[11px] text-slate-400 font-semibold leading-snug">
            {applied ??
              (dictation.available
                ? "Tap the mic, or use the microphone on your keyboard. Nothing is saved until you press Mark."
                : "Use the microphone on your keyboard to speak. Nothing is saved until you press Mark.")}
          </p>
        )}

        {dictation.error && (
          <p className="text-[11px] font-bold text-red-600">{dictation.error}</p>
        )}

        {parsed.marks.length > 0 && (
          <div className="space-y-1.5">
            {parsed.marks.map((mark) => (
              <div
                key={mark.student.id}
                className="flex items-center gap-2.5 bg-slate-50 border border-slate-200/70 rounded-2xl px-3 py-2"
              >
                <StudentAvatar presetId={mark.student.avatarId} size="xs" />
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-slate-800 text-sm truncate">
                    {mark.student.name}
                    {mark.heardAs && (
                      <span className="ml-1.5 text-[10px] font-bold text-amber-600">
                        heard “{mark.heardAs}”
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 text-right">
                  {describe(mark)}
                </span>
              </div>
            ))}
          </div>
        )}

        {text.trim() && hasNotes && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-3.5 py-2.5 text-[11px] font-bold text-amber-800 space-y-1">
            {parsed.ambiguous.map((a, i) => (
              <p key={`a${i}`} className="flex gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  “{a.word}” could be {a.candidates.map((c) => c.name).join(" or ")} — tap the right
                  one below.
                </span>
              </p>
            ))}
            {parsed.unknown.length > 0 && (
              <p className="flex gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>Not a name on this list: {parsed.unknown.join(", ")}</span>
              </p>
            )}
            {parsed.nothingSaid.length > 0 && (
              <p className="flex gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                <span>
                  Nothing to mark for {parsed.nothingSaid.map((s) => s.name).join(", ")} — say
                  homework, quiz, on time, late or absent.
                </span>
              </p>
            )}
          </div>
        )}

        {parsed.marks.length > 0 && (
          <button
            onClick={applyParsed}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm py-3.5 rounded-2xl shadow transition-all active:scale-95 cursor-pointer"
          >
            <Check className="w-4 h-4" strokeWidth={3} />
            Mark {parsed.marks.length} student{parsed.marks.length === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 text-xs font-bold text-red-700">
          {error}
        </div>
      )}

      {/* The sheet */}
      {!marks ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      ) : roster.length === 0 ? (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center">
          <p className="text-sm font-extrabold text-slate-600">No students here yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-2.5 sm:p-4">
          <div className="divide-y divide-slate-100">
            {roster.map((student) => {
              const day = dayPoints(student);
              const arrival = arrivalOf(student);
              const total = day ? dayTotal(day) : 0;
              const run = runs.get(student.id) ?? 0;

              return (
                <div key={student.id} className="flex items-center gap-2 py-2 px-1.5">
                  <button
                    onClick={() => onOpenStudent(student)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <StudentAvatar presetId={student.avatarId} size="xs" className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-extrabold text-slate-800 text-sm truncate">
                        {student.name}
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] font-black font-mono text-slate-400 leading-tight">
                        {total !== 0 ? `${total > 0 ? "+" : ""}${total}` : "—"}
                        {run > 0 && (
                          <span
                            className={`flex items-center gap-0.5 ${
                              (day?.streak ?? 0) > 0 ? "text-orange-600" : "text-orange-400"
                            }`}
                            title={`${run} homework days in a row`}
                          >
                            <Flame className="w-3 h-3" />
                            {run}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>

                  <button
                    onClick={() => cycleArrival(student)}
                    className={`shrink-0 w-[68px] py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer ${
                      arrival ? ARRIVAL_STYLE[arrival].cls : `${CHIP_OFF} border-dashed`
                    }`}
                    style={{ touchAction: "manipulation" }}
                  >
                    {arrival ? ARRIVAL_STYLE[arrival].label : "Arrived?"}
                  </button>

                  <button
                    onClick={() => toggle(student, "homework")}
                    aria-pressed={(day?.homework ?? 0) > 0}
                    aria-label={`Homework, ${student.name}`}
                    className={`shrink-0 w-11 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer ${
                      (day?.homework ?? 0) > 0 ? "bg-amber-500 border-amber-500 text-white" : CHIP_OFF
                    }`}
                    style={{ touchAction: "manipulation" }}
                  >
                    HW
                  </button>

                  <button
                    onClick={() => toggle(student, "quiz")}
                    aria-pressed={(day?.quiz ?? 0) > 0}
                    aria-label={`Quiz, ${student.name}`}
                    className={`shrink-0 w-12 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer ${
                      (day?.quiz ?? 0) > 0 ? "bg-emerald-600 border-emerald-600 text-white" : CHIP_OFF
                    }`}
                    style={{ touchAction: "manipulation" }}
                  >
                    Quiz
                  </button>
                </div>
              );
            })}
          </div>

          <p className="text-[10px] font-semibold text-slate-400 text-center px-3 pt-3 pb-1 leading-snug">
            On time +{POINT_VALUES.onTime} · Homework +{POINT_VALUES.homework} · Quiz +
            {POINT_VALUES.quiz}
            {streakRuleLive &&
              ` · ${HOMEWORK_STREAK.days} homeworks in a row +${HOMEWORK_STREAK.bonus}`}
            . Tap the arrival box again for late, then absent. Tap a name for bonus points.
          </p>

          {/* Only once the register has been started, so an untouched day is
              never one stray tap from eighteen absences. */}
          {unmarked.length > 0 && unmarked.length < roster.length && (
            <button
              onClick={() => void markRestAbsent()}
              disabled={busy}
              className="mt-2 w-full flex items-center justify-center gap-2 bg-white border-2 border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50 font-black text-xs py-3 rounded-2xl transition-all active:scale-95 cursor-pointer"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserRoundX className="w-4 h-4" />}
              Mark the other {unmarked.length} absent
            </button>
          )}
        </div>
      )}
    </div>
  );
};
