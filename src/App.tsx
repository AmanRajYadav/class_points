import React, { useState, useMemo } from "react";
import {
  Trophy,
  Users,
  Award,
  Settings,
  Lock,
  Unlock,
  Sparkles,
  Plus,
  Search,
  Download,
  Upload,
  RotateCcw,
  Check,
  Zap,
  ChevronRight,
  UserPlus,
  Calendar,
  AlertTriangle,
  Crown,
  X,
  FileSpreadsheet,
  CloudOff,
  CloudUpload,
  Cloud,
  Loader2,
  RefreshCw,
  Database
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Student, DailyPoint, AppSettings, AppState } from "./types";
import {
  calculateScores,
  clearLegacyState,
  daysBetween,
  formatDateString,
  formatPeriod,
  generateId,
  nextPeriod,
  parseDateOnly,
  pickCycleWinners,
  readLegacyState,
  settingsPeriod,
  startOfToday,
  isAppStateShaped
} from "./lib/storage";
import { useAppState, SyncStatus } from "./lib/useAppState";
import { changeTeacherPassword, signOutTeacher, useTeacherSession } from "./lib/auth";
import { StudentAvatar, AVATAR_PRESETS } from "./components/StudentAvatar";
import { TeacherLoginModal } from "./components/TeacherLoginModal";
import { StudentDetailModal } from "./components/StudentDetailModal";
import { QuickMark } from "./components/QuickMark";
import { TrophyAnimationModal } from "./components/TrophyAnimationModal";
import { PastRecords } from "./components/PastRecords";

type AppController = ReturnType<typeof useAppState>;

/** Boot gate: nothing renders against a half-loaded scoreboard. */
export default function App() {
  const app = useAppState();

  if (!app.state) {
    return <BootScreen status={app.status} error={app.error} onRetry={app.retry} />;
  }

  return <Scoreboard app={app} state={app.state} />;
}

