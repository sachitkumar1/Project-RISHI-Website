// ============================================================================
//  Notify — task/event emails + in-dashboard notifications
// ----------------------------------------------------------------------------
//  One place that owns every templated message in the spec. Each call sends an
//  email FROM the notifications account (projectrishiucberkeley@gmail.com) AND writes a
//  matching notification (title = subject, body = body) so the dashboard bell
//  shows it too. Everything here is best-effort: a delivery failure is logged
//  but never breaks the task/event action that triggered it.
// ============================================================================

import { findMember, memberFullName, MEMBERS, type Member } from "@/lib/members";
import {
  getGmailConnection,
  sendViaConnection,
  NOTIFY_SENDER,
  NOTIFY_FROM_NAME,
} from "@/lib/lms/gmail";
import { addNotification } from "@/lib/lms/notifications";
import { peerEmails } from "@/lib/lms/permissions";
import type { ClubEvent, Task } from "@/lib/lms/types";
import { PROJECT_GROUP_LABELS } from "@/lib/lms/types";

const nameOf = (email: string) => {
  const m = findMember(email);
  return m ? memberFullName(m) : email;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const htmlFromText = (text: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1B2620">${esc(
    text,
  ).replace(/\n/g, "<br>")}</div>`;

// `datetime-local` values are converted to UTC before being saved. Vercel/Node
// often formats dates in UTC by default, which made task emails show due times
// 7+ hours ahead of what the dashboard form showed. Always render LMS emails in
// the club's local timezone so the email matches the selected due time.
const LMS_TIME_ZONE = "America/Los_Angeles";

const fmtDue = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: LMS_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

/**
 * Email one recipient from the club account AND drop a notification in their
 * dashboard. Both are best-effort and independent — if email fails, the
 * notification still lands, and vice-versa.
 */
async function notify(
  recipientEmail: string,
  subject: string,
  body: string,
  kind: string,
  refId: string | null,
): Promise<void> {
  // In-dashboard notification (also drives the browser notification).
  try {
    await addNotification({ userEmail: recipientEmail, title: subject, body, kind, refId });
  } catch (e) {
    console.error("notify: notification write failed", (e as Error).message);
  }
  // Email from the club notifications account.
  try {
    const conn = await getGmailConnection(NOTIFY_SENDER);
    if (!conn) return; // notifications Gmail not connected yet — notification still delivered
    const fromEmail = conn.connectedGoogleEmail ?? conn.accountEmail;
    await sendViaConnection(conn, {
      fromEmail,
      fromName: NOTIFY_FROM_NAME,
      to: [recipientEmail],
      subject,
      html: htmlFromText(body),
    });
  } catch (e) {
    console.error("notify: email send failed", (e as Error).message);
  }
}

// Append a free-text note (a comment) to a body, if one was given.
const withNote = (body: string, note?: string | null) =>
  note && note.trim() ? `${body}\n\nNote: ${note.trim()}` : body;

// ---------------------------------------------------------------- TASK EMAILS

/** A task was assigned → email/notify the assignee. */
export async function notifyTaskAssigned(task: Task): Promise<void> {
  const assigner = nameOf(task.assignerEmail);
  const subject = `Task Assigned: ${task.title}`;
  const body =
    `${assigner} has assigned you a new task: ${task.title}. ` +
    `Please complete it and mark it as done on your Member Dashboard by ${fmtDue(task.dueAt)}.\n\n` +
    `Task Description: ${task.description || "(none)"}`;
  await notify(task.assigneeEmail, subject, body, "task_assigned", task.id);
}

/** The doer marked it done → email/notify the assigner (pending their approval). */
export async function notifyTaskSubmitted(task: Task, note?: string | null): Promise<void> {
  const doer = nameOf(task.assigneeEmail);
  const subject = `${doer} completed ${task.title} — awaiting your approval`;
  const body = withNote(
    `${doer} completed "${task.title}". It is awaiting your approval.`,
    note,
  );
  // Notify the task's managers: its assigner plus that assigner's co-leads /
  // co-NMT-leaders — the people responsible for approving it.
  const assigner = findMember(task.assignerEmail);
  const managers = assigner ? peerEmails(assigner) : [task.assignerEmail.trim().toLowerCase()];
  const doerEmail = task.assigneeEmail.trim().toLowerCase();
  for (const email of managers) {
    if (email === doerEmail) continue; // never notify the doer of their own submission
    await notify(email, subject, body, "task_submitted", task.id).catch(() => {});
  }
}

/** Completion approved → email/notify the doer. */
export async function notifyTaskApproved(task: Task, approverEmail: string): Promise<void> {
  const approver = nameOf(approverEmail);
  const subject = `${approver} has Approved Completion of "${task.title}"`;
  const body = `Congrats! ${approver} has approved the completion of "${task.title}".`;
  await notify(task.assigneeEmail, subject, body, "task_approved", task.id);
}

/** Completion rejected → email/notify the doer. */
export async function notifyTaskRejected(
  task: Task,
  rejecterEmail: string,
  note?: string | null,
): Promise<void> {
  const rejecter = nameOf(rejecterEmail);
  const subject = `${rejecter} has Rejected Completion of "${task.title}"`;
  const body = withNote(
    `${rejecter} has rejected the completion of "${task.title}". Please revisit.`,
    note,
  );
  await notify(task.assigneeEmail, subject, body, "task_rejected", task.id);
}

/** A completed task was unmarked by the creator → email/notify the doer. */
export async function notifyTaskUnmarked(
  task: Task,
  unmarkerEmail: string,
  note?: string | null,
): Promise<void> {
  const unmarker = nameOf(unmarkerEmail);
  const subject = `${task.title} has been Unmarked as Complete`;
  const body = withNote(
    `Your task, "${task.title}" has been unmarked as complete by ${unmarker}. Please revisit.`,
    note,
  );
  await notify(task.assigneeEmail, subject, body, "task_unmarked", task.id);
}

/** A task was deleted → email/notify the doer. */
export async function notifyTaskDeleted(task: Task, actorEmail: string): Promise<void> {
  const actor = nameOf(actorEmail);
  const subject = `Task Deleted: ${task.title}`;
  const body =
    `Your task, "${task.title}", assigned by ${nameOf(task.assignerEmail)}, ` +
    `has been deleted by ${actor} and removed from your Member Dashboard.`;
  await notify(task.assigneeEmail, subject, body, "task_deleted", task.id);
}

/** A task was archived → email/notify the doer. */
export async function notifyTaskArchived(task: Task, actorEmail: string): Promise<void> {
  const actor = nameOf(actorEmail);
  const subject = `Task Archived: ${task.title}`;
  const body =
    `Your task, "${task.title}", has been archived by ${actor} ` +
    `and moved to your past tasks on the Member Dashboard.`;
  await notify(task.assigneeEmail, subject, body, "task_archived", task.id);
}

/** Reminder (cron) → email/notify the doer. `phrase` like "in 3 days" / "by 2 days". */
/**
 * A manual "Nudge" from an assigner/co-lead to one assignee: a personal reminder
 * email (and dashboard notification) that shows how long until the task is due,
 * or how long it's been overdue.
 */
export async function notifyTaskNudge(task: Task, nudgerEmail: string): Promise<void> {
  const nudger = nameOf(nudgerEmail);
  const ms = new Date(task.dueAt).getTime() - Date.now();
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const timing = overdue
    ? `It is past due by ${days} days and ${hours} hours.`
    : `It is due in ${days} days and ${hours} hours.`;
  const subject = `Reminder to complete: ${task.title}`;
  const body = `${nudger} is reminding you to complete the task ${task.title}. ${timing}`;
  await notify(task.assigneeEmail, subject, body, "task_nudge", task.id);
}

export async function notifyTaskReminder(
  task: Task,
  state: "due" | "past due",
  phrase: string,
): Promise<void> {
  const subject = `Task Reminder: ${task.title} is ${state} ${phrase}`;
  const body = `${task.title} is ${state} ${phrase}. Please complete as soon as possible and submit for approval.`;
  await notify(task.assigneeEmail, subject, body, "task_reminder", task.id);
}

// --------------------------------------------------------------- EVENT EMAILS
//  Events have an audience rather than a single assignee, so we resolve the
//  member emails the event targets and notify each of them.

function eventAudience(event: ClubEvent): string[] {
  const set = new Set<string>();
  const add = (e: string) => set.add(e.toLowerCase());
  switch (event.scopeKind) {
    case "club":
      MEMBERS.forEach((m) => add(m.email));
      break;
    case "group":
      MEMBERS.filter((m) => event.scopeGroups.includes(m.group)).forEach((m) => add(m.email));
      break;
    case "all_newbies":
      MEMBERS.filter((m) => m.roles.newbie).forEach((m) => add(m.email));
      break;
    case "members":
      event.scopeEmails.forEach(add);
      break;
  }
  add(event.creatorEmail); // the creator always hears about their own event
  return Array.from(set);
}

function eventWhen(event: ClubEvent): string {
  if (event.allDay) {
    const d = new Date(event.startAt).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${d} (all day)`;
  }
  const start = fmtDue(event.startAt);
  return event.endAt ? `${start} – ${fmtDue(event.endAt)}` : start;
}

