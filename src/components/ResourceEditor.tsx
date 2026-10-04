import React, { useEffect, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { Branch, Resource } from "../types";
import { deleteResource, saveResource } from "../lib/hub";

interface Props {
  open: boolean;
  /** Existing row to edit, or a partial seed for a new one. */
  initial: Partial<Resource> | null;
  onClose: () => void;
  onSaved: () => void;
}

export const ResourceEditor: React.FC<Props> = ({
  open,
  initial,
  onClose,
  onSaved,
}) => {
  const [draft, setDraft] = useState<Partial<Resource>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft({ kind: "game", pinned: false, ...initial });
      setError(null);
      setBusy(false);
    }
  }, [open, initial]);

  if (!open) return null;

  const set = <K extends keyof Resource>(key: K, value: Resource[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = async () => {
    if (!draft.title?.trim()) {
      setError("Give it a title.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveResource({ ...draft, title: draft.title.trim() });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!draft.id) return;
    if (!window.confirm("Delete this item for everyone?")) return;
    setBusy(true);
    try {
      await deleteResource(draft.id);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const field = "w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500";
  const label = "block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1";

  return (
    <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-end sm:items-center justify-center backdrop-blur-sm">
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl border-t-4 sm:border-4 border-slate-100 max-h-[92vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-black text-slate-900">{draft.id ? "Edit item" : "New item"}</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className={label}>Title</label>
            <input
              autoFocus
              className={field}
              value={draft.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Light — reflection quiz"
            />
          </div>

          <div>
            <label className={label}>Link (optional)</label>
            <input
              className={field}
              inputMode="url"
              value={draft.url ?? ""}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div>
            <label className={label}>Description (optional)</label>
            <textarea
              rows={2}
              className={field}
              value={draft.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="One line so it's findable later."
            />
          </div>

          <div>
            <label className={label}>Branch</label>
            <select
              className={field}
              value={draft.branch ?? ""}
              onChange={(e) => set("branch", (e.target.value || null) as Branch | null)}
            >
              <option value="">Both branches</option>
              <option value="Mangla">Mangla only</option>
              <option value="Sarkanda">Sarkanda only</option>
            </select>
          </div>

          <label className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.pinned ?? false}
              onChange={(e) => set("pinned", e.target.checked)}
              className="w-4 h-4 accent-indigo-600"
            />
            <span className="text-xs font-bold text-slate-700">Pin to the top of the list</span>
          </label>

          {error && <p className="text-xs font-extrabold text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={busy}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-sm rounded-2xl shadow transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {draft.id ? "Save changes" : "Add to Fluence"}
            </button>

            {draft.id && (
              <button
                onClick={handleDelete}
                disabled={busy}
                aria-label="Delete"
                className="px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-black rounded-2xl transition-all active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
