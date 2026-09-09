import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { canCreateMeeting } from "@/lib/lms/permissions";
import { createMeeting, listMeetings } from "@/lib/lms/meetings";
import { PROJECT_GROUPS, type ProjectGroup } from "@/lib/lms/types";

export const dynamic = "force-dynamic";

const isGroup = (g: unknown): g is ProjectGroup => PROJECT_GROUPS.includes(g as ProjectGroup);

export async function GET(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const group = new URL(req.url).searchParams.get("group");
  if (!isGroup(group)) return NextResponse.json({ error: "Unknown group." }, { status: 400 });
  const meetings = await listMeetings(group);
  // Lightweight list: drop the heavy blocks payload.
  const list = meetings.map(({ blocks, ...m }) => ({ ...m, blockCount: blocks.length }));
  return NextResponse.json({ meetings: list, canCreate: canCreateMeeting(me, group) });
}

export async function POST(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  let body: { group?: string; title?: string; date?: string | null; location?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  if (!isGroup(body.group)) return NextResponse.json({ error: "Unknown group." }, { status: 400 });
  if (!canCreateMeeting(me, body.group))
    return NextResponse.json({ error: "Only leads of this group can create a meeting." }, { status: 403 });
  const meeting = await createMeeting(body.group, me.email, {
    title: body.title, date: body.date ?? null, location: body.location, attendees: [],
  });
  return NextResponse.json({ meeting }, { status: 201 });
}
