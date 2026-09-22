import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { MEMBERS, findMember } from "@/lib/members";
import { canManageEvent, canManageTask } from "@/lib/lms/permissions";
import { getAvatars, listAllEvents, listAllTasks } from "@/lib/lms/store";
import type { ProjectGroup } from "@/lib/lms/types";

export const dynamic = "force-dynamic";

// A "lane" is the colour/section a task or event falls into on the overview.
// It is decided by the ROLE of the person who assigned the task / created the
// event: a Lead → their project group; an NMT leader → NMT; anyone else → OTHER.
export type Lane = ProjectGroup | "NMT" | "OTHER";

function laneFor(email: string): Lane {
  const m = findMember(email);
  if (!m) return "OTHER";
  if (m.roles.lead && m.group) return m.group; // lead-first precedence
  if (m.roles.nmtLeader) return "NMT";
  return "OTHER";
}

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const [tasks, events] = await Promise.all([listAllTasks(), listAllEvents()]);

  const tasksOut = tasks.map((t) => ({
    ...t,
    lane: laneFor(t.assignerEmail),
    canManage: canManageTask(me, t),
  }));
  const eventsOut = events.map((e) => ({
    ...e,
    lane: laneFor(e.creatorEmail),
    canManage: canManageEvent(me, e),
  }));

  // Name/group/avatar map for everyone (names aren't sensitive; used for display).
  const avatarMap = await getAvatars(MEMBERS.map((m) => m.email));
  const members: Record<string, { name: string; group: ProjectGroup | null; avatar: string | null }> = {};
  for (const m of MEMBERS) {
    members[m.email.toLowerCase()] = {
      name: `${m.firstName} ${m.lastName}`,
      group: m.group,
      avatar: avatarMap[m.email.toLowerCase()] ?? null,
    };
  }

  return NextResponse.json({ tasks: tasksOut, events: eventsOut, members });
}
