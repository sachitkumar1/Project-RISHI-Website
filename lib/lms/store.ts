// ============================================================================
//  LMS — data store
// ----------------------------------------------------------------------------
//  All task/event reads + writes go through here. Supabase when configured,
//  otherwise an in-memory store seeded with sample data for local preview.
// ============================================================================

import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "@/lib/members";
import { visibleAssignerEmails } from "@/lib/lms/permissions";
import type {
  ClubEvent,
  NewEventInput,
  NewTaskInput,
  Task,
  TaskComment,
  TaskHistoryAction,
  TaskHistoryEntry,
  TaskStatus,
} from "@/lib/lms/types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

let _client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const lc = (s: string) => s.trim().toLowerCase();
const eq = (a?: string | null, b?: string | null) => !!a && !!b && lc(a) === lc(b);

function historyEntry(action: TaskHistoryAction, actorEmail: string, note?: string | null): TaskHistoryEntry {
  return { id: uid(), action, actorEmail: lc(actorEmail), at: now(), note: note?.trim() || undefined };
}

// ----------------------------------------------------------------- row mapping
/* eslint-disable @typescript-eslint/no-explicit-any */
const taskFromRow = (r: any): Task => ({
  id: r.id,
  groupId: r.group_id ?? r.id,
  title: r.title,
  description: r.description ?? "",
  tags: r.tags ?? [],
  dueAt: r.due_at,
  requiresFile: r.requires_file ?? false,
  requireSubmission: r.require_submission ?? false,
  emailTemplate: r.email_template ?? null,
  assignerEmail: r.assigner_email,
  assigneeEmail: r.assignee_email,
  status: r.status as TaskStatus,
  submittedAt: r.submitted_at ?? null,
  submissionText: r.submission_text ?? null,
  submissionLink: r.submission_link ?? null,
  history: (r.history ?? []) as TaskHistoryEntry[],
  comments: (r.comments ?? []) as TaskComment[],
  remindersSent: (r.reminders_sent ?? []) as string[],
  archived: r.archived ?? false,
  createdAt: r.created_at,
});

