"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Contours from "@/components/Contours";
import MeetingOutline, { type Block } from "@/components/MeetingOutline";

const GROUP_LABEL: Record<string, string> = {
  E: "Education", R: "Water & Sanitation", W: "Women's Empowerment", H: "Health",
};

type Meeting = {
  id: string; group: string; title: string; date: string | null;
  location: string; notetaker: string; snack: string;
  attendees: string[]; blocks: Block[]; createdBy: string;
};
type Task = { id: string; groupId: string; title: string; assigneeEmail: string; assigneeName: string; dueAt: string; status: string; archived: boolean };
type DirEntry = { loginEmail: string; name: string; group: string };

const STATUS_LABEL: Record<string, string> = { not_complete: "Not complete", pending: "Pending approval", complete: "Complete" };
const STATUS_STYLE: Record<string, string> = {
  not_complete: "bg-ink/8 text-ink/60", pending: "bg-marigold-soft/50 text-marigold-deep", complete: "bg-pine/15 text-pine-deep",
};

export default function MeetingPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();

  const [m, setM] = useState<Meeting | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"" | "saving" | "saved">("");
  const [dir, setDir] = useState<DirEntry[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);

  const load = useCallback(() => {
    return fetch(`/api/lms/meetings/${id}`)
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d?.error || "Couldn't load."); return d; })
      .then((d) => { setM(d.meeting); setTasks(d.tasks.filter((t: Task) => !t.archived)); setCanEdit(d.canEdit); setCanManage(d.canManage); })
      .catch((e) => setError(e instanceof Error ? e.message : "Something went wrong."))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch("/api/lms/directory").then((r) => (r.ok ? r.json() : null)).then((d) => d && setDir(d.entries)).catch(() => {}); }, []);

  // ---- autosave (debounced) ----
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback((patch: Partial<Meeting>) => {
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const body: Record<string, unknown> = { ...patch };
        await fetch(`/api/lms/meetings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        setSaveState("saved"); setTimeout(() => setSaveState((s) => (s === "saved" ? "" : s)), 1500);
      } catch { setSaveState(""); }
    }, 700);
  }, [id]);

  const update = (patch: Partial<Meeting>) => { setM((cur) => (cur ? { ...cur, ...patch } : cur)); save(patch); };

  if (loading) return <Shell><p className="text-ink/50">Loading…</p></Shell>;
  if (error || !m) return <Shell><p className="text-red-600">{error ?? "Not found."}</p></Shell>;

  const label = GROUP_LABEL[m.group] ?? m.group;
  const groupMembers = dir.filter((d) => d.group === label);
  const nameOf = (email: string) => dir.find((d) => d.loginEmail === email.toLowerCase())?.name ?? email;
  const nonAttendees = groupMembers.filter((d) => !m.attendees.includes(d.loginEmail));

  return (
    <>
      <section className="relative overflow-hidden bg-pine pt-[var(--header-h)] text-paper">
        <Contours className="absolute inset-0 h-full w-full text-paper" opacity={0.12} />
        <div className="container-rishi relative z-10 py-10">
          <div className="flex items-center justify-between">
            <Link href={`/dashboard/meetings/g/${m.group}`} className="inline-flex items-center gap-2 text-sm font-semibold text-paper/80 hover:text-paper">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
              {label} meetings
            </Link>
            {saveState && <span className="text-xs text-paper/60">{saveState === "saving" ? "Saving…" : "Saved"}</span>}
          </div>
          {canEdit ? (
            <input value={m.title} onChange={(e) => update({ title: e.target.value })} placeholder="Meeting title"
              className="mt-4 w-full bg-transparent font-display text-4xl font-semibold text-paper outline-none placeholder:text-paper/40 sm:text-5xl" />
          ) : (
            <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">{m.title || "Untitled meeting"}</h1>
          )}
        </div>
      </section>

      <section className="container-rishi max-w-4xl py-8">
        {/* ---- header details ---- */}
        <div className="grid gap-4 rounded-3xl border border-pine/12 bg-pine/[0.02] p-6 sm:grid-cols-2">
          <Field label="Date">
            {canEdit ? <input type="date" value={m.date ?? ""} onChange={(e) => update({ date: e.target.value })} className="field" />
              : <span className="text-ink/80">{m.date ? new Date(m.date + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "—"}</span>}
          </Field>
          <Field label="Location / call link">
            {canEdit ? <input value={m.location} onChange={(e) => update({ location: e.target.value })} placeholder="In person / link" className="field" />
              : <span className="text-ink/80">{m.location || "—"}</span>}
          </Field>
          <Field label="Notetaker">
            {canEdit ? <input value={m.notetaker} onChange={(e) => update({ notetaker: e.target.value })} placeholder="Who's taking notes" className="field" />
              : <span className="text-ink/80">{m.notetaker || "—"}</span>}
          </Field>
          <Field label="Snack pledge">
            {canEdit ? <input value={m.snack} onChange={(e) => update({ snack: e.target.value })} placeholder="Who's bringing snacks" className="field" />
              : <span className="text-ink/80">{m.snack || "—"}</span>}
          </Field>
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Attendees</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {m.attendees.length === 0 && <span className="text-sm text-ink/40">None yet</span>}
              {m.attendees.map((e) => (
                <span key={e} className="inline-flex items-center gap-1 rounded-full bg-pine/10 px-3 py-1 text-xs font-medium text-pine-deep">
                  {nameOf(e)}
                  {canEdit && <button onClick={() => update({ attendees: m.attendees.filter((x) => x !== e) })} className="text-pine-deep/50 hover:text-pine-deep">✕</button>}
                </span>
              ))}
              {canEdit && nonAttendees.length > 0 && (
                <select value="" onChange={(e) => { if (e.target.value) update({ attendees: [...m.attendees, e.target.value] }); }}
                  className="rounded-full border border-pine/20 bg-paper px-3 py-1 text-xs text-pine-deep outline-none">
                  <option value="">+ Add attendee</option>
                  {nonAttendees.map((d) => <option key={d.loginEmail} value={d.loginEmail}>{d.name}</option>)}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* ---- agenda + notes outline ---- */}
        <div className="mt-8">
          <h2 className="font-display text-2xl font-semibold text-pine-deep">Agenda & notes</h2>
          <div className="mt-3 rounded-3xl border border-pine/12 bg-paper p-6">
            <MeetingOutline blocks={m.blocks} editable={canEdit} onChange={(next) => update({ blocks: next })} />
          </div>
          {!canEdit && <p className="mt-2 text-xs text-ink/40">Only {label} members can edit this meeting.</p>}
        </div>

        {/* ---- tasks (real dashboard tasks) ---- */}
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold text-pine-deep">Tasks</h2>
            {canManage && (
              <button onClick={() => setAssignOpen(true)} className="rounded-full bg-pine px-4 py-2 text-sm font-semibold text-paper hover:bg-pine-deep">
                + Assign task
              </button>
            )}
          </div>
          <div className="mt-3 overflow-hidden rounded-3xl border border-pine/12">
            {tasks.length === 0 ? (
              <p className="p-6 text-sm text-ink/45">No tasks assigned from this meeting yet.{canManage ? " Use “Assign task” to create real dashboard tasks that everyone tracks." : ""}</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-pine/10 bg-pine/[0.03] text-xs uppercase tracking-wide text-ink/50">
                  <th className="px-4 py-3 font-semibold">Task</th><th className="px-4 py-3 font-semibold">Assigned to</th>
                  <th className="px-4 py-3 font-semibold">Due</th><th className="px-4 py-3 font-semibold">Status</th>
                </tr></thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id} className="border-b border-pine/8">
                      <td className="px-4 py-3 font-medium text-ink">{t.title}</td>
                      <td className="px-4 py-3 text-ink/70">{t.assigneeName}</td>
                      <td className="px-4 py-3 text-ink/70">{new Date(t.dueAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                      <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[t.status] ?? "bg-ink/8"}`}>{STATUS_LABEL[t.status] ?? t.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {tasks.length > 0 && <p className="mt-2 text-xs text-ink/40">These are live dashboard tasks — statuses update as people submit and get approved.</p>}
        </div>

        {canManage && (
          <div className="mt-10 border-t border-pine/10 pt-5">
            <button onClick={async () => {
              if (!confirm("Delete this meeting? This can't be undone. (Tasks assigned from it stay in the task system.)")) return;
              const r = await fetch(`/api/lms/meetings/${id}`, { method: "DELETE" });
              if (r.ok) router.push(`/dashboard/meetings/g/${m.group}`); else alert("Couldn't delete.");
            }} className="text-sm font-semibold text-red-500 hover:text-red-600">Delete meeting</button>
          </div>
        )}
      </section>

      {assignOpen && (
        <AssignModal group={m.group} groupMembers={groupMembers} onClose={() => setAssignOpen(false)}
          onDone={() => { setAssignOpen(false); load(); }} meetingId={id} />
      )}

      <style jsx>{`.field { width: 100%; border-radius: 0.75rem; border: 1px solid rgba(20,54,40,0.15); padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; background: #fff; }`}</style>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><p className="text-xs font-semibold uppercase tracking-wide text-ink/45">{label}</p><div className="mt-1">{children}</div></div>);
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <section className="bg-pine pt-[var(--header-h)]"><div className="container-rishi py-10"><Link href="/dashboard/meetings" className="text-sm font-semibold text-paper/80 hover:text-paper">← Meetings</Link></div></section>
      <section className="container-rishi py-10">{children}</section>
    </>
  );
}

