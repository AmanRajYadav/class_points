import React, { useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, Lock } from "lucide-react";

/**
 * The day's questions for Instagram (Aman, 27 Nov 2026): 5 Maths + 5 Science + 5 Social Science, in book order
 * from Fluence 100 / Fluence 200 / The 100 Questions. Built by F:/Math Hacking/HUB/_engine/daily_questions.py into
 * public/daily/questions.json; one copy button per subject and one for all.
 */
type Q = { src: string; chapter: string; marks: string; text: string; html?: string; answer?: string };
type Day = { day: number; maths: Q[]; science: Q[]; sst: Q[] };

const ist = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const nice = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

const SUBJECTS: { key: "maths" | "science" | "sst"; label: string; tone: string }[] = [
  { key: "maths", label: "Maths", tone: "text-amber-700" },
  { key: "science", label: "Science", tone: "text-emerald-700" },
  { key: "sst", label: "Social Science", tone: "text-sky-700" },
];

const block = (label: string, qs: Q[]) =>
  `${label}\n` + qs.map((q, i) => `${i + 1}. ${q.text}${q.marks ? ` (${q.marks.replace(/^(\d+)$/, "$1 marks")})` : ""}`).join("\n\n");

export const DailyQuestions: React.FC<{ canTeach: boolean; onUnlockRequest: () => void }> = ({ canTeach, onUnlockRequest }) => {
  const [all, setAll] = useState<Record<string, Day> | null>(null);
  const [date, setDate] = useState(ist());
  const [answers, setAnswers] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!canTeach) return;
    void fetch("./daily/questions.json")
      .then((r) => r.json())
      .then((j) => setAll(j.days))
      .catch(() => setAll({}));
  }, [canTeach]);

  const day = all?.[date];
  const dates = useMemo(() => (all ? Object.keys(all).sort() : []), [all]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      window.prompt("Copy this:", text);
    }
  };

  if (!canTeach) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/60 p-8 text-center">
        <Lock className="w-7 h-7 text-slate-400 mx-auto" />
        <h2 className="text-lg font-black text-slate-900 mt-3">Teacher only</h2>
        <button onClick={onUnlockRequest} className="mt-4 px-5 py-2.5 bg-slate-800 text-white font-black text-xs rounded-xl cursor-pointer">
          Sign in
        </button>
      </div>
    );
  }

  const header = day ? `Fluence daily questions · Day ${day.day} · ${nice(date)}` : "";

  return (
    <div className="space-y-4 dq">
      <style>{`.dq .fr{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;line-height:1.05;margin:0 2px;font-size:.92em}.dq .fr>span:last-child{border-top:1.5px solid currentColor}.dq .opts span{display:block}.dq .small{font-size:12px;color:#64748b;margin-top:4px}`}</style>
      <div className="bg-white rounded-3xl border border-slate-200/80 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-black text-slate-900 leading-tight">Daily questions</h2>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">
            {day ? `Day ${day.day} · 5 Maths, 5 Science, 5 Social Science` : all ? "No questions for this day" : "Loading…"}
          </p>
        </div>
        <input
          type="date"
          value={date}
          min={dates[0]}
          max={dates[dates.length - 1]}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
        />
      </div>

      {!all && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      )}

      {day && (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => void copy("all", [header, ...SUBJECTS.map((s) => block(s.label, day[s.key]))].join("\n\n\n"))}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm py-3 rounded-2xl cursor-pointer"
            >
              {copied === "all" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied === "all" ? "Copied" : "Copy all 15"}
            </button>
            <button
              onClick={() => setAnswers((v) => !v)}
              className="px-4 rounded-2xl border border-slate-200 bg-white text-xs font-black text-slate-600 cursor-pointer"
            >
              {answers ? "Hide answers" : "Answers"}
            </button>
          </div>

          {SUBJECTS.map((s) => (
            <div key={s.key} className="bg-white rounded-3xl border border-slate-200/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className={`text-[11px] font-black uppercase tracking-wider ${s.tone}`}>
                  {s.label} · {day[s.key][0]?.chapter}
                </h3>
                <button
                  onClick={() => void copy(s.key, `${header}\n\n${block(s.label, day[s.key])}`)}
                  className="flex items-center gap-1.5 text-[11px] font-black px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 cursor-pointer"
                >
                  {copied === s.key ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied === s.key ? "Copied" : "Copy"}
                </button>
              </div>
              <ol className="list-decimal pl-5 space-y-3 mt-2 text-[13.5px] leading-snug text-slate-700 font-medium">
                {day[s.key].map((q) => (
                  <li key={q.src}>
                    {q.html ? <span dangerouslySetInnerHTML={{ __html: q.html }} /> : <span className="whitespace-pre-line">{q.text}</span>}
                    <span className="block text-[10px] font-black uppercase tracking-wider text-slate-300 mt-1">
                      {q.src}
                      {q.marks ? ` · ${q.marks.replace(/^(\d+)$/, "$1 marks")}` : ""}
                    </span>
                    {answers && (
                      <span className="block text-[12px] text-emerald-700 font-semibold mt-1 whitespace-pre-line">
                        {q.answer ?? `Solution: ${q.src} in the book (back pages)`}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </>
      )}
    </div>
  );
};
