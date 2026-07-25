import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { Chapter, Resource, ResourceKind, Subject } from "../types";
import { fetchResources } from "../lib/hub";
import { ResourceCard } from "./ResourceCard";
import { ResourceEditor } from "./ResourceEditor";

interface Props {
  title: string;
  subtitle: string;
  /** Which kinds this view shows. Games, Notes and Notices are each one kind;
   *  Resources is the catch-all. */
  kinds: ResourceKind[];
  /** Restricts to a chapter — this is what makes Park a view of the same data. */
  chapterId?: string;
  editorMode: boolean;
  studentId: string | null;
  bookmarkedIds: Set<string>;
  onToggleBookmark: (resource: Resource) => void;
  subjects: Subject[];
  chapters: Chapter[];
  /** Pre-filled when adding from inside a chapter. */
  seed?: Partial<Resource>;
  emptyHint?: string;
}

export const ResourceList: React.FC<Props> = ({
  title,
  subtitle,
  kinds,
  chapterId,
  editorMode,
  studentId,
  bookmarkedIds,
  onToggleBookmark,
  subjects,
  chapters,
  seed,
  emptyHint,
}) => {
  const [items, setItems] = useState<Resource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<Resource> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const kindKey = kinds.join(",");

  useEffect(() => {
    let active = true;
    setItems(null);
    setError(null);

    fetchResources({ kinds, chapterId })
      .then((rows) => active && setItems(rows))
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)));

    return () => {
      active = false;
    };
    // kindKey stands in for the kinds array so a new array identity on each
    // render does not refetch forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindKey, chapterId, reloadKey]);

  // Filtering happens client-side: these lists are small, and it keeps typing
  // instant with no request per keystroke.
  const visible = useMemo(() => {
    if (!items) return null;
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) =>
      [r.title, r.description, r.body].some((f) => f?.toLowerCase().includes(q))
    );
  }, [items, search]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 leading-tight">{title}</h2>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black mt-0.5">
              {subtitle}
            </p>
          </div>

          {editorMode && (
            <button
              onClick={() => setEditing({ kind: kinds[0], ...seed })}
              className="shrink-0 flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs px-3.5 py-2.5 rounded-2xl shadow transition-all active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          )}
        </div>

        <div className="relative mt-4">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or description…"
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-2.5 pl-9 pr-4 text-base font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs font-bold text-red-700">
          {error}
        </div>
      )}

      {!items && !error && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
        </div>
      )}

      {visible && visible.length === 0 && (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center">
          <p className="text-sm font-extrabold text-slate-600">
            {search ? "Nothing matches that search." : "Nothing here yet."}
          </p>
          {!search && emptyHint && (
            <p className="text-xs text-slate-400 mt-1.5 max-w-xs mx-auto">{emptyHint}</p>
          )}
        </div>
      )}

      {visible && visible.length > 0 && (
        <div className="space-y-2.5">
          {visible.map((resource) => (
            <ResourceCard
              key={resource.id}
              resource={resource}
              bookmarked={bookmarkedIds.has(resource.id)}
              canBookmark={studentId !== null}
              editorMode={editorMode}
              onToggleBookmark={onToggleBookmark}
              onEdit={setEditing}
            />
          ))}
        </div>
      )}

      <ResourceEditor
        open={editing !== null}
        initial={editing}
        subjects={subjects}
        chapters={chapters}
        onClose={() => setEditing(null)}
        onSaved={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
};
