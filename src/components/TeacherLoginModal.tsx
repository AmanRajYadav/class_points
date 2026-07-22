import React, { useState, useEffect, useRef } from "react";
import { X, Lock, Unlock, Eye, EyeOff, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { signInAsTeacher } from "../lib/auth";

interface TeacherLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// On success there is nothing to hand back: useTeacherSession is subscribed to
// Supabase's auth state and flips the app into editor mode on its own.
export const TeacherLoginModal: React.FC<TeacherLoginModalProps> = ({ isOpen, onClose }) => {
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setPassword("");
      setError(null);
      setShowPassword(false);
      setBusy(false);
    } else {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    setError(null);
    setBusy(true);
    const message = await signInAsTeacher(password);
    setBusy(false);

    if (message) {
      setError(message);
      if (navigator.vibrate) navigator.vibrate(100);
      return;
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/85 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm relative border-4 border-slate-100"
      >
        <button
          onClick={onClose}
          type="button"
          className="absolute top-4 right-4 p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center mt-4">
          <div className="bg-amber-100 p-3 rounded-full text-amber-500 mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-black text-slate-800">Unlock Editor Mode</h3>
          <p className="text-xs text-slate-400 text-center mt-1 px-4">
            Enter your teacher password to enable point adjustment, student editing, and
            cycle resets.
          </p>

          <form onSubmit={handleSubmit} className="w-full mt-6 space-y-4">
            <motion.div
              animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="relative"
            >
              <input
                ref={inputRef}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Teacher password…"
                value={password}
                onChange={(e) => {
                  setError(null);
                  setPassword(e.target.value);
                }}
                disabled={busy}
                className={`w-full bg-slate-50 border text-center rounded-2xl py-3 px-12 text-xl focus:outline-none focus:ring-4 font-mono font-black tracking-widest disabled:opacity-60 ${
                  error
                    ? "border-red-500 focus:ring-red-500/10 text-red-600 bg-red-50/30"
                    : "border-slate-200 focus:ring-indigo-500/10 focus:border-indigo-500 text-slate-800"
                }`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer rounded-lg hover:bg-slate-100"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </motion.div>

            {error && (
              <p className="text-center text-xs font-bold text-red-500">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy || password.length === 0}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-sm rounded-2xl shadow-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking…
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" /> Unlock Editor mode
                </>
              )}
            </button>
          </form>

          <p className="text-[10px] text-slate-400 text-center mt-4 leading-relaxed">
            Editing is enforced by the database, not this screen. Students can always
            watch the board without signing in.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
