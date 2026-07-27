import React, { useState } from "react";
import {
  Activity,
  CalendarCheck,
  ChevronRight,
  Gamepad2,
  Megaphone,
  NotebookPen,
  Paperclip,
  Pencil,
  RefreshCw,
  Settings,
  Trophy,
  Zap,
} from "lucide-react";
import { motion } from "motion/react";
import { View } from "../lib/useRoute";
import { buildLabel, forceRefresh } from "../lib/appUpdate";

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
    hint: "Swipe Maths, plus every practice link",
    icon: Gamepad2,
    tint: "bg-violet-50 text-violet-600 border-violet-100",
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
  // The desktop rail has had a Settings entry all along; on a phone there was
  // no way in at all, which also meant a signed-in student could never reach
  // their own profile card. Shown to everyone: the panel below the profile
  // explains itself when you are not the head of the institution.
  {
    view: "config",
    label: "Settings",
    hint: "Your profile, password & institution setup",
    icon: Settings,
    tint: "bg-slate-100 text-slate-600 border-slate-200",
  },
];

interface Props {
  counts: Record<string, number>;
  /** admin or editor — the tools that oversee the class rather than run it. */
  canManage: boolean;
  /** the above plus a subject teacher. */
  canTeach: boolean;
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

/**
 * Build stamp and manual update.
 *
 * The service worker updates itself on its own, so the button is a last resort
 * for a phone somehow still holding an old copy. The stamp beside it is the
 * more useful half: it turns "it's showing the old version" from a guess into
 * something checkable — read it out, compare it against the deploy.
 */
const UpdateFooter: React.FC = () => {
  const [refreshing, setRefreshing] = useState(false);

  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-1">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">
        Build {buildLabel()}
      </p>
      <button
        onClick={() => {
          setRefreshing(true);
          void forceRefresh();
        }}
        disabled={refreshing}
        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 disabled:text-slate-300 transition-colors cursor-pointer disabled:cursor-default"
      >
        <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
        {refreshing ? "Updating…" : "Force update"}
      </button>
    </div>
  );
};

export const MasterMenu: React.FC<Props> = ({ counts, canManage, canTeach, onOpen }) => (
  <div className="space-y-4">
    <div className="px-1">
      <h2 className="text-xl font-black text-slate-900 leading-tight">Everything in one place</h2>
      <p className="text-xs text-slate-400 font-semibold mt-0.5">
        {canManage
          ? "Editor mode is on — you can add and edit anywhere."
          : canTeach
            ? "Points, attendance, homework and the teaching log are unlocked."
            : "Tap a tool to open it."}
      </p>
    </div>

    <div className="grid grid-cols-2 gap-3">
      {TILES.filter((t) => !t.teacherOnly || canManage).map((tile, index) => {
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

    <UpdateFooter />
  </div>
);