function AssignModal({ group, groupMembers, meetingId, onClose, onDone }: {
  group: string; groupMembers: DirEntry[]; meetingId: string; onClose: () => void; onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!title.trim()) return setErr("Add a task title.");
    if (picked.length === 0) return setErr("Pick at least one person.");
    if (!due) return setErr("Pick a due date.");
    setBusy(true);
    try {
      const r = await fetch("/api/lms/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, assigneeEmails: picked, dueAt: new Date(due).toISOString(), meetingId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Couldn't assign.");
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't assign."); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[1100] grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-paper p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl font-semibold text-pine-deep">Assign a task</h3>
        <p className="mt-1 text-xs text-ink/50">Creates a real dashboard task linked to this meeting.</p>
        <label className="mt-4 block"><span className="text-xs font-semibold uppercase tracking-wide text-ink/50">Task</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" className="mt-1.5 w-full rounded-xl border border-pine/20 px-4 py-2.5 text-sm outline-none focus:border-pine" /></label>
        <div className="mt-3"><span className="text-xs font-semibold uppercase tracking-wide text-ink/50">Assign to</span>
          <div className="mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-pine/15 p-2">
            {groupMembers.length === 0 && <p className="p-2 text-xs text-ink/40">No members found for this group.</p>}
            {groupMembers.map((d) => (
              <label key={d.loginEmail} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-pine/5">
                <input type="checkbox" checked={picked.includes(d.loginEmail)}
                  onChange={(e) => setPicked((p) => e.target.checked ? [...p, d.loginEmail] : p.filter((x) => x !== d.loginEmail))} />
                {d.name}
              </label>
            ))}
          </div>
        </div>
        <label className="mt-3 block"><span className="text-xs font-semibold uppercase tracking-wide text-ink/50">Due</span>
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="mt-1.5 w-full rounded-xl border border-pine/20 px-4 py-2.5 text-sm outline-none focus:border-pine" /></label>
        {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-pine/20 px-4 py-2 text-sm font-semibold text-pine-deep hover:bg-pine/5">Cancel</button>
          <button onClick={submit} disabled={busy} className="rounded-full bg-pine px-5 py-2 text-sm font-semibold text-paper hover:bg-pine-deep disabled:opacity-60">{busy ? "Assigning…" : "Assign"}</button>
        </div>
      </div>
    </div>
  );
}
