import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { canSeeMember, findMember, MEMBERS } from "@/lib/members";
import { canAssignTasks, canAssignTaskTo, canManageTask } from "@/lib/lms/permissions";
import { createTasks, listTasksForMember } from "@/lib/lms/store";
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

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const tasks = await listTasksForMember(me);
  const withFlags = tasks.map((t) => ({
    ...t,
    canManage: canManageTask(me, t),
    ccEmails: t.emailTemplate ? autoCc(t) : [],
  }));
  return NextResponse.json({ tasks: withFlags });
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
