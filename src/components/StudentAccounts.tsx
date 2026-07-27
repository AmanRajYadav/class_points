import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, GraduationCap, Link2, Loader2, Trash2 } from "lucide-react";
import { Student } from "../types";
import {
  fetchStaffAccounts,
  fetchStudentAccounts,
  linkStaffAccount,
  linkStudentAccount,
  normaliseUsername,
  revokeAccount,
  ROLE_LABEL,
  StaffAccount,
  StaffRole,
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
  const [staff, setStaff] = useState<StaffAccount[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [username, setUsername] = useState("");
  const [uid, setUid] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Adding a hire.
  const [staffRole, setStaffRole] = useState<StaffRole>("teacher");
  const [staffUsername, setStaffUsername] = useState("");
  const [staffUid, setStaffUid] = useState("");
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffMessage, setStaffMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(() => {
    fetchStudentAccounts().then(setAccounts);
    fetchStaffAccounts().then(setStaff);
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
    const error = await revokeAccount(account.id);
    if (error) setMessage({ ok: false, text: error });
    else load();
  };

  const addStaff = async () => {
    setStaffBusy(true);
    setStaffMessage(null);

    const { error } = await linkStaffAccount(staffUid, staffUsername, staffRole);
    setStaffBusy(false);

    if (error) {
      setStaffMessage({ ok: false, text: error });
      return;
    }

    setStaffMessage({
      ok: true,
      text: `${normaliseUsername(staffUsername)} can now sign in as ${ROLE_LABEL[staffRole].toLowerCase()}.`,
    });
    setStaffUsername("");
    setStaffUid("");
    load();
  };

  const revokeStaff = async (account: StaffAccount) => {
    if (account.role === "admin") return;
    if (!window.confirm(`Remove ${account.username}'s access?`)) return;
    const error = await revokeAccount(account.id);
    if (error) setStaffMessage({ ok: false, text: error });
    else load();
  };

  const field =
    "w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500";
  const label = "block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1";

  const previewEmail = username.trim() ? usernameToEmail(username) : "<username>@students.fluence.local";
  const staffPreviewEmail = usernameToEmail(staffUsername.trim() || "<name>", staffRole);

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------------
          Staff.
          The list is read-only for everyone but the head — the database
          refuses a profiles write from anyone else, which is what stops a
          hire promoting themselves. Admin rows have no remove button at
          all: locking yourself out of your own institution should not be
          one mis-tap away.
          --------------------------------------------------------------- */}
      <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 space-y-3">
        <h5 className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
          <GraduationCap className="w-3.5 h-3.5" /> Staff {staff ? `(${staff.length})` : ""}
        </h5>

        <div className="space-y-1.5">
          {staff?.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2.5 bg-white border border-amber-200/70 rounded-xl px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <span className="block text-xs font-extrabold text-slate-700 truncate">
                  @{a.username}
                </span>
                <span className="text-[10px] font-bold text-amber-700">{ROLE_LABEL[a.role]}</span>
              </div>
              {a.role !== "admin" && (
                <button
                  onClick={() => void revokeStaff(a)}
                  aria-label={`Remove ${a.username}`}
                  className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          {staff?.length === 0 && (
            <p className="text-xs text-slate-400 font-semibold">No staff accounts yet.</p>
          )}
        </div>

        <details className="group">
          <summary className="text-[11px] font-black text-amber-800 uppercase tracking-wider cursor-pointer list-none">
            + Add a hire
          </summary>

          <div className="pt-3 space-y-3">
            <p className="text-[10px] text-amber-800 leading-relaxed">
              Create the login first at{" "}
              <a
                href={DASHBOARD_USERS}
                target="_blank"
                rel="noopener noreferrer"
                className="underline inline-flex items-center gap-0.5"
              >
                Authentication → Users <ExternalLink className="w-3 h-3" />
              </a>{" "}
              using <code className="bg-white px-1 rounded font-mono">{staffPreviewEmail}</code>, tick{" "}
              <strong>Auto Confirm User</strong>, then paste the UID here.
            </p>

            <div>
              <label className={label}>Role</label>
              <select
                className={field}
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value as StaffRole)}
              >
                <option value="teacher">Teacher — points, attendance, homework, teaching log</option>
                <option value="editor">Editor — the above plus roster, library and Park</option>
              </select>
              <p className="text-[10px] text-slate-400 font-semibold mt-1 leading-relaxed">
                Head of institution is not offered here. Promoting someone to that is done in the
                SQL editor, on purpose — it is not a thing to do by dropdown.
              </p>
            </div>

            <div>
              <label className={label}>Username</label>
              <input
                className={field}
                value={staffUsername}
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => setStaffUsername(e.target.value)}
                placeholder="jitesh"
              />
            </div>

            <div>
              <label className={label}>User UID from the dashboard</label>
              <input
                className={`${field} font-mono text-xs`}
                value={staffUid}
                autoCapitalize="none"
                spellCheck={false}
                onChange={(e) => setStaffUid(e.target.value)}
                placeholder="c8c12db5-0893-430f-97fc-195b416d0232"
              />
            </div>

            <button
              onClick={() => void addStaff()}
              disabled={staffBusy || staffUsername.trim().length < 3 || staffUid.trim().length < 10}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white font-black text-xs rounded-xl transition-all active:scale-95 cursor-pointer"
            >
              {staffBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Add staff account
            </button>

            {staffMessage && (
              <p
                className={`text-[11px] font-bold leading-relaxed ${
                  staffMessage.ok ? "text-emerald-700" : "text-red-600"
                }`}
              >
                {staffMessage.ok && <Check className="w-3.5 h-3.5 inline mr-1" />}
                {staffMessage.text}
              </p>
            )}
          </div>
        </details>
      </div>

      <h5 className="text-xs font-black text-slate-700 uppercase tracking-wider pt-1">Students</h5>

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
