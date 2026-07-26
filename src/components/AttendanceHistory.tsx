import React, { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingDown } from "lucide-react";
import { AttendanceRecord, AttendanceStatus, Student } from "../types";
import { fetchAttendance } from "../lib/hub";
import { addDays, formatDateString, startOfToday } from "../lib/storage";
import { StudentAvatar } from "./StudentAvatar";

const WINDOWS = [
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

/** Days shown as dots. Beyond this the strip stops being readable on a phone. */
const STRIP_DAYS = 14;

interface Props {
  roster: Student[];
  branch: string;
}

interface Row {
  student: Student;
  present: number;
  absent: number;
  late: number;
  marked: number;
  percent: number | null;
  recent: (AttendanceStatus | null)[];
}

export const AttendanceHistory: React.FC<Props> = ({ roster, branch }) => {
  const [days, setDays] = useState<number>(30);
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = startOfToday();
  const from = formatDateString(addDays(today, -(days - 1)));
  const to = formatDateString(today);

  useEffect(() => {
    let active = true;
    setRecords(null);
    setError(null);

    fetchAttendance(from, to)
      .then((rows) => active && setRecords(rows))
      .catch((e) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : String(e));
        setRecords([]);
      });

    return () => {
      active = false;
    };
  }, [from, to]);

  /** The last STRIP_DAYS calendar days, oldest first. */
  const stripDates = useMemo(
    () =>
      Array.from({ length: STRIP_DAYS }, (_, i) =>
        formatDateString(addDays(today, -(STRIP_DAYS - 1 - i)))
      ),
    // `today` is a fresh Date each render; the string form is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [to]
  );

  const rows: Row[] | null = useMemo(() => {
    if (!records) return null;

    const byStudent = new Map<string, Map<string, AttendanceStatus>>();
    for (const r of records) {
      if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, new Map());
      byStudent.get(r.studentId)!.set(r.date, r.status);
    }

    return roster
      .map((student) => {
        const marks = byStudent.get(student.id) ?? new Map<string, AttendanceStatus>();
        let present = 0;
        let absent = 0;
        let late = 0;
        for (const status of marks.values()) {
          if (status === "present") present++;
          else if (status === "absent") absent++;
          else late++;
        }
        const marked = present + absent + late;

        return {
          student,
          present,
          absent,
          late,
          marked,
          // Late counts as attending. Days never marked are excluded entirely,
          // so a holiday does not read as an absence.
          percent: marked === 0 ? null : Math.round(((present + late) / marked) * 100),
          recent: stripDates.map((d) => marks.get(d) ?? null),
        };
      })
      .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101));
  }, [records, roster, stripDates]);

  const classPercent = useMemo(() => {
    if (!rows) return null;
    const scored = rows.filter((r) => r.percent !== null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((sum, r) => sum + (r.percent ?? 0), 0) / scored.length);
  }, [rows]);

  const dotClass = (status: AttendanceStatus | null) => {
    if (status === "present") return "bg-emerald-500";
    if (status === "absent") return "bg-rose-500";
    if (status === "late") return "bg-amber-400";
    return "bg-slate-200";
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-black text-slate-900">{branch} attendance</h3>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
              {classPercent === null ? "Nothing marked yet" : `${classPercent}% class average`}
            </p>
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

        <div className="flex items-center gap-3 mt-3 text-[9px] font-black uppercase tracking-widest text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Present
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500" /> Absent
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Late
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-200" /> No class
          </span>
        </div>
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

      {rows && rows.every((r) => r.marked === 0) && (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center">
          <p className="text-sm font-extrabold text-slate-600">
            No attendance recorded in the last {days} days.
          </p>
          <p className="text-xs text-slate-400 mt-1">Take today's register to start the record.</p>
        </div>
      )}

      {rows && rows.some((r) => r.marked > 0) && (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5 space-y-3">
          {rows.map((row) => {
            // Sorted worst-first, so the students needing a word are at the top.
            const concerning = row.percent !== null && row.percent < 75;

            return (
              <div key={row.student.id} className="flex items-center gap-3">
                <StudentAvatar presetId={row.student.avatarId} size="xs" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-slate-800 text-sm truncate">
                      {row.student.name}
                    </span>
                    {concerning && (
                      <TrendingDown className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    )}
                  </div>

                  {/* Last fortnight, oldest to newest. */}
                  <div className="flex items-center gap-[3px] mt-1">
                    {row.recent.map((status, i) => (
                      <span
                        key={i}
                        title={`${stripDates[i]}: ${status ?? "no class"}`}
                        className={`h-2 flex-1 max-w-[10px] rounded-full ${dotClass(status)}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`block text-base font-black font-mono leading-none ${
                      row.percent === null
                        ? "text-slate-300"
                        : concerning
                          ? "text-rose-600"
                          : "text-emerald-600"
                    }`}
                  >
                    {row.percent === null ? "—" : `${row.percent}%`}
                  </span>
                  <span className="text-[9px] uppercase font-black text-slate-400 tracking-widest">
                    {row.marked === 0 ? "no data" : `${row.present}/${row.marked}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rows && rows.some((r) => r.marked > 0) && (
        <p className="text-[10px] text-slate-400 font-bold text-center px-4 leading-relaxed">
          Percentages count only days that were actually marked, so holidays and
          missed registers never read as absences.
        </p>
      )}
    </div>
  );
};