function eventAudienceLabel(event: ClubEvent): string {
  switch (event.scopeKind) {
    case "club":
      return "the whole club";
    case "all_newbies":
      return "all newbies";
    case "group":
      return event.scopeGroups.map((g) => PROJECT_GROUP_LABELS[g]).join(", ");
    case "members":
      return `${event.scopeEmails.length} member(s)`;
  }
}

/** An event was created → email/notify everyone in its audience. */
export async function notifyEventCreated(event: ClubEvent): Promise<void> {
  const creator = nameOf(event.creatorEmail);
  const subject = `New Event: ${event.title}`;
  const body =
    `${creator} created a new event: ${event.title} — ${eventWhen(event)} ` +
    `(for ${eventAudienceLabel(event)}).` +
    (event.description ? `\n\nDetails: ${event.description}` : "");
  await Promise.all(
    eventAudience(event).map((email) => notify(email, subject, body, "event_created", event.id)),
  );
}

/** An event was removed → email/notify everyone in its audience. */
export async function notifyEventRemoved(event: ClubEvent): Promise<void> {
  const creator = nameOf(event.creatorEmail);
  const subject = `Event Canceled: ${event.title}`;
  const body = `${creator} canceled the event "${event.title}" (was ${eventWhen(event)}).`;
  await Promise.all(
    eventAudience(event).map((email) => notify(email, subject, body, "event_removed", event.id)),
  );
}

// Re-export for callers that want the audience (e.g. reminder/debug tooling).
export { eventAudience };
export type { Member };
