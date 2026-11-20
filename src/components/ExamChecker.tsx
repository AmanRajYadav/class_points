import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, ArrowLeft, Camera, Check, ChevronDown, ClipboardCopy, FileText, Loader2, Minus, Plus,
  RefreshCw, ScanLine, Sparkles, Trash2, Upload, X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { Student } from "../types";
import { Scanner } from "./Scanner";

/**
 * Exam Checker — staff only.
 *
 * Aman had not checked test papers for twenty days (Nov 2026). The flow he
 * asked for, in his order:
 *   1. put in the QUESTION PAPER (scan it here, or upload a PDF / photos), and
 *      the answer key if there is one;
 *   2. put in each student's ANSWER SHEET (scan here, or a PDF made in any
 *      scanner app);
 *   3. the AI marks it question by question, and wherever it is not sure of the
 *      handwriting or the marks it says "Check this yourself";
 *   4. the teacher changes any mark and makes it final.
 *
 * Nothing here is visible to students: the tables, the files and the AI
 * function (supabase/functions/check-exam) all demand can_teach(). The screen
 * is also only routed for staff, but that is a courtesy; the database is what
 * keeps students and the API credit safe.
 */

interface PaperQ { n: number; label: string; text: string; marks: number; answer: string; answer_from?: string }
interface Exam {
  id: string;
  title: string;
  exam_date: string;
  branch: string | null;
  total_marks: number;
  paper_files: string[];
  key_files: string[];
  paper: { questions?: PaperQ[]; total?: number; note?: string; readable?: boolean } | null;
  paper_error: string | null;
}
interface SheetQ { n: number; attempted: boolean; awarded: number; reason: string; mistake?: string; check_yourself: boolean; why_check?: string }
interface Sheet {
  id: string;
  exam_id: string;
  student_id: string;
  files: string[];
  status: "uploaded" | "checked" | "final";
  ai: { questions?: SheetQ[]; for_teacher?: string; readable?: boolean; name_on_sheet?: string; error?: string } | null;
  /** The marks that count. "_seen" lists the questions the teacher has looked at. */
  marks: Record<string, number | number[]> | null;
  total: number | null;
}

const BUCKET = "exams";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const niceDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const trim = (n: number) => (Math.round(n * 2) / 2).toString();

async function prepare(file: File): Promise<{ blob: Blob; ext: string; type: string }> {
  if (file.type === "application/pdf") {
    if (file.size > 20 * 1024 * 1024) throw new Error("This PDF is bigger than 20 MB.");
    return { blob: file, ext: "pdf", type: "application/pdf" };
  }
  if (!file.type.startsWith("image/")) throw new Error("Use a PDF or photos.");
  if (file.name.startsWith("scan_")) return { blob: file, ext: "jpg", type: "image/jpeg" };
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.75));
  if (!blob) throw new Error("Could not read one of the photos.");
  return { blob, ext: "jpg", type: "image/jpeg" };
}

