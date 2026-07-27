import { useEffect, useState } from "react";
import { CalendarDays, Check, GraduationCap, KeyRound, Loader2, LogOut, UserRound } from "lucide-react";
import { Profile, changeOwnPassword, signOut } from "../lib/auth";
import { Student } from "../types";
import { fetchLeaderboard, levelProgress, rankFor } from "../lib/xp";
import { StudentAvatar } from "./StudentAvatar";

interface Props {
  profile: Profile | null;
  students: Student[];
  onSignIn: () => void;
}

const joined = (iso: string | undefined) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

export const ProfileCard = ({ profile, students, onSignIn }: Props) => {
  const [xp, setXp] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const student = profile?.studentId
    ? students.find((s) => s.id === profile.studentId) ?? null
    : null;

  // All-time XP, for the level badge. Only meaningful for a student.
  useEffect(() => {
    if (!profile?.studentId) return;
    let active = true;
    fetchLeaderboard("all")
      .then((rows) => {
        if (!active) return;
        setXp(rows.find((r) => r.studentId === profile.studentId)?.xp ?? 0);
      })
      .catch(() => active && setXp(null));
    return () => {
      active = false;
    };
  }, [profile?.studentId]);

  if (!profile) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200/60 p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <UserRound className="w-6 h-6" />
        </div>
        <h3 className="font-black text-slate-800 mt-3">Not signed in</h3>
        <p className="text-xs text-slate-400 font-semibold mt-1">
          Sign in to see your profile, XP and saved items.
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

  const isTeacher = profile.role === "teacher";
  const progress = xp !== null ? levelProgress(xp) : null;
  const rank = progress ? rankFor(progress.level) : null;

  const savePassword = async () => {
    if (newPassword.length < 6) return;
    setBusy(true);
    const failure = await changeOwnPassword(newPassword);
    setBusy(false);
    setMessage(
      failure
        ? { ok: false, text: failure }
        : { ok: true, text: "Password changed. Use the new one next time you sign in." }
    );
    if (!failure) setNewPassword("");
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4">
      <div className="flex items-center gap-3">
        {student ? (
          <StudentAvatar presetId={student.avatarId} size="sm" />
        ) : (
          <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="font-black text-slate-900 text-base truncate">
              {student?.name ?? profile.username}
            </h3>
            <span
              className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${
                isTeacher
                  ? "bg-amber-100 text-amber-700"
                  : "bg-indigo-100 text-indigo-700"
              }`}
            >
              {profile.role}
            </span>
            {rank && (
              <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${rank.tint}`}>
                {rank.title}
              </span>
            )}
          </div>
          <span className="text-[11px] font-bold text-slate-400 font-mono">@{profile.username}</span>
        </div>

        <button
          onClick={() => void signOut()}
          className="shrink-0 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl transition-all cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>

      {/* Facts */}
      <div className="grid grid-cols-2 gap-2">
        <Fact
          icon={CalendarDays}
          label="Joined"
          value={joined(profile.createdAt)}
        />
        {student ? (
          <Fact icon={GraduationCap} label="Branch" value={`${student.branch}`} />
        ) : (
          <Fact icon={UserRound} label="Role" value="Teacher" />
        )}
      </div>

      {/* Level, students only */}
      {progress && (
        <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-3.5">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
            <span>Level {progress.level}</span>
            <span className="text-amber-600">{xp?.toLocaleString()} XP total</span>
          </div>
          <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${progress.fraction * 100}%` }}
            />
          </div>
          <p className="text-[10px] font-bold text-slate-400 mt-1.5">
            {progress.toNext.toLocaleString()} XP to level {progress.level + 1}
          </p>
        </div>
      )}

      {xp === null && profile.studentId && (
        <div className="flex justify-center py-2">
          <Loader2 className="w-4 h-4 text-slate-300 animate-spin" />
        </div>
      )}

      {/* Password */}
      <div className="border-t border-slate-100 pt-3 space-y-2">
        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
          Change your password
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => {
              setMessage(null);
              setNewPassword(e.target.value);
            }}
            placeholder="New password (min 6)"
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
          <button
            onClick={() => void savePassword()}
            disabled={busy || newPassword.length < 6}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white font-black text-xs rounded-xl transition-all active:scale-95 cursor-pointer whitespace-nowrap flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
        {message && (
          <p className={`text-[11px] font-bold ${message.ok ? "text-emerald-700" : "text-red-600"}`}>
            {message.ok && <Check className="w-3.5 h-3.5 inline mr-1" />}
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
};

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-slate-50 border border-slate-200/60 rounded-2xl px-3 py-2.5">
      <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400">
        <Icon className="w-3 h-3" /> {label}
      </span>
      <span className="block text-sm font-black text-slate-800 mt-0.5 truncate">{value}</span>
    </div>
  );
}
