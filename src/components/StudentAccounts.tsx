import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Link2, Loader2, Trash2 } from "lucide-react";
import { Student } from "../types";
import {
  fetchStudentAccounts,
  linkStudentAccount,
  normaliseUsername,
  revokeStudentAccount,
  StudentAccount,
  usernameToEmail,
} from "../lib/auth";
import { StudentAvatar } from "./StudentAvatar";

interface Props {
  students: Student[];
}

const DASHBOARD_USERS = "https://supabase.com/dashboard/project/wccuyukbmagzkculpzyh/auth/users";

const suggest = (name: string) => normaliseUsername(name).slice(0, 20);

export const StudentAccounts = ({ students }: Props) => {
  const [accounts, setAccounts] = useState<StudentAccount[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [username, setUsername] = useState("");
  const [uid, setUid] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    fetchStudentAccounts().then(setAccounts);
  }, []);

  useEffect(load, [load]);

  const withoutAccounts = students.filter((s) => !accounts?.some((a) => a.studentId === s.id));

  const link = async () => {
    setBusy(true);
    setMessage(null);

    const { error } = await linkStudentAccount(uid, username, selected);
    setBusy(false);

    if (error) {
      setMessage({ ok: false, text: error });
      return;
    }

    const who = students.find((s) => s.id === selected)?.name ?? "Student";
    setMessage({ ok: true, text: `${who} can now sign in as "${normaliseUsername(username)}".` });
    setSelected("");
    setUsername("");
    setUid("");
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

  const previewEmail = username.trim() ? usernameToEmail(username) : "<username>@students.fluence.local";

  return (
    <div className="space-y-4">
      {/* Why this is a two-step job rather than a button. */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 space-y-2">
        <h5 className="text-xs font-black text-indigo-900 uppercase tracking-wider">
          Step 1 — create the login in Supabase
        </h5>
        <ol className="text-[11px] text-indigo-800 font-semibold leading-relaxed list-decimal pl-4 space-y-1">
          <li>
            Open{" "}
            <a
              href={DASHBOARD_USERS}
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-flex items-center gap-0.5"
            >
              Authentication → Users <ExternalLink className="w-3 h-3" />
            </a>{" "}
            and press <strong>Add user → Create new user</strong>.
          </li>
          <li>
            Email: <code className="bg-white px-1 rounded font-mono">{previewEmail}</code>
          </li>
          <li>Set the password yourself, and tick <strong>Auto Confirm User</strong>.</li>
          <li>Copy the new row's <strong>UID</strong> and paste it below.</li>
        </ol>
        <p className="text-[10px] text-indigo-700 leading-relaxed pt-1">
          The browser cannot create these accounts: Supabase refuses any address whose domain
          has no mail servers, and rate limits sign-ups to about two an hour. The dashboard
          uses the admin API, which is subject to neither.
        </p>
      </div>

      {/* Link */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
        <h5 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" /> Step 2 — link it here
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

        <div>
          <label className={label}>Username (what they type to sign in)</label>
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
          <label className={label}>User UID from the dashboard</label>
          <input
            className={`${field} font-mono text-xs`}
            value={uid}
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setUid(e.target.value)}
            placeholder="c8c12db5-0893-430f-97fc-195b416d0232"
          />
        </div>

        <button
          onClick={() => void link()}
          disabled={busy || !selected || username.trim().length < 3 || uid.trim().length < 10}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-black text-xs rounded-xl transition-all active:scale-95 cursor-pointer"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          Link account
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
          Linked accounts {accounts ? `(${accounts.length})` : ""}
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
          Unlinking removes access immediately. The login itself still exists in Supabase —
          deleting that needs the service_role key, which never touches the browser — but
          without a link it grants nothing and appears nowhere.
        </p>
      </div>
    </div>
  );
};
