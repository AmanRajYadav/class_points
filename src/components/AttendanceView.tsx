import React from "react";
import { CalendarCheck, Hand } from "lucide-react";

/**
 * Placeholder. The real screen is a swipe deck — one student card at a time,
 * left for absent, right for present — built in the next step.
 */
export const AttendanceView: React.FC<{ studentCount: number }> = ({ studentCount }) => (
  <div className="bg-white rounded-3xl border border-slate-200/60 p-8 text-center">
    <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
      <CalendarCheck className="w-7 h-7" />
    </div>
    <h2 className="text-lg font-black text-slate-900 mt-3">Attendance</h2>
    <p className="text-xs text-slate-400 font-semibold mt-1.5 max-w-xs mx-auto leading-relaxed">
      Coming next: a swipe deck through all {studentCount} students — left for
      absent, right for present, one tap per child.
    </p>
    <div className="mt-5 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
      <Hand className="w-3.5 h-3.5" /> Swipe interface in progress
    </div>
  </div>
);
