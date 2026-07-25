import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  Lock,
  Mic,
  Play,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { Branch, ClassSummary } from "../types";
import {
  deleteSummary,
  fetchSummaries,
  saveSummary,
  signedAudioUrl,
  uploadAudio,
} from "../lib/hub";
import { formatDateString, parseDateOnly } from "../lib/storage";
import { speechSupported, useVoiceNote } from "../lib/useVoiceNote";

const mmss = (total: number) =>
  `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;

interface Props {
  editorMode: boolean;
  onUnlockRequest: () => void;
}

/**
 * The teacher's daily "what I taught" log. Teacher-only in both directions —
 * the RLS policy on class_summaries denies anonymous reads, so this screen has
 * nothing to show a student even if they route to it.
 */
export const SummaryView: React.FC<Props> = ({ editorMode, onUnlockRequest }) => {
  const [entries, setEntries] = useState<ClassSummary[] | null>(null);
  const [branch, setBranch] = useState<Branch | "">("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  const voice = useVoiceNote();
  const canTranscribe = speechSupported();

  const load = useCallback(() => {
    fetchSummaries()
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  useEffect(() => {
    if (editorMode) load();
    else setEntries(null);
  }, [editorMode, load]);

  if (!editorMode) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/60 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-black text-slate-900 mt-3">Teacher only</h2>
        <p className="text-xs text-slate-400 font-semibold mt-1 max-w-xs mx-auto">
          The daily teaching log is private. Unlock editor mode to record and read it.
        </p>
        <button
          onClick={onUnlockRequest}
          className="mt-4 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-black text-xs rounded-xl shadow transition-all active:scale-95 cursor-pointer"
        >
          Unlock
        </button>
      </div>
    );
  }

  const handleStop = async () => {
    const note = await voice.stop();
    if (!note) return;

    setSaving(true);
    setSaveError(null);
    try {
      // Upload first: if storage fails we would rather save nothing than a row
      // pointing at an object that was never written.
      const date = formatDateString(new Date());
      const audioPath = note.blob.size > 0 ? await uploadAudio(note.blob, date) : null;

      await saveSummary({
        date,
        branch: branch || null,
        transcript: note.transcript || null,
        audioPath,
        durationSeconds: note.durationSeconds,
      });

      voice.cancel();
      load();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handlePlay = async (entry: ClassSummary) => {
    if (!entry.audioPath) return;
    setPlaying(entry.id);
    const url = await signedAudioUrl(entry.audioPath);
    setPlaying(null);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleDelete = async (entry: ClassSummary) => {
    if (!window.confirm("Delete this entry?")) return;
    await deleteSummary(entry.id);
    load();
  };

  const handleEditTranscript = async (entry: ClassSummary) => {
    const next = window.prompt("Transcript", entry.transcript ?? "");
    if (next === null) return;
    await saveSummary({ ...entry, transcript: next });
    load();
  };

  return (
    <div className="space-y-4">
      {/* Recorder */}
      <div className="bg-white rounded-3xl border border-slate-200/60 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 leading-tight">Today's Summary</h2>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black mt-0.5">
              Speak what you taught
            </p>
          </div>
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value as Branch | "")}
            disabled={voice.recording}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
          >
            <option value="">Both branches</option>
            <option value="Mangla">Mangla</option>
            <option value="Sarkanda">Sarkanda</option>
          </select>
        </div>

        {!canTranscribe && (
          <p className="mt-3 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed">
            This browser can't transcribe live. The audio will still be recorded and
            saved — you can type or auto-transcribe it later.
          </p>
        )}

        <div className="mt-4 flex flex-col items-center gap-3">
          {!voice.recording ? (
            <button
              onClick={() => void voice.start()}
              disabled={saving}
              className="w-20 h-20 rounded-full bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-lg shadow-rose-200 flex items-center justify-center transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              aria-label="Start recording"
            >
              {saving ? <Loader2 className="w-8 h-8 animate-spin" /> : <Mic className="w-8 h-8" />}
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <button
                onClick={voice.cancel}
                className="w-12 h-12 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                aria-label="Discard"
              >
                <X className="w-5 h-5" />
              </button>

              <motion.button
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ repeat: Infinity, duration: 1.6 }}
                onClick={() => void handleStop()}
                className="w-20 h-20 rounded-full bg-slate-900 text-white shadow-lg flex items-center justify-center cursor-pointer"
                aria-label="Stop and save"
              >
                <Square className="w-7 h-7 fill-white" />
              </motion.button>

              <span className="w-12 text-center font-black font-mono text-slate-700">
                {mmss(voice.seconds)}
              </span>
            </div>
          )}

          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">
            {saving ? "Saving…" : voice.recording ? "Recording — tap to save" : "Tap to record"}
          </span>
        </div>

        {voice.recording && (
          <div className="mt-3 bg-slate-50 border border-slate-200 rounded-2xl p-3 min-h-[64px] max-h-40 overflow-y-auto">
            <p className="text-sm text-slate-700 leading-relaxed">
              {voice.transcript || (
                <span className="text-slate-400 italic">Listening…</span>
              )}
            </p>
          </div>
        )}

        {(voice.error || saveError) && (
          <p className="mt-3 text-xs font-extrabold text-red-600 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {voice.error ?? saveError}
          </p>
        )}
      </div>

      {/* Timeline */}
      <div className="space-y-2.5">
        {!entries && (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        )}

        {entries && entries.length === 0 && (
          <div className="bg-white rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center">
            <p className="text-sm font-extrabold text-slate-600">No entries yet.</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              Record a short summary after each class. These build up into the history
              an AI can process later.
            </p>
          </div>
        )}

        {entries?.map((entry, i) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 10) * 0.03 }}
            className="bg-white rounded-2xl border border-slate-200/80 p-4 relative"
          >
            {/* Timeline rail */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black text-slate-800">
                {parseDateOnly(entry.date).toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </span>
              {entry.branch && (
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-1.5 rounded">
                  {entry.branch}
                </span>
              )}
              {entry.durationSeconds != null && (
                <span className="text-[10px] font-bold text-slate-400 font-mono">
                  {mmss(entry.durationSeconds)}
                </span>
              )}
            </div>

            <p
              onClick={() => void handleEditTranscript(entry)}
              className="text-sm text-slate-600 leading-relaxed mt-1.5 cursor-text hover:bg-slate-50 rounded-lg -mx-1 px-1 transition-colors"
            >
              {entry.transcript || (
                <span className="italic text-slate-400">
                  No transcript — tap to type one.
                </span>
              )}
            </p>

            <div className="flex items-center gap-1.5 mt-2.5">
              {entry.audioPath && (
                <button
                  onClick={() => void handlePlay(entry)}
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                >
                  {playing === entry.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3 fill-indigo-600" />
                  )}
                  Audio
                </button>
              )}
              <button
                onClick={() => void handleDelete(entry)}
                aria-label="Delete entry"
                className="ml-auto p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {entries && entries.length > 0 && (
        <p className="text-[10px] text-slate-400 font-bold text-center flex items-center justify-center gap-1.5 pb-2">
          <Check className="w-3 h-3" />
          Stored in Supabase, ready for AI processing later
        </p>
      )}
    </div>
  );
};