const eventFromRow = (r: any): ClubEvent => ({
  id: r.id,
  title: r.title,
  description: r.description ?? "",
  startAt: r.start_at,
  endAt: r.end_at ?? null,
  allDay: r.all_day ?? false,
  creatorEmail: r.creator_email,
  scopeKind: r.scope_kind,
  scopeEmails: r.scope_emails ?? [],
  scopeGroups: r.scope_groups ?? [],
  archived: r.archived ?? false,
  createdAt: r.created_at,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// Visibility: is this event relevant to the given member?
function eventVisibleTo(e: ClubEvent, m: Member): boolean {
  if (eq(e.creatorEmail, m.email)) return true;
  if (visibleAssignerEmails(m).includes(lc(e.creatorEmail))) return true; // co-leads / co-NMT
  switch (e.scopeKind) {
    case "club":
      return true;
    case "group":
      return e.scopeGroups.includes(m.group);
    case "members":
      return e.scopeEmails.some((x) => eq(x, m.email));
    case "all_newbies":
      return m.roles.newbie;
    default:
      return false;
  }
}

// ============================================================================
//  IN-MEMORY FALLBACK (seed data)
// ============================================================================
function mkSeedTask(
  t: Omit<Task, "requireSubmission" | "submissionText" | "submissionLink" | "history" | "comments" | "remindersSent">,
): Task {
  return {
    requireSubmission: false,
    submissionText: null,
    submissionLink: null,
    history: [historyEntry("created", t.assignerEmail)],
    comments: [],
    remindersSent: [],
    ...t,
  };
}

const seedTasks: Task[] = [
  mkSeedTask({
    id: "seed-t1", groupId: "seed-t1", title: "Draft Fall recruitment flyer",
    description: "Design the flyer for our Fall info session and share a draft.",
    tags: ["recruitment", "design"], dueAt: new Date(Date.now() + 3 * 864e5).toISOString(),
    requiresFile: false, emailTemplate: null, assignerEmail: "sachitk@berkeley.edu",
    assigneeEmail: "palakprabhakar1@berkeley.edu", status: "not_complete",
    submittedAt: null, archived: false, createdAt: now(),
  }),
  mkSeedTask({
    id: "seed-t2", groupId: "seed-t2", title: "Confirm village contact for water testing",
    description: "Reach out to Naresh Ji and confirm the testing schedule.",
    tags: ["watsan", "logistics"], dueAt: new Date(Date.now() - 1 * 864e5).toISOString(),
    requiresFile: false, emailTemplate: null, assignerEmail: "sachitk@berkeley.edu",
    assigneeEmail: "palakprabhakar1@berkeley.edu", status: "pending",
    submittedAt: now(), archived: false, createdAt: now(),
  }),
  mkSeedTask({
    id: "seed-t3", groupId: "seed-t3", title: "Prepare slides for GM",
    description: "Self-assigned: put together the general meeting deck.",
    tags: ["meeting"], dueAt: new Date(Date.now() + 5 * 864e5).toISOString(),
    requiresFile: false, emailTemplate: null, assignerEmail: "sachitk@berkeley.edu",
    assigneeEmail: "sachitk@berkeley.edu", status: "complete",
    submittedAt: now(), archived: false, createdAt: now(),
  }),
  mkSeedTask({
    id: "seed-t4a", groupId: "seed-grp4", title: "Submit availability for retreat",
    description: "Fill out the when2meet for the spring retreat.", tags: ["retreat"],
    dueAt: new Date(Date.now() + 4 * 864e5).toISOString(), requiresFile: false, emailTemplate: null,
    assignerEmail: "sachitk@berkeley.edu", assigneeEmail: "palakprabhakar1@berkeley.edu",
    status: "complete", submittedAt: now(), archived: false, createdAt: now(),
  }),
  mkSeedTask({
    id: "seed-t4b", groupId: "seed-grp4", title: "Submit availability for retreat",
    description: "Fill out the when2meet for the spring retreat.", tags: ["retreat"],
    dueAt: new Date(Date.now() + 4 * 864e5).toISOString(), requiresFile: false, emailTemplate: null,
    assignerEmail: "sachitk@berkeley.edu", assigneeEmail: "nikita_jadhav@berkeley.edu",
    status: "not_complete", submittedAt: null, archived: false, createdAt: now(),
  }),
];

const seedEvents: ClubEvent[] = [
  {
    id: "seed-e1", title: "All-club General Meeting", description: "Monthly GM — everyone attends.",
    startAt: new Date(Date.now() + 2 * 864e5).toISOString(), endAt: null, allDay: false,
    creatorEmail: "sachitk@berkeley.edu", scopeKind: "club", scopeEmails: [], scopeGroups: [],
    archived: false, createdAt: now(),
  },
  {
    id: "seed-e2", title: "Women's Empowerment sync", description: "Project-group check-in.",
    startAt: new Date(Date.now() + 4 * 864e5).toISOString(), endAt: null, allDay: false,
    creatorEmail: "palakprabhakar1@berkeley.edu", scopeKind: "group", scopeEmails: [], scopeGroups: ["W"],
    archived: false, createdAt: now(),
  },
];

const mem = { tasks: [...seedTasks], events: [...seedEvents] };

// ============================================================================
//  TASKS
// ============================================================================

/** Tasks where I'm the assignee, OR assigned by me / my co-leads / co-NMT. */
export async function listTasksForMember(member: Member): Promise<Task[]> {
  const me = lc(member.email);
  const peers = visibleAssignerEmails(member);
  if (usingSupabase) {
    const inList = peers.map((e) => `"${e}"`).join(",");
    const { data, error } = await sb()
      .from("lms_tasks")
      .select("*")
      .or(`assignee_email.eq.${me},assigner_email.in.(${inList})`)
      .order("due_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(taskFromRow);
  }
  const peerSet = new Set(peers);
  return mem.tasks
    .filter((t) => eq(t.assigneeEmail, me) || peerSet.has(lc(t.assignerEmail)))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export async function createTasks(input: NewTaskInput, assignerEmail: string, meetingId?: string): Promise<Task[]> {
  const groupId = uid();
  const base = {
    meeting_id: meetingId ?? null,
    group_id: groupId,
    title: input.title,
    description: input.description,
    tags: input.tags,
    due_at: input.dueAt,
    requires_file: input.requiresFile,
    require_submission: input.requireSubmission,
    email_template: input.emailTemplate ?? null,
    assigner_email: assignerEmail,
  };
  if (usingSupabase) {
    const rows = input.assigneeEmails.map((assignee) => ({
      ...base,
      assignee_email: assignee,
      status: "not_complete",
      history: [historyEntry("created", assignerEmail)],
      comments: [],
      reminders_sent: [],
    }));
    const { data, error } = await sb().from("lms_tasks").insert(rows).select("*");
    if (error) throw new Error(error.message);
    return (data ?? []).map(taskFromRow);
  }
  const created = input.assigneeEmails.map((assignee) =>
    mkSeedTask({
      id: uid(), groupId, title: input.title, description: input.description, tags: input.tags,
      dueAt: input.dueAt, requiresFile: input.requiresFile, emailTemplate: input.emailTemplate ?? null,
      assignerEmail, assigneeEmail: assignee, status: "not_complete", submittedAt: null,
      archived: false, createdAt: now(),
    }),
  );
  created.forEach((t) => { t.requireSubmission = input.requireSubmission; (t as Task & { meetingId?: string }).meetingId = meetingId; });
  mem.tasks.push(...created);
  return created;
}

export async function getTask(id: string): Promise<Task | null> {
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_tasks").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? taskFromRow(data) : null;
  }
  return mem.tasks.find((t) => t.id === id) ?? null;
}

async function patchTask(id: string, fields: Record<string, unknown>): Promise<Task> {
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_tasks").update(fields).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return taskFromRow(data);
  }
  const t = mem.tasks.find((x) => x.id === id);
  if (!t) throw new Error("Task not found");
  const map: Record<string, keyof Task> = {
    status: "status", submitted_at: "submittedAt", submission_text: "submissionText",
    submission_link: "submissionLink", history: "history", comments: "comments",
    reminders_sent: "remindersSent", title: "title", description: "description", tags: "tags",
    due_at: "dueAt", requires_file: "requiresFile", require_submission: "requireSubmission",
    assignee_email: "assigneeEmail", email_template: "emailTemplate", archived: "archived",
  };
  for (const [k, v] of Object.entries(fields)) {
    const key = map[k];
    if (key) (t as Record<string, unknown>)[key] = v;
  }
  return t;
}

/** Assignee marks the task done. Self-assigned -> completes immediately. */
export async function submitTask(
  task: Task,
  submission: { text: string | null; link: string | null },
): Promise<Task> {
  const selfAssigned = eq(task.assignerEmail, task.assigneeEmail);
  const status: TaskStatus = selfAssigned ? "complete" : "pending";
  const history = [...task.history, historyEntry("submitted", task.assigneeEmail)];
  return patchTask(task.id, {
    status,
    submitted_at: now(),
    submission_text: submission.text,
    submission_link: submission.link,
    history,
  });
}

export async function approveTask(task: Task, actorEmail: string): Promise<Task> {
  const history = [...task.history, historyEntry("approved", actorEmail)];
  return patchTask(task.id, { status: "complete", history });
}

export async function nudgeTask(task: Task, actorEmail: string): Promise<Task> {
  const history = [...task.history, historyEntry("nudged", actorEmail)];
  return patchTask(task.id, { history });
}
export async function rejectTask(task: Task, actorEmail: string, note?: string | null): Promise<Task> {
  const history = [...task.history, historyEntry("rejected", actorEmail, note)];
  return patchTask(task.id, { status: "not_complete", history });
}

export async function unmarkTask(task: Task, actorEmail: string, note?: string | null): Promise<Task> {
  const history = [...task.history, historyEntry("unmarked", actorEmail, note)];
  return patchTask(task.id, { status: "not_complete", history });
}

export async function addTaskComment(
  task: Task,
  authorEmail: string,
  body: string,
  parentId: string | null,
): Promise<Task> {
  const comment: TaskComment = { id: uid(), authorEmail: lc(authorEmail), body, at: now(), parentId };
  return patchTask(task.id, { comments: [...task.comments, comment] });
}

export type TaskEdit = {
  title: string;
  description: string;
  tags: string[];
  dueAt: string;
  requiresFile: boolean;
  requireSubmission: boolean;
  assigneeEmail: string;
  emailTemplate: { subject: string; bodyHtml: string } | null;
};

export async function updateTask(task: Task, fields: TaskEdit): Promise<Task> {
  const history = [...task.history, historyEntry("edited", task.assignerEmail)];
  return patchTask(task.id, {
    title: fields.title,
    description: fields.description,
    tags: fields.tags,
    due_at: fields.dueAt,
    requires_file: fields.requiresFile,
    require_submission: fields.requireSubmission,
    assignee_email: fields.assigneeEmail,
    email_template: fields.emailTemplate,
    history,
  });
}

export async function deleteTask(id: string): Promise<void> {
  if (usingSupabase) {
    const { error } = await sb().from("lms_tasks").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  mem.tasks = mem.tasks.filter((t) => t.id !== id);
}

export async function setTaskArchived(id: string, archived: boolean): Promise<Task> {
  return patchTask(id, { archived });
}

// ---- Part 8: whole-club listings (P/VP Full Club Overview) ----
export async function listTasksForMeeting(meetingId: string): Promise<Task[]> {
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_tasks").select("*").eq("meeting_id", meetingId);
    if (error) throw new Error(error.message);
    return (data ?? []).map(taskFromRow);
  }
  return mem.tasks.filter((t) => (t as Task & { meetingId?: string }).meetingId === meetingId);
}

export async function listAllTasks(): Promise<Task[]> {
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_tasks").select("*").order("due_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(taskFromRow);
  }
  return [...mem.tasks].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export async function listAllEvents(): Promise<ClubEvent[]> {
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_events").select("*").order("start_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(eventFromRow);
  }
  return [...mem.events].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

// ---- Part 3: fetch + edit a whole task group (add/remove assignees) ----
export async function getTasksByGroup(groupId: string): Promise<Task[]> {
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_tasks").select("*").eq("group_id", groupId);
    if (error) throw new Error(error.message);
    return (data ?? []).map(taskFromRow);
  }
  return mem.tasks.filter((t) => (t.groupId || t.id) === groupId);
}

export type GroupEdit = {
  title: string;
  description: string;
  tags: string[];
  dueAt: string;
  requiresFile: boolean;
  requireSubmission: boolean;
  emailTemplate: { subject: string; bodyHtml: string } | null;
  assigneeEmails: string[]; // the DESIRED full set of assignees
};

/**
 * Apply a single edit across an entire task group: update shared fields on the
 * rows that stay, create fresh rows for newly-added assignees, and delete the
 * rows of assignees that were removed. Returns the new rows (so the caller can
 * email them) and how many were removed.
 */
export async function editTaskGroup(
  groupId: string,
  assignerEmail: string,
  edit: GroupEdit,
): Promise<{ added: Task[]; removed: Task[]; retained: Task[] }> {
  const rows = await getTasksByGroup(groupId);
  const desired = Array.from(new Set(edit.assigneeEmails.map(lc)));
  const toAdd = desired.filter((e) => !rows.some((r) => eq(r.assigneeEmail, e)));
  const toRemove = rows.filter((r) => !desired.includes(lc(r.assigneeEmail)));
  const retained = rows.filter((r) => desired.includes(lc(r.assigneeEmail)));

  const shared = {
    title: edit.title,
    description: edit.description,
    tags: edit.tags,
    due_at: edit.dueAt,
    requires_file: edit.requiresFile,
    require_submission: edit.requireSubmission,
    email_template: edit.emailTemplate,
  };

  for (const r of retained) {
    await patchTask(r.id, { ...shared, history: [...r.history, historyEntry("edited", assignerEmail)] });
  }
  for (const r of toRemove) await deleteTask(r.id);

  let added: Task[] = [];
  if (toAdd.length) {
    if (usingSupabase) {
      const insertRows = toAdd.map((assignee) => ({
        group_id: groupId,
        ...shared,
        assigner_email: assignerEmail,
        assignee_email: assignee,
        status: "not_complete",
        history: [historyEntry("created", assignerEmail)],
        comments: [],
        reminders_sent: [],
      }));
      const { data, error } = await sb().from("lms_tasks").insert(insertRows).select("*");
      if (error) throw new Error(error.message);
      added = (data ?? []).map(taskFromRow);
    } else {
      added = toAdd.map((assignee) =>
        mkSeedTask({
          id: uid(), groupId, title: edit.title, description: edit.description, tags: edit.tags,
          dueAt: edit.dueAt, requiresFile: edit.requiresFile, emailTemplate: edit.emailTemplate,
          assignerEmail, assigneeEmail: assignee, status: "not_complete", submittedAt: null,
          archived: false, createdAt: now(),
        }),
      );
      added.forEach((t) => (t.requireSubmission = edit.requireSubmission));
      mem.tasks.push(...added);
    }
  }
  return { added, removed: toRemove, retained };
}

// ---- reminder support (cron) ----------------------------------------------
export async function listRemindableTasks(): Promise<Task[]> {
  if (usingSupabase) {
    const { data, error } = await sb()
      .from("lms_tasks")
      .select("*")
      .eq("archived", false)
      .eq("status", "not_complete");
    if (error) throw new Error(error.message);
    return (data ?? []).map(taskFromRow);
  }
  return mem.tasks.filter((t) => !t.archived && t.status === "not_complete");
}

export async function markRemindersSent(id: string, keys: string[]): Promise<void> {
  await patchTask(id, { reminders_sent: keys });
}

// ============================================================================
//  EVENTS
// ============================================================================

export async function listEventsForMember(member: Member): Promise<ClubEvent[]> {
  let all: ClubEvent[];
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_events").select("*").order("start_at", { ascending: true });
    if (error) throw new Error(error.message);
    all = (data ?? []).map(eventFromRow);
  } else {
    all = [...mem.events].sort((a, b) => a.startAt.localeCompare(b.startAt));
  }
  return all.filter((e) => eventVisibleTo(e, member));
}

