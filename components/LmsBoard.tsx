"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import RichTextEditor from "@/components/editor/RichTextEditor";
import MessageComposer from "@/components/MessageComposer";

// ----- types mirrored from the API JSON -----
type Group = "E" | "R" | "W" | "H";
const GROUP_LABEL: Record<Group, string> = {
  E: "Education",
  R: "Water & Sanitation",
  W: "Women's Empowerment",
  H: "Health",
};
type Roles = {
  nmtLeader: boolean; newbie: boolean; lead: boolean;
  internal: boolean; vpp: boolean; exec: boolean;
};
type Lite = { email: string; name: string; group: Group; avatar?: string | null };
export type Meta = {
  me: { email: string; name: string; group: Group; roles: Roles };
  can: { assignTasks: boolean; createEvents: boolean };
  assignableMembers: Lite[];
  assignScopes: Array<"members" | "group" | "club">;
  assignableGroups: Group[];
  eventScopes: Array<"members" | "group" | "club" | "all_newbies">;
  targetableGroups: Group[];
  eventMemberTargets: Lite[];
  allMembers: Lite[];
};
type EmailTemplate = { subject: string; bodyHtml: string };
type HistoryAction = "created" | "submitted" | "approved" | "rejected" | "unmarked" | "edited" | "nudged";
type HistoryEntry = { id: string; action: HistoryAction; actorEmail: string; at: string; note?: string };
type Comment = { id: string; authorEmail: string; body: string; at: string; parentId: string | null };
type Task = {
  id: string; groupId: string; title: string; description: string; tags: string[];
  dueAt: string; requiresFile: boolean; requireSubmission: boolean; assignerEmail: string;
  assigneeEmail: string; status: "not_complete" | "pending" | "complete";
  submittedAt: string | null; submissionText: string | null; submissionLink: string | null;
  history: HistoryEntry[]; comments: Comment[]; archived: boolean; createdAt: string;
  canManage?: boolean; emailTemplate?: EmailTemplate | null; ccEmails?: string[];
};
type ClubEvent = {
  id: string; title: string; description: string; startAt: string;
  endAt: string | null; allDay: boolean; creatorEmail: string;
  scopeKind: "members" | "group" | "club" | "all_newbies";
  scopeEmails: string[]; scopeGroups: Group[]; archived: boolean; createdAt: string; canManage?: boolean;
};

const SCOPE_LABEL: Record<Meta["eventScopes"][number], string> = {
  members: "Specific members",
  group: "A project group",
  club: "The whole club",
  all_newbies: "All newbies",
};

const HISTORY_LABEL: Record<HistoryAction, string> = {
  created: "Created",
  submitted: "Marked done by doer",
  approved: "Approved as complete",
  rejected: "Completion rejected",
  unmarked: "Unmarked as complete",
  nudged: "Reminder sent",
  edited: "Edited",
};

