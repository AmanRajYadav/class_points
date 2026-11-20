import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Clock, FileText, Loader2, Sparkles, Upload, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { DailyPoint, Student } from "../types";
import { HomeworkWall } from "./HomeworkWall";

/**
 * Homework: a student sends it here, and the homework point marks itself.
 *
 * One screen for both sides. A signed-in student sees "send today's / yesterday's
 * homework" and their last week. Staff see the whole class for one homework
 * date: who sent, who did not, a tap to open the pages, accept or reject.
 *
 * The rule (decided in the database, see supabase/16_homework_upload.sql, never
 * here): homework is named by its date and is on time on that date or before
 * 4 pm the next day. On
 * time earns the point at once, and every third on-time day in a row earns 200
 * more. Later is kept as "late" for Sir to accept. A rejected upload loses the
 * point.
 *
 * Photos are shrunk on the phone before they leave it. A page of handwriting
 * is readable at 1400 px and about 150 KB; the camera's own 4 MB file would
 * fill the project's storage in a few weeks.
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
    reason?: string;
    for_teacher?: string;
    error?: string;
    questions?: { n: number; verdict: string; mistake?: string; cause?: string }[];
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
const MAX_SIDE = 1400;
const MAX_PDF_BYTES = 8 * 1024 * 1024;

/** Today's date in India, whatever the phone's own clock zone says. */
const istDate = (offsetDays = 0): string => {
  const now = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
};

const istHour = (): number =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(new Date()));

/** The homework files write a fraction as {a|b}. */
const plain = (q: string): string => q.replace(/\{([^{}|]+)\|([^{}|]+)\}/g, "($1)/($2)");

const niceDate = (iso: string): string =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", weekday: "short" });
const niceTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Shrinks a photo to a JPEG a teacher can still read. PDFs pass through. */
async function shrink(file: File): Promise<{ blob: Blob; ext: string; type: string }> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_PDF_BYTES) throw new Error("This PDF is bigger than 8 MB. Send photos of the pages instead.");
    return { blob: file, ext: "pdf", type: "application/pdf" };
  }
  if (!file.type.startsWith("image/")) throw new Error("Send photos or a PDF.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.62));
  if (!blob) throw new Error("Could not read one of the photos.");
  return { blob, ext: "jpg", type: "image/jpeg" };
}

const STATUS_STYLE: Record<Status, string> = {
  accepted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  late: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};
const STATUS_LABEL: Record<Status, string> = { accepted: "Mil gaya", late: "Late", rejected: "Wapas" };

