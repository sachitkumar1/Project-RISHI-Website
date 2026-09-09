import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { canCreateMeeting, canEditMeeting, canManageTask } from "@/lib/lms/permissions";
import { deleteMeeting, getMeeting, updateMeeting, type MeetingPatch } from "@/lib/lms/meetings";
import { broadcastMeetingChange } from "@/lib/lms/realtime";
import { listTasksForMeeting } from "@/lib/lms/store";
import { memberFullName, findMember } from "@/lib/members";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const meeting = await getMeeting(params.id);
  if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });

  // Everyone can view; editing is gated to that group's members (or VP/P).
  const tasks = (await listTasksForMeeting(params.id)).map((t) => ({
    ...t, canManage: canManageTask(me, t),
    assigneeName: findMember(t.assigneeEmail) ? memberFullName(findMember(t.assigneeEmail)!) : t.assigneeEmail,
  }));
  return NextResponse.json({
    meeting, tasks,
    canEdit: canEditMeeting(me, meeting.group),
    canManage: canCreateMeeting(me, meeting.group), // create tasks / delete meeting
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const meeting = await getMeeting(params.id);
  if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  if (!canEditMeeting(me, meeting.group))
    return NextResponse.json({ error: "Only this group's members can edit this meeting." }, { status: 403 });

  let body: MeetingPatch & { clientId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const { clientId, ...patch } = body;
  const updated = await updateMeeting(params.id, patch);
  // Ping everyone viewing this meeting so they refetch and see the change live.
  await broadcastMeetingChange(params.id, updated?.updatedAt ?? new Date().toISOString(), clientId).catch(() => {});
  return NextResponse.json({ meeting: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const meeting = await getMeeting(params.id);
  if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  if (!canCreateMeeting(me, meeting.group))
    return NextResponse.json({ error: "Only leads of this group can delete a meeting." }, { status: 403 });
  await deleteMeeting(params.id);
  return NextResponse.json({ ok: true });
}
