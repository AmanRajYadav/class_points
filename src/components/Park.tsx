import React, { useMemo, useState } from "react";
import { BookOpen, ChevronRight, GraduationCap, Layers, Plus, TreePine } from "lucide-react";
import { motion } from "motion/react";
import { Board, Chapter, Resource, Subject } from "../types";
import { Route } from "../lib/useRoute";
import { ResourceList } from "./ResourceList";
import { upsertChapter, upsertSubject } from "../lib/hub";

interface Props {
  route: Route;
  boards: Board[];
  subjects: Subject[];
  chapters: Chapter[];
  editorMode: boolean;
  studentId: string | null;
  bookmarkedIds: Set<string>;
  onToggleBookmark: (resource: Resource) => void;
  onNavigate: (next: Partial<Route>) => void;
  onTreeChanged: () => void;
}

const Crumb: React.FC<{ items: { label: string; onClick?: () => void }[] }> = ({ items }) => (
  <div className="flex items-center gap-1 flex-wrap text-[11px] font-black uppercase tracking-wider">
    {items.map((item, i) => (
      <React.Fragment key={i}>
        {i > 0 && <ChevronRight className="w-3 h-3 text-slate-300" />}
        {item.onClick ? (
          <button
            onClick={item.onClick}
            className="text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
          >
            {item.label}
          </button>
        ) : (
          <span className="text-slate-500">{item.label}</span>
        )}
      </React.Fragment>
    ))}
  </div>
);

/** One row in any of the drill-down levels. */
const PickerRow: React.FC<{
  icon: React.ElementType;
  label: string;
  hint?: string;
  onClick: () => void;
  index: number;
}> = ({ icon: Icon, label, hint, onClick, index }) => (
  <motion.button
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: Math.min(index, 12) * 0.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className="w-full bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center gap-3 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer text-left group"
  >
    <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-500 shrink-0">
      <Icon className="w-4.5 h-4.5" />
    </div>
    <div className="min-w-0 flex-1">
      <span className="block font-extrabold text-slate-800 text-sm truncate">{label}</span>
      {hint && <span className="block text-[11px] text-slate-400 font-semibold">{hint}</span>}
    </div>
    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all shrink-0" />
  </motion.button>
);

