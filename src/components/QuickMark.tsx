import React, { useState, useEffect, useRef } from "react";
import { CheckCircle2, BookOpen, Award, Sparkles, ChevronLeft, ChevronRight, Check, X, Calendar } from "lucide-react";
import { Student, DailyPoint } from "../types";
import { StudentAvatar } from "./StudentAvatar";
import { formatDateString } from "../lib/storage";
import { motion, AnimatePresence } from "motion/react";

interface QuickMarkProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  points: Record<string, DailyPoint>;
  onUpdatePoints: (studentId: string, date: string, category: keyof Omit<DailyPoint, "id" | "studentId" | "date">, value: number) => void;
}

interface FloatingPop {
  id: string;
  x: number;
  y: number;
  label: string;
  colorClass: string;
}

export const QuickMark: React.FC<QuickMarkProps> = ({
  isOpen,
  onClose,
  students,
  points,
  onUpdatePoints,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [floatingPops, setFloatingPops] = useState<FloatingPop[]>([]);

  // Swipe gesture detection state
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  // Debouncing refs to prevent double-tap double points
  const lastTapTimes = useRef<Record<string, number>>({});

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setSelectedDate(formatDateString(new Date()));
    }
  }, [isOpen]);

  if (!isOpen || students.length === 0) return null;

  const currentStudent = students[currentIndex];
  const pointKey = `${currentStudent.id}_${selectedDate}`;
  const currentDayPoints = points[pointKey] || {
    onTime: 0,
    homework: 0,
    quiz: 0,
    bonus: 0,
  };

  const handleNext = () => {
    const now = Date.now();
    if (now - (lastTapTimes.current["nav"] || 0) < 300) return;
    lastTapTimes.current["nav"] = now;

    if (currentIndex < students.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    const now = Date.now();
    if (now - (lastTapTimes.current["nav"] || 0) < 300) return;
    lastTapTimes.current["nav"] = now;

    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
    }
  };

  const handleToggleCategory = (category: "onTime" | "homework" | "quiz", e: React.MouseEvent<HTMLButtonElement>) => {
    const tapKey = `${currentStudent.id}_${category}`;
    const now = Date.now();
    if (now - (lastTapTimes.current[tapKey] || 0) < 350) return; // Debounce rapid taps
    lastTapTimes.current[tapKey] = now;

    const currentValue = currentDayPoints[category] || 0;
    
    let newValue = 0;
    if (category === "onTime") {
      newValue = currentValue === 50 ? 0 : 50;
    } else {
      newValue = currentValue === 100 ? 0 : 100;
    }

    // Call update points
    onUpdatePoints(currentStudent.id, selectedDate, category, newValue);

    // Trigger visual pop feedback from tap position
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    const id = Math.random().toString(36).substring(2, 9);
    
    let popLabel = newValue > 0 ? `+${newValue} pts` : "0 pts";
    let colorClass = newValue > 0 ? "text-emerald-400 bg-emerald-950/90" : "text-slate-400 bg-slate-900/90";

    setFloatingPops((prev) => [
      ...prev,
      { id, x, y, label: popLabel, colorClass }
    ]);

    setTimeout(() => {
      setFloatingPops((prev) => prev.filter((pop) => pop.id !== id));
    }, 800);
  };

  const handleBonusChange = (delta: number, e: React.MouseEvent<HTMLButtonElement>) => {
    const tapKey = `${currentStudent.id}_bonus`;
    const now = Date.now();
    if (now - (lastTapTimes.current[tapKey] || 0) < 350) return; // Debounce
    lastTapTimes.current[tapKey] = now;

    const currentBonus = currentDayPoints.bonus || 0;
    const newBonus = Math.max(0, currentBonus + delta);
    onUpdatePoints(currentStudent.id, selectedDate, "bonus", newBonus);

    // Trigger visual pop feedback
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;
    const id = Math.random().toString(36).substring(2, 9);
    
    let popLabel = delta > 0 ? `+${delta} Bonus` : `${delta} Bonus`;
    let colorClass = delta > 0 ? "text-purple-400 bg-purple-950/90" : "text-amber-400 bg-amber-950/90";

    setFloatingPops((prev) => [
      ...prev,
      { id, x, y, label: popLabel, colorClass }
    ]);

    setTimeout(() => {
      setFloatingPops((prev) => prev.filter((pop) => pop.id !== id));
    }, 800);
  };

  // Touch Swipe Gesture Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 60; // Swiped left -> Next
    const isRightSwipe = distance < -60; // Swiped right -> Prev

    if (isLeftSwipe) {
      handleNext();
    } else if (isRightSwipe) {
      handlePrev();
    }
  };

  const progressPercent = ((currentIndex + 1) / students.length) * 100;

  return (
    <div 
      className="fixed inset-0 bg-slate-900/95 flex flex-col z-50 justify-between backdrop-blur-lg select-none p-4 pb-safe overflow-hidden"
      id="quickmark-overlay"
    >
      {/* Top Header Row */}
      <div className="w-full max-w-lg mx-auto bg-slate-800/90 rounded-2xl border border-slate-700/60 p-3 flex items-center justify-between text-white shadow-xl mb-2">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-500/20 text-indigo-400 p-1.5 rounded-xl border border-indigo-500/30">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-sm tracking-tight">Quick Mark Mode</h3>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block leading-none">
              Fast Daily Entry
            </span>
          </div>
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-1 bg-slate-900/80 px-2 py-1 rounded-xl border border-slate-700">
          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-transparent text-xs text-white font-extrabold focus:outline-none cursor-pointer [color-scheme:dark] h-8 px-1"
          />
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-slate-700/50 text-slate-400 hover:text-white transition-all cursor-pointer min-h-[48px] min-w-[48px] flex items-center justify-center"
          aria-label="Close Quick Mark Mode"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Swipeable Student Area */}
      <div 
        className="flex-1 w-full max-w-lg mx-auto flex flex-col justify-center gap-3 overflow-hidden cursor-grab active:cursor-grabbing"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Progress Tracker */}
        <div className="w-full px-1">
          <div className="flex justify-between items-center text-xs text-slate-400 font-extrabold mb-1">
            <span className="text-[11px] uppercase tracking-wider">Swipe Left/Right to Navigate</span>
            <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded-full border border-slate-700 font-mono text-[11px]">
              {currentIndex + 1} / {students.length} students
            </span>
          </div>
          <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700/30">
            <div
              className="bg-indigo-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Swipe-driven Center Card */}
        <div className="relative flex-1 flex flex-col justify-center items-center py-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStudent.id}
              initial={{ opacity: 0, scale: 0.95, x: 30 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95, x: -30 }}
              transition={{ duration: 0.2 }}
              className="bg-white/10 backdrop-blur-md rounded-3xl border border-white/20 p-5 flex flex-col items-center justify-center shadow-xl w-full max-w-md mx-auto aspect-[4/3] sm:aspect-square max-h-[220px] sm:max-h-[300px]"
            >
              <div className="relative mb-2">
                <div className="p-1.5 rounded-full bg-gradient-to-tr from-emerald-400 via-indigo-500 to-purple-600 shadow-lg">
                  <StudentAvatar presetId={currentStudent.avatarId} size="lg" />
                </div>
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight text-center truncate w-full px-4">
                {currentStudent.name}
              </h2>
              <p className="text-[10px] text-indigo-200 uppercase tracking-widest font-black mt-1">
                {new Date(selectedDate).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* LOWER HALF: Big Point Award Buttons & Navigation (THUMB REACH ZONE) */}
      <div className="w-full max-w-lg mx-auto flex flex-col gap-3 mt-auto pb-safe">
        <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 text-center block mb-0.5">
          TAP TO AWARD (THUMB REACH ZONE)
        </span>
        
        {/* Massive Point buttons - Quarter screen width, > 48px height, easy hit */}
        <div className="grid grid-cols-2 gap-3 w-full">
          {/* On Time Button */}
          <button
            onClick={(e) => handleToggleCategory("onTime", e)}
            className={`h-20 sm:h-24 rounded-2xl border-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 cursor-pointer ${
              currentDayPoints.onTime > 0
                ? "bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-900/30"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600"
            }`}
            style={{ touchAction: "manipulation" }}
          >
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-5 h-5 text-blue-400" />
              <span className="text-[15px] font-black uppercase tracking-wide">On-Time</span>
            </div>
            <span className="text-lg font-black mt-1">
              {currentDayPoints.onTime > 0 ? "+50 pts" : "0 pts"}
            </span>
          </button>

          {/* Homework Button */}
          <button
            onClick={(e) => handleToggleCategory("homework", e)}
            className={`h-20 sm:h-24 rounded-2xl border-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 cursor-pointer ${
              currentDayPoints.homework > 0
                ? "bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-900/30"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600"
            }`}
            style={{ touchAction: "manipulation" }}
          >
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-5 h-5 text-amber-400" />
              <span className="text-[15px] font-black uppercase tracking-wide">Homework</span>
            </div>
            <span className="text-lg font-black mt-1">
              {currentDayPoints.homework > 0 ? "+100 pts" : "0 pts"}
            </span>
          </button>

          {/* Quiz Button */}
          <button
            onClick={(e) => handleToggleCategory("quiz", e)}
            className={`h-20 sm:h-24 rounded-2xl border-3 flex flex-col items-center justify-center text-center transition-all active:scale-95 cursor-pointer ${
              currentDayPoints.quiz > 0
                ? "bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-900/30"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600"
            }`}
            style={{ touchAction: "manipulation" }}
          >
            <div className="flex items-center gap-1.5">
              <Award className="w-5 h-5 text-emerald-400" />
              <span className="text-[15px] font-black uppercase tracking-wide">Quiz</span>
            </div>
            <span className="text-lg font-black mt-1">
              {currentDayPoints.quiz > 0 ? "+100 pts" : "0 pts"}
            </span>
          </button>

          {/* Bonus Stepper Button */}
          <div
            className={`h-20 sm:h-24 rounded-2xl border-3 flex flex-col items-center justify-center text-center transition-all ${
              currentDayPoints.bonus > 0
                ? "bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-900/30"
                : "bg-slate-800 border-slate-700 text-slate-300"
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles className="w-4 h-4 text-purple-300" />
              <span className="text-[13px] font-black uppercase tracking-wide">Bonus</span>
            </div>
            
            <div className="flex items-center justify-between w-full px-2">
              <button
                onClick={(e) => handleBonusChange(-10, e)}
                className="w-8 h-8 rounded-full bg-slate-700/80 text-white hover:bg-slate-600 font-extrabold text-[11px] flex items-center justify-center active:scale-90 transition-all cursor-pointer border border-slate-600 min-h-[36px] min-w-[36px]"
                style={{ touchAction: "manipulation" }}
              >
                -10
              </button>
              
              <input
                type="number"
                value={currentDayPoints.bonus || 0}
                onChange={(e) => {
                  const val = Math.max(0, parseInt(e.target.value) || 0);
                  onUpdatePoints(currentStudent.id, selectedDate, "bonus", val);
                }}
                className="w-12 bg-slate-900/60 border border-slate-700/80 rounded-lg text-center font-black text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 py-0.5"
                placeholder="0"
                style={{ touchAction: "manipulation" }}
              />

              <button
                onClick={(e) => handleBonusChange(10, e)}
                className="w-8 h-8 rounded-full bg-slate-700/80 text-white hover:bg-slate-600 font-extrabold text-[11px] flex items-center justify-center active:scale-90 transition-all cursor-pointer border border-slate-600 min-h-[36px] min-w-[36px]"
                style={{ touchAction: "manipulation" }}
              >
                +10
              </button>
            </div>
          </div>
        </div>

        {/* Navigation bottom bar */}
        <div className="w-full bg-slate-800 rounded-2xl border border-slate-700/50 p-2 flex items-center justify-between gap-3 shadow-2xl">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="flex-1 py-3.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-30 rounded-xl font-black text-white text-[13px] uppercase flex items-center justify-center gap-2 transition-all active:scale-95 disabled:pointer-events-none cursor-pointer min-h-[48px]"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>

          {currentIndex === students.length - 1 ? (
            <button
              onClick={onClose}
              className="flex-1 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 rounded-xl font-extrabold text-white text-[13px] uppercase flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer min-h-[48px]"
            >
              <Check className="w-4 h-4" /> Finish!
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-black text-white text-[13px] uppercase flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer min-h-[48px]"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

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