// Group task copies that were created together (same groupId).
type TaskGroup = { key: string; rows: Task[]; head: Task };
function groupByBatch(rows: Task[]): TaskGroup[] {
  const m = new Map<string, Task[]>();
  for (const t of rows) {
    const k = t.groupId || t.id;
    const arr = m.get(k);
    if (arr) arr.push(t); else m.set(k, [t]);
  }
  return Array.from(m.entries()).map(([key, r]) => ({ key, rows: r, head: r[0] }));
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
const fmtDateOnly = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const toDateInput = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const CAL_EVENT = { bg: "rgba(91,124,106,0.30)", fg: "#143628" };
const CAL_TO = { bg: "rgba(226,160,47,0.40)", fg: "#5c3d00" };
const CAL_BY = { bg: "rgba(70,107,176,0.28)", fg: "#1c3559" };
const taskKind = (t: Task, email: string): "to" | "by" =>
  t.assigneeEmail.toLowerCase() === email.toLowerCase() ? "to" : "by";

// ---- Full Club Overview (P/VP) ----
type TimeWindow = "day" | "week" | "month" | "all";
// Is an item's date within the selected window, anchored on today?
function inTimeWindow(iso: string, window: TimeWindow): boolean {
  if (window === "all") return true;
  const d = new Date(iso);
  const now = new Date();
  if (window === "day")
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (window === "month")
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  // week: Sunday..Saturday containing today
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(now.getDate() - now.getDay());
  const end = new Date(start); end.setDate(start.getDate() + 7);
  return d >= start && d < end;
}
// An event has "passed" once its end (or start, if no end) is in the past.
function eventHasPassed(e: { startAt: string; endAt?: string | null; allDay?: boolean }): boolean {
  const end = new Date(e.endAt || e.startAt);
  if (e.allDay) { end.setHours(23, 59, 59, 999); }
  return end.getTime() < Date.now();
}
// "Active" = outstanding. A task is outstanding until it's complete or archived;
// an event is outstanding until it has passed or been archived. "All" = no filter.
// Both are additionally constrained to the selected time window.
function taskPasses(t: { archived: boolean; status: string; dueAt: string }, archive: "active" | "all", period: TimeWindow): boolean {
  const outstanding = !t.archived && t.status !== "complete";
  return (archive === "all" || outstanding) && inTimeWindow(t.dueAt, period);
}
function eventPasses(e: { archived: boolean; startAt: string; endAt?: string | null; allDay?: boolean }, archive: "active" | "all", period: TimeWindow): boolean {
  const outstanding = !e.archived && !eventHasPassed(e);
  return (archive === "all" || outstanding) && inTimeWindow(e.startAt, period);
}
type Lane = "E" | "R" | "W" | "H" | "NMT" | "OTHER";
type OTask = Task & { lane: Lane; canManage?: boolean };
type OEvent = ClubEvent & { lane: Lane; canManage?: boolean };
type Overview = {
  tasks: OTask[];
  events: OEvent[];
  members: Record<string, { name: string; group: Group; avatar: string | null }>;
};
const LANE_ORDER: Lane[] = ["E", "R", "W", "H", "NMT", "OTHER"];
const LANE_LABEL: Record<Lane, string> = {
  E: "Education", R: "Water & Sanitation", W: "Women's Empowerment", H: "Health",
  NMT: "New Member Training", OTHER: "Other",
};
const LANE_COLOR: Record<Lane, { bg: string; fg: string; dot: string }> = {
  E: { bg: "rgba(226,160,47,0.40)", fg: "#5c3d00", dot: "#e2a02f" },
  R: { bg: "rgba(70,107,176,0.30)", fg: "#1c3559", dot: "#466bb0" },
  W: { bg: "rgba(150,90,160,0.30)", fg: "#48214f", dot: "#965aa0" },
  H: { bg: "rgba(193,84,96,0.28)", fg: "#5c2230", dot: "#c15460" },
  NMT: { bg: "rgba(91,124,106,0.34)", fg: "#143628", dot: "#5b7c6a" },
  OTHER: { bg: "rgba(60,60,60,0.16)", fg: "#333333", dot: "#777777" },
};

async function api(url: string, opts?: RequestInit) {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Something went wrong");
  return data;
}

export default function LmsBoard() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<ClubEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [composeTask, setComposeTask] = useState<Task | null>(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingEvent, setEditingEvent] = useState<ClubEvent | null>(null);
  const [showPastTasks, setShowPastTasks] = useState(false);
  const [showPastEvents, setShowPastEvents] = useState(false);
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [overviewGroupKey, setOverviewGroupKey] = useState<string | null>(null);
  const [detailEventId, setDetailEventId] = useState<string | null>(null);
  const [overviewOn, setOverviewOn] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [ovArchive, setOvArchive] = useState<"active" | "all">("active");
  const [ovWindow, setOvWindow] = useState<TimeWindow>("all");
  const [myArchive, setMyArchive] = useState<"active" | "all">("active");
  const [myWindow, setMyWindow] = useState<TimeWindow>("all");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [calConnected, setCalConnected] = useState(false);
  const calConnectedRef = useRef(false);
  useEffect(() => { calConnectedRef.current = calConnected; }, [calConnected]);

  const runSync = useCallback(async (announce: boolean) => {
    setSyncing(true);
    if (announce) setSyncMsg(null);
    try {
      const r = await api("/api/lms/gcal/sync", { method: "POST" });
      if (announce) setSyncMsg(`Synced ${r.total} item${r.total === 1 ? "" : "s"} to your Google Calendar.`);
    } catch (err) {
      const m = (err as Error).message;
      if (m === "calendar_not_connected") { setCalConnected(false); }
      else if (m === "calendar_permission") {
        setCalConnected(false);
        setSyncMsg("Google Calendar access expired. Click Connect to reconnect.");
      } else if (announce) setSyncMsg("Sync failed — please try again in a moment.");
    } finally {
      setSyncing(false);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [m, t, e] = await Promise.all([
        api("/api/lms/meta"),
        api("/api/lms/tasks"),
        api("/api/lms/events"),
      ]);
      setMeta(m); setTasks(t.tasks); setEvents(e.events); setError(null);
      if (calConnectedRef.current) runSync(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [runSync]);

  useEffect(() => { load(); }, [load]);

  // Full Club Overview (P/VP only): (re)fetch whenever it's on and data changes.
  const loadOverview = useCallback(async () => {
    try { setOverview(await api("/api/lms/overview")); }
    catch { setOverview(null); }
  }, []);
  useEffect(() => { if (overviewOn) loadOverview(); }, [overviewOn, tasks, events, loadOverview]);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const flag = params.get("calendar");
      if (flag) {
        window.history.replaceState({}, "", window.location.pathname);
        if (flag === "error") setSyncMsg("Google Calendar wasn't connected. Please try again.");
      }
      try {
        const s = await api("/api/lms/gcal/status");
        setCalConnected(s.connected);
        if (s.connected || flag === "connected") {
          setCalConnected(true);
          await runSync(flag === "connected");
        }
      } catch { /* not signed in / no status */ }
    })();
  }, [runSync]);

  const myEmail = meta?.me.email ?? "";
  const nameOf = useCallback(
    (email: string) =>
      meta?.allMembers.find((m) => m.email.toLowerCase() === email.toLowerCase())?.name ??
      overview?.members[email.toLowerCase()]?.name ?? email,
    [meta, overview]
  );
  const avatarOf = useCallback(
    (email: string) =>
      meta?.allMembers.find((m) => m.email.toLowerCase() === email.toLowerCase())?.avatar ??
      overview?.members[email.toLowerCase()]?.avatar ?? null,
    [meta, overview]
  );

  const assignedToMe = useMemo(
    () => tasks.filter((t) => t.assigneeEmail.toLowerCase() === myEmail.toLowerCase()),
    [tasks, myEmail]
  );
  const activeToMe = useMemo(
    () => assignedToMe.filter((t) => taskPasses(t, myArchive, myWindow)).sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    [assignedToMe, myArchive, myWindow]
  );
  const activeByMeGroups = useMemo(() => {
    const rows = tasks.filter(
      (t) => t.assignerEmail.toLowerCase() === myEmail.toLowerCase()
        && t.assigneeEmail.toLowerCase() !== myEmail.toLowerCase()
    );
    return groupByBatch(rows).filter((g) => g.rows.some((r) => taskPasses(r, myArchive, myWindow)));
  }, [tasks, myEmail, myArchive, myWindow]);
  // Tasks assigned by my CO-LEADS / CO-NMT to other people (visible via shared control).
  const coLeadGroups = useMemo(() => {
    const rows = tasks.filter(
      (t) => t.assignerEmail.toLowerCase() !== myEmail.toLowerCase()
        && t.assigneeEmail.toLowerCase() !== myEmail.toLowerCase()
    );
    return groupByBatch(rows).filter((g) => g.rows.some((r) => taskPasses(r, myArchive, myWindow)));
  }, [tasks, myEmail, myArchive, myWindow]);
  const pastTaskGroups = useMemo(
    () => groupByBatch(tasks)
      .filter((g) => g.rows.every((r) => r.status === "complete" || r.archived))
      .sort((a, b) => (b.head.submittedAt ?? b.head.dueAt).localeCompare(a.head.submittedAt ?? a.head.dueAt)),
    [tasks]
  );
  const pastTaskCount = useMemo(() => pastTaskGroups.reduce((n, g) => n + g.rows.length, 0), [pastTaskGroups]);

  const upcomingEvents = useMemo(
    () => events.filter((e) => eventPasses(e, myArchive, myWindow)).sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [events, myArchive, myWindow]
  );
  const pastEvents = useMemo(
    () => events.filter((e) => e.archived || eventHasPassed(e)).sort((a, b) => b.startAt.localeCompare(a.startAt)),
    [events]
  );

  const openGroupRows = useMemo(
    () => (openGroupKey ? tasks.filter((t) => (t.groupId || t.id) === openGroupKey) : []),
    [tasks, openGroupKey]
  );
  const overviewGroupRows = useMemo(
    () => (overviewGroupKey ? (overview?.tasks ?? []).filter((t) => (t.groupId || t.id) === overviewGroupKey) : []),
    [overview, overviewGroupKey]
  );
  const detailTask = useMemo(
    () => tasks.find((t) => t.id === detailTaskId) ?? overview?.tasks.find((t) => t.id === detailTaskId) ?? null,
    [tasks, overview, detailTaskId]
  );
  const detailEvent = useMemo(
    () => events.find((e) => e.id === detailEventId) ?? overview?.events.find((e) => e.id === detailEventId) ?? null,
    [events, overview, detailEventId]
  );
  // All assignees currently on the group of the task being edited (for multi-assignee edit).
  const editingGroupAssignees = useMemo(() => {
    if (!editingTask) return [];
    const key = editingTask.groupId || editingTask.id;
    const pool = [...tasks, ...(overview?.tasks ?? [])];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of pool) {
      if ((t.groupId || t.id) === key && !seen.has(t.id)) { seen.add(t.id); out.push(t.assigneeEmail); }
    }
    return Array.from(new Set(out));
  }, [editingTask, tasks, overview]);

  // ---- task actions ----
  const callTask = useCallback(async (taskId: string, body: Record<string, unknown>) => {
    await api(`/api/lms/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(body) });
    await load();
  }, [load]);

  async function act(taskId: string, action: string, extra?: Record<string, unknown>) {
    try { await callTask(taskId, { action, ...(extra ?? {}) }); }
    catch (err) { alert((err as Error).message); }
  }
  const [nudgeToast, setNudgeToast] = useState<string | null>(null);
  const [nudgeLockedIds, setNudgeLockedIds] = useState<string[]>([]);
  async function nudge(taskId: string, personName: string) {
    if (nudgeLockedIds.includes(taskId)) return; // already nudged in the last few seconds
    setNudgeLockedIds((ids) => [...ids, taskId]);
    const unlock = () => setNudgeLockedIds((ids) => ids.filter((x) => x !== taskId));
    try {
      await api(`/api/lms/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ action: "nudge" }) });
      const msg = `${personName} has been nudged!`;
      setNudgeToast(msg);
      setTimeout(() => setNudgeToast((t) => (t === msg ? null : t)), 1200); // popup auto-hides after ~1s
      load(); // refresh so the new activity-log entry shows
      setTimeout(unlock, 5000); // keep the button disabled ~5s to prevent spam
    } catch (err) {
      alert((err as Error).message);
      unlock();
    }
  }
  async function archiveGroup(rows: Task[], archived: boolean) {
    try {
      await Promise.all(rows.map((r) =>
        api(`/api/lms/tasks/${r.id}`, { method: "PATCH", body: JSON.stringify({ action: archived ? "archive" : "unarchive" }) })
      ));
      await load();
    } catch (err) { alert((err as Error).message); }
  }
  async function archiveEvent(eventId: string, archived: boolean) {
    try {
      await api(`/api/lms/events/${eventId}`, { method: "PATCH", body: JSON.stringify({ action: archived ? "archive" : "unarchive" }) });
      await load();
    } catch (err) { alert((err as Error).message); }
  }
  async function removeTask(taskId: string) {
    if (!confirm("Delete this task? This can't be undone.")) return;
    try { await api(`/api/lms/tasks/${taskId}`, { method: "DELETE" }); await load(); setDetailTaskId(null); }
    catch (err) { alert((err as Error).message); }
  }
  async function removeEvent(eventId: string) {
    if (!confirm("Delete this event? This can't be undone.")) return;
    try { await api(`/api/lms/events/${eventId}`, { method: "DELETE" }); await load(); setDetailEventId(null); }
    catch (err) { alert((err as Error).message); }
  }

  async function syncGoogleCalendar() { await runSync(true); }
  function connectGoogleCalendar() { window.location.href = "/api/lms/gcal/connect"; }
  async function unsyncGoogleCalendar() {
    if (!confirm("Stop syncing and remove the synced items from your Google Calendar?")) return;
    setSyncing(true); setSyncMsg(null);
    try {
      await api("/api/lms/gcal/disconnect", { method: "POST" });
      setCalConnected(false);
      setSyncMsg("Disconnected. Your Google Calendar will no longer update.");
    } catch { setSyncMsg("Couldn't disconnect — please try again."); }
    finally { setSyncing(false); }
  }

  if (loading) return <p className="text-sm text-ink/50">Loading your dashboard…</p>;
  if (error)
    return (
      <div className="rounded-2xl border border-marigold-deep/30 bg-marigold-soft/20 p-5 text-sm text-ink/80">
        {error === "Not authorized" ? "Please sign in to view your tasks and events." : error}
      </div>
    );
  if (!meta) return null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button onClick={() => setOverviewOn((v) => !v)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${overviewOn ? "bg-pine text-paper" : "border border-pine/25 text-pine-deep hover:bg-pine/5"}`}>
          {overviewOn ? "✓ Full Club Overview" : "Full Club Overview"}
        </button>
        <div className="flex gap-2">
          {meta.can.assignTasks && (
            <button onClick={() => setShowTaskForm(true)} className="btn-primary text-sm">+ Assign task</button>
          )}
          {meta.can.createEvents && (
            <button onClick={() => setShowEventForm(true)} className="btn-accent text-sm">+ Create event</button>
          )}
        </div>
      </div>

      {overviewOn && overview && (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <SegToggle label="Show" value={ovArchive} onChange={(v) => setOvArchive(v as "active" | "all")}
            options={[["active", "Active"], ["all", "All"]]} />
          <SegToggle label="Period" value={ovWindow} onChange={(v) => setOvWindow(v as TimeWindow)}
            options={[["day", "Day"], ["week", "Week"], ["month", "Month"], ["all", "All time"]]} />
        </div>
      )}

      {!overviewOn && (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <SegToggle label="Show" value={myArchive} onChange={(v) => setMyArchive(v as "active" | "all")}
            options={[["active", "Active"], ["all", "All"]]} />
          <SegToggle label="Period" value={myWindow} onChange={(v) => setMyWindow(v as TimeWindow)}
            options={[["day", "Day"], ["week", "Week"], ["month", "Month"], ["all", "All time"]]} />
        </div>
      )}

      <div className="mt-8">
        {overviewOn && overview ? (
          <ClubCalendar tasks={overview.tasks} events={overview.events} archive={ovArchive} period={ovWindow}
            onOpenTaskGroup={(gid) => setOverviewGroupKey(gid)} onOpenEvent={(id) => setDetailEventId(id)} />
        ) : (
          <CalendarMonth tasks={tasks} events={events} myEmail={myEmail} archive={myArchive} period={myWindow}
            onOpenTask={(id) => setDetailTaskId(id)} onOpenEvent={(id) => setDetailEventId(id)} />
        )}
      </div>
      {overviewOn && !overview && <p className="mt-3 text-sm text-ink/50">Loading the full club view…</p>}

      {!overviewOn && (<>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button onClick={() => setShowPastTasks(true)} className="btn-ghost text-sm">Past tasks ({pastTaskCount})</button>
        <button onClick={() => setShowPastEvents(true)} className="btn-ghost text-sm">Past events ({pastEvents.length})</button>
        {calConnected ? (
          <>
            <button onClick={syncGoogleCalendar} disabled={syncing} className="btn-ghost text-sm disabled:opacity-60">
              {syncing ? "Syncing…" : "Sync now"}
            </button>
            <button onClick={unsyncGoogleCalendar} disabled={syncing} className="btn-accent text-sm disabled:opacity-60">
              Unsync from Google Calendar
            </button>
          </>
        ) : (
          <button onClick={connectGoogleCalendar} className="btn-accent text-sm">Connect Google Calendar</button>
        )}
      </div>
      {syncMsg && <p className="mt-2 text-sm text-ink/60">{syncMsg}</p>}

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section>
          <h3 className="font-display text-xl font-semibold text-pine-deep">My tasks</h3>
          <div className="mt-4 space-y-3">
            {activeToMe.length === 0 && <Empty>No active tasks assigned to you. Nice.</Empty>}
            {activeToMe.map((t) => (
              <TaskRow key={t.id} task={t} role="assignee" onOpen={() => setDetailTaskId(t.id)}
                onComposeEmail={() => setComposeTask(t)} />
            ))}
          </div>

          {activeByMeGroups.length > 0 && (
            <>
              <h3 className="mt-8 font-display text-xl font-semibold text-pine-deep">Assigned by me</h3>
              <div className="mt-4 space-y-3">
                {activeByMeGroups.map((g) =>
                  g.rows.length === 1 ? (
                    <TaskRow key={g.key} task={g.rows[0]} role="assigner"
                      assigneeName={nameOf(g.rows[0].assigneeEmail)} assigneeAvatar={avatarOf(g.rows[0].assigneeEmail)}
                      onOpen={() => setDetailTaskId(g.rows[0].id)} />
                  ) : (
                    <GroupCard key={g.key} group={g} onOpen={() => setOpenGroupKey(g.key)}
                      onArchive={() => archiveGroup(g.rows, true)} />
                  )
                )}
              </div>
            </>
          )}

          {coLeadGroups.length > 0 && (
            <>
              <h3 className="mt-8 font-display text-xl font-semibold text-pine-deep">
                Assigned by my co-leads
              </h3>
              <p className="mt-1 text-xs text-ink/50">
                Tasks assigned by the other lead(s) of your project group or your co-NMT leaders. You have full control over these.
              </p>
              <div className="mt-4 space-y-3">
                {coLeadGroups.map((g) =>
                  g.rows.length === 1 ? (
                    <TaskRow key={g.key} task={g.rows[0]} role="assigner"
                      assigneeName={nameOf(g.rows[0].assigneeEmail)} assigneeAvatar={avatarOf(g.rows[0].assigneeEmail)}
                      byline={`by ${nameOf(g.rows[0].assignerEmail)}`}
                      onOpen={() => setDetailTaskId(g.rows[0].id)} />
                  ) : (
                    <GroupCard key={g.key} group={g} byline={`by ${nameOf(g.head.assignerEmail)}`}
                      onOpen={() => setOpenGroupKey(g.key)} onArchive={() => archiveGroup(g.rows, true)} />
                  )
                )}
              </div>
            </>
          )}
        </section>

        <section>
          <h3 className="font-display text-xl font-semibold text-pine-deep">Events</h3>
          <div className="mt-4 space-y-3">
            {upcomingEvents.length === 0 && <Empty>No upcoming events.</Empty>}
            {upcomingEvents.map((e) => (
              <EventRow key={e.id} event={e} onOpen={() => setDetailEventId(e.id)} />
            ))}
          </div>
        </section>
      </div>
      </>)}

      {overviewOn && overview && (
        <ClubOverviewLists tasks={overview.tasks} events={overview.events} archive={ovArchive} period={ovWindow}
          nameOf={nameOf} onOpenTask={(id) => setDetailTaskId(id)} onOpenEvent={(id) => setDetailEventId(id)} />
      )}

      {(showTaskForm || editingTask) && (
        <TaskForm meta={meta} editing={editingTask} editGroupAssignees={editingGroupAssignees}
          onClose={() => { setShowTaskForm(false); setEditingTask(null); }}
          onCreated={() => { setShowTaskForm(false); setEditingTask(null); load(); }} />
      )}

      {composeTask && composeTask.emailTemplate && (
        <MessageComposer
          initialMode="email"
          prefill={{
            subject: composeTask.emailTemplate.subject,
            bodyHtml: composeTask.emailTemplate.bodyHtml,
            cc: composeTask.ccEmails ?? [],
          }}
          onClose={() => setComposeTask(null)}
          onPosted={() => setComposeTask(null)}
        />
      )}
      {(showEventForm || editingEvent) && (
        <EventForm meta={meta} editing={editingEvent} onClose={() => { setShowEventForm(false); setEditingEvent(null); }}
          onCreated={() => { setShowEventForm(false); setEditingEvent(null); load(); }} />
      )}

      {detailTask && (
        <TaskDetail task={detailTask} myEmail={myEmail} nameOf={nameOf} avatarOf={avatarOf}
          onClose={() => setDetailTaskId(null)}
          onAction={(action, extra) => act(detailTask.id, action, extra)}
          onEdit={() => { setEditingTask(detailTask); setDetailTaskId(null); }}
          onDelete={() => removeTask(detailTask.id)}
          onComposeEmail={detailTask.emailTemplate ? () => setComposeTask(detailTask) : undefined}
          onNudge={() => nudge(detailTask.id, nameOf(detailTask.assigneeEmail))}
          nudgeLocked={nudgeLockedIds.includes(detailTask.id)} />
      )}

      {nudgeToast && (
        <div className="fixed bottom-24 left-1/2 z-[1200] -translate-x-1/2 animate-in rounded-full bg-pine px-5 py-2.5 text-sm font-semibold text-paper shadow-xl">
          {nudgeToast}
        </div>
      )}

      {detailEvent && (
        <EventDetail event={detailEvent} nameOf={nameOf}
          onClose={() => setDetailEventId(null)}
          onEdit={detailEvent.canManage ? () => { setEditingEvent(detailEvent); setDetailEventId(null); } : undefined}
          onArchive={detailEvent.canManage ? () => { archiveEvent(detailEvent.id, !detailEvent.archived); setDetailEventId(null); } : undefined}
          onDelete={detailEvent.canManage ? () => removeEvent(detailEvent.id) : undefined} />
      )}

      {showPastTasks && (
        <Modal title="Past tasks" onClose={() => setShowPastTasks(false)}>
          {pastTaskGroups.length === 0 ? (
            <p className="text-sm text-ink/50">No completed or archived tasks yet.</p>
          ) : (
            <div className="space-y-2">
              {pastTaskGroups.map((g) => {
                const t = g.head;
                const multi = g.rows.length > 1;
                const doneCount = g.rows.filter((r) => r.status === "complete").length;
                const anyArchived = g.rows.some((r) => r.archived);
                const late = !multi && t.submittedAt && new Date(t.submittedAt) > new Date(t.dueAt);
                return (
                  <div key={g.key} className="rounded-xl border border-pine/12 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => { if (!multi) { setDetailTaskId(t.id); setShowPastTasks(false); } else { setOpenGroupKey(g.key); setShowPastTasks(false); } }}
                        className="text-left font-medium text-ink hover:underline">{t.title}</button>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ backgroundColor: anyArchived ? "rgba(27,38,32,0.08)" : CAL_TO.bg, color: anyArchived ? "#1B2620" : CAL_TO.fg }}>
                        {anyArchived ? "Archived" : "Complete"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink/50">
                      {multi
                        ? `Assigned to ${g.rows.length} people · ${doneCount} complete`
                        : <>Due {fmtDateTime(t.dueAt)}{t.submittedAt && <span className={late ? "font-semibold text-red-600" : ""}> · Completed {fmtDateTime(t.submittedAt)}{late ? " (late)" : ""}</span>}</>}
                    </p>
                    {g.rows.some((r) => r.canManage) && anyArchived && (
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => archiveGroup(g.rows.filter((r) => r.archived), false)}
                          className="rounded-full border border-pine/20 px-3 py-1 text-xs font-medium text-pine-deep hover:bg-pine/5">Unarchive</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Modal>
      )}
      {showPastEvents && (
        <Modal title="Past events" onClose={() => setShowPastEvents(false)}>
          {pastEvents.length === 0 ? (
            <p className="text-sm text-ink/50">No past events.</p>
          ) : (
            <div className="space-y-2">
              {pastEvents.map((e) => (
                <div key={e.id} className="rounded-xl border border-pine/12 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button onClick={() => { setDetailEventId(e.id); setShowPastEvents(false); }}
                      className="text-left font-medium text-ink hover:underline">{e.title}</button>
                    <span className="shrink-0 text-xs text-ink/50">
                      {e.archived ? "Archived · " : ""}{e.allDay ? fmtDateOnly(e.startAt) : fmtDateTime(e.startAt)}
                    </span>
                  </div>
                  {e.description && <p className="mt-1 text-xs text-ink/60">{e.description}</p>}
                  {e.canManage && e.archived && (
                    <button onClick={() => archiveEvent(e.id, false)}
                      className="mt-2 rounded-full border border-pine/20 px-3 py-1 text-xs font-medium text-pine-deep hover:bg-pine/5">Unarchive</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {overviewGroupKey && overviewGroupRows.length > 0 && (
        <Modal title={overviewGroupRows[0].title} onClose={() => setOverviewGroupKey(null)}>
          <p className="text-sm text-ink/55">Assigned to {overviewGroupRows.length} {overviewGroupRows.length === 1 ? "person" : "people"} · due {fmtDateTime(overviewGroupRows[0].dueAt)}</p>
          {overviewGroupRows[0].description && <p className="mt-3 whitespace-pre-wrap text-sm text-ink/75">{overviewGroupRows[0].description}</p>}
          <div className="mt-4 space-y-2">
            {overviewGroupRows.map((r) => (
              <button key={r.id} onClick={() => { setDetailTaskId(r.id); setOverviewGroupKey(null); }}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-pine/12 px-4 py-2.5 text-left hover:border-pine/40">
                <span className="font-medium text-ink">{nameOf(r.assigneeEmail)}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === "complete" ? "bg-pine/15 text-pine-deep" : r.status === "pending" ? "bg-marigold-soft/50 text-marigold-deep" : "bg-ink/8 text-ink/60"}`}>
                  {r.status === "complete" ? "Complete" : r.status === "pending" ? "Pending approval" : "Not complete"}
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {openGroupKey && openGroupRows.length > 0 && (
        <Modal title={openGroupRows[0].title} onClose={() => setOpenGroupKey(null)}>
          <p className="text-sm text-ink/60">{openGroupRows[0].description || "Assigned to multiple people."}</p>
          <p className="mt-1 text-xs text-ink/45">Due {fmtDateTime(openGroupRows[0].dueAt)}</p>
          <div className="mt-4 space-y-2">
            {openGroupRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-pine/12 p-3">
                <div className="flex items-center gap-2.5">
                  <Avatar src={avatarOf(r.assigneeEmail)} name={nameOf(r.assigneeEmail)} size={28} />
                  <div>
                    <p className="text-sm font-medium text-ink">{nameOf(r.assigneeEmail)}</p>
                    <p className="text-xs text-ink/45">
                      {r.status === "complete" ? "Complete" : r.status === "pending" ? "Pending review" : "Not yet complete"}
                      {r.archived ? " · archived" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => { setDetailTaskId(r.id); setOpenGroupKey(null); }}
                    className="rounded-full border border-pine/20 px-3 py-1 text-xs font-medium text-pine-deep hover:bg-pine/5">Open</button>
                  {r.canManage && r.status === "pending" && (
                    <button onClick={() => act(r.id, "approve")}
                      className="rounded-full bg-marigold px-3 py-1 text-xs font-semibold text-pine-deep">Approve</button>
                  )}
                  {r.canManage && r.status !== "complete" && r.assigneeEmail.toLowerCase() !== myEmail.toLowerCase() && (
                    <button onClick={() => nudge(r.id, nameOf(r.assigneeEmail))} disabled={nudgeLockedIds.includes(r.id)}
                      className="rounded-full border border-marigold/50 bg-marigold-soft/40 px-2 py-1 text-xs font-medium text-marigold-deep hover:bg-marigold-soft/70 disabled:cursor-not-allowed disabled:opacity-50">
                      {nudgeLockedIds.includes(r.id) ? "Nudged" : "Nudge"}
                    </button>
                  )}
                  {r.canManage && (
                    <button onClick={() => act(r.id, r.archived ? "unarchive" : "archive")}
                      className="rounded-full border border-pine/20 px-2 py-1 text-xs font-medium text-pine-deep hover:bg-pine/5">{r.archived ? "Unarchive" : "Archive"}</button>
                  )}
                  {r.canManage && (
                    <button onClick={() => removeTask(r.id)}
                      className="rounded-full px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">Delete</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {openGroupRows.some((r) => r.canManage) && (
              <button onClick={() => { setEditingTask(openGroupRows[0]); setOpenGroupKey(null); }}
                className="rounded-full border border-pine/20 px-4 py-2 text-xs font-medium text-pine-deep hover:bg-pine/5">Edit task / assignees</button>
            )}
            {openGroupRows.some((r) => r.canManage) && (
              <button onClick={() => { archiveGroup(openGroupRows, true); setOpenGroupKey(null); }}
                className="rounded-full border border-pine/20 px-4 py-2 text-xs font-medium text-pine-deep hover:bg-pine/5">Archive for everyone</button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-pine/15 bg-pine/[0.02] p-4 text-sm text-ink/45">{children}</p>;
}

// --------------------------------------------------------------------- task row
function statusChipFor(status: Task["status"]) {
  if (status === "complete")
    return <span className="rounded-full bg-pine px-2.5 py-1 text-xs font-semibold text-paper">Complete</span>;
  if (status === "pending")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-marigold-soft px-2.5 py-1 text-xs font-semibold text-marigold-deep">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        Pending
      </span>
    );
  return <span className="rounded-full border border-ink/15 px-2.5 py-1 text-xs font-medium text-ink/55">Not yet complete</span>;
}

function TaskRow({
  task, role, assigneeName, assigneeAvatar, byline, onOpen, onComposeEmail,
}: {
  task: Task; role: "assignee" | "assigner"; assigneeName?: string; assigneeAvatar?: string | null;
  byline?: string; onOpen: () => void; onComposeEmail?: () => void;
}) {
  const overdue = task.submittedAt
    ? new Date(task.submittedAt) > new Date(task.dueAt)
    : new Date() > new Date(task.dueAt) && task.status !== "complete";

  return (
    <div className="rounded-2xl border border-pine/12 bg-paper p-4 transition-colors hover:border-pine/30">
      <button onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold text-ink">{task.title}</p>
          <div className="flex shrink-0 items-center gap-1.5">{statusChipFor(task.status)}</div>
        </div>
        {task.description && <p className="mt-1 line-clamp-2 text-sm text-ink/70">{task.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {task.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-sage/15 px-2 py-0.5 text-[11px] font-medium text-pine-deep">#{tag}</span>
          ))}
          {task.requireSubmission && (
            <span className="rounded-full bg-marigold-soft/60 px-2 py-0.5 text-[11px] font-medium text-marigold-deep">submission required</span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-ink/50">
            Due {fmtDateTime(task.dueAt)}
            {role === "assigner" && assigneeName ? (
              <span className="inline-flex items-center gap-1.5">
                <span>·</span>
                <Avatar src={assigneeAvatar} name={assigneeName} size={18} />
                {assigneeName}
              </span>
            ) : ""}
            {byline ? <span className="text-ink/40">· {byline}</span> : ""}
          </span>
          {task.submittedAt && (
            <span className={overdue ? "font-semibold text-red-600" : "text-ink/50"}>
              Submitted {fmtDateTime(task.submittedAt)}{overdue ? " (late)" : ""}
            </span>
          )}
        </div>
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        {role === "assignee" && task.emailTemplate && onComposeEmail && (
          <button onClick={onComposeEmail} className="inline-flex items-center gap-1.5 rounded-full bg-marigold px-4 py-2 text-xs font-semibold text-pine-deep transition-transform hover:scale-[1.02]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7.5 8.5 6 8.5-6" /></svg>
            Compose email
          </button>
        )}
        <button onClick={onOpen} className="rounded-full border border-pine/20 px-4 py-2 text-xs font-semibold text-pine-deep hover:bg-pine/5">
          Open
        </button>
      </div>
    </div>
  );
}

function EventRow({ event, onOpen }: { event: ClubEvent; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="block w-full rounded-2xl border border-pine/12 bg-paper p-4 text-left transition-colors hover:border-pine/30">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-ink">{event.title}</p>
        <span className="shrink-0 rounded-full bg-sage/15 px-2.5 py-1 text-xs font-medium text-pine-deep">
          {event.allDay ? `${fmtDateOnly(event.startAt)} · all day` : fmtDateTime(event.startAt)}
        </span>
      </div>
      {event.description && <p className="mt-1 line-clamp-2 text-sm text-ink/70">{event.description}</p>}
      <p className="mt-2 text-xs text-ink/45">
        {event.scopeKind === "club" && "Whole club"}
        {event.scopeKind === "all_newbies" && "All newbies"}
        {event.scopeKind === "group" && `Groups: ${event.scopeGroups.map((g) => GROUP_LABEL[g]).join(", ")}`}
        {event.scopeKind === "members" && `${event.scopeEmails.length} member(s)`}
      </p>
    </button>
  );
}

function GroupCard({ group, byline, onOpen, onArchive }: { group: TaskGroup; byline?: string; onOpen: () => void; onArchive: () => void }) {
  const t = group.head;
  const done = group.rows.filter((r) => r.status === "complete").length;
  const total = group.rows.length;
  return (
    <div className="rounded-2xl border border-pine/12 bg-paper p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-ink">{t.title}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-sage/15 px-2.5 py-1 text-xs font-semibold text-pine-deep">{done}/{total} complete</span>
          {group.rows.some((r) => r.canManage) && (
            <button onClick={onArchive} title="Archive for everyone" className="grid h-6 w-6 place-items-center rounded-full text-ink/40 hover:bg-pine/5 hover:text-pine-deep">🗄</button>
          )}
        </div>
      </div>
      {t.description && <p className="mt-1 text-sm text-ink/70">{t.description}</p>}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <span className="text-ink/50">Due {fmtDateTime(t.dueAt)} · {total} people{byline ? ` · ${byline}` : ""}</span>
        <button onClick={onOpen} className="rounded-full border border-pine/20 px-3 py-1 font-medium text-pine-deep hover:bg-pine/5">View / manage</button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- task detail popup
function TaskDetail({
  task, myEmail, nameOf, avatarOf, onClose, onAction, onEdit, onDelete, onComposeEmail, onNudge, nudgeLocked,
}: {
  task: Task; myEmail: string;
  nameOf: (e: string) => string; avatarOf: (e: string) => string | null;
  onClose: () => void;
  onAction: (action: string, extra?: Record<string, unknown>) => void | Promise<void>;
  onEdit: () => void; onDelete: () => void; onComposeEmail?: () => void;
  onNudge: () => void; nudgeLocked: boolean;
}) {
  const isAssignee = task.assigneeEmail.toLowerCase() === myEmail.toLowerCase();
  const canManage = !!task.canManage;
  const canComment = canManage || isAssignee; // managers (assigner + co-leads/NMT) + the assignee
  // A self-assigned task has no separate doer: the one person manages it via the
  // manager controls below, so we never show the doer-only submission/complete UI.
  const isSelfAssigned = isAssignee && task.assigneeEmail.toLowerCase() === task.assignerEmail.toLowerCase();
  // The doer may submit proof of work only on a require-submission task they
  // didn't assign themselves. They never mark complete or unmark.
  const canDoerSubmit = isAssignee && !isSelfAssigned && task.requireSubmission;
  const [subText, setSubText] = useState(task.submissionText ?? "");
  const [subLink, setSubLink] = useState(task.submissionLink ?? "");
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: string, extra?: Record<string, unknown>) {
    setBusy(true);
    try { await onAction(action, extra); }
    finally { setBusy(false); }
  }

  const topComments = task.comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => task.comments.filter((c) => c.parentId === id);

  return (
    <Modal title={task.title} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {statusChipFor(task.status)}
          {task.requireSubmission && (
            <span className="rounded-full bg-marigold-soft/60 px-2.5 py-1 text-xs font-medium text-marigold-deep">submission required</span>
          )}
          {task.archived && <span className="rounded-full bg-ink/10 px-2.5 py-1 text-xs font-medium text-ink/60">archived</span>}
        </div>

        {task.description && <p className="text-sm text-ink/75">{task.description}</p>}

        <div className="grid grid-cols-2 gap-3 text-xs text-ink/55">
          <div><span className="font-semibold text-ink/70">Due</span><br />{fmtDateTime(task.dueAt)}</div>
          <div><span className="font-semibold text-ink/70">Assigned to</span><br />
            <span className="inline-flex items-center gap-1.5"><Avatar src={avatarOf(task.assigneeEmail)} name={nameOf(task.assigneeEmail)} size={18} />{nameOf(task.assigneeEmail)}</span>
          </div>
          <div><span className="font-semibold text-ink/70">Assigned by</span><br />{nameOf(task.assignerEmail)}</div>
          {task.tags.length > 0 && (
            <div><span className="font-semibold text-ink/70">Tags</span><br />{task.tags.map((t) => `#${t}`).join(" ")}</div>
          )}
        </div>

        {/* Submission — proof of work. A doer can submit (for review) only on a
            require-submission task they didn't assign themselves; everyone else
            sees it read-only. */}
        {(task.submissionText || task.submissionLink || canDoerSubmit) && (
          <div className="rounded-2xl border border-pine/12 p-4">
            <p className="text-sm font-semibold text-ink">Submission</p>
            {canDoerSubmit && task.status === "not_complete" ? (
              <div className="mt-2 space-y-2">
                <textarea className={inputCls} rows={3} value={subText} onChange={(e) => setSubText(e.target.value)}
                  placeholder="Write a note about your work (optional unless required)…" />
                <input className={inputCls} value={subLink} onChange={(e) => setSubLink(e.target.value)}
                  placeholder="Add a link (optional unless required)…" />
                <button disabled={busy} onClick={() => run("submit", { submissionText: subText, submissionLink: subLink })}
                  className="rounded-full bg-pine px-4 py-2 text-xs font-semibold text-paper disabled:opacity-60">
                  {busy ? "Saving…" : "Submit for review"}
                </button>
                <p className="text-xs text-ink/45">Your assigner reviews this and marks the task complete.</p>
              </div>
            ) : (
              <div className="mt-2 space-y-1 text-sm text-ink/75">
                {task.submissionText && <p className="whitespace-pre-wrap">{task.submissionText}</p>}
                {task.submissionLink && (
                  <a href={task.submissionLink} target="_blank" rel="noreferrer" className="break-all text-pine underline">{task.submissionLink}</a>
                )}
                {!task.submissionText && !task.submissionLink && <p className="text-ink/40">Nothing submitted yet.</p>}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {/* Doer keeps only the (completion-unrelated) compose-email button.
              Marking complete / unmarking is a manager-only action below. */}
          {isAssignee && task.emailTemplate && onComposeEmail && (
            <button onClick={onComposeEmail} className="rounded-full bg-marigold px-4 py-2 text-xs font-semibold text-pine-deep">Compose email</button>
          )}

          {canManage && task.status === "pending" && (
            <>
              <button disabled={busy} onClick={() => run("approve")} className="rounded-full bg-marigold px-4 py-2 text-xs font-semibold text-pine-deep disabled:opacity-60">Approve</button>
              <button disabled={busy} onClick={() => { const c = prompt("Add a comment explaining the rejection (optional):") ?? ""; run("reject", { note: c }); }}
                className="rounded-full border border-red-300 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60">Reject</button>
            </>
          )}
          {canManage && task.status === "not_complete" && (
            <button disabled={busy} onClick={() => run("approve")} className="rounded-full bg-marigold px-4 py-2 text-xs font-semibold text-pine-deep disabled:opacity-60">Mark complete</button>
          )}
          {canManage && task.status === "complete" && (
            <button disabled={busy} onClick={() => { const c = prompt("Add a comment so they know what to change (optional):") ?? ""; run("unmark", { note: c }); }}
              className="rounded-full border border-pine/25 px-4 py-2 text-xs font-semibold text-pine-deep hover:bg-pine/5 disabled:opacity-60">Unmark as complete</button>
          )}
          {canManage && !isAssignee && task.status !== "complete" && (
            <button disabled={nudgeLocked} onClick={onNudge}
              className="rounded-full border border-marigold/50 bg-marigold-soft/40 px-4 py-2 text-xs font-semibold text-marigold-deep hover:bg-marigold-soft/70 disabled:cursor-not-allowed disabled:opacity-50">
              {nudgeLocked ? "Nudged" : "Nudge"}
            </button>
          )}
          {canManage && task.status !== "complete" && (
            <button onClick={onEdit} className="rounded-full border border-pine/20 px-4 py-2 text-xs font-semibold text-pine-deep hover:bg-pine/5">Edit</button>
          )}
          {canManage && (
            <>
              <button disabled={busy} onClick={() => run(task.archived ? "unarchive" : "archive")} className="rounded-full border border-pine/20 px-4 py-2 text-xs font-semibold text-pine-deep hover:bg-pine/5 disabled:opacity-60">{task.archived ? "Unarchive" : "Archive"}</button>
              <button onClick={onDelete} className="rounded-full px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">Delete</button>
            </>
          )}
        </div>

        {/* History timeline */}
        <div>
          <p className="text-sm font-semibold text-ink">Activity history</p>
          <ol className="mt-2 space-y-2">
            {task.history.length === 0 && <li className="text-xs text-ink/40">No activity yet.</li>}
            {task.history.map((h) => (
              <li key={h.id} className="flex gap-2 text-xs text-ink/60">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-pine/40" />
                <span>
                  <span className="font-medium text-ink/80">{HISTORY_LABEL[h.action]}</span>
                  {" "}by {nameOf(h.actorEmail)} · {fmtDateTime(h.at)}
                  {h.note && <span className="mt-0.5 block text-ink/55">“{h.note}”</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* Comments */}
        <div>
          <p className="text-sm font-semibold text-ink">Comments</p>
          <div className="mt-2 space-y-3">
            {topComments.length === 0 && <p className="text-xs text-ink/40">No comments yet.</p>}
            {topComments.map((c) => (
              <div key={c.id} className="rounded-xl border border-pine/10 p-3">
                <p className="text-xs font-semibold text-ink/80">{nameOf(c.authorEmail)} <span className="font-normal text-ink/40">· {fmtDateTime(c.at)}</span></p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink/75">{c.body}</p>
                {canComment && <button onClick={() => setReplyTo(replyTo === c.id ? null : c.id)} className="mt-1 text-[11px] font-medium text-pine-deep hover:underline">Reply</button>}
                <div className="mt-2 space-y-2 border-l border-pine/10 pl-3">
                  {repliesOf(c.id).map((r) => (
                    <div key={r.id}>
                      <p className="text-xs font-semibold text-ink/80">{nameOf(r.authorEmail)} <span className="font-normal text-ink/40">· {fmtDateTime(r.at)}</span></p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink/75">{r.body}</p>
                    </div>
                  ))}
                  {replyTo === c.id && (
                    <div className="flex gap-2">
                      <input className={inputCls} style={{ marginTop: 0 }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a reply…" />
                      <button disabled={busy || !comment.trim()} onClick={async () => { await run("comment", { body: comment, parentId: c.id }); setComment(""); setReplyTo(null); }}
                        className="rounded-xl bg-pine px-3 text-sm font-semibold text-paper disabled:opacity-50">Send</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {canComment ? (
            replyTo === null && (
              <div className="mt-3 flex gap-2">
                <input className={inputCls} style={{ marginTop: 0 }} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" />
                <button disabled={busy || !comment.trim()} onClick={async () => { await run("comment", { body: comment, parentId: null }); setComment(""); }}
                  className="rounded-xl bg-pine px-3 text-sm font-semibold text-paper disabled:opacity-50">Send</button>
              </div>
            )
          ) : (
            <p className="mt-3 text-xs text-ink/40">Only the people involved in this task can comment.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

// --------------------------------------------------------------- event detail popup
function EventDetail({
  event, nameOf, onClose, onEdit, onArchive, onDelete,
}: {
  event: ClubEvent; nameOf: (e: string) => string;
  onClose: () => void; onEdit?: () => void; onArchive?: () => void; onDelete?: () => void;
}) {
  const when = event.allDay
    ? `${fmtDateOnly(event.startAt)}${event.endAt ? ` – ${fmtDateOnly(event.endAt)}` : ""} · all day`
    : `${fmtDateTime(event.startAt)}${event.endAt ? ` – ${fmtDateTime(event.endAt)}` : ""}`;
  return (
    <Modal title={event.title} onClose={onClose}>
      <div className="space-y-4">
        <p className="inline-block rounded-full bg-sage/15 px-3 py-1 text-sm font-medium text-pine-deep">{when}</p>
        {event.description && <p className="text-sm text-ink/75">{event.description}</p>}
        <div className="grid grid-cols-2 gap-3 text-xs text-ink/55">
          <div><span className="font-semibold text-ink/70">Created by</span><br />{nameOf(event.creatorEmail)}</div>
          <div><span className="font-semibold text-ink/70">Audience</span><br />
            {event.scopeKind === "club" && "Whole club"}
            {event.scopeKind === "all_newbies" && "All newbies"}
            {event.scopeKind === "group" && event.scopeGroups.map((g) => GROUP_LABEL[g]).join(", ")}
            {event.scopeKind === "members" && `${event.scopeEmails.length} member(s)`}
          </div>
        </div>
        {(onEdit || onArchive || onDelete) && (
          <div className="flex flex-wrap gap-2">
            {onEdit && <button onClick={onEdit} className="rounded-full border border-pine/20 px-4 py-2 text-xs font-semibold text-pine-deep hover:bg-pine/5">Edit</button>}
            {onArchive && <button onClick={onArchive} className="rounded-full border border-pine/20 px-4 py-2 text-xs font-semibold text-pine-deep hover:bg-pine/5">{event.archived ? "Unarchive" : "Archive"}</button>}
            {onDelete && <button onClick={onDelete} className="rounded-full px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">Delete</button>}
          </div>
        )}
      </div>
    </Modal>
  );
}

// --------------------------------------------------------------------- calendar
// ============================ shared calendar view =========================
// One engine renders Day / Week / Month / Year layouts (Google/Apple-style).
// Both the personal and club-overview calendars feed it normalized items.
type CalColor = { bg: string; fg: string; dot?: string };
type CalItem = {
  id: string;
  kind: "task" | "event";
  title: string;
  at: string;       // ISO datetime (task dueAt / event startAt)
  allDay?: boolean;
  color: CalColor;
  onOpen: () => void;
};

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d: Date) => { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function CalendarView({ title, items, period, legend }: {
  title: string; items: CalItem[]; period: TimeWindow; legend: React.ReactNode;
}) {
  const [cursor, setCursor] = useState(() => new Date());
  const [openDay, setOpenDay] = useState<Date | null>(null);
  const [view, setView] = useState<TimeWindow>(period);
  useEffect(() => { setView(period); }, [period]);
  const drilled = view !== period;
  const today = new Date();

  const step = (dir: number) => {
    if (view === "day") setCursor((c) => addDays(c, dir));
    else if (view === "week") setCursor((c) => addDays(c, dir * 7));
    else if (view === "all") setCursor((c) => new Date(c.getFullYear() + dir, c.getMonth(), 1));
    else setCursor((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
  };
  const itemsOn = (date: Date) =>
    items.filter((it) => sameDay(new Date(it.at), date)).sort((a, b) => a.at.localeCompare(b.at));
  const drillToMonth = (year: number, month: number) => { setCursor(new Date(year, month, 1)); setView("month"); };

  const heading = (() => {
    if (view === "day") return cursor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    if (view === "week") {
      const sd = startOfWeek(cursor), e = addDays(sd, 6);
      const opts = { month: "short", day: "numeric" } as const;
      const sameMonth = sd.getMonth() === e.getMonth() && sd.getFullYear() === e.getFullYear();
      const left = sd.toLocaleDateString(undefined, opts);
      const right = sameMonth ? String(e.getDate()) : e.toLocaleDateString(undefined, opts);
      return `${left} - ${right}, ${e.getFullYear()}`;
    }
    if (view === "all") return String(cursor.getFullYear());
    return cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  })();

  const navLabel = view === "day" ? "day" : view === "week" ? "week" : view === "all" ? "year" : "month";

  return (
    <div className="rounded-3xl border border-pine/12 bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {drilled && (
            <button onClick={() => setView(period)} className="rounded-full border border-pine/20 px-3 py-1 text-xs font-semibold text-pine-deep hover:bg-pine/5" title="Back">
              &lsaquo; {period === "all" ? "Year" : period}
            </button>
          )}
          <h3 className="font-display text-xl font-semibold text-pine-deep">
            {heading}{title ? ` - ${title}` : ""}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(new Date())} className="mr-1 rounded-full border border-pine/15 px-3 py-1 text-xs font-semibold text-pine-deep hover:bg-pine/5">Today</button>
          <button onClick={() => step(-1)} className="grid h-8 w-8 place-items-center rounded-full border border-pine/15 text-pine-deep hover:bg-pine/5" aria-label={`Previous ${navLabel}`}>&lsaquo;</button>
          <button onClick={() => step(1)} className="grid h-8 w-8 place-items-center rounded-full border border-pine/15 text-pine-deep hover:bg-pine/5" aria-label={`Next ${navLabel}`}>&rsaquo;</button>
        </div>
      </div>

      {view === "day" && (
        <div className="mt-4"><DayAgenda date={cursor} items={itemsOn(cursor)} big /></div>
      )}

      {view === "week" && (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)).map((d) => {
            const its = itemsOn(d);
            const isToday = sameDay(today, d);
            return (
              <div key={d.toISOString()} onClick={() => setOpenDay(d)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") setOpenDay(d); }} title="Open this day"
                className={`min-h-[8rem] cursor-pointer rounded-xl border p-2 transition-colors hover:border-pine/40 ${isToday ? "border-marigold bg-marigold-soft/15" : "border-pine/10 bg-pine/[0.015]"}`}>
                <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${isToday ? "text-marigold-deep" : "text-ink/45"}`}>
                  {WEEKDAYS[d.getDay()]} {d.getDate()}
                </div>
                <div className="space-y-1">
                  {its.map((it) => (
                    <button key={it.id} onClick={(e) => { e.stopPropagation(); it.onOpen(); }} title={it.title}
                      className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-medium"
                      style={{ backgroundColor: it.color.bg, color: it.color.fg }}>
                      {it.title}
                    </button>
                  ))}
                  {its.length === 0 && <div className="text-[11px] text-ink/25">-</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "month" && (
        <MonthGrid cursor={cursor} today={today} itemsOn={itemsOn} onOpenDay={setOpenDay} />
      )}

      {view === "all" && (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }, (_, m) => (
            <MiniMonth key={m} year={cursor.getFullYear()} month={m} today={today} itemsOn={itemsOn} onDrill={drillToMonth} />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink/55">{legend}</div>

      {openDay && (
        <Modal title={openDay.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} onClose={() => setOpenDay(null)}>
          <DayAgenda date={openDay} items={itemsOn(openDay)} onNavigate={() => setOpenDay(null)} />
        </Modal>
      )}
    </div>
  );
}

function DayAgenda({ date, items, big, onNavigate }: {
  date: Date; items: CalItem[]; big?: boolean; onNavigate?: () => void;
}) {
  if (items.length === 0)
    return <p className={`text-ink/50 ${big ? "rounded-2xl border border-pine/10 bg-pine/[0.015] p-6 text-center text-sm" : "text-sm"}`}>Nothing scheduled for this day.</p>;
  const events = items.filter((i) => i.kind === "event");
  const tasks = items.filter((i) => i.kind === "task");
  const Row = (it: CalItem) => (
    <button key={it.id} onClick={() => { it.onOpen(); onNavigate?.(); }}
      className="block w-full rounded-xl border border-pine/12 p-3 text-left hover:border-pine/30">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded" style={{ backgroundColor: it.color.dot ?? it.color.bg }} />
        <span className="font-medium text-ink">{it.title}</span>
        <span className="ml-auto text-xs text-ink/50">{it.kind === "event" ? (it.allDay ? "Event · all day" : `Event · ${fmtDateTime(it.at)}`) : `Task · due ${fmtDateTime(it.at)}`}</span>
      </div>
    </button>
  );
  return (
    <div className="space-y-4">
      {events.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Events</p>
          <div className="mt-2 space-y-2">{events.map(Row)}</div>
        </div>
      )}
      {tasks.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink/40">Tasks due</p>
          <div className="mt-2 space-y-2">{tasks.map(Row)}</div>
        </div>
      )}
    </div>
  );
}

// Full month grid (the classic view).
function MonthGrid({ cursor, today, itemsOn, onOpenDay }: {
  cursor: Date; today: Date; itemsOn: (d: Date) => CalItem[]; onOpenDay: (d: Date) => void;
}) {
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return (
    <>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-ink/40">
        {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="aspect-square rounded-lg" />;
          const its = itemsOn(date);
          const isToday = sameDay(today, date);
          return (
            <button key={i} type="button" onClick={() => onOpenDay(date)}
              className={`aspect-square rounded-lg border p-1 text-left transition-colors hover:border-pine/40 ${isToday ? "border-marigold bg-marigold-soft/20" : "border-pine/8 bg-pine/[0.015]"}`}>
              <div className={`text-[11px] font-semibold ${isToday ? "text-marigold-deep" : "text-ink/55"}`}>{date.getDate()}</div>
              <div className="mt-0.5 space-y-0.5">
                {its.slice(0, 3).map((it) => (
                  <div key={it.id} className="truncate rounded px-1 text-[9px] font-medium" style={{ backgroundColor: it.color.bg, color: it.color.fg }} title={it.title}>{it.title}</div>
                ))}
                {its.length > 3 && <div className="text-[9px] text-ink/40">+{its.length - 3} more</div>}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// Compact month (used in the Year view): dots on days that have items.
function MiniMonth({ year, month, today, itemsOn, onDrill }: {
  year: number; month: number; today: Date; itemsOn: (d: Date) => CalItem[]; onDrill: (year: number, month: number) => void;
}) {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return (
    <button type="button" onClick={() => onDrill(year, month)} title={`Open ${new Date(year, month, 1).toLocaleString(undefined, { month: "long" })}`}
      className="rounded-2xl border border-pine/10 bg-pine/[0.015] p-3 text-left transition-colors hover:border-pine/40 hover:bg-pine/[0.04]">
      <p className="mb-2 text-sm font-semibold text-pine-deep">{new Date(year, month, 1).toLocaleString(undefined, { month: "long" })}</p>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-ink/35">
        {WEEKDAYS.map((d) => <div key={d}>{d[0]}</div>)}
      </div>
      <div className="mt-0.5 grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const date = new Date(year, month, d);
          const its = itemsOn(date);
          const isToday = sameDay(today, date);
          return (
            <div key={i}
              className={`relative grid aspect-square place-items-center rounded text-[10px] ${isToday ? "bg-marigold-soft/40 font-bold text-marigold-deep" : its.length ? "font-semibold text-ink" : "text-ink/40"}`}>
              {d}
              {its.length > 0 && <span className="absolute bottom-0.5 h-1 w-1 rounded-full" style={{ backgroundColor: its[0].color.dot ?? its[0].color.bg }} />}
            </div>
          );
        })}
      </div>
    </button>
  );
}


function CalendarMonth({ tasks, events, myEmail, archive, period, onOpenTask, onOpenEvent }: {
  tasks: Task[]; events: ClubEvent[]; myEmail: string; archive: "active" | "all"; period: TimeWindow;
  onOpenTask: (id: string) => void; onOpenEvent: (id: string) => void;
}) {
  const items: CalItem[] = useMemo(() => {
    const okT = (t: Task) => archive === "all" || (!t.archived && t.status !== "complete");
    const okE = (e: ClubEvent) => archive === "all" || (!e.archived && !eventHasPassed(e));
    const mine = tasks.filter((t) => t.assigneeEmail.toLowerCase() === myEmail.toLowerCase() && okT(t));
    return [
      ...events.filter(okE).map((e) => ({ id: `e:${e.id}`, kind: "event" as const, title: e.title, at: e.startAt, allDay: e.allDay, color: CAL_EVENT, onOpen: () => onOpenEvent(e.id) })),
      ...mine.map((t) => ({ id: `t:${t.id}`, kind: "task" as const, title: t.title, at: t.dueAt, color: taskKind(t, myEmail) === "to" ? CAL_TO : CAL_BY, onOpen: () => onOpenTask(t.id) })),
    ];
  }, [tasks, events, myEmail, archive, onOpenTask, onOpenEvent]);

  const legend = (
    <>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: CAL_EVENT.bg }} /> Event</span>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: CAL_TO.bg }} /> Task to me</span>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: CAL_BY.bg }} /> Task by me</span>
    </>
  );
  return <CalendarView title="" items={items} period={period} legend={legend} />;
}

// ------------------------------------------------------------------- modal shell
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-paper p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold text-pine-deep">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-ink/50 hover:bg-ink/5" aria-label="Close">✕</button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

const inputCls =
  "mt-1 w-full rounded-xl border border-pine/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-pine";
const labelCls = "block text-sm font-medium text-ink/80";

function MemberPicker({ members, selected, onToggle, single }: {
  members: Lite[]; selected: string[]; onToggle: (email: string) => void; single?: boolean;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = needle ? members.filter((m) => `${m.name} ${m.email}`.toLowerCase().includes(needle)) : members;
  return (
    <div>
      <input className={inputCls} style={{ marginTop: 0 }} placeholder="Search members by name…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-pine/15 p-2">
        {filtered.length === 0 && <p className="px-2 py-1 text-xs text-ink/40">No matches.</p>}
        {filtered.map((m) => (
          <label key={m.email} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-pine/5">
            <input type={single ? "radio" : "checkbox"} checked={selected.includes(m.email)} onChange={() => onToggle(m.email)} />
            {m.name} <span className="text-xs text-ink/40">· {GROUP_LABEL[m.group]}</span>
          </label>
        ))}
      </div>
      {selected.length > 0 && <p className="mt-1 text-xs text-ink/45">{selected.length} selected</p>}
    </div>
  );
}

// -------------------------------------------------------------------- task form
export function TaskForm({ meta, editing, editGroupAssignees, meetingId, onClose, onCreated }: { meta: Meta; editing?: Task | null; editGroupAssignees?: string[]; meetingId?: string; onClose: () => void; onCreated: () => void }) {
  const isEdit = !!editing;
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [dueAt, setDueAt] = useState(editing ? toLocalInput(editing.dueAt) : "");
  const [requireSubmission, setRequireSubmission] = useState(editing?.requireSubmission ?? false);
  const [tags, setTags] = useState<string[]>(editing?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [assignees, setAssignees] = useState<string[]>(
    editing ? (editGroupAssignees && editGroupAssignees.length ? editGroupAssignees : [editing.assigneeEmail]) : []
  );
  const scopes = meta.assignScopes.length ? meta.assignScopes : (["members"] as const);
  const [scope, setScope] = useState<"members" | "group" | "club">(isEdit ? "members" : scopes[0]);
  const [groups, setGroups] = useState<Group[]>(!isEdit && meta.assignableGroups.length === 1 ? meta.assignableGroups : []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(!!editing?.emailTemplate);
  const [emailSubject, setEmailSubject] = useState(editing?.emailTemplate?.subject ?? "");
  const [emailBody, setEmailBody] = useState(editing?.emailTemplate?.bodyHtml ?? "");
  const emailTemplate =
    emailEnabled && (emailSubject.trim() || emailBody.replace(/<[^>]*>/g, "").trim())
      ? { subject: emailSubject, bodyHtml: emailBody } : null;

  const toggleAssignee = (email: string) =>
    setAssignees((a) => (a.includes(email) ? a.filter((x) => x !== email) : [...a, email]));
  const toggleGroup = (g: Group) => setGroups((x) => (x.includes(g) ? x.filter((y) => y !== g) : [...x, g]));

  const resolveAssignees = (): string[] => {
    if (isEdit) return assignees;
    if (scope === "club") return meta.allMembers.map((m) => m.email);
    if (scope === "group") return meta.allMembers.filter((m) => groups.includes(m.group)).map((m) => m.email);
    return assignees;
  };
  const addTag = () => { const t = tagInput.trim().replace(/^#/, ""); if (t && !tags.includes(t)) setTags([...tags, t]); setTagInput(""); };

  async function submit() {
    setErr(null);
    const dueIso = dueAt ? new Date(dueAt).toISOString() : "";
    if (!isEdit && resolveAssignees().length === 0) { setErr("Pick who to assign this to."); return; }
    setBusy(true);
    try {
      if (isEdit && editing) {
        if (assignees.length === 0) { setErr("Keep at least one person on the task."); setBusy(false); return; }
        await api(`/api/lms/tasks/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            action: "editGroup", title, description, dueAt: dueIso, requireSubmission,
            requiresFile: false, tags, assigneeEmails: assignees, emailTemplate,
          }),
        });
      } else {
        await api("/api/lms/tasks", {
          method: "POST",
          body: JSON.stringify({ title, description, dueAt: dueIso, requireSubmission, requiresFile: false, tags, emailTemplate, assigneeEmails: resolveAssignees(), meetingId }),
        });
      }
      onCreated();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <Modal title={isEdit ? "Edit task" : "Assign a task"} onClose={onClose}>
      <div className="space-y-4">
        <div><label className={labelCls}>Title</label>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" /></div>
        <div><label className={labelCls}>Description</label>
          <textarea className={inputCls} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div><label className={labelCls}>Due date &amp; time</label>
          <input type="datetime-local" className={inputCls} value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></div>

        <div>
          <label className={labelCls}>Tags</label>
          <div className="mt-1 flex gap-2">
            <input className={inputCls} style={{ marginTop: 0 }} value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="Type a tag, press Enter" />
            <button type="button" onClick={addTag} className="rounded-xl border border-pine/20 px-3 text-sm">Add</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-sage/15 px-2 py-0.5 text-xs text-pine-deep">
                #{t}<button onClick={() => setTags(tags.filter((x) => x !== t))} className="text-ink/40">✕</button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls}>Assign to{isEdit ? " (add or remove anyone)" : ""}</label>
          {isEdit ? (
            <div className="mt-1"><MemberPicker members={meta.assignableMembers} selected={assignees} onToggle={toggleAssignee} /></div>
          ) : (
            <div className="mt-1 space-y-3">
              {scopes.length > 1 && (
                <select className={inputCls} style={{ marginTop: 0 }} value={scope} onChange={(e) => setScope(e.target.value as "members" | "group" | "club")}>
                  {scopes.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
                </select>
              )}
              {scope === "members" && <MemberPicker members={meta.assignableMembers} selected={assignees} onToggle={toggleAssignee} />}
              {scope === "group" && (
                <div className="flex flex-wrap gap-2">
                  {meta.assignableGroups.map((g) => (
                    <label key={g} className="flex items-center gap-1.5 rounded-full border border-pine/15 px-3 py-1 text-sm">
                      <input type="checkbox" checked={groups.includes(g)} onChange={() => toggleGroup(g)} />{GROUP_LABEL[g]}
                    </label>
                  ))}
                </div>
              )}
              {scope === "club" && (
                <p className="rounded-xl border border-pine/15 bg-pine/[0.03] px-3 py-2 text-sm text-ink/70">
                  This task will be assigned to all {meta.allMembers.length} club members.
                </p>
              )}
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" checked={requireSubmission} onChange={(e) => setRequireSubmission(e.target.checked)} />
          Require a submission (written note or link) before the doer can mark it complete
        </label>

        <div className="rounded-xl border border-pine/12 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} className="accent-pine" />
            Attach an email template
          </label>
          <p className="mt-1 text-xs text-ink/50">
            The person doing this task gets a one-click button to open a pre-filled email. Any{" "}
            <code className="rounded bg-ink/[0.06] px-1">{"{{word}}"}</code> becomes a mail-merge column for them to fill.
          </p>
          {emailEnabled && (
            <div className="mt-3 space-y-2">
              <input className={inputCls} value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Email subject (e.g. Hello {{firstName}})" />
              <RichTextEditor value={editing?.emailTemplate?.bodyHtml ?? ""} onChange={setEmailBody} placeholder="Write the email template…" />
            </div>
          )}
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button onClick={submit} disabled={busy} className="btn-primary w-full justify-center disabled:opacity-60">
          {busy ? "Saving…" : isEdit ? "Save changes" : "Assign task"}
        </button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------- event form
function EventForm({ meta, editing, onClose, onCreated }: { meta: Meta; editing?: ClubEvent | null; onClose: () => void; onCreated: () => void }) {
  const isEdit = !!editing;
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [allDay, setAllDay] = useState(editing?.allDay ?? false);
  const [startAt, setStartAt] = useState(editing ? toLocalInput(editing.startAt) : "");
  const [startDate, setStartDate] = useState(editing ? toDateInput(editing.startAt) : "");
  const [hasEnd, setHasEnd] = useState(!!editing?.endAt);
  const [endAt, setEndAt] = useState(editing?.endAt ? toLocalInput(editing.endAt) : "");
  const [endDate, setEndDate] = useState(editing?.endAt ? toDateInput(editing.endAt) : "");
  const [scopeKind, setScopeKind] = useState<Meta["eventScopes"][number]>(editing?.scopeKind ?? meta.eventScopes[0]);
  const [scopeEmails, setScopeEmails] = useState<string[]>(editing?.scopeEmails ?? []);
  const [scopeGroups, setScopeGroups] = useState<Group[]>(editing?.scopeGroups ?? (meta.targetableGroups.length === 1 ? meta.targetableGroups : []));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null); setBusy(true);
    try {
      let startIso = "";
      let endIso: string | null = null;
      if (allDay) {
        if (!startDate) throw new Error("Pick a start date.");
        startIso = new Date(`${startDate}T00:00`).toISOString();
        endIso = hasEnd && endDate ? new Date(`${endDate}T00:00`).toISOString() : null;
      } else {
        if (!startAt) throw new Error("Pick a start time.");
        startIso = new Date(startAt).toISOString();
        endIso = hasEnd && endAt ? new Date(endAt).toISOString() : null;
      }
      const payload = { title, description, startAt: startIso, endAt: endIso, allDay, scopeKind, scopeEmails, scopeGroups };
      if (isEdit && editing) {
        await api(`/api/lms/events/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/api/lms/events", { method: "POST", body: JSON.stringify(payload) });
      }
      onCreated();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <Modal title={isEdit ? "Edit event" : "Create an event"} onClose={onClose}>
      <div className="space-y-4">
        <div><label className={labelCls}>Title</label>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className={labelCls}>Description</label>
          <textarea className={inputCls} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>

        <label className="flex items-center gap-2 text-sm font-medium text-ink/80">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> All day
        </label>

        {allDay ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={labelCls}>Start date</label>
              <input type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            {hasEnd && (
              <div><label className={labelCls}>End date</label>
                <input type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={labelCls}>Start date &amp; time</label>
              <input type="datetime-local" className={inputCls} value={startAt} onChange={(e) => setStartAt(e.target.value)} /></div>
            {hasEnd && (
              <div><label className={labelCls}>End date &amp; time</label>
                <input type="datetime-local" className={inputCls} value={endAt} onChange={(e) => setEndAt(e.target.value)} /></div>
            )}
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" checked={hasEnd} onChange={(e) => setHasEnd(e.target.checked)} />
          Set an end {allDay ? "date" : "time"} (optional — otherwise it shows as a single point)
        </label>

        <div>
          <label className={labelCls}>Who is it for?</label>
          <select className={inputCls} value={scopeKind} onChange={(e) => setScopeKind(e.target.value as Meta["eventScopes"][number])}>
            {meta.eventScopes.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
          </select>
        </div>

        {scopeKind === "group" && (
          <div>
            <label className={labelCls}>Which group(s)?</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {meta.targetableGroups.map((g) => (
                <label key={g} className="flex items-center gap-1.5 rounded-full border border-pine/15 px-3 py-1 text-sm">
                  <input type="checkbox" checked={scopeGroups.includes(g)} onChange={() => setScopeGroups((x) => x.includes(g) ? x.filter((y) => y !== g) : [...x, g])} />
                  {GROUP_LABEL[g]}
                </label>
              ))}
            </div>
          </div>
        )}

        {scopeKind === "members" && (
          <div>
            <label className={labelCls}>Which members?</label>
            {meta.eventMemberTargets.length === 0 ? (
              <p className="mt-1 text-xs text-ink/50">No members available to target.</p>
            ) : (
              <div className="mt-1">
                <MemberPicker members={meta.eventMemberTargets} selected={scopeEmails}
                  onToggle={(email) => setScopeEmails((x) => x.includes(email) ? x.filter((y) => y !== email) : [...x, email])} />
              </div>
            )}
          </div>
        )}

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button onClick={submit} disabled={busy} className="btn-accent w-full justify-center disabled:opacity-60">
          {busy ? "Saving…" : isEdit ? "Save changes" : "Create event"}
        </button>
      </div>
    </Modal>
  );
}

// ============================================================================
//  Full Club Overview (P/VP only) — club-wide calendar + grouped lists
function SegToggle({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">{label}</span>
      <div className="inline-flex rounded-full border border-pine/20 bg-paper p-0.5">
        {options.map(([val, lbl]) => (
          <button key={val} onClick={() => onChange(val)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${value === val ? "bg-pine text-paper" : "text-pine-deep hover:bg-pine/5"}`}>
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}
// ============================================================================
function laneOfTask(t: OTask): Lane { return t.lane; }

function ClubCalendar({ tasks, events, archive, period, onOpenTaskGroup, onOpenEvent }: {
  tasks: OTask[]; events: OEvent[]; archive: "active" | "all"; period: TimeWindow;
  onOpenTaskGroup: (groupId: string) => void; onOpenEvent: (id: string) => void;
}) {
  const items: CalItem[] = useMemo(() => {
    const okT = (t: OTask) => archive === "all" || (!t.archived && t.status !== "complete");
    const okE = (e: OEvent) => archive === "all" || (!e.archived && !eventHasPassed(e));
    // Collapse per-assignee task rows: one calendar entry per task group.
    const seen = new Set<string>();
    const taskItems = tasks.filter(okT).filter((t) => {
      const k = t.groupId || t.id;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    }).map((t) => ({ id: `t:${t.groupId || t.id}`, kind: "task" as const, title: t.title, at: t.dueAt, color: LANE_COLOR[t.lane], onOpen: () => onOpenTaskGroup(t.groupId || t.id) }));
    return [
      ...events.filter(okE).map((e) => ({ id: `e:${e.id}`, kind: "event" as const, title: e.title, at: e.startAt, allDay: e.allDay, color: LANE_COLOR[e.lane], onOpen: () => onOpenEvent(e.id) })),
      ...taskItems,
    ];
  }, [tasks, events, archive, onOpenTaskGroup, onOpenEvent]);

  const legend = (
    <>
      {LANE_ORDER.map((l) => (
        <span key={l} className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: LANE_COLOR[l].dot }} /> {LANE_LABEL[l]}
        </span>
      ))}
    </>
  );
  return <CalendarView title="whole club" items={items} period={period} legend={legend} />;
}

function ClubOverviewLists({ tasks, events, archive, period, nameOf, onOpenTask, onOpenEvent }: {
  tasks: OTask[]; events: OEvent[]; archive: "active" | "all"; period: TimeWindow;
  nameOf: (e: string) => string;
  onOpenTask: (id: string) => void; onOpenEvent: (id: string) => void;
}) {
  const fTasks = tasks.filter((t) => taskPasses(t, archive, period));
  const fEvents = events.filter((e) => eventPasses(e, archive, period));
  const groups = groupByBatch(fTasks);
  const nothing = groups.length === 0 && fEvents.length === 0;
  return (
    <div className="mt-10">
      <h3 className="font-display text-2xl font-semibold text-pine-deep">Full Club Overview</h3>
      {nothing && <p className="mt-6 text-sm text-ink/45">Nothing matches the selected filters.</p>}
      <div className="mt-6 space-y-8">
        {LANE_ORDER.map((lane) => {
          const laneGroups = groups.filter((g) => laneOfTask(g.head as OTask) === lane);
          const laneEvents = fEvents.filter((e) => e.lane === lane);
          if (laneGroups.length === 0 && laneEvents.length === 0) return null;
          const c = LANE_COLOR[lane];
          return (
            <section key={lane}>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded" style={{ backgroundColor: c.dot }} />
                <h4 className="font-display text-lg font-semibold text-pine-deep">{LANE_LABEL[lane]}</h4>
                <span className="text-xs text-ink/40">{laneGroups.length} task{laneGroups.length === 1 ? "" : "s"} · {laneEvents.length} event{laneEvents.length === 1 ? "" : "s"}</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {laneGroups.map((g) => {
                  const t = g.head;
                  const done = g.rows.filter((r) => r.status === "complete").length;
                  const archived = g.rows.every((r) => r.archived);
                  return (
                    <button key={g.key} onClick={() => onOpenTask(t.id)}
                      className="rounded-xl border border-pine/12 bg-paper p-3 text-left transition-colors hover:border-pine/30">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-ink">{t.title}</span>
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: c.bg, color: c.fg }}>Task</span>
                      </div>
                      <p className="mt-1 text-xs text-ink/50">
                        by {nameOf(t.assignerEmail)} · {g.rows.length === 1 ? `to ${nameOf(t.assigneeEmail)}` : `${g.rows.length} people`} · {done}/{g.rows.length} done{archived ? " · archived" : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-ink/40">Due {fmtDateTime(t.dueAt)}</p>
                    </button>
                  );
                })}
                {laneEvents.map((e) => (
                  <button key={e.id} onClick={() => onOpenEvent(e.id)}
                    className="rounded-xl border border-pine/12 bg-paper p-3 text-left transition-colors hover:border-pine/30">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-ink">{e.title}</span>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: c.bg, color: c.fg }}>Event</span>
                    </div>
                    <p className="mt-1 text-xs text-ink/50">by {nameOf(e.creatorEmail)}{e.archived ? " · archived" : ""}</p>
                    <p className="mt-0.5 text-xs text-ink/40">{e.allDay ? `${fmtDateOnly(e.startAt)} · all day` : fmtDateTime(e.startAt)}</p>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
