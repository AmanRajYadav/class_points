import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, GraduationCap, Loader2, Lock, Unlock, User, X } from "lucide-react";
import { motion } from "motion/react";
import {
  clearFailedLogins,
  lockoutRemaining,
  noteFailedLogin,
  signInStudent,
  signInTeacher,
} from "../lib/auth";

type Tab = "student" | "teacher";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Which tab opens first — the lock button wants teacher, the rest student. */
  initialTab?: Tab;
}

export const LoginModal: React.FC<Props> = ({ isOpen, onClose, initialTab = "student" }) => {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitFor, setWaitFor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setUsername("");
      setPassword("");
      setError(null);
      setShow(false);
      setBusy(false);
      return;
    }
    setTab(initialTab);
    setWaitFor(lockoutRemaining());
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen, initialTab]);

  // Countdown while locked out.
  useEffect(() => {
    if (waitFor <= 0) return;
    const t = window.setTimeout(() => setWaitFor((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [waitFor]);

  if (!isOpen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || waitFor > 0) return;

    setError(null);
    setBusy(true);
    const message =
      tab === "teacher" ? await signInTeacher(password) : await signInStudent(username, password);
    setBusy(false);

    if (message) {
      setError(message);
      const delay = noteFailedLogin();
      setWaitFor(delay);
      if (navigator.vibrate) navigator.vibrate(100);
      return;
    }

    clearFailedLogins();
    onClose();
  };

  const field =
    "w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 px-4 text-base font-bold focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 disabled:opacity-60";

  return (
    <div className="fixed inset-0 bg-slate-900/85 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
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

        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/60 select-none mt-6 mb-5">
          {(["student", "teacher"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                tab === t ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
              }`}
            >
              {t === "student" ? <User className="w-3.5 h-3.5" /> : <GraduationCap className="w-3.5 h-3.5" />}
              {t}
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center">
          <div
            className={`p-3 rounded-full mb-3 ${
              tab === "teacher" ? "bg-amber-100 text-amber-500" : "bg-indigo-100 text-indigo-500"
            }`}
          >
            <Lock className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-black text-slate-800">
            {tab === "teacher" ? "Teacher sign in" : "Sign in to play"}
          </h3>
          <p className="text-xs text-slate-400 text-center mt-1 px-2">
            {tab === "teacher"
              ? "Unlocks marking, editing and the class activity."
              : "Your XP, streak and place on the leaderboard follow your account."}
          </p>

          <form onSubmit={submit} className="w-full mt-5 space-y-3">
            {tab === "student" && (
              <input
                ref={tab === "student" ? inputRef : undefined}
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Username"
                value={username}
                onChange={(e) => {
                  setError(null);
                  setUsername(e.target.value);
                }}
                disabled={busy || waitFor > 0}
                className={field}
                required
              />
            )}

            <motion.div
              animate={error ? { x: [-8, 8, -8, 8, 0] } : {}}
              transition={{ duration: 0.4 }}
              className="relative"
            >
              <input
                ref={tab === "teacher" ? inputRef : undefined}
                type={show ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => {
                  setError(null);
                  setPassword(e.target.value);
                }}
                disabled={busy || waitFor > 0}
                className={`${field} pr-12 ${
                  error ? "border-red-400 bg-red-50/40 text-red-700" : ""
                }`}
                required
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </motion.div>

            {error && <p className="text-center text-xs font-bold text-red-500">{error}</p>}

            {waitFor > 0 && (
              <p className="text-center text-xs font-bold text-amber-600">
                Too many attempts — try again in {waitFor}s.
              </p>
            )}

            <button
              type="submit"
              disabled={busy || waitFor > 0 || password.length === 0}
              className={`w-full py-3 disabled:opacity-50 text-white font-black text-sm rounded-2xl shadow-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2 ${
                tab === "teacher"
                  ? "bg-slate-800 hover:bg-slate-900"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Checking…
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" /> Sign in
                </>
              )}
            </button>
          </form>

          <p className="text-[10px] text-slate-400 text-center mt-4 leading-relaxed">
            {tab === "student"
              ? "No account? Ask your teacher — accounts are created for you."
              : "What you can edit is enforced by the database, not this screen."}
          </p>
        </div>
      </motion.div>
    </div>
  );
};
