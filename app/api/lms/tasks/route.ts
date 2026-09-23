import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { canSeeMember, findMember, MEMBERS } from "@/lib/members";
import { canAssignTasks, canAssignTaskTo, canManageTask } from "@/lib/lms/permissions";
import { createTasks, listTasksInGroups, listTasksForMember, countPastTaskGroups } from "@/lib/lms/store";
import { syncTasksIfRealtime } from "@/lib/lms/sheets";
import { notifyTaskAssigned } from "@/lib/lms/notify";
import type { NewTaskInput, Task } from "@/lib/lms/types";

export const dynamic = "force-dynamic";

// Auto-CC for a task email: if the assigner is a lead, CC every project lead of
// the assignee's group; otherwise CC the assigner. The doer can remove these.
function autoCc(t: Task): string[] {
  const assigner = findMember(t.assignerEmail);
  const assignee = findMember(t.assigneeEmail);
  if (!assigner) return [];
  if (assigner.roles.lead && assignee) {
    return MEMBERS.filter((m) => m.group === assignee.group && m.roles.lead && !m.hidden).map((m) => m.email);
  }
  return [assigner.email];
}

export async function GET(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  // ?scope=active → outstanding work only (what the dashboard shows). The
  // History popup asks for everything. Default stays "all" for any other caller.
  const scope = new URL(req.url).searchParams.get("scope") === "active" ? "active" : "all";
  const [tasks, pastGroupCount] = await Promise.all([
    listTasksForMember(me, scope),
    scope === "active" ? countPastTaskGroups(me) : Promise.resolve(undefined),
  ]);

  // Who else is on the same task. A task shared by several people is stored as
  // one row each, so an assignee would otherwise have no idea anyone else was
  // working on it. Only the people and their progress are exposed — nothing
  // about tasks the person isn't part of.
  //
  // Scoped to the task groups this person is actually on, rather than reading
  // every task in the club to answer the same question.
  const shared = await listTasksInGroups(tasks.map((t) => t.groupId || t.id));
  const byGroup = new Map<string, { email: string; status: string }[]>();
  for (const t of shared) {
    const key = t.groupId || t.id;
    const arr = byGroup.get(key);
    const entry = { email: t.assigneeEmail, status: t.status };
    if (arr) arr.push(entry);
    else byGroup.set(key, [entry]);
  }

  const withFlags = tasks.map((t) => ({
    ...t,
    canManage: canManageTask(me, t),
    ccEmails: t.emailTemplate ? autoCc(t) : [],
    coAssignees: (byGroup.get(t.groupId || t.id) ?? []).filter(
      (x) => x.email.toLowerCase() !== t.assigneeEmail.toLowerCase(),
    ),
  }));
  return NextResponse.json({ tasks: withFlags, pastGroupCount });
}

export async function POST(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  if (!canAssignTasks(me))
    return NextResponse.json({ error: "You can't assign tasks." }, { status: 403 });

  let body: Partial<NewTaskInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  const assigneeEmails = Array.isArray(body.assigneeEmails) ? body.assigneeEmails : [];
  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });
  if (!body.dueAt) return NextResponse.json({ error: "A due date is required." }, { status: 400 });
  if (assigneeEmails.length === 0)
    return NextResponse.json({ error: "Pick at least one person." }, { status: 400 });

  for (const email of assigneeEmails) {
    const target = findMember(email);
    if (!target || !canAssignTaskTo(me, target) || !canSeeMember(me.email, target)) {
      return NextResponse.json({ error: `You can't assign tasks to ${email}.` }, { status: 403 });
    }
  }

  const meetingId = typeof (body as { meetingId?: string }).meetingId === "string" ? (body as { meetingId?: string }).meetingId : undefined;
  const created = await createTasks(
    {
      title,
      description: (body.description ?? "").trim(),
      tags: Array.isArray(body.tags) ? body.tags : [],
      dueAt: body.dueAt,
      requiresFile: Boolean(body.requiresFile),
      requireSubmission: Boolean(body.requireSubmission),
      emailTemplate:
        body.emailTemplate && (body.emailTemplate.subject || body.emailTemplate.bodyHtml)
          ? { subject: body.emailTemplate.subject ?? "", bodyHtml: body.emailTemplate.bodyHtml ?? "" }
          : null,
      assigneeEmails,
    },
    me.email,
    meetingId,
  );

  // Email + notify each assignee that a task was created for them (best-effort).
  await Promise.allSettled(created.map((t) => notifyTaskAssigned(t)));

  // Mirror the new task(s) into the task Google Sheet (real-time mode only).
  await syncTasksIfRealtime();
  return NextResponse.json({ tasks: created }, { status: 201 });
}