export const Park = ({
  route,
  boards,
  subjects,
  chapters,
  editorMode,
  studentId,
  bookmarkedIds,
  onToggleBookmark,
  onNavigate,
  onTreeChanged,
}: Props) => {
  const [busy, setBusy] = useState(false);

  const board = boards.find((b) => b.id === route.board);
  const subject = subjects.find((s) => s.id === route.subjectId);
  const chapter = chapters.find((c) => c.id === route.chapterId);

  // Class levels that actually have subjects under this board.
  const classLevels = useMemo<number[]>(() => {
    if (!board) return [];
    const levels = subjects.filter((s) => s.boardId === board.id).map((s) => s.classLevel);

    return Array.from(new Set(levels)).sort((a, b) => a - b);
  }, [board, subjects]);

  const subjectsHere = useMemo(
    () =>
      board && route.classLevel
        ? subjects.filter((s) => s.boardId === board.id && s.classLevel === route.classLevel)
        : [],
    [board, route.classLevel, subjects]
  );

  const chaptersHere = useMemo(
    () => (subject ? chapters.filter((c) => c.subjectId === subject.id) : []),
    [subject, chapters]
  );

  const go = (next: Partial<Route>) => onNavigate({ view: "park", ...next });

  const addSubject = async () => {
    const name = window.prompt("Subject name (e.g. Science)");
    if (!name?.trim() || !board || !route.classLevel) return;
    setBusy(true);
    try {
      await upsertSubject({
        boardId: board.id,
        classLevel: route.classLevel,
        name: name.trim(),
        sortOrder: subjectsHere.length,
      });
      onTreeChanged();
    } finally {
      setBusy(false);
    }
  };

  const addChapter = async () => {
    const name = window.prompt("Chapter name");
    if (!name?.trim() || !subject) return;
    setBusy(true);
    try {
      await upsertChapter({
        subjectId: subject.id,
        number: chaptersHere.length + 1,
        name: name.trim(),
        sortOrder: chaptersHere.length,
      });
      onTreeChanged();
    } finally {
      setBusy(false);
    }
  };

  const addClass = () => {
    const input = window.prompt("Which class? (e.g. 10)");
    const level = Number(input);
    if (!Number.isInteger(level) || level < 1 || level > 12) return;
    // A class exists only once a subject sits in it, so go straight there.
    go({ board: board!.id, classLevel: level });
  };

  const header = (
    <div className="bg-white rounded-3xl border border-slate-200/60 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
          <TreePine className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-black text-slate-900 leading-tight">Park</h2>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
            Browse by board, class, subject, chapter
          </p>
        </div>
      </div>

      <div className="mt-3">
        <Crumb
          items={[
            { label: "Park", onClick: route.board ? () => go({}) : undefined },
            ...(board
              ? [
                  {
                    label: board.name,
                    onClick: route.classLevel ? () => go({ board: board.id }) : undefined,
                  },
                ]
              : []),
            ...(route.classLevel
              ? [
                  {
                    label: `Class ${route.classLevel}`,
                    onClick: subject
                      ? () => go({ board: board!.id, classLevel: route.classLevel })
                      : undefined,
                  },
                ]
              : []),
            ...(subject
              ? [
                  {
                    label: subject.name,
                    onClick: chapter
                      ? () =>
                          go({
                            board: board!.id,
                            classLevel: route.classLevel,
                            subjectId: subject.id,
                          })
                      : undefined,
                  },
                ]
              : []),
            ...(chapter ? [{ label: chapter.name }] : []),
          ]}
        />
      </div>
    </div>
  );

  const AddButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
    <button
      onClick={onClick}
      disabled={busy}
      className="w-full border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/30 text-slate-400 hover:text-indigo-600 rounded-2xl p-4 flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
    >
      <Plus className="w-4 h-4" /> {label}
    </button>
  );

  // Deepest level: the chapter's own shelf of mixed content.
  if (chapter) {
    return (
      <div className="space-y-4">
        {header}
        <ResourceList
          title={chapter.number ? `${chapter.number}. ${chapter.name}` : chapter.name}
          subtitle={`${board?.name} · Class ${route.classLevel} · ${subject?.name}`}
          kinds={["note", "game", "video", "pdf", "link", "homework"]}
          chapterId={chapter.id}
          editorMode={editorMode}
          studentId={studentId}
          bookmarkedIds={bookmarkedIds}
          onToggleBookmark={onToggleBookmark}
          subjects={subjects}
          chapters={chapters}
          seed={{
            boardId: board?.id ?? null,
            classLevel: route.classLevel ?? null,
            subjectId: subject?.id ?? null,
            chapterId: chapter.id,
          }}
          emptyHint="Notes, games, videos and PDFs added to this chapter will appear here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}

      <div className="space-y-2.5">
        {/* Board */}
        {!board &&
          boards.map((b, i) => (
            <PickerRow
              key={b.id}
              index={i}
              icon={GraduationCap}
              label={b.name}
              hint={`${
                Array.from(new Set(subjects.filter((s) => s.boardId === b.id).map((s) => s.classLevel))).length
              } classes`}
              onClick={() => go({ board: b.id })}
            />
          ))}

        {/* Class */}
        {board && !route.classLevel && (
          <>
            {classLevels.map((level, i) => (
              <PickerRow
                key={level}
                index={i}
                icon={Layers}
                label={`Class ${level}`}
                hint={`${
                  subjects.filter((s) => s.boardId === board.id && s.classLevel === level).length
                } subjects`}
                onClick={() => go({ board: board.id, classLevel: level })}
              />
            ))}
            {classLevels.length === 0 && (
              <p className="text-center text-xs font-bold text-slate-400 py-6">
                No classes yet in {board.name}.
              </p>
            )}
            {editorMode && <AddButton label="Add a class" onClick={addClass} />}
          </>
        )}

        {/* Subject */}
        {board && route.classLevel && !subject && (
          <>
            {subjectsHere.map((s, i) => (
              <PickerRow
                key={s.id}
                index={i}
                icon={BookOpen}
                label={s.name}
                hint={`${chapters.filter((c) => c.subjectId === s.id).length} chapters`}
                onClick={() => go({ board: board.id, classLevel: route.classLevel, subjectId: s.id })}
              />
            ))}
            {subjectsHere.length === 0 && (
              <p className="text-center text-xs font-bold text-slate-400 py-6">
                No subjects in Class {route.classLevel} yet.
              </p>
            )}
            {editorMode && <AddButton label="Add a subject" onClick={addSubject} />}
          </>
        )}

        {/* Chapter */}
        {subject && (
          <>
            {chaptersHere.map((c, i) => (
              <PickerRow
                key={c.id}
                index={i}
                icon={BookOpen}
                label={c.number ? `${c.number}. ${c.name}` : c.name}
                onClick={() =>
                  go({
                    board: board!.id,
                    classLevel: route.classLevel,
                    subjectId: subject.id,
                    chapterId: c.id,
                  })
                }
              />
            ))}
            {chaptersHere.length === 0 && (
              <p className="text-center text-xs font-bold text-slate-400 py-6">
                No chapters in {subject.name} yet.
              </p>
            )}
            {editorMode && <AddButton label="Add a chapter" onClick={addChapter} />}
          </>
        )}
      </div>
    </div>
  );
};
