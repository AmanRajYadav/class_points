import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Check, Clock, FileText, Loader2, ScanLine, Sparkles, Upload, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { DailyPoint, Student } from "../types";
import { HomeworkWall } from "./HomeworkWall";
import { Scanner } from "./Scanner";

/**
 * Homework: a student scans it here, and the homework point marks itself.
 *
 * One screen for both sides. A signed-in student sees their own questions for
 * the day, a "Scan homework" button and their last week. Staff see the whole
 * class for one homework date: who sent, who did not, a tap to open the pages,
 * the AI's reading, accept or send back, and a scan button to put in homework
 * that reached them on WhatsApp.
 *
 * The rule (decided in the database, see supabase/16 to 19, never here):
 * homework is named by its date; it is on time on that date or before 4 pm the
 * next day. On time earns the point at once, and every third on-time day in a
 * row earns 200 more. Later is kept as "late" for Sir to accept. A homework
 * sent back loses the point.
 *
 * All text on these screens is English (Aman, 20 Nov 2026).
 */

type Status = "accepted" | "late" | "rejected";

interface Submission {
  id: string;
  student_id: string;
  hw_date: string;
  files: string[];
  submitted_at: string;
  status: Status;
  note: string | null;
  ai: {
    summary?: string;
    needs_review?: boolean;
    other_homework?: boolean;
    reason?: string;
    for_teacher?: string;
    error?: string;
    attempted?: number;
    right?: number;
    total?: number;
    questions?: { n: number; verdict: string; mistake?: string; note?: string; cause?: string }[];
  } | null;
}

interface Props {
  students: Student[];
  points: Record<string, DailyPoint>;
  studentId: string | null;
  canTeach: boolean;
  onUnlockRequest: () => void;
}

const BUCKET = "homework";
const MAX_SIDE = 1500;
const MAX_PDF_BYTES = 8 * 1024 * 1024;

/** Today's date in India, whatever the phone's own clock zone says. */
const istDate = (offsetDays = 0): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + offsetDays * 86400000));
const istHour = (): number =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date()));

/** The homework files write a fraction as {a|b}. */
const plain = (q: string): string => q.replace(/\{([^{}|]+)\|([^{}|]+)\}/g, "($1)/($2)");

const niceDate = (iso: string): string =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" });
const niceTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** What the AI's reading says, in a few English words. */
const aiLine = (ai: Submission["ai"]): string => {
  if (!ai) return "";
  if (ai.error) return "AI check failed";
  if (ai.other_homework) return "Another day's homework";
  if (typeof ai.attempted === "number" && ai.total) return `${ai.attempted}/${ai.total} done, ${ai.right ?? 0} right`;
  return ai.needs_review ? "Needs a look" : "Pages look fine";
};

/**
 * Makes a file ready to store. Pages from the scanner are already sized and
 * cleaned, so they pass through. A gallery photo is shrunk; a PDF is kept.
 */
async function prepare(file: File): Promise<{ blob: Blob; ext: string; type: string }> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_PDF_BYTES) throw new Error("This PDF is bigger than 8 MB. Scan the pages instead.");
    return { blob: file, ext: "pdf", type: "application/pdf" };
  }
  if (!file.type.startsWith("image/")) throw new Error("Use photos or a PDF.");
  if (file.name.startsWith("scan_")) return { blob: file, ext: "jpg", type: "image/jpeg" };
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
  if (!blob) throw new Error("Could not read one of the photos.");
  return { blob, ext: "jpg", type: "image/jpeg" };
}

/** Puts the files in the student's folder for that date and returns their paths. */
async function uploadPages(
  studentId: string,
  hwDate: string,
  files: File[],
  onStep: (text: string) => void
): Promise<string[]> {
  const paths: string[] = [];
  const stamp = Date.now();
  for (let i = 0; i < files.length; i++) {
    onStep(`Sending page ${i + 1} of ${files.length}…`);
    const { blob, ext, type } = await prepare(files[i]);
    const path = `${studentId}/${hwDate}/${stamp}_${String(i + 1).padStart(2, "0")}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type });
    if (error) throw new Error(error.message);
    paths.push(path);
  }
  return paths;
}

const STATUS_STYLE: Record<Status, string> = {
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  late: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};
const STATUS_LABEL: Record<Status, string> = { accepted: "On time", late: "Late", rejected: "Sent back" };

const Pill: React.FC<{ status: Status }> = ({ status }) => (
  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_STYLE[status]}`}>
    {STATUS_LABEL[status]}
  </span>
);

