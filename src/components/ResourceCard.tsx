import React from "react";
import {
  Bookmark as BookmarkIcon,
  ExternalLink,
  FileText,
  Gamepad2,
  Link as LinkIcon,
  Megaphone,
  NotebookPen,
  Pencil,
  Youtube,
} from "lucide-react";
import { Resource, ResourceKind } from "../types";

export const KIND_META: Record<
  ResourceKind,
  { label: string; icon: React.ElementType; tint: string }
> = {
  note: { label: "Note", icon: NotebookPen, tint: "bg-sky-50 text-sky-600 border-sky-100" },
  game: { label: "Game", icon: Gamepad2, tint: "bg-violet-50 text-violet-600 border-violet-100" },
  notice: { label: "Notice", icon: Megaphone, tint: "bg-rose-50 text-rose-600 border-rose-100" },
  video: { label: "Video", icon: Youtube, tint: "bg-red-50 text-red-600 border-red-100" },
  pdf: { label: "PDF", icon: FileText, tint: "bg-amber-50 text-amber-600 border-amber-100" },
  link: { label: "Link", icon: LinkIcon, tint: "bg-slate-100 text-slate-600 border-slate-200" },
  homework: {
    label: "Homework",
    icon: Pencil,
    tint: "bg-emerald-50 text-emerald-600 border-emerald-100",
  },
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

interface Props {
  resource: Resource;
  bookmarked: boolean;
  canBookmark: boolean;
  editorMode: boolean;
  onToggleBookmark: (resource: Resource) => void;
  onEdit: (resource: Resource) => void;
}

export const ResourceCard: React.FC<Props> = ({
  resource,
  bookmarked,
  canBookmark,
  editorMode,
  onToggleBookmark,
  onEdit,
}) => {
  const meta = KIND_META[resource.kind] ?? KIND_META.link;
  const Icon = meta.icon;

  const body = (
    <>
      <div className={`shrink-0 w-11 h-11 rounded-2xl border flex items-center justify-center ${meta.tint}`}>
        <Icon className="w-5 h-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
            {meta.label}
          </span>
          {resource.pinned && (
            <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-1.5 rounded">
              Pinned
            </span>
          )}
          {resource.branch && (
            <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-1.5 rounded">
              {resource.branch}
            </span>
          )}
        </div>

        <h4 className="font-extrabold text-slate-800 text-sm leading-snug mt-0.5 break-words">
          {resource.title}
        </h4>

        {resource.description && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2 break-words">{resource.description}</p>
        )}

        <div className="flex items-center gap-2 mt-1.5 text-[10px] font-bold text-slate-400">
          <span>{formatDate(resource.createdAt)}</span>
          {resource.dueDate && (
            <span className="text-emerald-600">
              Due {new Date(resource.dueDate).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </span>
          )}
          {resource.url && <ExternalLink className="w-3 h-3" />}
        </div>
      </div>
    </>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 flex items-start gap-3 hover:border-slate-300 hover:shadow-sm transition-all relative group">
      {resource.url ? (
        <a
          href={resource.url}
          target="_blank"
          // noreferrer as well as noopener: without it the opened page can read
          // document.referrer and, in older browsers, reach back via window.opener.
          rel="noopener noreferrer"
          className="flex items-start gap-3 flex-1 min-w-0"
        >
          {body}
        </a>
      ) : (
        <div className="flex items-start gap-3 flex-1 min-w-0">{body}</div>
      )}

      <div className="flex flex-col gap-1 shrink-0">
        {canBookmark && (
          <button
            onClick={() => onToggleBookmark(resource)}
            aria-label={bookmarked ? "Remove bookmark" : "Save bookmark"}
            className={`p-2 rounded-xl transition-all active:scale-90 cursor-pointer ${
              bookmarked
                ? "text-amber-500 bg-amber-50"
                : "text-slate-300 hover:text-slate-500 hover:bg-slate-50"
            }`}
          >
            <BookmarkIcon className={`w-4 h-4 ${bookmarked ? "fill-amber-500" : ""}`} />
          </button>
        )}

        {editorMode && (
          <button
            onClick={() => onEdit(resource)}
            aria-label="Edit"
            className="p-2 rounded-xl text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-90 cursor-pointer"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