const Pill: React.FC<{ status: Status }> = ({ status }) => (
  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${STATUS_STYLE[status]}`}>
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
  const [picked, setPicked] = useState<File[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [mine, setMine] = useState<Submission[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  // Pages add up; taking another photo never throws the earlier ones away.
  const addPages = (files: File[]) => {
    if (files.length) setPicked((list) => [...list, ...files].slice(0, 20));
    if (camera.current) camera.current.value = "";
    if (input.current) input.current.value = "";
  };

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

  const send = async () => {
    if (picked.length === 0) return;
    setMessage(null);
    try {
      const paths: string[] = [];
      const stamp = Date.now();
      for (let i = 0; i < picked.length; i++) {
        setBusy(`Page ${i + 1} of ${picked.length} ja raha hai…`);
        const { blob, ext, type } = await shrink(picked[i]);
        const path = `${studentId}/${hwDate}/${stamp}_${String(i + 1).padStart(2, "0")}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type });
        if (error) throw new Error(error.message);
        paths.push(path);
      }
      setBusy("Sir ko bhej rahe hain…");
      const { data, error } = await supabase.rpc("submit_homework", { p_hw_date: hwDate, p_files: paths });
      if (error) throw new Error(error.message);
      const status = (data as Submission).status;
      // First review by the AI. Not awaited: the point never waits for it, and
      // if the function or its key is missing the homework is still in.
      void supabase.functions.invoke("check-homework", { body: { submission_id: (data as Submission).id } }).catch(() => undefined);
      setMessage(
        status === "accepted"
          ? { ok: true, text: "Homework mil gaya. Point lag gaya. 3 din lagataar bhejo to +200." }
          : { ok: true, text: "Homework mil gaya, par late hai. Late ka point nahi lagta; Sir dekh kar faisla karenge." }
      );
      setPicked([]);
      if (input.current) input.current.value = "";
      await load();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Nahi gaya. Net dekh kar phir bhejo." });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-slate-200/80 p-4 space-y-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 leading-tight">Homework bhejo</h2>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">
            Copy ke har page ki photo lo, ya PDF chuno. Agle din 4 baje tak bheja to point pakka. 3 din lagataar = +200.
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
                {d === today ? "Aaj ka homework" : stillOpen ? "Kal ka (4 baje tak)" : "Kal ka (late)"}
              </p>
              <p className="font-black text-slate-800 text-sm">{niceDate(d)}</p>
            </button>
          ))}
        </div>

        {task && (
          <div className="rounded-2xl bg-amber-50/60 border border-amber-100 px-3 py-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 mb-1.5">{task.title || "Homework"} · aapke 10 sawal</p>
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
              Is din ka homework aap bhej chuke ho ({sent.files.length} page). Dobara bhejoge to naya wala rahega.
            </p>
            <Pill status={sent.status} />
          </div>
        )}

        {/* The camera opens straight away; every photo taken is one more page.
            Nobody has to make a PDF or find a file: point, click, repeat, send. */}
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => addPages(Array.from(e.target.files ?? []))}
        />
        <input
          ref={input}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => addPages(Array.from(e.target.files ?? []))}
        />
        <button
          onClick={() => camera.current?.click()}
          disabled={Boolean(busy)}
          className="w-full rounded-2xl bg-slate-900 text-white py-5 flex flex-col items-center gap-1 cursor-pointer active:scale-[0.99] transition-transform"
        >
          <Camera className="w-7 h-7" />
          <span className="text-base font-black">
            {picked.length ? "Agle page ki photo lo" : "Copy ke page ki photo lo"}
          </span>
          <span className="text-[11px] font-semibold text-slate-300">Har page ke liye ek baar dabao</span>
        </button>

        {picked.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {picked.map((file, index) => (
              <button
                key={index}
                onClick={() => setPicked((list) => list.filter((_, k) => k !== index))}
                title="Hatao"
                className="text-xs font-black px-2.5 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 cursor-pointer"
              >
                {file.type === "application/pdf" ? "PDF" : `Page ${index + 1}`} ✕
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => input.current?.click()}
          disabled={Boolean(busy)}
          className="w-full text-xs font-bold text-slate-400 underline underline-offset-2 cursor-pointer"
        >
          Photos pehle se kheenche hain, ya PDF hai? Yahan se chuno
        </button>

        <button
          onClick={() => void send()}
          disabled={picked.length === 0 || Boolean(busy)}
          className="w-full rounded-2xl bg-indigo-600 text-white font-black py-3.5 flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer disabled:cursor-default"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {busy || (picked.length ? `${picked.length} page Sir ko bhejo` : "Sir ko bhejo")}
        </button>

        {message && (
          <p className={`text-sm font-bold rounded-2xl px-3 py-2.5 ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            {message.text}
          </p>
        )}
      </div>

      {mine.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-4">
          <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">Pichhle din</h3>
          <div className="divide-y divide-slate-100">
            {mine.map((s) => (
              <button key={s.id} onClick={() => void openFiles(s.files)} className="w-full py-2.5 flex items-center justify-between gap-2 text-left cursor-pointer">
                <div>
                  <p className="font-black text-slate-800 text-sm">{niceDate(s.hw_date)}</p>
                  <p className="text-[11px] text-slate-400 font-semibold">
                    {s.files.length} page · {niceTime(s.submitted_at)}
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
  const [uploadFor, setUploadFor] = useState<Student | null>(null);
  const [uploading, setUploading] = useState("");
  const staffInput = useRef<HTMLInputElement>(null);

  // Homework that reached Sir on WhatsApp: he puts it in for the student.
  const uploadForStudent = async (files: File[]) => {
    const student = uploadFor;
    if (!student || files.length === 0) return;
    try {
      const paths: string[] = [];
      const stamp = Date.now();
      for (let i = 0; i < files.length; i++) {
        setUploading(`${student.name}: page ${i + 1} of ${files.length}…`);
        const { blob, ext, type } = await shrink(files[i]);
        const path = `${student.id}/${hwDate}/${stamp}_${String(i + 1).padStart(2, "0")}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type });
        if (error) throw new Error(error.message);
        paths.push(path);
      }
      const { data, error } = await supabase.rpc("submit_homework_for", { p_student_id: student.id, p_hw_date: hwDate, p_files: paths });
      if (error) throw new Error(error.message);
      void supabase.functions.invoke("check-homework", { body: { submission_id: (data as Submission).id } }).catch(() => undefined);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Upload nahi hua.");
    } finally {
      setUploading("");
      setUploadFor(null);
      if (staffInput.current) staffInput.current.value = "";
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("homework_submissions").select("*").eq("hw_date", hwDate);
    setRows((data as Submission[]) ?? []);
    setLoading(false);
  }, [hwDate]);
  useEffect(() => void load(), [load]);

  // Who can upload at all. A student without a login can never appear as "sent",
  // and that must not read as "did not do the homework".
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

  const review = async (row: Submission, status: Status) => {
    let note: string | null = null;
    if (status === "rejected") {
      note = window.prompt("Bachche ko ek line (khaali chhod sakte ho):", "Poora karke dobara bhejo") ?? null;
      if (note === null) return;
    }
    setBusyId(row.id);
    const { error } = await supabase.rpc("review_homework", { p_id: row.id, p_status: status, p_note: note });
    setBusyId("");
    if (error) window.alert(error.message);
    else await load();
  };

  // Run the AI reading again (Google is sometimes busy the first time), then show it.
  const recheck = async (row: Submission) => {
    setBusyId(row.id);
    const { error } = await supabase.functions.invoke("check-homework", { body: { submission_id: row.id } });
    setBusyId("");
    if (error) window.alert("AI check abhi nahi ho paya. Thodi der baad phir dabao.");
    await load();
  };

  const showAi = (student: Student, row: Submission) => {
    const ai = row.ai;
    if (!ai || ai.error) return void recheck(row);
    const lines = (ai.questions ?? [])
      .filter((q) => q.verdict !== "right")
      .map((q) => `Q${q.n}: ${q.verdict === "not_attempted" ? "chhoda" : q.verdict === "wrong" ? "galat" : q.verdict === "different_question" ? "doosri list ka sawal" : "padha nahi gaya"}${q.mistake ? " - " + q.mistake : ""}${q.cause && q.cause !== "none" ? " (" + q.cause + ")" : ""}`);
    const text = [`${student.name}: ${ai.summary ?? ""}`, ai.reason ?? "", ...lines, ai.for_teacher ? "Aage: " + ai.for_teacher : "", "(AI ki padhai hai; likhawat galat bhi padh sakta hai.)"]
      .filter(Boolean)
      .join(String.fromCharCode(10));
    window.alert(text);
  };

  const branches: Student["branch"][] = ["Sarkanda", "Mangla"];

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-slate-200/80 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-black text-slate-900 leading-tight">Homework</h2>
          <p className="text-xs text-slate-400 font-semibold mt-0.5">
            {uploading || (loading ? "Dekh rahe hain…" : `${sentCount} of ${students.length} ne bheja · ${niceDate(hwDate)} ka homework`)}
          </p>
          <input
            ref={staffInput}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => void uploadForStudent(Array.from(e.target.files ?? []).slice(0, 20))}
          />
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
        const list = students.filter((s) => s.branch === branch).sort((a, b) => a.name.localeCompare(b.name));
        if (list.length === 0) return null;
        return (
          <div key={branch} className="bg-white rounded-3xl border border-slate-200/80 p-4">
            <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-1">{branch}</h3>
            <div className="divide-y divide-slate-100">
              {list.map((student) => {
                const row = byStudent.get(student.id);
                const noLogin = logins !== null && !logins.has(student.id);
                return (
                  <div key={student.id} className="py-2.5 flex flex-wrap items-center gap-2">
                    <div className="basis-full sm:basis-0 sm:flex-1 min-w-0">
                      <p className="font-black text-slate-800 text-sm truncate">{student.name}</p>
                      <p className="text-[11px] font-semibold text-slate-400">
                        {row
                          ? `${row.files.length} page · ${niceTime(row.submitted_at)}${row.ai?.summary ? ` · ${row.ai.summary}` : ""}`
                          : noLogin
                            ? "Login nahi bana hai, upload nahi kar sakta"
                            : "Nahi bheja"}
                      </p>
                    </div>
                    {row ? (
                      <>
                        {row.ai?.needs_review && (
                          <span title={row.ai.reason ?? "AI: please look"} className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
                            Dekho
                          </span>
                        )}
                        <Pill status={row.status} />
                        <button onClick={() => showAi(student, row)} disabled={busyId === row.id} title="AI ne kya padha (dobara check ke liye bhi yahi)" className="w-9 h-9 rounded-xl border border-violet-200 bg-violet-50 flex items-center justify-center text-violet-600 cursor-pointer">
                          {busyId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        </button>
                        <button onClick={() => void openFiles(row.files)} title="Open" className="w-9 h-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 cursor-pointer">
                          <FileText className="w-4 h-4" />
                        </button>
                        {row.status !== "accepted" && (
                          <button onClick={() => void review(row, "accepted")} disabled={busyId === row.id} title="Accept, give the point" className="w-9 h-9 rounded-xl border border-emerald-200 bg-emerald-50 flex items-center justify-center text-emerald-600 cursor-pointer">
                            <Check className="w-4 h-4" />
                          </button>
                        )}
                        {row.status !== "rejected" && (
                          <button onClick={() => void review(row, "rejected")} disabled={busyId === row.id} title="Send back, take the point away" className="w-9 h-9 rounded-xl border border-rose-200 bg-rose-50 flex items-center justify-center text-rose-600 cursor-pointer">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    ) : (
                      <Clock className={`w-4 h-4 ${noLogin ? "text-slate-200" : "text-rose-300"}`} />
                    )}
                    <button
                      onClick={() => {
                        setUploadFor(student);
                        staffInput.current?.click();
                      }}
                      disabled={Boolean(uploading)}
                      title="Is bachche ka homework aap upload karo (WhatsApp par aaya ho to)"
                      className="w-9 h-9 rounded-xl border border-indigo-200 bg-indigo-50 flex items-center justify-center text-indigo-600 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
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

export const HomeworkView: React.FC<Props> = ({ students, points, studentId, canTeach, onUnlockRequest }) => (
  <div className="space-y-4">
    {canTeach ? (
      <StaffSide students={students} />
    ) : studentId ? (
      <StudentSide studentId={studentId} />
    ) : (
    <div className="bg-white rounded-3xl border border-slate-200/80 p-6 text-center space-y-3">
      <h2 className="text-lg font-black text-slate-900">Homework bhejne ke liye login karo</h2>
      <p className="text-xs text-slate-400 font-semibold">Apna username aur password daalo. Nahi pata to Sir se poochho.</p>
      <button onClick={onUnlockRequest} className="rounded-2xl bg-indigo-600 text-white font-black px-5 py-3 cursor-pointer">
        Login
      </button>
    </div>
    )}
    <HomeworkWall students={students} points={points} highlightId={studentId} />
  </div>
);