async function openFiles(paths: string[]) {
  // Opened one by one in new tabs; a signed link lasts ten minutes.
  for (const path of paths) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------
const StudentSide: React.FC<{ studentId: string }> = ({ studentId }) => {
  const today = istDate();
  const yesterday = istDate(-1);
  // Before 4 pm, yesterday's homework is still on time and is what most are sending.
  const stillOpen = istHour() < 16;
  const [hwDate, setHwDate] = useState(stillOpen ? yesterday : today);
  const [task, setTask] = useState<{ title: string; questions: string[] } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [mine, setMine] = useState<Submission[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("homework_submissions")
      .select("*")
      .eq("student_id", studentId)
      .gte("hw_date", istDate(-10))
      .order("hw_date", { ascending: false });
    setMine((data as Submission[]) ?? []);
  }, [studentId]);
  useEffect(() => void load(), [load]);

  useEffect(() => {
    setTask(null);
    void supabase.rpc("my_homework", { p_hw_date: hwDate }).then(({ data }) => setTask(data ?? null));
  }, [hwDate]);

  const sent = mine.find((s) => s.hw_date === hwDate);

  const send = async (files: File[]) => {
    if (files.length === 0) return;
    setMessage(null);
    try {
      const paths = await uploadPages(studentId, hwDate, files, setBusy);
      setBusy("Sending to Sir…");
      const { data, error } = await supabase.rpc("submit_homework", { p_hw_date: hwDate, p_files: paths });
      if (error) throw new Error(error.message);
      const row = data as Submission;
      // First review by the AI. Not awaited: the point never waits for it.
      void supabase.functions.invoke("check-homework", { body: { submission_id: row.id } }).catch(() => undefined);
      setMessage(
        row.status === "accepted"
          ? { ok: true, text: `Homework received (${files.length} page${files.length > 1 ? "s" : ""}). Your point is added. 3 days in a row = +200.` }
          : { ok: true, text: "Homework received, but it is late. A late homework gets no point unless Sir accepts it." }
      );
      setScanning(false);
      await load();
    } catch (e) {
      const text = e instanceof Error ? e.message : "It did not go. Check the internet and send again.";
      setMessage({ ok: false, text });
      // The scanner covers the page, so say it there too; the scanned pages are kept.
      if (scanning) window.alert(text);
    } finally {
      setBusy("");
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <Scanner
        open={scanning}
        title={`Homework · ${niceDate(hwDate)}`}
        onClose={() => setScanning(false)}
        onDone={send}
      />

      <div className="bg-white rounded-3xl border border-slate-200/80 p-4 space-y-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 leading-tight">Homework</h2>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">
            Scan your notebook pages and send. On time = by 4 pm the next day. 3 days in a row = +200.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[today, yesterday].map((d) => (
            <button
              key={d}
              onClick={() => setHwDate(d)}
              className={`rounded-2xl border px-3 py-2.5 text-left cursor-pointer transition-colors ${
                hwDate === d ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white"
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {d === today ? "Today's homework" : stillOpen ? "Yesterday's (till 4 pm)" : "Yesterday's (late)"}
              </p>
              <p className="font-black text-slate-800 text-sm">{niceDate(d)}</p>
            </button>
          ))}
        </div>

        {task && (
          <div className="rounded-2xl bg-amber-50/60 border border-amber-100 px-3 py-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 mb-1.5">
              {task.title || "Homework"} · your {task.questions.length} questions
            </p>
            <ol className="list-decimal pl-5 space-y-1.5 text-[13px] leading-snug text-slate-700 font-medium">
              {task.questions.map((q, i) => (
                <li key={i}>{plain(q)}</li>
              ))}
            </ol>
          </div>
        )}

        {sent && (
          <div className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-xs font-semibold text-slate-600">
              You already sent this day's homework ({sent.files.length} page{sent.files.length > 1 ? "s" : ""}). Sending again replaces it.
            </p>
            <Pill status={sent.status} />
          </div>
        )}

        <button
          onClick={() => setScanning(true)}
          disabled={Boolean(busy)}
          className="w-full rounded-2xl bg-slate-900 text-white py-5 flex flex-col items-center gap-1 cursor-pointer active:scale-[0.99] transition-transform disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-7 h-7 animate-spin" /> : <ScanLine className="w-7 h-7" />}
          <span className="text-base font-black">{busy || "Scan homework"}</span>
          {!busy && <span className="text-[11px] font-semibold text-slate-300">Camera opens · one tap for each page · then Done</span>}
        </button>

        <input
          ref={input}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => void send(Array.from(e.target.files ?? []).slice(0, 20))}
        />
        <button
          onClick={() => input.current?.click()}
          disabled={Boolean(busy)}
          className="w-full text-xs font-bold text-slate-400 underline underline-offset-2 cursor-pointer"
        >
          Already have a PDF or photos? Choose them here
        </button>

        {message && (
          <p className={`text-sm font-bold rounded-2xl px-3 py-2.5 ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {message.text}
          </p>
        )}
      </div>

      {mine.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-4">
          <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Your last days</h3>
          <div className="divide-y divide-slate-100">
            {mine.map((s) => (
              <button key={s.id} onClick={() => void openFiles(s.files)} className="w-full py-2.5 flex items-center justify-between gap-2 text-left cursor-pointer">
                <div>
                  <p className="font-black text-slate-800 text-sm">{niceDate(s.hw_date)}</p>
                  <p className="text-[11px] text-slate-400 font-semibold">
                    {s.files.length} page{s.files.length > 1 ? "s" : ""} · {niceTime(s.submitted_at)}
                    {s.note ? ` · Sir: ${s.note}` : ""}
                  </p>
                </div>
                <Pill status={s.status} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------
const StaffSide: React.FC<{ students: Student[] }> = ({ students }) => {
  const [hwDate, setHwDate] = useState(istDate());
  const [rows, setRows] = useState<Submission[]>([]);
  const [logins, setLogins] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [scanFor, setScanFor] = useState<Student | null>(null);
  const [fileFor, setFileFor] = useState<Student | null>(null);
  const [uploading, setUploading] = useState("");
  const [reading, setReading] = useState<{ student: Student; row: Submission } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("homework_submissions").select("*").eq("hw_date", hwDate);
    setRows((data as Submission[]) ?? []);
    setLoading(false);
  }, [hwDate]);
  useEffect(() => void load(), [load]);

  // Who can sign in at all. A student without a login can never appear as
  // "sent" on their own, and that must not read as "did not do the homework".
  useEffect(() => {
    void supabase
      .from("profiles")
      .select("student_id")
      .not("student_id", "is", null)
      .then(({ data }) => {
        // A subject teacher may read only their own profile; then we simply do not know.
        if (data && data.length > 1) setLogins(new Set(data.map((p: { student_id: string }) => p.student_id)));
      });
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("homework-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "homework_submissions" }, () => void load())
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [load]);

  const byStudent = useMemo(() => new Map(rows.map((r) => [r.student_id, r])), [rows]);
  const sentCount = rows.filter((r) => r.status !== "rejected").length;

  /** Homework that reached Sir on WhatsApp: he puts it in for the student. */
  const uploadFor = async (student: Student, files: File[]) => {
    if (files.length === 0) return;
    try {
      const paths = await uploadPages(student.id, hwDate, files, (text) => setUploading(`${student.name}: ${text}`));
      const { data, error } = await supabase.rpc("submit_homework_for", { p_student_id: student.id, p_hw_date: hwDate, p_files: paths });
      if (error) throw new Error(error.message);
      void supabase.functions
        .invoke("check-homework", { body: { submission_id: (data as Submission).id } })
        .then(() => load())
        .catch(() => undefined);
      setScanFor(null);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "The upload did not go through.");
    } finally {
      setUploading("");
      setFileFor(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const review = async (row: Submission, status: Status) => {
    let note: string | null = null;
    if (status === "rejected") {
      note = window.prompt("One line for the student (you can leave it empty):", "Finish it and send again") ?? null;
      if (note === null) return;
    }
    setBusyId(row.id);
    const { error } = await supabase.rpc("review_homework", { p_id: row.id, p_status: status, p_note: note });
    setBusyId("");
    if (error) window.alert(error.message);
    else await load();
  };

  // Run the AI reading again (Google is sometimes busy the first time).
  const recheck = async (row: Submission) => {
    setBusyId(row.id);
    const { error } = await supabase.functions.invoke("check-homework", { body: { submission_id: row.id } });
    setBusyId("");
    if (error) window.alert("The AI check could not run just now. Try again in a minute.");
    await load();
  };

  // "Personal" is reserved for a one-to-one class; the database allows it.
  const branches: string[] = ["Sarkanda", "Mangla", "Personal"];

  return (
    <div className="space-y-4">
      <Scanner
        open={scanFor !== null}
        title={scanFor ? `${scanFor.name} · ${niceDate(hwDate)}` : ""}
        onClose={() => setScanFor(null)}
        onDone={(files) => (scanFor ? uploadFor(scanFor, files) : undefined)}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => fileFor && void uploadFor(fileFor, Array.from(e.target.files ?? []).slice(0, 20))}
      />

      <div className="bg-white rounded-3xl border border-slate-200/80 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-black text-slate-900 leading-tight">Homework</h2>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">
            {uploading || (loading ? "Loading…" : `${sentCount} of ${students.length} sent · homework of ${niceDate(hwDate)}`)}
          </p>
        </div>
        <input
          type="date"
          value={hwDate}
          max={istDate()}
          onChange={(e) => e.target.value && setHwDate(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
        />
      </div>

      {branches.map((branch) => {
        const list = students.filter((s) => (s.branch as string) === branch).sort((a, b) => a.name.localeCompare(b.name));
        if (list.length === 0) return null;
        return (
          <div key={branch} className="bg-white rounded-3xl border border-slate-200/80 p-4">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">{branch}</h3>
            <div className="divide-y divide-slate-100">
              {list.map((student) => {
                const row = byStudent.get(student.id);
                const noLogin = logins !== null && !logins.has(student.id);
                return (
                  <div key={student.id} className="py-3">
                    {/* The name has its own line; nothing on the row can squeeze it. */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-black text-slate-800 text-[15px]">{student.name}</p>
                      {row ? <Pill status={row.status} /> : <Clock className={`w-4 h-4 ${noLogin ? "text-slate-200" : "text-rose-300"}`} />}
                    </div>
                    <p className="text-[11px] font-semibold text-slate-400 mt-0.5">
                      {row
                        ? `${row.files.length} page${row.files.length > 1 ? "s" : ""} · ${niceTime(row.submitted_at)}${row.ai ? ` · ${aiLine(row.ai)}` : ""}`
                        : noLogin
                          ? "No login yet, cannot send"
                          : "Not sent"}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {row && (
                        <>
                          <button
                            onClick={() => (row.ai && !row.ai.error ? setReading({ student, row }) : void recheck(row))}
                            disabled={busyId === row.id}
                            className={`flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl border cursor-pointer ${
                              row.ai?.needs_review ? "border-violet-300 bg-violet-100 text-violet-800" : "border-violet-200 bg-violet-50 text-violet-700"
                            }`}
                          >
                            {busyId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            {row.ai && !row.ai.error ? (row.ai.needs_review ? "AI: look" : "AI reading") : "Run AI check"}
                          </button>
                          <button onClick={() => void openFiles(row.files)} className="flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl border border-slate-200 text-slate-600 cursor-pointer">
                            <FileText className="w-4 h-4" /> Open
                          </button>
                          {row.status !== "accepted" && (
                            <button onClick={() => void review(row, "accepted")} disabled={busyId === row.id} className="flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 cursor-pointer">
                              <Check className="w-4 h-4" /> Accept
                            </button>
                          )}
                          {row.status !== "rejected" && (
                            <button onClick={() => void review(row, "rejected")} disabled={busyId === row.id} className="flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 cursor-pointer">
                              <X className="w-4 h-4" /> Send back
                            </button>
                          )}
                        </>
                      )}
                      <button
                        onClick={() => setScanFor(student)}
                        disabled={Boolean(uploading)}
                        className="flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 cursor-pointer"
                      >
                        <Camera className="w-4 h-4" /> Scan
                      </button>
                      <button
                        onClick={() => {
                          setFileFor(student);
                          fileInput.current?.click();
                        }}
                        disabled={Boolean(uploading)}
                        className="flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl border border-slate-200 text-slate-600 cursor-pointer"
                      >
                        <Upload className="w-4 h-4" /> PDF / photos
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {reading && createPortal(
        <div className="fixed inset-0 z-[60] bg-slate-900/80 flex items-end sm:items-center justify-center p-3" onClick={() => setReading(null)}>
          <div className="bg-white rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">{reading.student.name}</h3>
                <p className="text-xs font-bold text-violet-700">{aiLine(reading.row.ai)}</p>
              </div>
              <button onClick={() => setReading(null)} className="p-2 rounded-xl bg-slate-100 text-slate-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            {reading.row.ai?.reason && <p className="text-sm text-slate-700 font-medium">{reading.row.ai.reason}</p>}
            <div className="divide-y divide-slate-100">
              {(reading.row.ai?.questions ?? []).map((q) => (
                <div key={q.n} className="py-2 flex gap-3">
                  <span className="w-9 shrink-0 text-xs font-black text-slate-400 pt-0.5">Q{q.n}</span>
                  <div className="min-w-0">
                    <p className={`text-xs font-black uppercase tracking-wider ${
                      q.verdict === "right" ? "text-emerald-600" : q.verdict === "wrong" ? "text-rose-600" : "text-slate-500"
                    }`}>
                      {q.verdict === "right" ? "Right" : q.verdict === "wrong" ? "Wrong" : q.verdict === "not_attempted" ? "Left out" : q.verdict === "different_question" ? "A different question" : "Could not read"}
                      {q.cause && q.cause !== "none" ? ` · ${q.cause.replace(/_/g, " ")}` : ""}
                    </p>
                    {(q.mistake || q.note) && <p className="text-[13px] text-slate-700 leading-snug">{q.mistake || q.note}</p>}
                  </div>
                </div>
              ))}
            </div>
            {reading.row.ai?.for_teacher && (
              <div className="rounded-2xl bg-violet-50 border border-violet-100 px-3 py-2.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-violet-700 mb-1">What to do next</p>
                <p className="text-[13px] text-slate-700 leading-snug">{reading.row.ai.for_teacher}</p>
              </div>
            )}
            <p className="text-[11px] text-slate-400 font-semibold">This is the AI's reading of the photos. It can misread handwriting. It never changes a point.</p>
            <button
              onClick={() => {
                const row = reading.row;
                setReading(null);
                void recheck(row);
              }}
              className="w-full text-xs font-black px-3 py-2.5 rounded-xl border border-slate-200 text-slate-600 cursor-pointer"
            >
              Run the AI check again
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export const HomeworkView: React.FC<Props> = ({ students, points, studentId, canTeach, onUnlockRequest }) => (
  <div className="space-y-4">
    {canTeach ? (
      <StaffSide students={students} />
    ) : studentId ? (
      <StudentSide studentId={studentId} />
    ) : (
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 text-center space-y-3">
        <h2 className="text-lg font-black text-slate-900">Sign in to send homework</h2>
        <p className="text-xs text-slate-400 font-semibold">Type your name and press Sign in. Ask Sir if it does not work.</p>
        <button onClick={onUnlockRequest} className="rounded-2xl bg-indigo-600 text-white font-black px-5 py-3 cursor-pointer">
          Sign in
        </button>
      </div>
    )}
    <HomeworkWall students={students} points={points} highlightId={studentId} />
  </div>
);
