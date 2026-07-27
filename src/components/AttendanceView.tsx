import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  Check,
  CheckCheck,
  Clock,
  Loader2,
  Lock,
  RotateCcw,
  Undo2,
  UserRoundCheck,
  UserRoundX,
  X,
} from "lucide-react";

import { AttendanceStatus, Branch, Student } from "../types";
import { fetchAttendance, markAttendance, markAttendanceBulk } from "../lib/hub";
import { formatDateString, parseDateOnly } from "../lib/storage";
import { StudentAvatar } from "./StudentAvatar";
import { AttendanceHistory } from "./AttendanceHistory";
import { SwipeDeck } from "./SwipeDeck";

const BRANCHES: Branch[] = ["Mangla", "Sarkanda"];

interface Props {
  students: Student[];
  editorMode: boolean;
  onUnlockRequest: () => void;
}

export const AttendanceView: React.FC<Props> = ({ students, editorMode, onUnlockRequest }) => {
  const [branch, setBranch] = useState<Branch>("Mangla");
  const [mode, setMode] = useState<"today" | "history">("today");
  const [date, setDate] = useState<string>(() => formatDateString(new Date()));
  const [marks, setMarks] = useState<Record<string, AttendanceStatus> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Student ids in the order they were marked, for undo. */
  const [undoStack, setUndoStack] = useState<string[]>([]);

  const roster = useMemo(
    () => students.filter((s) => s.branch === branch),
    [students, branch]
  );

  const load = useCallback(async () => {
    setMarks(null);
    setError(null);
    try {
      const rows = await fetchAttendance(date, date);
      const next: Record<string, AttendanceStatus> = {};
      for (const r of rows) next[r.studentId] = r.status;
      setMarks(next);
      setUndoStack([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMarks({});
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = useMemo(
    () => (marks ? roster.filter((s) => !marks[s.id]) : []),
    [roster, marks]
  );

  const present = roster.filter((s) => marks?.[s.id] === "present").length;
  const absent = roster.filter((s) => marks?.[s.id] === "absent").length;
  const late = roster.filter((s) => marks?.[s.id] === "late").length;

  const apply = async (student: Student, status: AttendanceStatus) => {
    // Optimistic: the card must leave immediately or the deck feels broken.
    setMarks((prev) => ({ ...(prev ?? {}), [student.id]: status }));
    setUndoStack((prev) => [...prev, student.id]);
    try {
      await markAttendance(student.id, date, status);
    } catch (e) {
      setMarks((prev) => {
        const next = { ...(prev ?? {}) };
        delete next[student.id];
        return next;
      });
      setUndoStack((prev) => prev.filter((id) => id !== student.id));
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const undo = () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((prev) => prev.slice(0, -1));
    setMarks((prev) => {
      const next = { ...(prev ?? {}) };
      delete next[last];
      return next;
    });
    // The row stays in the database until it is marked again — leaving it is
    // safer than deleting, since an undo is usually followed by a re-mark.
  };

  const markAllPresent = async () => {
    if (pending.length === 0) return;
    setBusy(true);
    setError(null);
    const ids = pending.map((s) => s.id);
    setMarks((prev) => {
      const next = { ...(prev ?? {}) };
      for (const id of ids) next[id] = "present";
      return next;
    });
    try {
      await markAttendanceBulk(ids, date, "present");
      setUndoStack([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void load();
    } finally {
      setBusy(false);
    }
  };

  if (!editorMode) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/60 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-black text-slate-900 mt-3">Teacher only</h2>
        <p className="text-xs text-slate-400 font-semibold mt-1 max-w-xs mx-auto">
          Unlock editor mode to take the register.
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

  const current = pending[0];

  return (
    <div className="space-y-4">
      {/* Date + branch */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black text-slate-900 leading-tight">Attendance</h2>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
              {mode === "today"
                ? parseDateOnly(date).toLocaleDateString(undefined, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })
                : "Record so far"}
            </p>
          </div>
          {mode === "today" && (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          )}
        </div>

        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60 select-none">
          {(["today", "history"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                mode === m ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
              }`}
            >
              {m === "today" ? "Take register" : "History"}
            </button>
          ))}
        </div>

        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60 select-none">
          {BRANCHES.map((b) => (
            <button
              key={b}
              onClick={() => setBranch(b)}
              className={`flex-1 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                branch === b ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500"
              }`}
            >
              {b} ({students.filter((s) => s.branch === b).length})
            </button>
          ))}
        </div>

        {/* Tally */}
        <div className={`items-center gap-1.5 flex-wrap text-[11px] font-black uppercase tracking-wider ${mode === "today" ? "flex" : "hidden"}`}>
          <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1.5 rounded-xl border border-emerald-100 whitespace-nowrap">
            <UserRoundCheck className="w-3.5 h-3.5" /> {present} present
          </span>
          <span className="flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2.5 py-1.5 rounded-xl border border-amber-100 whitespace-nowrap">
            <Clock className="w-3.5 h-3.5" /> {late} late
          </span>
          <span className="flex items-center gap-1.5 bg-rose-50 text-rose-700 px-2.5 py-1.5 rounded-xl border border-rose-100 whitespace-nowrap">
            <UserRoundX className="w-3.5 h-3.5" /> {absent} absent
          </span>
          {pending.length > 0 && (
            <span className="ml-auto text-slate-400">{pending.length} left</span>
          )}
        </div>
      </div>

      {mode === "history" && <AttendanceHistory roster={roster} branch={branch} />}

      {mode === "today" && error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 text-xs font-bold text-red-700">
          {error}
        </div>
      )}

      {mode === "today" && !marks && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      )}

      {/* The deck */}
      {mode === "today" && marks && current && (
        <>
          <button
            onClick={() => void markAllPresent()}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-sm py-3.5 rounded-2xl shadow transition-all active:scale-95 cursor-pointer"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
            Mark all {pending.length} present
          </button>

          <p className="text-center text-[11px] font-black uppercase tracking-widest text-slate-400">
            or swipe each one
          </p>

          <SwipeDeck
            className="h-[340px]"
            items={pending.slice(0, 3)}
            keyOf={(s) => s.id}
            allowUp
            onCommit={(student, dir) =>
              void apply(student, dir === "right" ? "present" : dir === "up" ? "late" : "absent")
            }
            tint={{ right: "bg-emerald-100", left: "bg-rose-100", up: "bg-amber-100" }}
            overlay={(dir) => (
              <span
                className={`border-4 font-black text-xl uppercase tracking-wider px-3 py-1 rounded-xl block ${
                  dir === "right"
                    ? "border-emerald-500 text-emerald-500 -rotate-12"
                    : dir === "left"
                      ? "border-rose-500 text-rose-500 rotate-12"
                      : "border-amber-500 text-amber-500"
                }`}
              >
                {dir === "right" ? "Present" : dir === "left" ? "Absent" : "Late"}
              </span>
            )}
            renderItem={(student) => (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="p-1.5 rounded-full bg-gradient-to-tr from-emerald-400 via-indigo-500 to-purple-600 shadow-lg">
                  <StudentAvatar presetId={student.avatarId} size="lg" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mt-3 px-4 text-center truncate max-w-full">
                  {student.name}
                </h3>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">
                  {student.branch} Branch
                </span>
                <div className="absolute bottom-4 inset-x-0 flex items-center justify-between px-6 text-[10px] font-black uppercase tracking-widest text-slate-300">
                  <span>← Absent</span>
                  <span className="text-amber-300">↑ Late</span>
                  <span>Present →</span>
                </div>
              </div>
            )}
          />

          {/* Buttons alongside the gestures. Late gets one because an upward
              swipe is the least discoverable of the three, and because tapping
              is easier than swiping when you are holding a phone one-handed. */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => void apply(current, "absent")}
              aria-label="Mark absent"
              className="w-16 h-16 rounded-full bg-white border-2 border-rose-200 text-rose-500 hover:bg-rose-50 shadow-sm flex items-center justify-center transition-all active:scale-90 cursor-pointer"
            >
              <X className="w-7 h-7" strokeWidth={3} />
            </button>

            <button
              onClick={() => void apply(current, "late")}
              aria-label="Mark late"
              className="w-14 h-14 rounded-full bg-white border-2 border-amber-200 text-amber-500 hover:bg-amber-50 shadow-sm flex items-center justify-center transition-all active:scale-90 cursor-pointer"
            >
              <Clock className="w-6 h-6" strokeWidth={2.5} />
            </button>

            <button
              onClick={() => void apply(current, "present")}
              aria-label="Mark present"
              className="w-16 h-16 rounded-full bg-white border-2 border-emerald-200 text-emerald-500 hover:bg-emerald-50 shadow-sm flex items-center justify-center transition-all active:scale-90 cursor-pointer"
            >
              <Check className="w-7 h-7" strokeWidth={3} />
            </button>
          </div>

          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="mx-auto flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none py-2 px-3 transition-colors cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" /> Undo last
          </button>
        </>
      )}

      {/* Done */}
      {mode === "today" && marks && !current && roster.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto">
            <Check className="w-6 h-6" strokeWidth={3} />
          </div>
          <h3 className="font-black text-emerald-900 mt-2.5">
            {branch} register done
          </h3>
          <p className="text-xs font-bold text-emerald-700 mt-0.5">
            {present} present · {late} late · {absent} absent
          </p>
        </div>
      )}

      {mode === "today" && marks && roster.length === 0 && (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center">
          <p className="text-sm font-extrabold text-slate-600">No students in {branch}.</p>
        </div>
      )}

      {/* Everyone's state, always visible and always correctable. */}
      {mode === "today" && marks && roster.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
            Tap anyone to change
          </h4>
          <div className="space-y-1.5">
            {roster.map((student) => {
              const status = marks[student.id];
              return (
                <button
                  key={student.id}
                  onClick={() =>
                    // Cycles present -> late -> absent -> present, so every
                    // state is reachable by tapping.
                    void apply(
                      student,
                      status === "present" ? "late" : status === "late" ? "absent" : "present"
                    )
                  }
                  className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-slate-50 transition-all cursor-pointer text-left"
                >
                  <StudentAvatar presetId={student.avatarId} size="xs" />
                  <span className="font-extrabold text-slate-700 text-sm flex-1 truncate">
                    {student.name}
                  </span>
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg border ${
                      status === "present"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                        : status === "late"
                          ? "bg-amber-50 text-amber-700 border-amber-100"
                          : status === "absent"
                            ? "bg-rose-50 text-rose-700 border-rose-100"
                            : "bg-slate-50 text-slate-400 border-slate-200"
                    }`}
                  >
                    {status ?? "not marked"}
                  </span>
                </button>
              );
            })}
          </div>

          {(present > 0 || absent > 0) && (
            <button
              onClick={() => void load()}
              className="mt-3 w-full flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-700 py-2 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" /> Reload from server
            </button>
          )}
        </div>
      )}
    </div>
  );
};
