"use client";

import { useCallback, useEffect, useState } from "react";
import { TaskDetail, TaskForm, type Meta } from "@/components/LmsBoard";

/**
 * The dashboard's task panel, usable outside the dashboard.
 *
 * The meeting page used to show a read-only table, so a task discussed in a
 * meeting couldn't be opened, commented on, approved or edited without going
 * to the dashboard and finding it again. This wraps the same `TaskDetail` the
 * board uses, with the same actions, so the two views behave identically
 * rather than drifting into two half-versions of the same thing.
 */
export default function TaskDetailModal({
  taskId,
  onClose,
  onChanged,
}: {
  taskId: string;
  onClose: () => void;
  /** Called after anything that changes the task, so the caller can refresh. */
  onChanged?: () => void;
}) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const [meta, setMeta] = useState<Meta | null>(null);
  const [task, setTask] = useState<any | null>(null);
  const [editing, setEditing] = useState(false);
  const [groupAssignees, setGroupAssignees] = useState<string[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const [mRes, tRes] = await Promise.all([
        fetch("/api/lms/meta"),
        fetch(`/api/lms/tasks/${taskId}`),
      ]);
      if (mRes.ok) setMeta(await mRes.json());
      if (!tRes.ok)
        throw new Error((await tRes.json().catch(() => null))?.error || "Couldn't load this task.");
      const d = await tRes.json();
      setTask(d.task);
      setGroupAssignees(d.groupAssignees ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load this task.");
    }
  }, [taskId]);

  useEffect(() => { void load(); }, [load]);

  const nameOf = useCallback(
    (email: string) =>
      meta?.allMembers.find((m) => m.email.toLowerCase() === email.toLowerCase())?.name ?? email,
    [meta],
  );
  const avatarOf = useCallback(
    (email: string) =>
      meta?.allMembers.find((m) => m.email.toLowerCase() === email.toLowerCase())?.avatar ?? null,
    [meta],
  );

  async function act(action: string, extra?: Record<string, unknown>) {
    setErr("");
    try {
      const r = await fetch(`/api/lms/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(extra ?? {}) }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || "That didn't work.");
      await load();
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That didn't work.");
    }
  }

  async function remove() {
    if (!window.confirm("Delete this task? This can't be undone.")) return;
    try {
      const r = await fetch(`/api/lms/tasks/${taskId}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || "Couldn't delete it.");
      onChanged?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't delete it.");
    }
  }

  if (err)
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
        <div className="rounded-2xl bg-paper p-6 text-sm text-ink/70" onClick={(e) => e.stopPropagation()}>
          {err}
        </div>
      </div>
    );

  if (!task || !meta) return null;

  if (editing)
    return (
      <TaskForm
        meta={meta}
        editing={task}
        editGroupAssignees={groupAssignees}
        onClose={() => setEditing(false)}
        onCreated={() => { setEditing(false); void load(); onChanged?.(); }}
      />
    );

  return (
    <TaskDetail
      task={task}
      myEmail={meta.me.email}
      meLead={meta.me.roles.lead || meta.me.roles.nmtLeader || meta.me.roles.vpp}
      nameOf={nameOf}
      avatarOf={avatarOf}
      onClose={onClose}
      onAction={act}
      onEdit={() => setEditing(true)}
      onDelete={remove}
      onComposeEmail={() => {}}
      onNudge={() => act("nudge")}
      nudgeLocked={false}
    />
  );
}
