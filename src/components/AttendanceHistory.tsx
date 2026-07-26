import { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingDown } from "lucide-react";
import { AttendanceRecord, AttendanceStatus, Student } from "../types";
import { fetchAttendance, fetchPunctuality, PunctualityRow } from "../lib/hub";
import { addDays, formatDateString, startOfToday } from "../lib/storage";
import { StudentAvatar } from "./StudentAvatar";

const WINDOWS = [
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

/** Days shown as dots. Beyond this the strip stops being readable on a phone. */
const STRIP_DAYS = 14;

/**
 * What a single day amounts to for one student.
 *
 * `noClass` and `missing` are both "nothing recorded", but they mean different
 * things and must not look alike: no class happened at all, versus a class ran
 * and this student's mark never got entered. Neither counts toward a
 * percentage, but conflating them would hide gaps in the register.
 */
type DayState = AttendanceStatus | "noClass" | "missing";

interface Props {
  roster: Student[];
  branch: string;
}

interface Row {
  student: Student;
  present: number;
  late: number;
  absent: number;
  marked: number;
  percent: number | null;
  recent: DayState[];
}

export const AttendanceHistory = ({ roster, branch }: Props) => {
  const [days, setDays] = useState<number>(30);
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [punctuality, setPunctuality] = useState<PunctualityRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const today = startOfToday();
  const from = formatDateString(addDays(today, -(days - 1)));
  const to = formatDateString(today);

  useEffect(() => {
    let active = true;
    setRecords(null);
    setError(null);

    Promise.all([fetchAttendance(from, to), fetchPunctuality(from, to)])
      .then(([attendance, points]) => {
        if (!active) return;
        setRecords(attendance);
        setPunctuality(points);
      })
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
    // `today` is a new Date every render; its string form is the real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [to]
  );

  const { rows, classDays } = useMemo(() => {
    if (!records) return { rows: null as Row[] | null, classDays: new Set<string>() };

    const attendanceBy = new Map<string, Map<string, AttendanceStatus>>();
    for (const r of records) {
      if (!attendanceBy.has(r.studentId)) attendanceBy.set(r.studentId, new Map());
      attendanceBy.get(r.studentId)!.set(r.date, r.status);
    }

    const onTimeBy = new Map<string, Map<string, number>>();
    for (const p of punctuality) {
      if (!onTimeBy.has(p.studentId)) onTimeBy.set(p.studentId, new Map());
      onTimeBy.get(p.studentId)!.set(p.date, p.onTime);
    }

    // A date is a class day if anyone at all has something recorded for it,
    // attendance or points. If the whole class has nothing, no class happened —
    // which is what makes holidays vanish instead of reading as absences.
    const activeDays = new Set<string>();
    for (const r of records) activeDays.add(r.date);
    for (const p of punctuality) activeDays.add(p.date);

    const stateFor = (studentId: string, date: string): DayState => {
      const status = attendanceBy.get(studentId)?.get(date);
      if (status === "absent") return "absent";
      if (status === "late") return "late";

      if (status === "present") {
        // Present, but that day's points row says no punctuality mark, so they
        // arrived late. The row has to exist — no points entered at all means
        // unknown, not late.
        return onTimeBy.get(studentId)?.get(date) === 0 ? "late" : "present";
      }

      return activeDays.has(date) ? "missing" : "noClass";
    };

    const built = roster
      .map((student) => {
        let present = 0;
        let late = 0;
        let absent = 0;

        for (const date of activeDays) {
          const state = stateFor(student.id, date);
          if (state === "present") present++;
          else if (state === "late") late++;
          else if (state === "absent") absent++;
        }

        const marked = present + late + absent;

        return {
          student,
          present,
          late,
          absent,
          marked,
          // Late still counts as attending. Only days this student was actually
          // marked go into the divisor.
          percent: marked === 0 ? null : Math.round(((present + late) / marked) * 100),
          recent: stripDates.map((d) => stateFor(student.id, d)),
        };
      })
      .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101));

    return { rows: built, classDays: activeDays };
  }, [records, punctuality, roster, stripDates]);

  const classPercent = useMemo(() => {
    if (!rows) return null;
    const scored = rows.filter((r) => r.percent !== null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((sum, r) => sum + (r.percent ?? 0), 0) / scored.length);
  }, [rows]);

  const totalLate = rows?.reduce((sum, r) => sum + r.late, 0) ?? 0;

  const dotClass = (state: DayState) => {
    switch (state) {
      case "present":
        return "bg-emerald-500";
      case "late":
        return "bg-amber-400";
      case "absent":
        return "bg-rose-500";
      case "missing":
        // Hollow: a class ran, but this student was never marked.
        return "bg-transparent border border-slate-300";
      default:
        return "bg-slate-200";
    }
  };

  const labelFor = (state: DayState) =>
    state === "missing" ? "not marked" : state === "noClass" ? "no class" : state;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-black text-slate-900">{branch} attendance</h3>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
              {classPercent === null
                ? "Nothing marked yet"
                : `${classPercent}% average · ${classDays.size} class ${
                    classDays.size === 1 ? "day" : "days"
                  }`}
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

        <div className="flex items-center gap-x-3 gap-y-1.5 mt-3 flex-wrap text-[9px] font-black uppercase tracking-widest text-slate-400">
          <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Present
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Late
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-rose-500" /> Absent
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full border border-slate-300" /> Not marked
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-slate-200" /> No class
          </span>
        </div>

        {totalLate > 0 && (
          <p className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mt-3 leading-relaxed">
            Late counts anyone marked present who did not get that day's on-time points,
            so the register and the scoreboard agree without you entering it twice.
          </p>
        )}
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

      {rows && classDays.size === 0 && (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center">
          <p className="text-sm font-extrabold text-slate-600">
            No class days in the last {days} days.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            A date becomes a class day as soon as any attendance or points are recorded.
          </p>
        </div>
      )}

      {rows && classDays.size > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5 space-y-3">
          {rows.map((row) => {
            // Sorted worst-first, so whoever needs a word is at the top.
            const concerning = row.percent !== null && row.percent < 75;

            return (
              <div key={row.student.id} className="flex items-center gap-3">
                <StudentAvatar presetId={row.student.avatarId} size="xs" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-extrabold text-slate-800 text-sm truncate">
                      {row.student.name}
                    </span>
                    {concerning && <TrendingDown className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                    {row.late > 0 && (
                      <span className="text-[9px] font-black uppercase tracking-wider text-amber-600 bg-amber-50 px-1.5 rounded shrink-0">
                        {row.late} late
                      </span>
                    )}
                  </div>

                  {/* Last fortnight, oldest to newest. */}
                  <div className="flex items-center gap-[3px] mt-1">
                    {row.recent.map((state, i) => (
                      <span
                        key={i}
                        title={`${stripDates[i]}: ${labelFor(state)}`}
                        className={`h-2 flex-1 max-w-[10px] rounded-full ${dotClass(state)}`}
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
                    {row.marked === 0 ? "no data" : `${row.present + row.late}/${row.marked}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rows && classDays.size > 0 && (
        <p className="text-[10px] text-slate-400 font-bold text-center px-4 leading-relaxed">
          A date with nothing recorded for anyone counts as no class, so holidays never
          read as absences.
        </p>
      )}
    </div>
  );
};
