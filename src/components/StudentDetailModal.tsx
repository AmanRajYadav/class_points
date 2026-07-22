import React, { useState, useEffect, useRef } from "react";
import { X, Calendar, Edit2, Trash2, CheckCircle2, BookOpen, Award, Sparkles } from "lucide-react";
import { Student, DailyPoint } from "../types";
import { StudentAvatar, AVATAR_PRESETS } from "./StudentAvatar";
import { daysBetween, formatDateString, parseDateOnly } from "../lib/storage";
import { motion, AnimatePresence } from "motion/react";

interface StudentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  editorMode: boolean;
  points: Record<string, DailyPoint>;
  onUpdatePoints: (studentId: string, date: string, category: keyof Omit<DailyPoint, "id" | "studentId" | "date">, value: number) => void;
  onRenameStudent: (studentId: string, newName: string) => void;
  onUpdateAvatar: (studentId: string, newAvatarId: number) => void;
  onDeleteStudent: (studentId: string) => void;
  cycleStartDate: string;
  cycleEndDate: string;
  onUnlockRequest?: () => void;
}

interface FloatingPop {
  id: string;
  x: number;
  y: number;
  label: string;
  colorClass: string;
}

export const StudentDetailModal: React.FC<StudentDetailModalProps> = ({
  isOpen,
  onClose,
  student,
  editorMode,
  points,
  onUpdatePoints,
  onRenameStudent,
  onUpdateAvatar,
  onDeleteStudent,
  cycleStartDate,
  cycleEndDate,
  onUnlockRequest,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [editedName, setEditedName] = useState<string>("");
  const [showAvatarPicker, setShowAvatarPicker] = useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [floatingPops, setFloatingPops] = useState<FloatingPop[]>([]);
  const [isEditingCyclePoints, setIsEditingCyclePoints] = useState<boolean>(false);
  const [tempCyclePoints, setTempCyclePoints] = useState<string>("");

  // Cooldown timer to prevent rapid double-taps
  const lastTapTimes = useRef<Record<string, number>>({});

  // Default to today on open
  useEffect(() => {
    if (isOpen) {
      setSelectedDate(formatDateString(new Date()));
      setIsEditingProfile(false);
      setShowAvatarPicker(false);
      setConfirmDelete(false);
      if (student) {
        setEditedName(student.name);
      }
    }
  }, [isOpen, student]);

  if (!isOpen || !student) return null;

  // Retrieve point record for this student and date
  const pointKey = `${student.id}_${selectedDate}`;
  const currentDayPoints = points[pointKey] || {
    onTime: 0,
    homework: 0,
    quiz: 0,
    bonus: 0,
  };

  // Get date helper array for the past 5 days (relative to selectedDate or today)
  const getRecentDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 4; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      dates.push(formatDateString(d));
    }
    return dates;
  };

  const recentDates = getRecentDates();

  // Calculations for current cycle breakdown
  let cycleOnTime = 0;
  let cycleHomework = 0;
  let cycleQuiz = 0;
  let cycleBonus = 0;
  let lifetimeTotal = 0;

  // Local-midnight parsing, matching lib/storage. Using `new Date("YYYY-MM-DD")`
  // here parsed as UTC and shifted the cycle window by a day, so this panel
  // could disagree with the leaderboard about the same student.
  const start = parseDateOnly(cycleStartDate).getTime();
  const end = parseDateOnly(cycleEndDate).getTime();

  (Object.values(points) as DailyPoint[]).forEach((p) => {
    if (p.studentId !== student.id) return;
    const pts = p.onTime + p.homework + p.quiz + p.bonus;
    lifetimeTotal += pts;

    const pDate = parseDateOnly(p.date).getTime();
    if (pDate >= start && pDate <= end) {
      cycleOnTime += p.onTime;
      cycleHomework += p.homework;
      cycleQuiz += p.quiz;
      cycleBonus += p.bonus;
    }
  });

  const cycleTotal = cycleOnTime + cycleHomework + cycleQuiz + cycleBonus;

  // Inclusive day count for the cycle, used as the denominator of the
  // "perfect score" progress bars below.
  const cycleDayCount = Math.max(
    1,
    daysBetween(parseDateOnly(cycleStartDate), parseDateOnly(cycleEndDate)) + 1
  );
  const barPercent = (earned: number, perDay: number) =>
    Math.min(100, (earned / (cycleDayCount * perDay)) * 100);

  const handleToggleCategory = (category: "onTime" | "homework" | "quiz", e: React.MouseEvent<HTMLButtonElement>) => {
    if (!editorMode) return;
    const tapKey = `${student.id}_${category}`;
    const now = Date.now();
    if (now - (lastTapTimes.current[tapKey] || 0) < 350) return; // Debounce double taps
    lastTapTimes.current[tapKey] = now;

    const currentValue = currentDayPoints[category] || 0;
    
    let newValue = 0;
    if (category === "onTime") {
      newValue = currentValue === 50 ? 0 : 50;
    } else {
      newValue = currentValue === 100 ? 0 : 100;
    }
    
    onUpdatePoints(student.id, selectedDate, category, newValue);

    // Trigger floating pop
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    const id = Math.random().toString(36).substring(2, 9);
    
    let popLabel = newValue > 0 ? `+${newValue} pts` : "0 pts";
    let colorClass = newValue > 0 ? "text-emerald-400 bg-emerald-950/95" : "text-slate-400 bg-slate-900/95";

    setFloatingPops((prev) => [
      ...prev,
      { id, x, y, label: popLabel, colorClass }
    ]);

    setTimeout(() => {
      setFloatingPops((prev) => prev.filter((p) => p.id !== id));
    }, 800);
  };

  const handleBonusChange = (delta: number, e: React.MouseEvent<HTMLButtonElement>) => {
    if (!editorMode) return;
    const tapKey = `${student.id}_bonus`;
    const Profilenow = Date.now();
    if (Profilenow - (lastTapTimes.current[tapKey] || 0) < 350) return; // Debounce
    lastTapTimes.current[tapKey] = Profilenow;

    const currentBonus = currentDayPoints.bonus || 0;
    const newBonus = currentBonus + delta;
    onUpdatePoints(student.id, selectedDate, "bonus", newBonus);

    // Trigger floating pop
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    const id = Math.random().toString(36).substring(2, 9);
    
    let popLabel = delta > 0 ? `+${delta} Bonus` : `${delta} Bonus`;
    let colorClass = delta > 0 ? "text-purple-400 bg-purple-950/95" : "text-amber-400 bg-amber-950/95";

    setFloatingPops((prev) => [
      ...prev,
      { id, x, y, label: popLabel, colorClass }
    ]);

    setTimeout(() => {
      setFloatingPops((prev) => prev.filter((p) => p.id !== id));
    }, 800);
  };

  const handleSaveManualCyclePoints = () => {
    const desiredTotal = parseInt(tempCyclePoints);
    if (!isNaN(desiredTotal)) {
      const difference = desiredTotal - cycleTotal;
      const currentBonus = currentDayPoints.bonus || 0;
      onUpdatePoints(student.id, selectedDate, "bonus", currentBonus + difference);
    }
    setIsEditingCyclePoints(false);
  };

  const handleSaveProfile = () => {
    if (editedName.trim() && editedName !== student.name) {
      onRenameStudent(student.id, editedName.trim());
    }
    setIsEditingProfile(false);
  };

  const handleAvatarSelect = (avatarId: number) => {
    onUpdateAvatar(student.id, avatarId);
    setShowAvatarPicker(false);
  };

  const handleDelete = () => {
    onDeleteStudent(student.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/85 flex items-end sm:items-center justify-center z-40 sm:p-4 overflow-hidden backdrop-blur-sm pb-safe">
      <motion.div
        initial={{ y: "100%", opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0.5 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="bg-slate-50 rounded-t-[32px] sm:rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden border-t-4 sm:border-4 border-white max-h-[92vh] flex flex-col"
      >
        {/* Scrollable Content wrapper to prevent clipping on small phones */}
        <div className="flex-1 overflow-y-auto scrollbar-none">
          {/* Header Visual with Student Info */}
          <div className="relative bg-gradient-to-br from-indigo-500 to-purple-600 p-6 text-white">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/15 text-white hover:bg-black/30 transition-all min-h-[48px] min-w-[48px] flex items-center justify-center"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left mt-2">
              <div className="relative group">
                <StudentAvatar presetId={student.avatarId} size="lg" className="ring-4 ring-white/30" />
                <button
                  onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                  className="absolute bottom-0 right-0 bg-yellow-400 hover:bg-yellow-500 text-slate-900 p-2.5 rounded-full shadow-lg transition-all scale-95 border-2 border-indigo-600 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                  title="Change Avatar"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 w-full">
                {isEditingProfile && editorMode ? (
                  <div className="flex flex-col gap-2 mt-1 w-full">
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="bg-white/10 border-2 border-white/20 rounded-xl px-3 py-2.5 text-white font-bold placeholder-white/50 focus:outline-none focus:border-white/50 w-full text-base"
                      maxLength={20}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveProfile}
                        className="flex-1 bg-emerald-400 hover:bg-emerald-500 text-slate-900 font-extrabold py-2.5 rounded-xl text-sm transition-all shadow-sm active:scale-95 min-h-[48px]"
                      >
                        Save Profile
                      </button>
                      <button
                        onClick={() => {
                          setEditedName(student.name);
                          setIsEditingProfile(false);
                        }}
                        className="bg-white/10 hover:bg-white/20 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-all min-h-[48px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <h2 className="text-2xl font-black tracking-tight">{student.name}</h2>
                      {editorMode && (
                        <button
                          onClick={() => setIsEditingProfile(true)}
                          className="text-white/75 hover:text-white p-2.5 rounded-full hover:bg-white/10 transition-all min-h-[48px] min-w-[48px] flex items-center justify-center"
                          title="Rename Student"
                        >
                          <Edit2 className="w-4.5 h-4.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-3 gap-y-1 mt-1 text-xs text-indigo-100 font-medium">
                      <span className="bg-yellow-400 text-slate-950 font-black px-2.5 py-0.5 rounded-full">
                        {student.branch} Branch
                      </span>
                      <span className="bg-indigo-700/40 px-2.5 py-0.5 rounded-full">
                        ID: {student.id}
                      </span>
                      <span className="bg-white/15 px-2.5 py-0.5 rounded-full">
                        Joined: {new Date(student.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Large Score Badge */}
              {editorMode ? (
                <div 
                  onClick={() => {
                    if (!isEditingCyclePoints) {
                      setIsEditingCyclePoints(true);
                      setTempCyclePoints(cycleTotal.toString());
                    }
                  }}
                  className="bg-white text-indigo-600 rounded-2xl px-4 py-3 text-center shadow-lg border-2 border-dashed border-indigo-300 hover:border-indigo-500 transition-all flex flex-col justify-center min-w-[95px] self-stretch sm:self-center cursor-pointer group relative"
                  title="Click to directly edit points"
                >
                  {isEditingCyclePoints ? (
                    <input
                      type="number"
                      value={tempCyclePoints}
                      onChange={(e) => setTempCyclePoints(e.target.value)}
                      onBlur={handleSaveManualCyclePoints}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveManualCyclePoints();
                        } else if (e.key === "Escape") {
                          setIsEditingCyclePoints(false);
                        }
                      }}
                      className="w-20 text-center bg-indigo-50 border-2 border-indigo-500 rounded-lg text-xl font-black text-indigo-700 py-1 focus:outline-none focus:ring-0 mx-auto"
                      autoFocus
                    />
                  ) : (
                    <>
                      <span className="text-3xl font-black tracking-tight leading-none group-hover:scale-105 transition-transform flex items-center justify-center gap-1">
                        {cycleTotal}
                        <Edit2 className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-600" />
                      </span>
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-400 mt-1">
                        Edit Points
                      </span>
                    </>
                  )}
                </div>
              ) : (
                <div 
                  onClick={() => {
                    if (onUnlockRequest) {
                      onUnlockRequest();
                    }
                  }}
                  className="bg-white text-indigo-600 rounded-2xl px-4 py-3 text-center shadow-lg border-2 border-dashed border-indigo-200 hover:border-indigo-400 transition-all flex flex-col justify-center min-w-[95px] self-stretch sm:self-center cursor-pointer group relative"
                  title="Click to unlock & edit points"
                >
                  <span className="text-3xl font-black tracking-tight leading-none group-hover:scale-105 transition-transform flex items-center justify-center gap-1.5">
                    {cycleTotal}
                    <Edit2 className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-600" />
                  </span>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-400 mt-1">
                    Click to Edit
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Avatar Picker Dropdown drawer */}
          <AnimatePresence>
            {showAvatarPicker && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-indigo-50/50 border-b border-indigo-100 p-4 overflow-hidden"
              >
                <h4 className="text-xs font-black text-indigo-700 uppercase tracking-wider mb-2">
                  Choose a Cartoon Avatar:
                </h4>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 max-h-40 overflow-y-auto p-1.5 bg-white rounded-2xl border border-indigo-100">
                  {AVATAR_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleAvatarSelect(p.id)}
                      className={`p-2 rounded-xl border-2 transition-all hover:scale-105 min-h-[48px] min-w-[48px] flex items-center justify-center ${
                        student.avatarId === p.id
                          ? "border-indigo-600 bg-indigo-50"
                          : "border-transparent hover:border-slate-200"
                      }`}
                    >
                      <StudentAvatar presetId={p.id} size="sm" />
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Date Selector */}
          <div className="bg-white border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-slate-500">
              <Calendar className="w-4 h-4 text-indigo-500" />
              <span className="text-sm font-bold text-slate-700">Daily Marking Date:</span>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
              {recentDates.map((dateStr) => {
                const d = new Date(dateStr);
                const label = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
                const isSelected = selectedDate === dateStr;

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`flex-1 sm:flex-none text-center px-3 py-2 rounded-lg text-[13px] font-black transition-all min-h-[44px] min-w-[55px] ${
                      isSelected
                        ? "bg-indigo-600 text-white shadow-sm shadow-indigo-100 scale-105"
                        : "text-slate-600 hover:bg-slate-200/50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Core Daily Point Buttons - THUMB REACH LOWER HALF */}
          <div className="p-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 text-center sm:text-left">
              Today's Daily Points Award (TAP BELOW)
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* On Time Category */}
              <button
                onClick={(e) => handleToggleCategory("onTime", e)}
                disabled={!editorMode}
                className={`p-4 h-24 sm:h-28 rounded-2xl border-3 flex flex-col items-center justify-center text-center transition-all ${
                  currentDayPoints.onTime > 0
                    ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-200/50"
                    : "bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50"
                } ${editorMode ? "active:scale-95 cursor-pointer" : "opacity-70 cursor-not-allowed"}`}
                style={{ touchAction: "manipulation" }}
              >
                <div
                  className={`p-2 rounded-full mb-1 ${
                    currentDayPoints.onTime > 0 ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider">On-Time</span>
                <span className="text-base font-black mt-0.5">
                  {currentDayPoints.onTime > 0 ? "+50 pts" : "0 pts"}
                </span>
              </button>

              {/* Homework Category */}
              <button
                onClick={(e) => handleToggleCategory("homework", e)}
                disabled={!editorMode}
                className={`p-4 h-24 sm:h-28 rounded-2xl border-3 flex flex-col items-center justify-center text-center transition-all ${
                  currentDayPoints.homework > 0
                    ? "bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-200/50"
                    : "bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50"
                } ${editorMode ? "active:scale-95 cursor-pointer" : "opacity-70 cursor-not-allowed"}`}
                style={{ touchAction: "manipulation" }}
              >
                <div
                  className={`p-2 rounded-full mb-1 ${
                    currentDayPoints.homework > 0 ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <BookOpen className="w-6 h-6" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider">Homework</span>
                <span className="text-base font-black mt-0.5">
                  {currentDayPoints.homework > 0 ? "+100 pts" : "0 pts"}
                </span>
              </button>

              {/* Quiz Category */}
              <button
                onClick={(e) => handleToggleCategory("quiz", e)}
                disabled={!editorMode}
                className={`p-4 h-24 sm:h-28 rounded-2xl border-3 flex flex-col items-center justify-center text-center transition-all ${
                  currentDayPoints.quiz > 0
                    ? "bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-200/50"
                    : "bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50"
                } ${editorMode ? "active:scale-95 cursor-pointer" : "opacity-70 cursor-not-allowed"}`}
                style={{ touchAction: "manipulation" }}
              >
                <div
                  className={`p-2 rounded-full mb-1 ${
                    currentDayPoints.quiz > 0 ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <Award className="w-6 h-6" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider">Quiz</span>
                <span className="text-base font-black mt-0.5">
                  {currentDayPoints.quiz > 0 ? "+100 pts" : "0 pts"}
                </span>
              </button>

              {/* Bonus Category */}
              <div
                className={`p-4 h-24 sm:h-28 rounded-2xl border-3 flex flex-col items-center justify-center text-center transition-all ${
                  (currentDayPoints.bonus || 0) > 0
                    ? "bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-200/50"
                    : (currentDayPoints.bonus || 0) < 0
                      ? "bg-rose-600 border-rose-400 text-white shadow-lg shadow-rose-200/50"
                      : "bg-white border-slate-200 text-slate-400"
                }`}
              >
                <div
                  className={`p-2 rounded-full mb-1 ${
                    (currentDayPoints.bonus || 0) > 0 
                      ? "bg-purple-500 text-white" 
                      : (currentDayPoints.bonus || 0) < 0
                        ? "bg-rose-500 text-white"
                        : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <Sparkles className="w-6 h-6" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider">Teacher Bonus</span>

                {editorMode ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <button
                      onClick={(e) => handleBonusChange(-10, e)}
                      className="w-7 h-7 rounded-full bg-purple-100 hover:bg-purple-200 text-purple-700 font-extrabold text-[11px] flex items-center justify-center active:scale-95 transition-all cursor-pointer min-h-[28px] min-w-[28px]"
                    >
                      -10
                    </button>
                    <input
                      type="number"
                      value={currentDayPoints.bonus || 0}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        onUpdatePoints(student.id, selectedDate, "bonus", val);
                      }}
                      className="w-10 bg-white border border-purple-200 rounded text-center font-black text-purple-700 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400 py-0.5"
                      placeholder="0"
                      style={{ touchAction: "manipulation" }}
                    />
                    <button
                      onClick={(e) => handleBonusChange(10, e)}
                      className="w-7 h-7 rounded-full bg-purple-100 hover:bg-purple-200 text-purple-700 font-extrabold text-[11px] flex items-center justify-center active:scale-95 transition-all cursor-pointer min-h-[28px] min-w-[28px]"
                    >
                      +10
                    </button>
                  </div>
                ) : (
                  <span className="text-base font-black mt-0.5">
                    {(currentDayPoints.bonus || 0) !== 0 
                      ? (currentDayPoints.bonus || 0) > 0 
                        ? `+${currentDayPoints.bonus} pts` 
                        : `${currentDayPoints.bonus} pts`
                      : "0 pts"}
                  </span>
                )}
              </div>
            </div>

            {/* Accompanying info message for unlocked vs locked states */}
            {!editorMode && (
              <p className="text-[11px] text-slate-400 mt-3 font-semibold text-center italic">
                🔒 Locked. Tap "Teacher Unlock" in settings to reward points.
              </p>
            )}

            {/* Cycle Stats Breakdown Progress Bars */}
            <div className="mt-6 bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
              <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 text-center sm:text-left">
                Cycle Progress ({cycleStartDate.split("-")[2]} - {cycleEndDate.split("-")[2]} {parseDateOnly(cycleStartDate).toLocaleDateString(undefined, { month: "short" })})
              </h4>

              <div className="space-y-3.5">
                {/* On Time Summary */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-600 mb-0.5">
                    <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-blue-500" /> On-Time</span>
                    <span className="font-mono text-slate-800">{cycleOnTime} pts</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-400 h-full rounded-full transition-all duration-300"
                      style={{ 
                        width: `${barPercent(cycleOnTime, 50)}%` 
                      }}
                    />
                  </div>
                </div>

                {/* Homework Summary */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-600 mb-0.5">
                    <span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-amber-500" /> Homework</span>
                    <span className="font-mono text-slate-800">{cycleHomework} pts</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-400 h-full rounded-full transition-all duration-300"
                      style={{ 
                        width: `${barPercent(cycleHomework, 100)}%` 
                      }}
                    />
                  </div>
                </div>

                {/* Quiz Summary */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-600 mb-0.5">
                    <span className="flex items-center gap-1.5"><Award className="w-3.5 h-3.5 text-emerald-500" /> Quiz</span>
                    <span className="font-mono text-slate-800">{cycleQuiz} pts</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-400 h-full rounded-full transition-all duration-300"
                      style={{ 
                        width: `${barPercent(cycleQuiz, 100)}%` 
                      }}
                    />
                  </div>
                </div>

                {/* Bonus Summary */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-600 mb-0.5">
                    <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-purple-500" /> Bonus</span>
                    <span className="font-mono text-slate-800">{cycleBonus} pts</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-400 h-full rounded-full transition-all duration-300"
                      style={{ 
                        width: `${barPercent(cycleBonus, 50)}%` 
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-bold">
                <span>Lifetime Score:</span>
                <span className="font-black text-slate-700 bg-slate-50 px-2 rounded-lg border border-slate-200/50">
                  {lifetimeTotal} total pts
                </span>
              </div>
            </div>

            {/* Delete Student Section for Editor Mode */}
            {editorMode && (
              <div className="mt-6 pt-4 border-t border-slate-200">
                {confirmDelete ? (
                  <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 flex flex-col items-center gap-2">
                    <div className="text-center">
                      <h5 className="text-red-700 font-bold text-sm">Delete {student.name}?</h5>
                      <p className="text-red-600 text-[11px] mt-0.5">
                        Permanently deletes all historical records for this student.
                      </p>
                    </div>
                    <div className="flex gap-2 w-full mt-2">
                      <button
                        onClick={handleDelete}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white font-extrabold py-2.5 rounded-xl text-xs transition-all active:scale-95 min-h-[44px]"
                      >
                        Yes, Delete
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="flex-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold py-2.5 rounded-xl text-xs transition-all min-h-[44px]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full py-3 border border-red-200 hover:bg-red-50 text-red-600 rounded-2xl text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer min-h-[48px]"
                  >
                    <Trash2 className="w-4 h-4" /> Remove Student from Class
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Floating Haptic Pops Layer */}
      <AnimatePresence>
        {floatingPops.map((pop) => (
          <motion.div
            key={pop.id}
            initial={{ opacity: 1, scale: 0.8, y: 0 }}
            animate={{ opacity: 0, scale: 1.4, y: -80 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className={`fixed font-black text-sm px-3 py-1.5 rounded-full shadow-lg pointer-events-none z-50 border border-white/20 ${pop.colorClass}`}
            style={{
              left: pop.x - 35,
              top: pop.y - 20,
            }}
          >
            {pop.label}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