function BootScreen({
  status,
  error,
  onRetry
}: {
  status: SyncStatus;
  error: Error | null;
  onRetry: () => void;
}) {
  const isLoading = status === "loading";

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6 font-sans">
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200/60 p-8 max-w-md w-full text-center">
        <img
          src={`${import.meta.env.BASE_URL}fluence_logo.png`}
          alt=""
          aria-hidden="true"
          className="w-14 h-14 object-contain mx-auto mb-3"
        />
        <h1 className="text-xl font-black uppercase tracking-[0.22em] text-slate-900">Fluence</h1>
        <p className="text-[10px] text-slate-400 uppercase tracking-[0.19em] font-bold mt-1.5 mb-7">
          Question Everything
        </p>

        {isLoading ? (
          <>
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-semibold mt-3">
              Loading the scoreboard…
            </p>
          </>
        ) : (
          <>
            <div className="bg-red-50 text-red-500 w-14 h-14 rounded-2xl flex items-center justify-center mx-auto border border-red-100">
              <Database className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-black text-slate-800 mt-4">Can't reach the database</h2>
            <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
              {error?.message ?? "Unknown error."}
            </p>
            <button
              onClick={onRetry}
              className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow transition-all active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Small always-visible readout of whether edits actually reached Supabase. */
function SyncBadge({
  status,
  pendingCount,
  onRetry
}: {
  status: SyncStatus;
  pendingCount: number;
  onRetry: () => void;
}) {
  const config = {
    loading: { icon: Loader2, label: "Loading", cls: "bg-slate-100 text-slate-500", spin: true },
    synced: { icon: Cloud, label: "Saved", cls: "bg-emerald-50 text-emerald-600", spin: false },
    saving: { icon: CloudUpload, label: "Saving", cls: "bg-indigo-50 text-indigo-600", spin: false },
    pending: {
      icon: CloudUpload,
      label: `${pendingCount} queued`,
      cls: "bg-amber-50 text-amber-600",
      spin: false
    },
    offline: { icon: CloudOff, label: "Offline copy", cls: "bg-amber-50 text-amber-700", spin: false },
    error: { icon: CloudOff, label: "Not saved", cls: "bg-red-50 text-red-600", spin: false }
  }[status];

  const Icon = config.icon;
  const isProblem = status === "error" || status === "offline" || status === "pending";

  return (
    <button
      onClick={onRetry}
      title={isProblem ? "Tap to retry syncing" : "Everything is saved to the cloud"}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border border-current/10 transition-all ${config.cls} ${
        isProblem ? "cursor-pointer hover:brightness-95" : "cursor-default"
      }`}
    >
      <Icon className={`w-3.5 h-3.5 ${config.spin ? "animate-spin" : ""}`} />
      <span>{config.label}</span>
    </button>
  );
}

function Scoreboard({ app, state }: { app: AppController; state: AppState }) {
  const { mutate, replaceAll, status, pendingCount, retry, celebration, dismissCelebration, celebrate } = app;

  // --- Teacher session ---
  // `editorMode` only decides which controls are drawn. Row level security is
  // what actually rejects writes from anyone who is not signed in.
  const { isTeacher } = useTeacherSession();
  const editorMode = isTeacher;

  const [activeTab, setActiveTab] = useState<"students" | "leaderboard" | "hall" | "settings">("students");

  // --- Search & Filter ---
  const [studentSearch, setStudentSearch] = useState<string>("");
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<"All" | "Mangla" | "Sarkanda">("All");

  // --- Modals & Overlays ---
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isQuickMarkOpen, setIsQuickMarkOpen] = useState<boolean>(false);
  const [showAddStudent, setShowAddStudent] = useState<boolean>(false);

  // --- Add Student Form State ---
  const [newStudentName, setNewStudentName] = useState<string>("");
  const [newStudentAvatar, setNewStudentAvatar] = useState<number>(0);
  const [newStudentBranch, setNewStudentBranch] = useState<"Mangla" | "Sarkanda">("Mangla");

  // --- Change-password form state ---
  const [newPassword, setNewPassword] = useState<string>("");
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // --- JSON State Strings for Settings ---
  const [jsonPaste, setJsonPaste] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);

  // --- One-time upload of data left by the browser-only version ---
  const [legacyState] = useState<AppState | null>(() => readLegacyState());
  const [legacyUploaded, setLegacyUploaded] = useState<boolean>(false);

  // The end-of-cycle rollover now happens inside useAppState, right after the
  // scoreboard loads, so it can only run against real server data.

  // --- Derived Score Summaries ---
  const studentScores = useMemo(() => {
    return calculateScores(
      state.students,
      state.points,
      state.settings.cycleStartDate,
      state.settings.cycleEndDate
    );
  }, [state.students, state.points, state.settings.cycleStartDate, state.settings.cycleEndDate]);

  // --- Search and Branch filtered students list ---
  const filteredStudents = useMemo(() => {
    let list = studentScores;
    if (selectedBranchFilter !== "All") {
      list = list.filter((s) => s.student.branch === selectedBranchFilter);
    }
    if (!studentSearch.trim()) return list;
    const q = studentSearch.toLowerCase();
    return list.filter((s) => s.student.name.toLowerCase().includes(q));
  }, [studentScores, studentSearch, selectedBranchFilter]);

  // --- Leaderboard Rankings by Branch ---
  const manglaRanked = useMemo(() => {
    return studentScores
      .filter((s) => s.student.branch === "Mangla")
      .sort((a, b) => b.cyclePoints - a.cyclePoints);
  }, [studentScores]);

  const sarkandaRanked = useMemo(() => {
    return studentScores
      .filter((s) => s.student.branch === "Sarkanda")
      .sort((a, b) => b.cyclePoints - a.cyclePoints);
  }, [studentScores]);

  // --- Handlers ---
  // Each handler updates the screen immediately and hands the matching write
  // to the sync queue, which retries until Supabase confirms it.
  const handleUpdatePoints = (
    studentId: string,
    date: string,
    category: keyof Omit<DailyPoint, "id" | "studentId" | "date">,
    value: number
  ) => {
    mutate((prev) => {
      const key = `${studentId}_${date}`;
      const point: DailyPoint = {
        ...(prev.points[key] ?? {
          id: key,
          studentId,
          date,
          onTime: 0,
          homework: 0,
          quiz: 0,
          bonus: 0,
        }),
        [category]: value,
      };

      return {
        next: { ...prev, points: { ...prev.points, [key]: point } },
        ops: [{ kind: "upsertPoint", point }],
      };
    });
  };

  const updateStudent = (studentId: string, patch: Partial<Student>) => {
    mutate((prev) => {
      const existing = prev.students.find((s) => s.id === studentId);
      if (!existing) return null;
      const student = { ...existing, ...patch };

      return {
        next: {
          ...prev,
          students: prev.students.map((s) => (s.id === studentId ? student : s)),
        },
        ops: [{ kind: "upsertStudent", student }],
      };
    });
  };

  const handleRenameStudent = (studentId: string, newName: string) =>
    updateStudent(studentId, { name: newName });

  const handleUpdateAvatar = (studentId: string, newAvatarId: number) =>
    updateStudent(studentId, { avatarId: newAvatarId });

  const handleDeleteStudent = (studentId: string) => {
    mutate((prev) => {
      const points: Record<string, DailyPoint> = {};
      for (const [key, p] of Object.entries(prev.points)) {
        if (p.studentId !== studentId) points[key] = p;
      }

      return {
        next: {
          ...prev,
          students: prev.students.filter((s) => s.id !== studentId),
          points,
        },
        // The daily_points rows cascade away with the student row.
        ops: [{ kind: "deleteStudent", studentId }],
      };
    });
  };

  const handleAddStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newStudentName.trim();
    if (!name) return;

    const student: Student = {
      id: "std_" + generateId(),
      name,
      avatarId: newStudentAvatar,
      createdAt: new Date().toISOString(),
      branch: newStudentBranch,
    };

    mutate((prev) => ({
      next: { ...prev, students: [...prev.students, student] },
      ops: [{ kind: "upsertStudent", student }],
    }));

    setNewStudentName("");
    setNewStudentAvatar((prev) => (prev + 1) % AVATAR_PRESETS.length);
    setShowAddStudent(false);
  };

  // Close the running period early and jump to the next one. Normally the
  // database does this on its own at the 1st and the 16th; this is the manual
  // override.
  const handleAwardTrophyManual = () => {
    const current = settingsPeriod(state.settings);
    const winners = pickCycleWinners(studentScores, current);
    if (winners.length === 0) return;

    const upcoming = nextPeriod(current);
    const settings: AppSettings = {
      ...state.settings,
      cycleStartDate: upcoming.startDate,
      cycleEndDate: upcoming.endDate,
    };

    mutate((prev) => ({
      next: { ...prev, history: [...winners, ...prev.history], settings },
      ops: [
        { kind: "insertWinners", winners },
        { kind: "updateSettings", settings },
      ],
    }));

    celebrate(winners);
  };

  // Change the teacher password (Supabase Auth, not app data)
  const handleSavePassword = async () => {
    if (newPassword.length < 6) return;
    const failure = await changeTeacherPassword(newPassword);
    setPasswordMessage(
      failure
        ? { ok: false, text: failure }
        : { ok: true, text: "Password updated. Use it on your other devices too." }
    );
    if (!failure) setNewPassword("");
  };

  // Export data as file download
  const handleExportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `classroom_points_backup_${formatDateString(new Date())}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Export the full students and points data as a CSV file
  const handleExportCSV = () => {
    try {
      const escapeCSV = (str: string) => {
        if (str === null || str === undefined) return "";
        const stringified = String(str);
        if (stringified.includes(",") || stringified.includes('"') || stringified.includes("\n") || stringified.includes("\r")) {
          return `"${stringified.replace(/"/g, '""')}"`;
        }
        return stringified;
      };

      const csvRows: string[] = [];

      // Document headers
      csvRows.push(`"CLASSROOM SCOREBOARD AND POINTS EXPORT"`);
      csvRows.push(`"Export Date:","${new Date().toLocaleString()}"`);
      csvRows.push(`"Current Cycle Period:","${state.settings.cycleStartDate} to ${state.settings.cycleEndDate}"`);
      csvRows.push("");

      // --- SECTION 1: STUDENT CYCLE SUMMARIES ---
      csvRows.push(`"STUDENT CYCLE SUMMARIES"`);
      csvRows.push(`"Student ID","Student Name","Branch","On-Time Total Points","Homework Total Points","Quiz Total Points","Bonus Total Points","Current Cycle Total Points","Lifetime All-Time Total Points"`);
      
      studentScores.forEach((summary) => {
        csvRows.push([
          escapeCSV(summary.student.id),
          escapeCSV(summary.student.name),
          escapeCSV(summary.student.branch),
          summary.categories.onTime,
          summary.categories.homework,
          summary.categories.quiz,
          summary.categories.bonus,
          summary.cyclePoints,
          summary.lifetimePoints
        ].join(","));
      });

      csvRows.push("");
      csvRows.push("");

      // --- SECTION 2: INDIVIDUAL DAILY MARKED LOGS ---
      csvRows.push(`"DAILY MARKED LOGS (HISTORICAL RECORDS)"`);
      csvRows.push(`"Date","Student ID","Student Name","Branch","On-Time Points","Homework Points","Quiz Points","Bonus Points","Daily Total Points"`);

      // Gather and sort all daily point records by date descending, then student name
      const sortedDailyPoints = (Object.values(state.points) as DailyPoint[]).sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        
        const studentA = state.students.find(s => s.id === a.studentId)?.name || "";
        const studentB = state.students.find(s => s.id === b.studentId)?.name || "";
        return studentA.localeCompare(studentB);
      });

      sortedDailyPoints.forEach((p) => {
        const student = state.students.find((s) => s.id === p.studentId);
        if (!student) return;

        const dailyTotal = p.onTime + p.homework + p.quiz + p.bonus;
        csvRows.push([
          escapeCSV(p.date),
          escapeCSV(p.studentId),
          escapeCSV(student.name),
          escapeCSV(student.branch),
          p.onTime,
          p.homework,
          p.quiz,
          p.bonus,
          dailyTotal
        ].join(","));
      });

      // Encode and trigger download with BOM (Byte Order Mark) for Excel compatibility
      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csvRows.join("\n"));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", csvContent);
      downloadAnchor.setAttribute("download", `classroom_scores_export_${formatDateString(new Date())}.csv`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      console.error("Failed to export CSV:", err);
      alert("Error generating CSV. Please try again.");
    }
  };

  // Copy state to clipboard
  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(state, null, 2));
    alert("Full backup data copied to clipboard!");
  };

  // Import JSON data (replaces the cloud copy)
  const handleImportData = () => {
    setImportError(null);
    setImportSuccess(false);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonPaste);
    } catch {
      setImportError("Error parsing JSON. Please ensure it is a valid backup file.");
      return;
    }

    if (!isAppStateShaped(parsed)) {
      setImportError("Invalid data format! Missing students, points, history, or settings fields.");
      return;
    }

    if (
      !window.confirm(
        "This replaces everything currently in the cloud database with the pasted backup. Continue?"
      )
    ) {
      return;
    }

    replaceAll(parsed);
    setImportSuccess(true);
    setJsonPaste("");
  };

  // One-time upload of whatever this browser saved before the cloud existed
  const handleUploadLegacyData = () => {
    if (!legacyState) return;
    if (
      !window.confirm(
        "Upload this device's saved scoreboard to the cloud? It replaces whatever is in the database now."
      )
    ) {
      return;
    }
    replaceAll(legacyState);
    clearLegacyState();
    setLegacyUploaded(true);
  };

  // Hard reset app data
  const handleResetApp = () => {
    if (
      window.confirm(
        "CRITICAL WARNING: This deletes all students, daily points, and history from the cloud database for every device. This cannot be undone! Are you absolutely sure?"
      )
    ) {
      replaceAll({ students: [], points: {}, history: [], settings: state.settings });
    }
  };

  // Current Cycle progress tracker
  const cycleProgress = useMemo(() => {
    const start = parseDateOnly(state.settings.cycleStartDate);
    const end = parseDateOnly(state.settings.cycleEndDate);
    const today = startOfToday();

    // Both endpoints are inclusive calendar days, and all three values are
    // local midnight, so the arithmetic no longer drifts by a day.
    const totalDays = Math.max(1, daysBetween(start, end) + 1);
    const elapsedDays = Math.min(totalDays, Math.max(0, daysBetween(start, today) + 1));

    return {
      percent: (elapsedDays / totalDays) * 100,
      elapsedDays,
      totalDays,
      daysLeft: Math.max(0, totalDays - elapsedDays),
    };
  }, [state.settings.cycleStartDate, state.settings.cycleEndDate]);

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 flex flex-col selection:bg-indigo-200">
      {/* Top Playful Brand Header */}
      <header className="bg-white border-b-2 border-slate-200/60 sticky top-0 z-30 px-4 py-3 sm:px-6 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Brand lockup. Kept on one line at every width — a wrapped tagline
              reads as a layout bug rather than a tagline. */}
          <div className="flex items-center gap-3 shrink-0">
            <img
              src={`${import.meta.env.BASE_URL}fluence_logo.png`}
              alt=""
              aria-hidden="true"
              className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 object-contain"
            />
            <div className="leading-none">
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-[0.2em] text-slate-900 whitespace-nowrap">
                Fluence
              </h1>
              <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase tracking-[0.16em] font-bold mt-1.5 whitespace-nowrap">
                Question Everything
              </p>
            </div>
          </div>

          {/* Cycle Info Bar */}
          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl px-4 py-2 flex items-center gap-4 text-xs font-bold text-slate-600 w-full sm:w-auto shadow-inner">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-500" />
              <div>
                <span className="block text-[9px] text-slate-400 uppercase font-black leading-none">Trophy Period</span>
                <span className="text-slate-800 font-extrabold">
                  {state.settings.cycleStartDate.split("-")[2]} - {state.settings.cycleEndDate.split("-")[2]} {parseDateOnly(state.settings.cycleStartDate).toLocaleDateString(undefined, { month: "short" })}
                </span>
              </div>
            </div>

            <div className="h-8 w-px bg-slate-200" />

            <div className="flex-1 sm:flex-initial min-w-[100px]">
              <div className="flex justify-between text-[9px] text-slate-400 font-black mb-0.5">
                <span>CYCLE BAR</span>
                <span>{cycleProgress.daysLeft} DAYS LEFT</span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${cycleProgress.percent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Lock / Unlock Toggle Button */}
          <div className="flex items-center gap-2">
            <SyncBadge status={status} pendingCount={pendingCount} onRetry={retry} />
            {editorMode ? (
              <motion.div
                initial={{ scale: 0.95 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-1.5 bg-amber-500 text-slate-950 font-black text-xs px-3 py-2 rounded-xl shadow-md border-2 border-amber-400"
              >
                <Unlock className="w-4 h-4" />
                <span>EDITOR ON</span>
                <button
                  onClick={() => void signOutTeacher()}
                  className="ml-2 bg-slate-950 text-white hover:bg-slate-800 px-2 py-1 rounded-lg text-[10px] uppercase font-black tracking-wider transition-all cursor-pointer"
                >
                  LOCK
                </button>
              </motion.div>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="flex items-center gap-1.5 bg-slate-800 text-slate-100 hover:bg-slate-900 font-black text-xs px-3 py-2 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer border border-slate-700"
              >
                <Lock className="w-4 h-4 text-slate-400" />
                <span>TEACHER UNLOCK</span>
              </button>
            )}
          </div>
        </div>
      </header>
 
      {/* Sync trouble ribbon — the app must never look "saved" when it isn't */}
      {(status === "offline" || status === "error" || status === "pending") && (
        <div className="bg-amber-500 text-amber-950 px-4 py-2 text-center text-xs font-black tracking-wide flex flex-wrap items-center justify-center gap-2 shadow-inner">
          <CloudOff className="w-4 h-4" />
          <span>
            {status === "offline"
              ? "Showing the last copy saved on this device — the cloud database is unreachable."
              : `${pendingCount} change${pendingCount === 1 ? "" : "s"} not saved to the cloud yet.`}
          </span>
          <button
            onClick={retry}
            className="bg-amber-950 text-amber-50 px-2.5 py-1 rounded-lg text-[10px] uppercase font-black tracking-wider hover:bg-amber-900 transition-all cursor-pointer"
          >
            Retry now
          </button>
        </div>
      )}

      {/* Editor Warning Ribbon */}
      {editorMode && (
        <div className="bg-amber-400 text-amber-950 px-4 py-2 text-center text-xs font-black tracking-wide flex items-center justify-center gap-2 shadow-inner">
          <Sparkles className="w-4 h-4 animate-spin" />
          <span>TEACHER CONTROL ACTIVE: You can now adjust daily points, edit students, and trigger trophy resets.</span>
        </div>
      )}

      {/* Main Body Content with Sidebar/Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6 pb-24 lg:pb-6">
        {/* Navigation Tabs (Desktop only; hidden on mobile in favor of sticky bottom tab bar) */}
        <div className="hidden lg:flex lg:flex-col lg:col-span-1 gap-2">
          <button
            onClick={() => setActiveTab("students")}
            className={`flex-1 lg:flex-initial flex items-center justify-center lg:justify-start gap-3 px-4 py-3.5 rounded-2xl font-black text-xs tracking-wider uppercase transition-all border-2 text-center lg:text-left cursor-pointer ${
              activeTab === "students"
                ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100 scale-102"
                : "bg-white text-slate-500 border-slate-200/60 hover:bg-slate-50"
            }`}
          >
            <Users className="w-4.5 h-4.5" />
            <span>Students Grid</span>
          </button>

          <button
            onClick={() => setActiveTab("leaderboard")}
            className={`flex-1 lg:flex-initial flex items-center justify-center lg:justify-start gap-3 px-4 py-3.5 rounded-2xl font-black text-xs tracking-wider uppercase transition-all border-2 text-center lg:text-left cursor-pointer ${
              activeTab === "leaderboard"
                ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100 scale-102"
                : "bg-white text-slate-500 border-slate-200/60 hover:bg-slate-50"
            }`}
          >
            <Trophy className="w-4.5 h-4.5" />
            <span>Leaderboard</span>
          </button>

          <button
            onClick={() => setActiveTab("hall")}
            className={`flex-1 lg:flex-initial flex items-center justify-center lg:justify-start gap-3 px-4 py-3.5 rounded-2xl font-black text-xs tracking-wider uppercase transition-all border-2 text-center lg:text-left cursor-pointer ${
              activeTab === "hall"
                ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100 scale-102"
                : "bg-white text-slate-500 border-slate-200/60 hover:bg-slate-50"
            }`}
          >
            <Award className="w-4.5 h-4.5" />
            <span>Hall of Fame</span>
          </button>

          <button
            onClick={() => setActiveTab("settings")}
            className={`flex-1 lg:flex-initial flex items-center justify-center lg:justify-start gap-3 px-4 py-3.5 rounded-2xl font-black text-xs tracking-wider uppercase transition-all border-2 text-center lg:text-left cursor-pointer ${
              activeTab === "settings"
                ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100 scale-102"
                : "bg-white text-slate-500 border-slate-200/60 hover:bg-slate-50"
            }`}
          >
            <Settings className="w-4.5 h-4.5" />
            <span>Settings</span>
          </button>
        </div>

        {/* Content Viewport */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          {/* STUDENTS TAB */}
          {activeTab === "students" && (
            <div className="space-y-6">
              {/* Controls bar */}
              <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200/60 flex flex-col md:flex-row gap-4 items-center justify-between">
                {/* Search Box */}
                <div className="relative w-full md:max-w-xs">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search students by name..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2 pl-9 pr-4 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
                  />
                </div>

                {/* Branch Quick Filters */}
                <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60 shrink-0 select-none">
                  <button
                    onClick={() => setSelectedBranchFilter("All")}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      selectedBranchFilter === "All"
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    All Branches
                  </button>
                  <button
                    onClick={() => setSelectedBranchFilter("Mangla")}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      selectedBranchFilter === "Mangla"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Mangla ({state.students.filter(s => s.branch === 'Mangla').length})
                  </button>
                  <button
                    onClick={() => setSelectedBranchFilter("Sarkanda")}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                      selectedBranchFilter === "Sarkanda"
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Sarkanda ({state.students.filter(s => s.branch === 'Sarkanda').length})
                  </button>
                </div>

                {/* Quick actions for teacher */}
                <div className="flex gap-2 w-full md:w-auto">
                  {editorMode && (
                    <>
                      <button
                        onClick={() => setIsQuickMarkOpen(true)}
                        className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-black text-xs px-4 py-2.5 rounded-2xl shadow-md transition-all active:scale-95 cursor-pointer"
                      >
                        <Zap className="w-4 h-4 text-slate-950 fill-slate-950" />
                        <span>Quick Mark</span>
                      </button>

                      <button
                        onClick={() => setShowAddStudent(true)}
                        className="flex-1 md:flex-none flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-4 py-2.5 rounded-2xl shadow-md transition-all active:scale-95 cursor-pointer"
                      >
                        <UserPlus className="w-4 h-4" />
                        <span>Add Student</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Student Snap-Grid */}
              {filteredStudents.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-slate-200">
                  <p className="text-slate-400 font-bold text-sm">No students found matching your search.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                  {filteredStudents.map(({ student, cyclePoints }) => (
                    <motion.div
                      key={student.id}
                      whileHover={{ scale: 1.03, y: -4 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setSelectedStudent(student)}
                      className="bg-white rounded-3xl border border-slate-200/80 p-4 flex flex-col items-center text-center cursor-pointer relative shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
                    >
                      {/* Snapchat Circular Avatar */}
                      <div className="relative mb-2">
                        <StudentAvatar presetId={student.avatarId} size="md" />
                        {/* Point Pill Badge */}
                        <span className="absolute -bottom-1 -right-1 bg-indigo-600 text-white px-2 py-0.5 rounded-full text-[10px] font-black font-mono shadow-sm border border-white">
                          {cyclePoints} pt
                        </span>
                      </div>

                      {/* Name below avatar */}
                      <h4 className="font-bold text-slate-800 text-sm truncate w-full px-1">
                        {student.name}
                      </h4>
                      {/* Branch indicator */}
                      <span className="text-[10px] font-black text-indigo-500/90 tracking-wide bg-indigo-50/50 px-2 py-0.5 rounded-md mt-1 mb-1 border border-indigo-100/30">
                        {student.branch} Branch
                      </span>
                    </motion.div>
                  ))}

                  {/* Add Student Card Trigger for Grid (Editor Mode Only) */}
                  {editorMode && (
                    <button
                      onClick={() => setShowAddStudent(true)}
                      className="bg-slate-50 border-3 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/20 text-slate-400 hover:text-indigo-600 rounded-3xl p-4 flex flex-col items-center justify-center text-center transition-all h-full min-h-[135px] cursor-pointer group"
                    >
                      <div className="p-3 bg-white rounded-full shadow-sm border border-slate-200 group-hover:border-indigo-100 mb-2">
                        <Plus className="w-5 h-5 text-slate-500 group-hover:text-indigo-600" />
                      </div>
                      <span className="text-xs font-black uppercase tracking-wider">Add Student</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* LEADERBOARD TAB */}
          {activeTab === "leaderboard" && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              {/* MANGLA BRANCH LEADERBOARD */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 bg-white px-5 py-4 rounded-3xl border border-slate-200/60 shadow-sm">
                  <div className="bg-indigo-50 p-2.5 rounded-2xl text-indigo-600 border border-indigo-100 flex items-center justify-center">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-lg leading-tight">Mangla Branch Standings</h3>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Separate Trophy Group</p>
                  </div>
                </div>

                {/* Podium Spotlight Section (Top 3) - Mangla */}
                {manglaRanked.length > 0 && (
                  <div className="bg-gradient-to-br from-indigo-900 to-purple-950 text-white rounded-3xl p-5 shadow-xl border-4 border-slate-800 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06)_0%,transparent_70%)] pointer-events-none" />
                    <h3 className="text-center font-black uppercase text-[10px] text-indigo-300 tracking-widest mb-4 flex items-center justify-center gap-1.5">
                      <Crown className="w-3.5 h-3.5 text-yellow-400" /> Mangla Podium <Crown className="w-3.5 h-3.5 text-yellow-400" />
                    </h3>

                    <div className="flex items-end justify-center gap-3 pt-4 max-w-sm mx-auto h-48">
                      {/* Rank 2 (Silver) */}
                      {manglaRanked[1] && (
                        <div className="flex flex-col items-center flex-1 max-w-[90px]">
                          <div className="relative mb-1">
                            <StudentAvatar presetId={manglaRanked[1].student.avatarId} size="sm" className="ring-2 ring-slate-300" />
                            <span className="absolute -bottom-1 -right-1 bg-slate-300 text-slate-800 font-black text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white">
                              2
                            </span>
                          </div>
                          <span className="text-[9px] font-bold truncate w-full text-center text-slate-200">
                            {manglaRanked[1].student.name.split(" ")[0]}
                          </span>
                          <span className="text-[10px] font-black font-mono text-slate-300">
                            {manglaRanked[1].cyclePoints} pt
                          </span>
                          <div className="w-full bg-gradient-to-t from-slate-700 to-slate-500 rounded-t-lg h-12 shadow-md flex items-center justify-center font-black text-xs text-slate-400 mt-1 border-t border-slate-400/30">
                            🥈
                          </div>
                        </div>
                      )}

                      {/* Rank 1 (Gold) */}
                      {manglaRanked[0] && (
                        <div className="flex flex-col items-center flex-1 max-w-[100px] relative -top-2">
                          <span className="text-lg animate-bounce mb-0.5">👑</span>
                          <div className="relative mb-1">
                            <StudentAvatar presetId={manglaRanked[0].student.avatarId} size="sm" className="ring-3 ring-yellow-400" />
                            <span className="absolute -bottom-1 -right-1 bg-yellow-400 text-slate-900 font-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center border border-white shadow-md">
                              1
                            </span>
                          </div>
                          <span className="text-[10px] font-black truncate w-full text-center text-yellow-300">
                            {manglaRanked[0].student.name.split(" ")[0]}
                          </span>
                          <span className="text-xs font-black font-mono text-yellow-400">
                            {manglaRanked[0].cyclePoints} pt
                          </span>
                          <div className="w-full bg-gradient-to-t from-yellow-600 to-amber-400 rounded-t-lg h-18 shadow-lg flex items-center justify-center font-black text-base text-yellow-950 mt-1 border-t border-yellow-300/40">
                            🏆
                          </div>
                        </div>
                      )}

                      {/* Rank 3 (Bronze) */}
                      {manglaRanked[2] && (
                        <div className="flex flex-col items-center flex-1 max-w-[90px]">
                          <div className="relative mb-1">
                            <StudentAvatar presetId={manglaRanked[2].student.avatarId} size="sm" className="ring-2 ring-amber-700/50" />
                            <span className="absolute -bottom-1 -right-1 bg-amber-600 text-white font-black text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white">
                              3
                            </span>
                          </div>
                          <span className="text-[9px] font-bold truncate w-full text-center text-slate-200">
                            {manglaRanked[2].student.name.split(" ")[0]}
                          </span>
                          <span className="text-[10px] font-black font-mono text-slate-300">
                            {manglaRanked[2].cyclePoints} pt
                          </span>
                          <div className="w-full bg-gradient-to-t from-amber-800 to-amber-600 rounded-t-lg h-8 shadow-md flex items-center justify-center font-black text-xs text-amber-900 mt-1 border-t border-amber-500/30">
                            🥉
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Scoreboard standings table list - Mangla */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                    Mangla Scoreboard Standings
                  </h4>

                  {manglaRanked.length === 0 ? (
                    <p className="text-slate-400 text-center font-bold py-6 text-xs">No student points recorded.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {manglaRanked.map((summary, index) => {
                        const isTop3 = index < 3;
                        const rankIcons = ["🥇", "🥈", "🥉"];

                        return (
                          <div
                            key={summary.student.id}
                            onClick={() => setSelectedStudent(summary.student)}
                            className="flex items-center justify-between py-2.5 hover:bg-slate-50/75 rounded-2xl px-2 transition-all cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 font-black text-slate-400 font-mono text-center text-xs">
                                {isTop3 ? rankIcons[index] : `#${index + 1}`}
                              </div>
                              <StudentAvatar presetId={summary.student.avatarId} size="xs" />
                              <div>
                                <span className="font-extrabold text-slate-800 group-hover:text-indigo-600 transition-colors text-xs sm:text-sm block">
                                  {summary.student.name}
                                </span>
                                <div className="flex gap-1 mt-0.5 text-[8px] font-extrabold text-slate-400 uppercase tracking-wider">
                                  <span className="bg-blue-50 text-blue-600 px-1 rounded">T:{summary.categories.onTime}</span>
                                  <span className="bg-amber-50 text-amber-600 px-1 rounded">H:{summary.categories.homework}</span>
                                  <span className="bg-emerald-50 text-emerald-600 px-1 rounded">Q:{summary.categories.quiz}</span>
                                  <span className="bg-purple-50 text-purple-600 px-1 rounded">B:{summary.categories.bonus}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <span className="block text-base font-black font-mono text-indigo-600 leading-none">
                                  {summary.cyclePoints}
                                </span>
                                <span className="text-[8px] uppercase font-black text-slate-400 tracking-widest">
                                  Pts
                                </span>
                              </div>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-all" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* SARKANDA BRANCH LEADERBOARD */}
              <div className="space-y-6">
                <div className="flex items-center gap-3 bg-white px-5 py-4 rounded-3xl border border-slate-200/60 shadow-sm">
                  <div className="bg-indigo-50 p-2.5 rounded-2xl text-indigo-600 border border-indigo-100 flex items-center justify-center">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-lg leading-tight">Sarkanda Branch Standings</h3>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Separate Trophy Group</p>
                  </div>
                </div>

                {/* Podium Spotlight Section (Top 3) - Sarkanda */}
                {sarkandaRanked.length > 0 && (
                  <div className="bg-gradient-to-br from-indigo-900 to-purple-950 text-white rounded-3xl p-5 shadow-xl border-4 border-slate-800 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06)_0%,transparent_70%)] pointer-events-none" />
                    <h3 className="text-center font-black uppercase text-[10px] text-indigo-300 tracking-widest mb-4 flex items-center justify-center gap-1.5">
                      <Crown className="w-3.5 h-3.5 text-yellow-400" /> Sarkanda Podium <Crown className="w-3.5 h-3.5 text-yellow-400" />
                    </h3>

                    <div className="flex items-end justify-center gap-3 pt-4 max-w-sm mx-auto h-48">
                      {/* Rank 2 (Silver) */}
                      {sarkandaRanked[1] && (
                        <div className="flex flex-col items-center flex-1 max-w-[90px]">
                          <div className="relative mb-1">
                            <StudentAvatar presetId={sarkandaRanked[1].student.avatarId} size="sm" className="ring-2 ring-slate-300" />
                            <span className="absolute -bottom-1 -right-1 bg-slate-300 text-slate-800 font-black text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white">
                              2
                            </span>
                          </div>
                          <span className="text-[9px] font-bold truncate w-full text-center text-slate-200">
                            {sarkandaRanked[1].student.name.split(" ")[0]}
                          </span>
                          <span className="text-[10px] font-black font-mono text-slate-300">
                            {sarkandaRanked[1].cyclePoints} pt
                          </span>
                          <div className="w-full bg-gradient-to-t from-slate-700 to-slate-500 rounded-t-lg h-12 shadow-md flex items-center justify-center font-black text-xs text-slate-400 mt-1 border-t border-slate-400/30">
                            🥈
                          </div>
                        </div>
                      )}

                      {/* Rank 1 (Gold) */}
                      {sarkandaRanked[0] && (
                        <div className="flex flex-col items-center flex-1 max-w-[100px] relative -top-2">
                          <span className="text-lg animate-bounce mb-0.5">👑</span>
                          <div className="relative mb-1">
                            <StudentAvatar presetId={sarkandaRanked[0].student.avatarId} size="sm" className="ring-3 ring-yellow-400" />
                            <span className="absolute -bottom-1 -right-1 bg-yellow-400 text-slate-900 font-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center border border-white shadow-md">
                              1
                            </span>
                          </div>
                          <span className="text-[10px] font-black truncate w-full text-center text-yellow-300">
                            {sarkandaRanked[0].student.name.split(" ")[0]}
                          </span>
                          <span className="text-xs font-black font-mono text-yellow-400">
                            {sarkandaRanked[0].cyclePoints} pt
                          </span>
                          <div className="w-full bg-gradient-to-t from-yellow-600 to-amber-400 rounded-t-lg h-18 shadow-lg flex items-center justify-center font-black text-base text-yellow-950 mt-1 border-t border-yellow-300/40">
                            🏆
                          </div>
                        </div>
                      )}

                      {/* Rank 3 (Bronze) */}
                      {sarkandaRanked[2] && (
                        <div className="flex flex-col items-center flex-1 max-w-[90px]">
                          <div className="relative mb-1">
                            <StudentAvatar presetId={sarkandaRanked[2].student.avatarId} size="sm" className="ring-2 ring-amber-700/50" />
                            <span className="absolute -bottom-1 -right-1 bg-amber-600 text-white font-black text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white">
                              3
                            </span>
                          </div>
                          <span className="text-[9px] font-bold truncate w-full text-center text-slate-200">
                            {sarkandaRanked[2].student.name.split(" ")[0]}
                          </span>
                          <span className="text-[10px] font-black font-mono text-slate-300">
                            {sarkandaRanked[2].cyclePoints} pt
                          </span>
                          <div className="w-full bg-gradient-to-t from-amber-800 to-amber-600 rounded-t-lg h-8 shadow-md flex items-center justify-center font-black text-xs text-amber-900 mt-1 border-t border-amber-500/30">
                            🥉
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Scoreboard standings table list - Sarkanda */}
                <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                    Sarkanda Scoreboard Standings
                  </h4>

                  {sarkandaRanked.length === 0 ? (
                    <p className="text-slate-400 text-center font-bold py-6 text-xs">No student points recorded.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {sarkandaRanked.map((summary, index) => {
                        const isTop3 = index < 3;
                        const rankIcons = ["🥇", "🥈", "🥉"];

                        return (
                          <div
                            key={summary.student.id}
                            onClick={() => setSelectedStudent(summary.student)}
                            className="flex items-center justify-between py-2.5 hover:bg-slate-50/75 rounded-2xl px-2 transition-all cursor-pointer group"
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 font-black text-slate-400 font-mono text-center text-xs">
                                {isTop3 ? rankIcons[index] : `#${index + 1}`}
                              </div>
                              <StudentAvatar presetId={summary.student.avatarId} size="xs" />
                              <div>
                                <span className="font-extrabold text-slate-800 group-hover:text-indigo-600 transition-colors text-xs sm:text-sm block">
                                  {summary.student.name}
                                </span>
                                <div className="flex gap-1 mt-0.5 text-[8px] font-extrabold text-slate-400 uppercase tracking-wider">
                                  <span className="bg-blue-50 text-blue-600 px-1 rounded">T:{summary.categories.onTime}</span>
                                  <span className="bg-amber-50 text-amber-600 px-1 rounded">H:{summary.categories.homework}</span>
                                  <span className="bg-emerald-50 text-emerald-600 px-1 rounded">Q:{summary.categories.quiz}</span>
                                  <span className="bg-purple-50 text-purple-600 px-1 rounded">B:{summary.categories.bonus}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <span className="block text-base font-black font-mono text-indigo-600 leading-none">
                                  {summary.cyclePoints}
                                </span>
                                <span className="text-[8px] uppercase font-black text-slate-400 tracking-widest">
                                  Pts
                                </span>
                              </div>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-all" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* HALL OF FAME TAB */}
          {activeTab === "hall" && (
            <div className="space-y-6">
              {/* Full standings for any finished period, recomputed from the
                  daily marks that are still on record. */}
              <PastRecords state={state} />

              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-yellow-100 p-2.5 rounded-2xl text-yellow-500 border border-yellow-200">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 leading-tight">Classroom Hall of Fame</h3>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                      Celebrated Past Cycle Trophy Winners
                    </p>
                  </div>
                </div>

                {state.history.length === 0 ? (
                  <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <span className="text-4xl animate-bounce block">🏆</span>
                    <h4 className="text-slate-700 font-extrabold mt-3 text-sm">No trophies awarded yet!</h4>
                    <p className="text-slate-400 text-xs mt-1 max-w-xs mx-auto">
                      At the end of each half-month period the #1 student in each branch is crowned here automatically.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {state.history.map((winner, idx) => (
                      <motion.div
                        key={winner.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className="bg-gradient-to-br from-amber-500/5 to-yellow-500/10 border-2 border-yellow-200 rounded-3xl p-5 flex items-center gap-4 relative overflow-hidden"
                      >
                        {/* Sparkly corner styling */}
                        <div className="absolute top-0 right-0 bg-yellow-400 text-slate-950 px-2.5 py-1 rounded-bl-2xl font-black text-[10px] uppercase tracking-wider shadow-sm flex items-center gap-1">
                          <Crown className="w-3 h-3" /> Winner
                        </div>

                        <StudentAvatar presetId={winner.avatarId} size="md" className="ring-2 ring-yellow-300" />

                        <div className="flex-1">
                          <h4 className="font-black text-slate-800 text-lg leading-tight mt-1">
                            {winner.studentName}
                          </h4>
                          <span className="text-[10px] font-extrabold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full w-fit block mt-1.5">
                            Winning Score: {winner.score} pts
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold block mt-1">
                            Cycle: {winner.cycleStartDate.split("-")[2]} - {winner.cycleEndDate.split("-")[2]} {parseDateOnly(winner.cycleStartDate).toLocaleDateString(undefined, { month: "short" })}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === "settings" && (
            <div className="space-y-6">
              {/* Teacher settings panel (Unlock check) */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-50 p-2.5 rounded-2xl text-indigo-600 border border-indigo-100">
                    <Settings className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 leading-tight">Teacher Control Panel</h3>
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                      Password, Trophy Period, and Backups
                    </p>
                  </div>
                </div>

                {!editorMode ? (
                  <div className="bg-slate-50 rounded-2xl p-6 text-center border border-slate-200 flex flex-col items-center">
                    <Lock className="w-8 h-8 text-slate-400 mb-3" />
                    <h4 className="font-extrabold text-slate-700 text-sm">Settings Locked</h4>
                    <p className="text-slate-400 text-xs mt-1 max-w-xs">
                      Please unlock Editor Mode using the button in the top header to configure settings.
                    </p>
                    <button
                      onClick={() => setIsLoginModalOpen(true)}
                      className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs rounded-xl shadow transition-all active:scale-95 cursor-pointer"
                    >
                      Unlock Now
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Teacher password */}
                    <div className="border-b border-slate-100 pb-5 space-y-3">
                      <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider">
                        1. Teacher Password
                      </h4>
                      <p className="text-xs text-slate-400">
                        Editing is protected by a real Supabase Auth account, so changing scores
                        is impossible without this password — even for someone poking at the
                        database directly. Changing it here signs out nothing; use the new
                        password on your other devices next time you unlock.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="password"
                          autoComplete="new-password"
                          placeholder="New password (min 6 characters)"
                          value={newPassword}
                          onChange={(e) => {
                            setPasswordMessage(null);
                            setNewPassword(e.target.value);
                          }}
                          className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-full sm:w-72 font-bold"
                        />
                        <button
                          onClick={() => void handleSavePassword()}
                          disabled={newPassword.length < 6}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs rounded-xl transition-all cursor-pointer whitespace-nowrap active:scale-95"
                        >
                          Save New Password
                        </button>
                      </div>
                      {passwordMessage && (
                        <p
                          className={`text-xs font-extrabold flex items-center gap-1 ${
                            passwordMessage.ok ? "text-emerald-600" : "text-red-600"
                          }`}
                        >
                          {passwordMessage.ok ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          )}
                          {passwordMessage.text}
                        </p>
                      )}
                    </div>

                    {/* Trophy period */}
                    <div className="border-b border-slate-100 pb-5 space-y-4">
                      <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider">
                        2. Trophy Period
                      </h4>
                      <p className="text-xs text-slate-400">
                        Scoring runs in fixed half-month periods: the 1st to the 15th, then the
                        16th to the end of the month. The database rolls the period over on its
                        own, crowns the top student in each branch, and files them in Past
                        Records. Daily marks are never deleted, so every past period stays
                        viewable.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl px-4 py-3">
                          <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Running now
                          </span>
                          <span className="block text-sm font-black text-slate-800 mt-0.5">
                            {formatPeriod(settingsPeriod(state.settings))}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl px-4 py-3">
                          <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Resets on
                          </span>
                          <span className="block text-sm font-black text-slate-800 mt-0.5">
                            {parseDateOnly(nextPeriod(settingsPeriod(state.settings)).startDate).toLocaleDateString(
                              undefined,
                              { day: "numeric", month: "short" }
                            )}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl px-4 py-3">
                          <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Timezone
                          </span>
                          <span className="block text-sm font-black text-slate-800 mt-0.5">
                            {state.settings.timezone}
                          </span>
                        </div>
                      </div>

                      {/* Manual early close */}
                      <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 mt-2">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="block text-xs font-extrabold text-amber-800">
                              Close this period early
                            </span>
                            <span className="block text-[10px] text-amber-600 mt-0.5">
                              Crowns the current leaders now and skips straight to{" "}
                              {formatPeriod(nextPeriod(settingsPeriod(state.settings)))}. Only
                              needed if you want to end a period ahead of schedule.
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                "Crown the current leaders and move to the next period now?"
                              )
                            ) {
                              handleAwardTrophyManual();
                            }
                          }}
                          className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 hover:from-amber-600 hover:to-amber-700 font-black text-xs rounded-xl shadow transition-all whitespace-nowrap active:scale-95 cursor-pointer"
                        >
                          Award Trophy Now 🏆
                        </button>
                      </div>
                    </div>

                    {/* Data Backups */}
                    <div className="border-b border-slate-100 pb-5 space-y-3">
                      <h4 className="text-sm font-black text-slate-700 uppercase tracking-wider">
                        3. Backup, Export, & Import
                      </h4>
                      <p className="text-xs text-slate-400">
                        Export your students, daily records, settings, and history logs as a backup file, or import a previously exported backup file to restore records.
                      </p>

                      {/* Data from the pre-database version of the app, if any */}
                      {legacyState && !legacyUploaded && (
                        <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div className="flex items-start gap-2.5">
                            <CloudUpload className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                            <div>
                              <span className="block text-xs font-extrabold text-indigo-900">
                                Older data found on this device
                              </span>
                              <span className="block text-[10px] text-indigo-600 mt-0.5">
                                {legacyState.students.length} students and{" "}
                                {Object.keys(legacyState.points).length} daily records were saved by
                                the previous browser-only version. Upload them to the cloud database.
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={handleUploadLegacyData}
                            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow transition-all whitespace-nowrap active:scale-95 cursor-pointer"
                          >
                            Push to cloud
                          </button>
                        </div>
                      )}
                      {legacyUploaded && (
                        <p className="text-xs text-emerald-600 font-extrabold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> This device's older data was uploaded to the cloud.
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          onClick={handleExportData}
                          className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs rounded-xl shadow active:scale-95 transition-all cursor-pointer"
                        >
                          <Download className="w-4 h-4" /> Export Backup File (.json)
                        </button>

                        <button
                          onClick={handleExportCSV}
                          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow active:scale-95 transition-all cursor-pointer"
                        >
                          <FileSpreadsheet className="w-4 h-4" /> Export Spreadsheet (.csv)
                        </button>

                        <button
                          onClick={handleCopyToClipboard}
                          className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl active:scale-95 transition-all cursor-pointer"
                        >
                          Copy JSON Backup Code
                        </button>
                      </div>

                      {/* Import Section */}
                      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3 mt-4">
                        <label className="block text-xs font-extrabold text-slate-700">
                          Restore Backup from Clipboard/JSON Code:
                        </label>
                        <textarea
                          placeholder='Paste your copied backup JSON here (e.g. {"students": [...], "points": {...}})...'
                          value={jsonPaste}
                          onChange={(e) => setJsonPaste(e.target.value)}
                          rows={3}
                          className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                        />
                        <button
                          onClick={handleImportData}
                          disabled={!jsonPaste.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 font-black text-xs rounded-xl transition-all active:scale-95 cursor-pointer"
                        >
                          <Upload className="w-4 h-4" /> Restore Backup Data
                        </button>

                        {importSuccess && (
                          <p className="text-xs text-emerald-600 font-extrabold flex items-center gap-1 mt-1">
                            <Check className="w-3.5 h-3.5" /> Backup successfully imported and restored! State reloaded.
                          </p>
                        )}
                        {importError && (
                          <p className="text-xs text-red-600 font-extrabold flex items-center gap-1 mt-1">
                            <AlertTriangle className="w-3.5 h-3.5" /> {importError}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Danger zone Reset */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-black text-red-600 uppercase tracking-wider">
                        4. Danger Zone
                      </h4>
                      <p className="text-xs text-slate-400">
                        Irreversibly erase all students, daily points records, settings, and trophy histories to start the coaching class from scratch.
                      </p>
                      <button
                        onClick={handleResetApp}
                        className="flex items-center gap-2 px-4 py-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-black text-xs rounded-2xl transition-all active:scale-95 cursor-pointer"
                      >
                        <RotateCcw className="w-4.5 h-4.5" /> Wipe Scoreboard Database Clean
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* FOOTER credit */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-[11px] text-slate-400 font-bold tracking-wide mt-auto">
        <p className="uppercase tracking-[0.19em] font-black text-slate-500">
          Fluence <span className="text-slate-300 mx-1">·</span> Question Everything
        </p>
        <p className="text-[10px] text-slate-400/75 mt-1">
          Classroom scoreboard. Records sync across every device.
        </p>
      </footer>

      {/* --- ADD STUDENT DIALOG MODAL (Editor Mode Only) --- */}
      <AnimatePresence>
        {showAddStudent && editorMode && (
          <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center z-40 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md border-4 border-slate-100"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-indigo-500" /> Add New Student
                </h3>
                <button
                  onClick={() => setShowAddStudent(false)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddStudentSubmit} className="space-y-5">
                {/* Name */}
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">
                    Full Student Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter student's first and last name..."
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 px-4 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-semibold"
                    maxLength={20}
                  />
                </div>

                {/* Branch Selection */}
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">
                    Select Class Branch
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewStudentBranch("Mangla")}
                      className={`flex-1 py-2.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider border-2 transition-all cursor-pointer ${
                        newStudentBranch === "Mangla"
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-md"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      Mangla Branch
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewStudentBranch("Sarkanda")}
                      className={`flex-1 py-2.5 px-4 rounded-2xl font-black text-xs uppercase tracking-wider border-2 transition-all cursor-pointer ${
                        newStudentBranch === "Sarkanda"
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-md"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      Sarkanda Branch
                    </button>
                  </div>
                </div>

                {/* Avatar Picker */}
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">
                    Assign Cartoon Avatar
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 p-2 bg-slate-50 rounded-2xl border border-slate-200/80 max-h-36 overflow-y-auto">
                    {AVATAR_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setNewStudentAvatar(preset.id)}
                        className={`p-1 rounded-xl border-2 transition-all hover:scale-105 cursor-pointer ${
                          newStudentAvatar === preset.id
                            ? "border-indigo-600 bg-white shadow-sm"
                            : "border-transparent"
                        }`}
                      >
                        <StudentAvatar presetId={preset.id} size="sm" />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-3 flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm rounded-2xl shadow-lg transition-all active:scale-95 cursor-pointer text-center"
                  >
                    Add to Class Board 🎉
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddStudent(false)}
                    className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- REUSABLE COMPONENT MODALS --- */}

      {/* Teacher sign-in */}
      <TeacherLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />

      {/* Student detail card modal */}
      <StudentDetailModal
        isOpen={selectedStudent !== null}
        onClose={() => setSelectedStudent(null)}
        student={selectedStudent}
        editorMode={editorMode}
        points={state.points}
        onUpdatePoints={handleUpdatePoints}
        onRenameStudent={handleRenameStudent}
        onUpdateAvatar={handleUpdateAvatar}
        onDeleteStudent={handleDeleteStudent}
        cycleStartDate={state.settings.cycleStartDate}
        cycleEndDate={state.settings.cycleEndDate}
        onUnlockRequest={() => setIsLoginModalOpen(true)}
      />

      {/* Quick mark class overlay */}
      <QuickMark
        isOpen={isQuickMarkOpen}
        onClose={() => setIsQuickMarkOpen(false)}
        students={filteredStudents.map((s) => s.student)}
        points={state.points}
        onUpdatePoints={handleUpdatePoints}
      />

      {/* Trophy Crowning Animation celebration Modal */}
      <TrophyAnimationModal
        isOpen={celebration.length > 0}
        winners={celebration}
        onClose={dismissCelebration}
      />

      {/* Sticky Bottom Tab Bar for Mobile (Thumb-reach optimized) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 py-2.5 px-3 flex items-center justify-around z-30 pb-safe shadow-xl">
        {/* Tab: Grid */}
        <button
          onClick={() => setActiveTab("students")}
          className={`flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === "students" ? "text-indigo-600 scale-105" : "text-slate-400"
          }`}
          style={{ minWidth: "55px", minHeight: "48px" }}
        >
          <Users className="w-5.5 h-5.5" />
          <span className="text-[9px] font-black uppercase tracking-wider">Class</span>
        </button>

        {/* Tab: Leaderboard */}
        <button
          onClick={() => setActiveTab("leaderboard")}
          className={`flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === "leaderboard" ? "text-indigo-600 scale-105" : "text-slate-400"
          }`}
          style={{ minWidth: "55px", minHeight: "48px" }}
        >
          <Trophy className="w-5.5 h-5.5" />
          <span className="text-[9px] font-black uppercase tracking-wider">Standings</span>
        </button>

        {/* Tab: Hall */}
        <button
          onClick={() => setActiveTab("hall")}
          className={`flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === "hall" ? "text-indigo-600 scale-105" : "text-slate-400"
          }`}
          style={{ minWidth: "55px", minHeight: "48px" }}
        >
          <Award className="w-5.5 h-5.5" />
          <span className="text-[9px] font-black uppercase tracking-wider">Hall</span>
        </button>

        {/* Tab: Lock Toggle */}
        <button
          onClick={() => {
            if (editorMode) {
              void signOutTeacher();
            } else {
              setIsLoginModalOpen(true);
            }
          }}
          className={`flex flex-col items-center justify-center gap-1 transition-all ${
            editorMode ? "text-amber-500 font-extrabold scale-110" : "text-slate-400"
          }`}
          style={{ minWidth: "55px", minHeight: "48px" }}
        >
          {editorMode ? <Unlock className="w-5.5 h-5.5" /> : <Lock className="w-5.5 h-5.5" />}
          {/* The label names the action the tap performs, not the current state. */}
          <span className="text-[9px] font-black uppercase tracking-wider">
            {editorMode ? "Lock" : "Unlock"}
          </span>
        </button>

        {/* Tab: Settings */}
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex flex-col items-center justify-center gap-1 transition-all ${
            activeTab === "settings" ? "text-indigo-600 scale-105" : "text-slate-400"
          }`}
          style={{ minWidth: "55px", minHeight: "48px" }}
        >
          <Settings className="w-5.5 h-5.5" />
          <span className="text-[9px] font-black uppercase tracking-wider">Config</span>
        </button>
      </div>
    </div>
  );
}
