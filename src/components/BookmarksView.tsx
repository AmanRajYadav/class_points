import { useEffect, useState } from "react";
import { BookmarkX, Loader2, LogIn } from "lucide-react";
import { Resource } from "../types";
import { fetchResources } from "../lib/hub";
import { ResourceCard } from "./ResourceCard";

interface Props {
  /** Roster id of the signed-in student, or null. */
  studentId: string | null;
  username: string | null;
  onSignIn: () => void;
  bookmarkedIds: Set<string>;
  onToggleBookmark: (resource: Resource) => void;
  editorMode: boolean;
}

export const BookmarksView = ({
  studentId,
  username,
  onSignIn,
  bookmarkedIds,
  onToggleBookmark,
  editorMode,
}: Props) => {
  const [items, setItems] = useState<Resource[] | null>(null);

  // Bookmarks store ids only. The catalogue is small enough that fetching it
  // and matching locally beats a round trip per saved item.
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
      <div className="bg-white rounded-3xl border border-slate-200/60 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-500 flex items-center justify-center mx-auto">
          <LogIn className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-black text-slate-900 mt-3">Sign in to save things</h2>
        <p className="text-xs text-slate-400 font-semibold mt-1.5 max-w-xs mx-auto leading-relaxed">
          Bookmarks follow your account, so they are there on any device you sign in on.
          Your teacher creates the account for you.
        </p>
        <button
          onClick={onSignIn}
          className="mt-4 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow transition-all active:scale-95 cursor-pointer"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5">
        <h2 className="text-lg font-black text-slate-900 leading-tight">Saved</h2>
        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
          {username ? `@${username} · ` : ""}
          {items?.length ?? 0} item{items?.length === 1 ? "" : "s"}
        </p>
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
            Tap the bookmark icon on any note, game or notice to keep it here.
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
