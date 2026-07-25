import React, { useEffect, useState } from "react";
import { BookmarkX, Loader2, UserRound } from "lucide-react";
import { Resource, Student } from "../types";
import { fetchResources } from "../lib/hub";
import { ResourceCard } from "./ResourceCard";
import { StudentAvatar } from "./StudentAvatar";

interface Props {
  students: Student[];
  studentId: string | null;
  onChooseStudent: (id: string | null) => void;
  bookmarkedIds: Set<string>;
  onToggleBookmark: (resource: Resource) => void;
  editorMode: boolean;
}

export const BookmarksView: React.FC<Props> = ({
  students,
  studentId,
  onChooseStudent,
  bookmarkedIds,
  onToggleBookmark,
  editorMode,
}) => {
  const [items, setItems] = useState<Resource[] | null>(null);
  const student = students.find((s) => s.id === studentId) ?? null;

  // Bookmarks store ids only, so fetch the full list and match locally. The
  // catalogue is small enough that this beats a second round trip per item.
  useEffect(() => {
    if (!studentId) {
      setItems([]);
      return;
    }
    let active = true;
    setItems(null);
    fetchResources({ limit: 500 })
      .then((all) => active && setItems(all.filter((r) => bookmarkedIds.has(r.id))))
      .catch(() => active && setItems([]));
    return () => {
      active = false;
    };
  }, [studentId, bookmarkedIds]);

  if (!studentId) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-3xl border border-slate-200/60 p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 text-amber-500 flex items-center justify-center mx-auto">
            <UserRound className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-black text-slate-900 mt-3">Who's using this phone?</h2>
          <p className="text-xs text-slate-400 font-semibold mt-1 max-w-xs mx-auto leading-relaxed">
            Pick your name so your saved items stay with you. No password — and
            you can change it any time.
          </p>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {students.map((s) => (
            <button
              key={s.id}
              onClick={() => onChooseStudent(s.id)}
              className="bg-white rounded-2xl border border-slate-200/80 p-3 flex flex-col items-center gap-2 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <StudentAvatar presetId={s.avatarId} size="sm" />
              <span className="text-xs font-extrabold text-slate-700 truncate w-full text-center">
                {s.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5 flex items-center gap-3">
        {student && <StudentAvatar presetId={student.avatarId} size="sm" />}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black text-slate-900 leading-tight truncate">
            {student?.name ?? "Saved"}
          </h2>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
            {items?.length ?? 0} saved {items?.length === 1 ? "item" : "items"}
          </p>
        </div>
        <button
          onClick={() => onChooseStudent(null)}
          className="shrink-0 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl transition-all cursor-pointer"
        >
          Not you?
        </button>
      </div>

      {!items && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      )}

      {items && items.length === 0 && (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center">
          <BookmarkX className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-extrabold text-slate-600 mt-3">Nothing saved yet.</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            Tap the bookmark icon on any note, game or notice to keep it here for quick access.
          </p>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="space-y-2.5">
          {items.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              bookmarked
              canBookmark
              editorMode={editorMode}
              onToggleBookmark={onToggleBookmark}
              onEdit={() => undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
};
