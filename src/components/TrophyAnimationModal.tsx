import React from "react";
import { Sparkles, Trophy, Calendar } from "lucide-react";
import { StudentAvatar } from "./StudentAvatar";
import { TrophyWinner } from "../types";
import { Confetti } from "./Confetti";
import { motion } from "motion/react";

interface TrophyAnimationModalProps {
  winners: TrophyWinner[];
  isOpen: boolean;
  onClose: () => void;
}

export const TrophyAnimationModal: React.FC<TrophyAnimationModalProps> = ({
  winners,
  isOpen,
  onClose,
}) => {
  if (!isOpen || winners.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/95 flex items-center justify-center z-50 p-4 backdrop-blur-md overflow-y-auto">
      {/* Confetti Celebration Trigger */}
      <Confetti active={isOpen} duration={7000} />

      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 50 }}
        transition={{ type: "spring", damping: 15 }}
        className="bg-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-2xl w-full text-center relative border-4 border-yellow-400 overflow-hidden my-8"
      >
        {/* Sparkle background details */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500" />

        {/* Crown & Trophy Spotlight */}
        <motion.div
          animate={{ rotate: [0, -10, 10, -10, 10, 0], scale: [1, 1.1, 1.1, 1] }}
          transition={{ repeat: Infinity, repeatDelay: 3, duration: 1 }}
          className="inline-block relative mb-4"
        >
          <div className="bg-yellow-100 p-4 rounded-full border-4 border-yellow-400 text-yellow-500 shadow-xl shadow-yellow-100">
            <Trophy className="w-12 h-12" />
          </div>
          <span className="absolute -top-4 -right-2 text-3xl animate-bounce">👑</span>
        </motion.div>

        <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight leading-none uppercase">
          Cycle Champions!
        </h2>
        <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mt-2 flex items-center justify-center gap-1.5 bg-amber-50 px-3 py-1 rounded-full w-fit mx-auto border border-amber-200/50">
          <Sparkles className="w-3.5 h-3.5" /> Branch Hall of Fame Crowning <Sparkles className="w-3.5 h-3.5" />
        </p>

        {/* Highlighted Winners Container */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
          {winners.map((winner, idx) => (
            <div
              key={winner.id || idx}
              className="bg-slate-50 border-2 border-slate-100 rounded-3xl p-5 relative shadow-inner flex flex-col justify-between"
            >
              <div>
                <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase tracking-wider rounded-full mb-3">
                  {winner.branch} Branch
                </span>

                <div className="relative inline-block mb-2">
                  <StudentAvatar presetId={winner.avatarId} size="xl" className="ring-4 ring-yellow-400" />
                  <span className="absolute -bottom-1 -right-1 bg-yellow-400 text-slate-900 w-8 h-8 rounded-full border-2 border-white font-black text-sm flex items-center justify-center shadow-md">
                    #1
                  </span>
                </div>

                <h3 className="text-xl font-black text-slate-800 tracking-tight leading-tight mt-1">
                  {winner.studentName}
                </h3>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-around gap-2">
                <div className="text-center">
                  <span className="block text-[9px] font-extrabold uppercase tracking-widest text-slate-400">
                    Points
                  </span>
                  <span className="text-xl font-black text-indigo-600 font-mono">
                    {winner.score} <span className="text-xs font-bold">pts</span>
                  </span>
                </div>

                <div className="w-px h-8 bg-slate-200" />

                <div className="text-center">
                  <span className="block text-[9px] font-extrabold uppercase tracking-widest text-slate-400">
                    Period
                  </span>
                  <span className="text-[11px] font-black text-slate-600 flex items-center gap-1 justify-center mt-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    {winner.cycleStartDate.split("-")[2]}-{winner.cycleEndDate.split("-")[2]} {new Date(winner.cycleStartDate).toLocaleDateString(undefined, { month: "short" })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          className="w-full py-4 bg-gradient-to-r from-yellow-400 to-amber-500 hover:from-yellow-500 hover:to-amber-600 text-slate-900 font-black text-sm tracking-wide rounded-2xl shadow-lg shadow-amber-100 hover:shadow-xl hover:shadow-amber-200 transition-all active:scale-95 cursor-pointer uppercase"
        >
          Begin Next Cycle 🚀
        </button>
      </motion.div>
    </div>
  );
};
