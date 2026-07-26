import React from "react";
import {
  Activity,
  Brain,
  CalendarCheck,
  ChevronRight,
  Gamepad2,
  Megaphone,
  NotebookPen,
  Paperclip,
  Pencil,
  Trophy,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { View } from "../lib/useRoute";

interface Tile {
  view: View;
  label: string;
  hint: string;
  icon: React.ElementType;
  tint: string;
  teacherOnly?: boolean;
}

const TILES: Tile[] = [
  {
    view: "points",
    label: "Points",
    hint: "Scoreboard, standings & hall of fame",
    icon: Trophy,
    tint: "bg-indigo-50 text-indigo-600 border-indigo-100",
  },
  {
    view: "attendance",
    label: "Attendance",
    hint: "Daily register",
    icon: CalendarCheck,
    tint: "bg-emerald-50 text-emerald-600 border-emerald-100",
  },
  {
    view: "homework",
    label: "Homework",
    hint: "What's due, and when",
    icon: Pencil,
    tint: "bg-teal-50 text-teal-600 border-teal-100",
  },
  {
    view: "notices",
    label: "Notices",
    hint: "Announcements you shouldn't miss",
    icon: Megaphone,
    tint: "bg-rose-50 text-rose-600 border-rose-100",
  },
  {
    view: "notes",
    label: "Notes",
    hint: "Class notes, searchable",
    icon: NotebookPen,
    tint: "bg-sky-50 text-sky-600 border-sky-100",
  },
  {
    view: "games",
    label: "Games",
    hint: "Practice games & quizzes",
    icon: Gamepad2,
    tint: "bg-violet-50 text-violet-600 border-violet-100",
  },
  {
    view: "swipemaths",
    label: "Swipe Maths",
    hint: "True or false, one swipe each",
    icon: Brain,
    tint: "bg-fuchsia-50 text-fuchsia-600 border-fuchsia-100",
  },
  {
    view: "leaderboard",
    label: "Leaderboard",
    hint: "XP, levels and this week's ranking",
    icon: Zap,
    tint: "bg-amber-50 text-amber-600 border-amber-100",
  },
  {
    view: "activity",
    label: "Activity",
    hint: "Who's opening it, who's practising",
    icon: Activity,
    tint: "bg-slate-100 text-slate-600 border-slate-200",
    teacherOnly: true,
  },
  {
    view: "resources",
    label: "Resources",
    hint: "Videos, PDFs and links",
    icon: Paperclip,
    tint: "bg-amber-50 text-amber-600 border-amber-100",
  },
];

interface Props {
  counts: Record<string, number>;
  editorMode: boolean;
  onOpen: (view: View) => void;
}

/** Count shown on a tile. Points and Attendance are not resource-backed. */
const countFor = (view: View, counts: Record<string, number>): number | null => {
  switch (view) {
    case "notes":
      return counts.note ?? 0;
    case "games":
      return counts.game ?? 0;
    case "notices":
      return counts.notice ?? 0;
    case "homework":
      return counts.homework ?? 0;
    case "resources":
      return (counts.video ?? 0) + (counts.pdf ?? 0) + (counts.link ?? 0);
    default:
      return null;
  }
};

export const MasterMenu: React.FC<Props> = ({ counts, editorMode, onOpen }) => (
  <div className="space-y-4">
    <div className="px-1">
      <h2 className="text-xl font-black text-slate-900 leading-tight">Everything in one place</h2>
      <p className="text-xs text-slate-400 font-semibold mt-0.5">
        {editorMode
          ? "Editor mode is on — you can add and edit anywhere."
          : "Tap a tool to open it."}
      </p>
    </div>

    <div className="grid grid-cols-2 gap-3">
      {TILES.filter((t) => !t.teacherOnly || editorMode).map((tile, index) => {
        const Icon = tile.icon;
        const count = countFor(tile.view, counts);

        return (
          <motion.button
            key={tile.view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onOpen(tile.view)}
            className="bg-white rounded-3xl border border-slate-200/80 p-4 text-left hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-start justify-between">
              <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center ${tile.tint}`}>
                <Icon className="w-5 h-5" />
              </div>
              {count !== null && count > 0 && (
                <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {count}
                </span>
              )}
            </div>

            <h3 className="font-black text-slate-800 text-sm mt-3 flex items-center gap-1">
              {tile.label}
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
            </h3>
            <p className="text-[11px] text-slate-400 font-semibold leading-snug mt-0.5">
              {tile.hint}
            </p>
          </motion.button>
        );
      })}
    </div>
  </div>
);