export async function createEvent(input: NewEventInput, creatorEmail: string): Promise<ClubEvent> {
  if (usingSupabase) {
    const { data, error } = await sb()
      .from("lms_events")
      .insert({
        title: input.title,
        description: input.description,
        start_at: input.startAt,
        end_at: input.endAt,
        all_day: input.allDay,
        creator_email: creatorEmail,
        scope_kind: input.scopeKind,
        scope_emails: input.scopeEmails,
        scope_groups: input.scopeGroups,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return eventFromRow(data);
  }
  const e: ClubEvent = {
    id: uid(), title: input.title, description: input.description, startAt: input.startAt,
    endAt: input.endAt, allDay: input.allDay, creatorEmail, scopeKind: input.scopeKind,
    scopeEmails: input.scopeEmails, scopeGroups: input.scopeGroups, archived: false, createdAt: now(),
  };
  mem.events.push(e);
  return e;
}

export type EventEdit = {
  title: string;
  description: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  scopeKind: ClubEvent["scopeKind"];
  scopeEmails: string[];
  scopeGroups: ClubEvent["scopeGroups"];
};

export async function updateEvent(id: string, fields: EventEdit): Promise<ClubEvent> {
  if (usingSupabase) {
    const { data, error } = await sb()
      .from("lms_events")
      .update({
        title: fields.title,
        description: fields.description,
        start_at: fields.startAt,
        end_at: fields.endAt,
        all_day: fields.allDay,
        scope_kind: fields.scopeKind,
        scope_emails: fields.scopeEmails,
        scope_groups: fields.scopeGroups,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return eventFromRow(data);
  }
  const e = mem.events.find((x) => x.id === id)!;
  Object.assign(e, fields);
  return e;
}

export async function getEvent(id: string): Promise<ClubEvent | null> {
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_events").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? eventFromRow(data) : null;
  }
  return mem.events.find((e) => e.id === id) ?? null;
}

export async function deleteEvent(id: string): Promise<void> {
  if (usingSupabase) {
    const { error } = await sb().from("lms_events").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  mem.events = mem.events.filter((e) => e.id !== id);
}

export async function setEventArchived(id: string, archived: boolean): Promise<ClubEvent> {
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_events").update({ archived }).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return eventFromRow(data);
  }
  const e = mem.events.find((x) => x.id === id);
  if (!e) throw new Error("Event not found");
  e.archived = archived;
  return e;
}

// ============================================================================
//  Member profiles (avatars)
// ============================================================================

const memProfiles = new Map<string, string>();

export async function getAvatar(email: string): Promise<string | null> {
  const key = lc(email);
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_profiles").select("avatar").eq("email", key).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.avatar ?? null;
  }
  return memProfiles.get(key) ?? null;
}

export async function getAvatars(emails: string[]): Promise<Record<string, string>> {
  const keys = Array.from(new Set(emails.map(lc)));
  if (keys.length === 0) return {};
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_profiles").select("email, avatar").in("email", keys);
    if (error) throw new Error(error.message);
    const out: Record<string, string> = {};
    for (const r of data ?? []) if (r.avatar) out[String(r.email).toLowerCase()] = r.avatar;
    return out;
  }
  const out: Record<string, string> = {};
  for (const k of keys) { const v = memProfiles.get(k); if (v) out[k] = v; }
  return out;
}

export async function setAvatar(email: string, avatar: string | null): Promise<void> {
  const key = lc(email);
  if (usingSupabase) {
    const { error } = await sb()
      .from("lms_profiles")
      .upsert({ email: key, avatar, updated_at: now() }, { onConflict: "email" });
    if (error) throw new Error(error.message);
    return;
  }
  if (avatar) memProfiles.set(key, avatar);
  else memProfiles.delete(key);
}