async function upload(folder: string, files: File[], onStep: (t: string) => void): Promise<string[]> {
  const paths: string[] = [];
  const stamp = Date.now();
  for (let i = 0; i < files.length; i++) {
    onStep(`Uploading ${i + 1} of ${files.length}…`);
    const { blob, ext, type } = await prepare(files[i]);
    const path = `${folder}/${stamp}_${String(i + 1).padStart(2, "0")}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type });
    if (error) throw new Error(error.message);
    paths.push(path);
  }
  return paths;
}

async function openFiles(paths: string[]) {
  for (const path of paths) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }
}

const seenOf = (s: Sheet): number[] => ((s.marks?._seen as number[] | undefined) ?? []);
const markOf = (s: Sheet, n: number): number => Number(s.marks?.[String(n)] ?? 0);
/** Questions the AI is unsure of and the teacher has not yet looked at. */
const pending = (s: Sheet): number =>
  s.status === "final" ? 0 : (s.ai?.questions ?? []).filter((q) => q.check_yourself && !seenOf(s).includes(q.n)).length;

const card = "bg-white rounded-3xl border border-slate-200/80";
const ghost = "flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50";
const dark = "flex items-center justify-center gap-2 text-sm font-black px-4 py-3 rounded-2xl bg-slate-900 text-white cursor-pointer disabled:opacity-50 active:scale-[0.99] transition-transform";

// ---------------------------------------------------------------------------
// A box that takes pages: scan here, or pick a PDF / photos
// ---------------------------------------------------------------------------
const PagesBox: React.FC<{
  label: string;
  hint: string;
  files: File[];
  onChange: (files: File[]) => void;
  optional?: boolean;
}> = ({ label, hint, files, onChange, optional }) => {
  const [scanning, setScanning] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={`rounded-2xl border-2 border-dashed p-4 ${files.length ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200"}`}>
      <Scanner open={scanning} title={label} onClose={() => setScanning(false)} onDone={(f) => { onChange(f); setScanning(false); }} />
      <input ref={input} type="file" accept="image/*,application/pdf" multiple className="hidden"
        onChange={(e) => { onChange(Array.from(e.target.files ?? []).slice(0, 20)); if (input.current) input.current.value = ""; }} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-slate-800 text-sm">
            {label} {optional && <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-1">optional</span>}
          </p>
          <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
            {files.length ? `${files.length} file${files.length > 1 ? "s" : ""} ready` : hint}
          </p>
        </div>
        {files.length > 0 && (
          <button onClick={() => onChange([])} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-400 cursor-pointer" title="Remove"><X className="w-4 h-4" /></button>
        )}
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={() => setScanning(true)} className={ghost}><ScanLine className="w-4 h-4" /> Scan</button>
        <button onClick={() => input.current?.click()} className={ghost}><Upload className="w-4 h-4" /> PDF / photos</button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// New exam
// ---------------------------------------------------------------------------
const NewExam: React.FC<{ onCancel: () => void; onCreated: (exam: Exam) => void }> = ({ onCancel, onCreated }) => {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [branch, setBranch] = useState("");
  const [paper, setPaper] = useState<File[]>([]);
  const [key, setKey] = useState<File[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const create = async () => {
    if (!title.trim() || paper.length === 0 || busy) return;
    setError("");
    let id = "";
    try {
      setBusy("Creating the exam…");
      const { data, error: e1 } = await supabase.from("exams").insert({ title: title.trim(), exam_date: date, branch: branch || null }).select().single();
      if (e1) throw new Error(e1.message);
      id = (data as Exam).id;
      const paperPaths = await upload(`${id}/paper`, paper, (t) => setBusy(`Question paper: ${t}`));
      const keyPaths = key.length ? await upload(`${id}/key`, key, (t) => setBusy(`Answer key: ${t}`)) : [];
      const { data: saved, error: e2 } = await supabase.from("exams").update({ paper_files: paperPaths, key_files: keyPaths }).eq("id", id).select().single();
      if (e2) throw new Error(e2.message);
      onCreated(saved as Exam);
    } catch (e) {
      // Do not leave an empty exam behind if the files never arrived.
      if (id) await supabase.from("exams").delete().eq("id", id);
      setError(e instanceof Error ? e.message : "Could not create the exam.");
      setBusy("");
    }
  };

  const field = "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:border-indigo-400 focus:bg-white";
  return (
    <div className={`${card} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black text-slate-900">New exam</h2>
        <button onClick={onCancel} disabled={Boolean(busy)} className="p-2 rounded-xl bg-slate-100 text-slate-500 cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <input className={field} placeholder="Name of the test (for example: Ch 9 test)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      <div className="grid grid-cols-2 gap-2">
        <input type="date" className={field} value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <select className={field} value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">Both centres</option>
          <option value="Sarkanda">Sarkanda</option>
          <option value="Mangla">Mangla</option>
        </select>
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Step 1 · the paper</p>
        <div className="space-y-2">
          <PagesBox label="Question paper" hint="Scan it, or choose the PDF." files={paper} onChange={setPaper} />
          <PagesBox label="Answer key" hint="Your solved paper or marking scheme. Without it the AI solves the paper itself." files={key} onChange={setKey} optional />
        </div>
      </div>
      {error && <p className="text-sm font-bold rounded-2xl px-3 py-2.5 bg-rose-50 text-rose-700">{error}</p>}
      <button onClick={() => void create()} disabled={!title.trim() || paper.length === 0 || Boolean(busy)} className={`${dark} w-full`}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {busy || "Create and read the paper"}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// One student's sheet: marks, question by question
// ---------------------------------------------------------------------------
const SheetReview: React.FC<{
  exam: Exam;
  sheet: Sheet;
  student: Student;
  onClose: () => void;
  onSaved: () => void;
  onRecheck: () => void;
}> = ({ exam, sheet, student, onClose, onSaved, onRecheck }) => {
  const questions = exam.paper?.questions ?? [];
  const aiBy = useMemo(() => new Map((sheet.ai?.questions ?? []).map((q) => [q.n, q])), [sheet.ai]);
  const [marks, setMarks] = useState<Record<number, number>>(() => Object.fromEntries(questions.map((q) => [q.n, markOf(sheet, q.n)])));
  const [seen, setSeen] = useState<number[]>(() => seenOf(sheet));
  const [open, setOpen] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);

  const total = questions.reduce((a, q) => a + (marks[q.n] ?? 0), 0);
  const max = questions.reduce((a, q) => a + q.marks, 0);
  const left = questions.filter((q) => aiBy.get(q.n)?.check_yourself && !seen.includes(q.n));
  // Unsure ones first, so the teacher's eyes go where they are needed. The order
  // is fixed when the sheet opens: a card must not jump away under the thumb the
  // moment its marks are confirmed.
  const ordered = useMemo(() => {
    const first = new Set(questions.filter((q) => aiBy.get(q.n)?.check_yourself && !seenOf(sheet).includes(q.n)).map((q) => q.n));
    return [...questions].sort((a, b) => Number(first.has(b.n)) - Number(first.has(a.n)) || a.n - b.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.id]);

  const setMark = (q: PaperQ, value: number) => {
    dirty.current = true;
    setMarks((m) => ({ ...m, [q.n]: Math.max(0, Math.min(q.marks, Math.round(value * 2) / 2)) }));
    setSeen((s) => (s.includes(q.n) ? s : [...s, q.n]));
  };
  const confirmQ = (n: number) => {
    dirty.current = true;
    setSeen((s) => (s.includes(n) ? s : [...s, n]));
  };

  const save = async (final: boolean) => {
    setSaving(true);
    const payload: Record<string, number | number[]> = { _seen: final ? questions.map((q) => q.n) : seen };
    for (const q of questions) payload[String(q.n)] = marks[q.n] ?? 0;
    const { error } = await supabase
      .from("exam_sheets")
      .update({ marks: payload, total, status: final ? "final" : "checked", final_at: final ? new Date().toISOString() : null })
      .eq("id", sheet.id);
    setSaving(false);
    if (error) return window.alert(error.message);
    dirty.current = false;
    onSaved();
    if (final) onClose();
  };

  const close = () => {
    if (dirty.current && !window.confirm("You changed some marks. Close without saving?")) return;
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-100 flex flex-col" role="dialog" aria-label={`Answer sheet of ${student.name}`}>
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <button onClick={close} className="p-2.5 rounded-xl bg-slate-100 text-slate-600 cursor-pointer"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-900 text-base leading-tight">{student.name}</p>
          <p className="text-[11px] font-semibold text-slate-400 truncate">{exam.title}{sheet.status === "final" ? " · final" : ""}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-slate-900 leading-none tabular-nums">{trim(total)}<span className="text-sm text-slate-400"> / {trim(max)}</span></p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 max-w-2xl w-full mx-auto">
        {sheet.ai?.error && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-sm font-bold text-rose-700">The AI check did not finish: {sheet.ai.error}</div>
        )}
        {left.length > 0 && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3 flex gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm font-bold text-amber-800">
              Check {left.length} question{left.length > 1 ? "s" : ""} yourself. The AI was not sure of the handwriting or the marks there. They are listed first.
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={() => void openFiles(sheet.files)} className={ghost}><FileText className="w-4 h-4" /> Open the answer sheet</button>
          <button onClick={onRecheck} className={ghost}><RefreshCw className="w-4 h-4" /> Check again</button>
        </div>

        {ordered.map((q) => {
          const ai = aiBy.get(q.n);
          const flagged = left.includes(q);
          const got = marks[q.n] ?? 0;
          return (
            <div key={q.n} className={`rounded-2xl border bg-white p-3 ${flagged ? "border-amber-300 ring-2 ring-amber-100" : "border-slate-200"}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {q.label} · {trim(q.marks)} mark{q.marks === 1 ? "" : "s"}
                    {ai && !ai.attempted ? " · not attempted" : ""}
                  </p>
                  <p className="text-[13px] font-semibold text-slate-800 leading-snug mt-0.5">{ai?.reason || (ai ? "" : "The AI did not mark this question.")}</p>
                  {ai?.mistake && <p className="text-[12px] text-rose-600 font-semibold leading-snug mt-0.5">Lost marks: {ai.mistake}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => setMark(q, got - 0.5)} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer active:scale-95"><Minus className="w-4 h-4" /></button>
                  <span className={`w-11 text-center text-lg font-black tabular-nums ${got === q.marks ? "text-emerald-600" : got === 0 ? "text-rose-600" : "text-slate-900"}`}>{trim(got)}</span>
                  <button onClick={() => setMark(q, got + 0.5)} className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center cursor-pointer active:scale-95"><Plus className="w-4 h-4" /></button>
                </div>
              </div>
              {flagged && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2">
                  <p className="text-[12px] font-bold text-amber-800">Check this yourself{ai?.why_check ? `: ${ai.why_check}` : "."}</p>
                  <button onClick={() => confirmQ(q.n)} className="text-[11px] font-black px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 whitespace-nowrap cursor-pointer">Marks are right</button>
                </div>
              )}
              <button onClick={() => setOpen(open === q.n ? null : q.n)} className="mt-2 flex items-center gap-1 text-[11px] font-black text-slate-400 cursor-pointer">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open === q.n ? "rotate-180" : ""}`} /> Question and expected answer
              </button>
              {open === q.n && (
                <div className="mt-1.5 rounded-xl bg-slate-50 px-3 py-2 text-[12px] leading-snug text-slate-600 space-y-1">
                  <p>{q.text}</p>
                  <p className="font-semibold text-slate-700">Expected: {q.answer}</p>
                </div>
              )}
            </div>
          );
        })}

        {sheet.ai?.for_teacher && (
          <div className="rounded-2xl bg-violet-50 border border-violet-100 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-violet-700 mb-1">What this student should practise</p>
            <p className="text-[13px] text-slate-700 leading-snug">{sheet.ai.for_teacher}</p>
          </div>
        )}
        <p className="text-[11px] text-slate-400 font-semibold px-1 pb-2">The AI proposes marks from the photos and can misread handwriting. The marks that count are the ones you save here.</p>
      </div>

      <div className="bg-white border-t border-slate-200 px-3 py-3 flex gap-2 max-w-2xl w-full mx-auto">
        <button onClick={() => void save(false)} disabled={saving} className={`${ghost} flex-1 justify-center py-3`}>Save</button>
        <button onClick={() => void save(true)} disabled={saving} className={`${dark} flex-[2]`}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          {left.length ? `Final (${left.length} not looked at)` : "Make it final"}
        </button>
      </div>
    </div>,
    document.body
  );
};

// ---------------------------------------------------------------------------
// One exam: the paper, then every student
// ---------------------------------------------------------------------------
const ExamDetail: React.FC<{ exam: Exam; students: Student[]; onBack: () => void; onChanged: () => void }> = ({ exam, students, onBack, onChanged }) => {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [scanFor, setScanFor] = useState<Student | null>(null);
  const [fileFor, setFileFor] = useState<Student | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [showPaper, setShowPaper] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  const questions = exam.paper?.questions ?? [];
  const max = questions.reduce((a, q) => a + q.marks, 0);
  const list = useMemo(
    () => students.filter((s) => !exam.branch || (s.branch as string) === exam.branch).sort((a, b) => a.name.localeCompare(b.name)),
    [students, exam.branch]
  );

  const load = useCallback(async () => {
    const { data } = await supabase.from("exam_sheets").select("*").eq("exam_id", exam.id);
    setSheets((data as Sheet[]) ?? []);
  }, [exam.id]);
  useEffect(() => void load(), [load]);

  const readPaper = useCallback(async () => {
    setReading(true);
    await supabase.functions.invoke("check-exam", { body: { action: "read_paper", exam_id: exam.id } });
    setReading(false);
    onChanged();
  }, [exam.id, onChanged]);

  // A new exam arrives here with its files and no questions yet: read it once.
  useEffect(() => {
    if (!started.current && !exam.paper && !exam.paper_error && exam.paper_files.length) {
      started.current = true;
      void readPaper();
    }
  }, [exam.paper, exam.paper_error, exam.paper_files.length, readPaper]);

  const setRow = (id: string, text: string) => setBusy((b) => ({ ...b, [id]: text }));

  const check = async (student: Student, sheetId: string) => {
    setRow(student.id, "AI is checking…");
    const { error } = await supabase.functions.invoke("check-exam", { body: { action: "check_sheet", sheet_id: sheetId } });
    setRow(student.id, "");
    if (error) window.alert(`${student.name}: the AI check did not finish. Press "Check again" in a minute.`);
    await load();
  };

  const addSheet = async (student: Student, files: File[]) => {
    if (!files.length) return;
    try {
      const paths = await upload(`${exam.id}/sheets/${student.id}`, files, (t) => setRow(student.id, t));
      const { data, error } = await supabase
        .from("exam_sheets")
        .upsert({ exam_id: exam.id, student_id: student.id, files: paths, status: "uploaded", ai: null, marks: null, total: null, final_at: null, uploaded_at: new Date().toISOString() }, { onConflict: "exam_id,student_id" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      setScanFor(null);
      await load();
      await check(student, (data as Sheet).id);
    } catch (e) {
      setRow(student.id, "");
      window.alert(e instanceof Error ? e.message : "The upload did not go through.");
    } finally {
      setFileFor(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${exam.title}" with all its answer sheets and marks? This cannot be undone.`)) return;
    await supabase.from("exams").delete().eq("id", exam.id);
    onChanged();
    onBack();
  };

  const by = useMemo(() => new Map(sheets.map((s) => [s.student_id, s])), [sheets]);
  const done = sheets.filter((s) => s.status !== "uploaded" && s.total !== null);
  const average = done.length ? done.reduce((a, s) => a + Number(s.total), 0) / done.length : 0;
  const toCheck = sheets.reduce((a, s) => a + pending(s), 0);
  const reviewSheet = sheets.find((s) => s.id === review);
  const reviewStudent = reviewSheet && students.find((s) => s.id === reviewSheet.student_id);

  const copyMarks = async () => {
    const lines = list.map((s) => `${s.name}: ${by.get(s.id)?.total != null ? `${trim(Number(by.get(s.id)!.total))}/${trim(max)}` : "absent"}`);
    await navigator.clipboard.writeText(`${exam.title} (${niceDate(exam.exam_date)})\n${lines.join("\n")}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4">
      <Scanner open={scanFor !== null} title={scanFor ? `${scanFor.name} · answer sheet` : ""} onClose={() => setScanFor(null)} onDone={(f) => (scanFor ? addSheet(scanFor, f) : undefined)} />
      <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple className="hidden"
        onChange={(e) => fileFor && void addSheet(fileFor, Array.from(e.target.files ?? []).slice(0, 20))} />

      <div className={`${card} p-5`}>
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="p-2.5 rounded-xl bg-slate-100 text-slate-600 cursor-pointer"><ArrowLeft className="w-5 h-5" /></button>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black text-slate-900 leading-tight">{exam.title}</h2>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">{niceDate(exam.exam_date)} · {exam.branch ?? "Both centres"}</p>
          </div>
          <button onClick={() => void remove()} className="p-2.5 rounded-xl bg-rose-50 text-rose-500 cursor-pointer" title="Delete this exam"><Trash2 className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          {[
            { k: "Checked", v: `${done.length}/${list.length}` },
            { k: "Average", v: done.length ? `${trim(average)}/${trim(max)}` : "–" },
            { k: "For you to check", v: String(toCheck) },
          ].map((x) => (
            <div key={x.k} className={`rounded-2xl px-3 py-2.5 ${x.k === "For you to check" && toCheck ? "bg-amber-50" : "bg-slate-50"}`}>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{x.k}</p>
              <p className="text-lg font-black text-slate-900 tabular-nums">{x.v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: the paper */}
      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Step 1 · question paper</p>
            <p className="font-black text-slate-800 text-sm mt-0.5">
              {reading ? "The AI is reading the paper…" : questions.length ? `${questions.length} questions · ${trim(max)} marks` : exam.paper_error ? "The paper could not be read" : "Not read yet"}
            </p>
          </div>
          {reading ? <Loader2 className="w-5 h-5 animate-spin text-indigo-500" /> : (
            <div className="flex gap-2">
              <button onClick={() => void openFiles([...exam.paper_files, ...exam.key_files])} className={ghost}><FileText className="w-4 h-4" /> Open</button>
              <button onClick={() => void readPaper()} className={ghost}><RefreshCw className="w-4 h-4" /> Read again</button>
            </div>
          )}
        </div>
        {exam.paper_error && !reading && <p className="text-xs font-bold text-rose-600 mt-2">{exam.paper_error}</p>}
        {questions.length > 0 && (
          <>
            <button onClick={() => setShowPaper(!showPaper)} className="mt-3 flex items-center gap-1 text-[11px] font-black text-slate-400 cursor-pointer">
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPaper ? "rotate-180" : ""}`} /> See the questions, marks and expected answers
            </button>
            {showPaper && (
              <div className="mt-2 divide-y divide-slate-100">
                {exam.paper?.note && <p className="text-[12px] text-amber-700 font-semibold pb-2">{exam.paper.note}</p>}
                {questions.map((q) => (
                  <div key={q.n} className="py-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{q.label} · {trim(q.marks)} mark{q.marks === 1 ? "" : "s"} · answer {q.answer_from === "key" ? "from your key" : "solved by AI"}</p>
                    <p className="text-[13px] text-slate-700 leading-snug">{q.text}</p>
                    <p className="text-[12px] text-slate-500 leading-snug">Expected: {q.answer}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Step 2: answer sheets */}
      <div className={`${card} p-4`}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Step 2 · answer sheets</p>
          <button onClick={() => void copyMarks()} className={ghost}><ClipboardCopy className="w-4 h-4" /> {copied ? "Copied" : "Copy marks"}</button>
        </div>
        {!questions.length && <p className="text-xs font-semibold text-slate-400 py-2">Answer sheets can be added once the paper has been read.</p>}
        <div className="divide-y divide-slate-100">
          {list.map((student) => {
            const sheet = by.get(student.id);
            const working = busy[student.id];
            const n = sheet ? pending(sheet) : 0;
            return (
              <div key={student.id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <button disabled={!sheet || sheet.status === "uploaded"} onClick={() => sheet && setReview(sheet.id)} className="text-left min-w-0 flex-1 cursor-pointer disabled:cursor-default">
                    <p className="font-black text-slate-800 text-[15px]">{student.name}</p>
                    <p className={`text-[11px] font-bold mt-0.5 ${working ? "text-indigo-600" : n ? "text-amber-700" : "text-slate-400"}`}>
                      {working || (!sheet ? "No answer sheet yet" : sheet.ai?.error ? "AI check did not finish" : sheet.status === "uploaded" ? "Waiting for the AI" : n ? `Check ${n} question${n > 1 ? "s" : ""} yourself` : sheet.status === "final" ? "Final" : "Checked by AI · tap to review")}
                    </p>
                  </button>
                  {working ? <Loader2 className="w-5 h-5 animate-spin text-indigo-500" /> : sheet && sheet.total !== null && sheet.status !== "uploaded" ? (
                    <button onClick={() => setReview(sheet.id)} className={`text-right px-3 py-1.5 rounded-xl cursor-pointer ${sheet.status === "final" ? "bg-emerald-50" : n ? "bg-amber-50" : "bg-slate-50"}`}>
                      <span className="text-lg font-black text-slate-900 tabular-nums">{trim(Number(sheet.total))}</span>
                      <span className="text-xs font-bold text-slate-400">/{trim(max)}</span>
                    </button>
                  ) : null}
                </div>
                {!working && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button disabled={!questions.length} onClick={() => setScanFor(student)} className={ghost}><Camera className="w-4 h-4" /> {sheet ? "Scan again" : "Scan"}</button>
                    <button disabled={!questions.length} onClick={() => { setFileFor(student); fileInput.current?.click(); }} className={ghost}><Upload className="w-4 h-4" /> PDF / photos</button>
                    {sheet && (sheet.status === "uploaded" || sheet.ai?.error) && (
                      <button onClick={() => void check(student, sheet.id)} className={ghost}><Sparkles className="w-4 h-4" /> Check again</button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {reviewSheet && reviewStudent && (
        <SheetReview
          key={reviewSheet.id + (reviewSheet.ai ? "1" : "0")}
          exam={exam}
          sheet={reviewSheet}
          student={reviewStudent}
          onClose={() => setReview(null)}
          onSaved={() => void load()}
          onRecheck={() => { setReview(null); void check(reviewStudent, reviewSheet.id); }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// The section
// ---------------------------------------------------------------------------
export const ExamChecker: React.FC<{ students: Student[]; canTeach: boolean; onUnlockRequest: () => void }> = ({ students, canTeach, onUnlockRequest }) => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const [{ data: e }, { data: s }] = await Promise.all([
      supabase.from("exams").select("*").order("exam_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("exam_sheets").select("exam_id"),
    ]);
    setExams((e as Exam[]) ?? []);
    const c: Record<string, number> = {};
    for (const row of (s as { exam_id: string }[]) ?? []) c[row.exam_id] = (c[row.exam_id] ?? 0) + 1;
    setCounts(c);
    setLoading(false);
  }, []);
  useEffect(() => { if (canTeach) void load(); }, [canTeach, load]);

  if (!canTeach) {
    return (
      <div className={`${card} p-6 text-center space-y-3`}>
        <h2 className="text-lg font-black text-slate-900">Exam Checker is for teachers</h2>
        <p className="text-xs text-slate-400 font-semibold">Sign in with your teacher name and password to use it.</p>
        <button onClick={onUnlockRequest} className={`${dark} mx-auto`}>Sign in</button>
      </div>
    );
  }

  const openExam = exams.find((e) => e.id === openId);
  if (openExam) return <ExamDetail exam={openExam} students={students} onBack={() => setOpenId(null)} onChanged={() => void load()} />;
  if (creating) return <NewExam onCancel={() => setCreating(false)} onCreated={(exam) => { setCreating(false); setExams((list) => [exam, ...list]); setOpenId(exam.id); }} />;

  return (
    <div className="space-y-4">
      <div className={`${card} p-5 flex items-center justify-between gap-3`}>
        <div>
          <h2 className="text-xl font-black text-slate-900 leading-tight">Exam Checker</h2>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">Put in the paper, scan the answer sheets, review the marks.</p>
        </div>
        <button onClick={() => setCreating(true)} className={dark}><Plus className="w-4 h-4" /> New exam</button>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
      ) : exams.length === 0 ? (
        <div className={`${card} p-8 text-center`}>
          <p className="font-black text-slate-700">No exams yet</p>
          <p className="text-xs text-slate-400 font-semibold mt-1">Press "New exam", add the question paper, then the answer sheets.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {exams.map((exam) => (
            <button key={exam.id} onClick={() => setOpenId(exam.id)} className={`${card} w-full p-4 text-left flex items-center justify-between gap-3 hover:border-slate-300 cursor-pointer transition-colors`}>
              <div className="min-w-0">
                <p className="font-black text-slate-800 truncate">{exam.title}</p>
                <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                  {niceDate(exam.exam_date)} · {exam.branch ?? "Both centres"} · {exam.paper?.questions?.length ? `${exam.paper.questions.length} questions` : "paper not read"}
                </p>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 whitespace-nowrap">{counts[exam.id] ?? 0} sheets</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

