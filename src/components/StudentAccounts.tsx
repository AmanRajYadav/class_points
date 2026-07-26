import { useCallback, useEffect, useState } from "react";
import { Check, KeyRound, Loader2, Trash2, UserPlus } from "lucide-react";
import { Student } from "../types";
import {
  createStudentAccount,
  fetchStudentAccounts,
  normaliseUsername,
  revokeStudentAccount,
  StudentAccount,
} from "../lib/auth";
import { StudentAvatar } from "./StudentAvatar";

interface Props {
  students: Student[];
}

/** Suggests a username from a name, so the teacher rarely has to think of one. */
const suggest = (name: string) => normaliseUsername(name).slice(0, 20);

export const StudentAccounts = ({ students }: Props) => {
  const [accounts, setAccounts] = useState<StudentAccount[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    fetchStudentAccounts().then(setAccounts);
  }, []);

  useEffect(load, [load]);

  const withoutAccounts = students.filter(
    (s) => !accounts?.some((a) => a.studentId === s.id)
  );

  const create = async () => {
    if (!selected || !username.trim() || password.length < 6) return;
    setBusy(true);
    setMessage(null);

    const { error } = await createStudentAccount(username, password, selected);
    setBusy(false);

    if (error) {
      setMessage({ ok: false, text: error });
      return;
    }

    const who = students.find((s) => s.id === selected)?.name ?? "Student";
    setMessage({
      ok: true,
      // The password is shown once, here, because there is no email to send it
      // to and no self-service reset — if it is not written down now, the only
      // fix is creating the account again.
      text: `${who} can now sign in as "${normaliseUsername(username)}" with the password you set. Write it down — there is no reset email.`,
    });
    setSelected("");
    setUsername("");
    setPassword("");
    load();
  };

  const revoke = async (account: StudentAccount) => {
    if (!window.confirm(`Remove ${account.username}'s access? Their XP and history stay.`)) return;
    const error = await revokeStudentAccount(account.id);
    if (error) setMessage({ ok: false, text: error });
    else load();
  };

  const field =
    "w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500";
  const label = "block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1";

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Students sign in with a username and password — no email, so nothing to confirm
        and nobody needs an inbox. Only you can create accounts, so nobody outside the
        class can appear on the leaderboard.
      </p>

      {/* New account */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
        <h5 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <UserPlus className="w-3.5 h-3.5" /> New account
        </h5>

        <div>
          <label className={label}>Student</label>
          <select
            className={field}
            value={selected}
            onChange={(e) => {
              const id = e.target.value;
              setSelected(id);
              const who = students.find((s) => s.id === id);
              if (who && !username) setUsername(suggest(who.name));
            }}
          >
            <option value="">— choose —</option>
            {withoutAccounts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.branch})
              </option>
            ))}
          </select>
          {withoutAccounts.length === 0 && accounts && (
            <p className="text-[11px] font-bold text-emerald-600 mt-1.5">
              Every student on the roster has an account.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Username</label>
            <input
              className={field}
              value={username}
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="aman"
            />
          </div>
          <div>
            <label className={label}>Password</label>
            <input
              className={field}
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 6 characters"
            />
          </div>
        </div>

        <button
          onClick={() => void create()}
          disabled={busy || !selected || password.length < 6 || username.trim().length < 3}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-black text-xs rounded-xl transition-all active:scale-95 cursor-pointer"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
          Create account
        </button>

        {message && (
          <p
            className={`text-[11px] font-bold leading-relaxed ${
              message.ok ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {message.ok && <Check className="w-3.5 h-3.5 inline mr-1" />}
            {message.text}
          </p>
        )}
      </div>

      {/* Existing */}
      <div>
        <h5 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-2">
          Accounts {accounts ? `(${accounts.length})` : ""}
        </h5>

        {!accounts && (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
          </div>
        )}

        {accounts?.length === 0 && (
          <p className="text-xs text-slate-400 font-semibold py-3">No student accounts yet.</p>
        )}

        <div className="space-y-1.5">
          {accounts?.map((a) => {
            const who = students.find((s) => s.id === a.studentId);
            return (
              <div
                key={a.id}
                className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-xl px-3 py-2"
              >
                {who ? (
                  <StudentAvatar presetId={who.avatarId} size="xs" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <span className="block text-xs font-extrabold text-slate-700 truncate">
                    {who?.name ?? "Unlinked"}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 font-mono">
                    @{a.username}
                  </span>
                </div>
                <button
                  onClick={() => void revoke(a)}
                  aria-label={`Remove ${a.username}`}
                  className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-slate-400 font-semibold mt-3 leading-relaxed">
          Removing an account takes away its access immediately. Deleting the underlying
          login needs the service_role key, which never touches the browser — so the
          sign-in still exists but grants nothing and appears nowhere.
        </p>
      </div>
    </div>
  );
};
