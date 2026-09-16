import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { MEMBERS, visibleMembers } from "@/lib/members";
import { getAvatars } from "@/lib/lms/store";
import {
  allowedAssignScopes,
  allowedEventScopes,
  assignableGroups,
  assignableMembers,
  canAssignTasks,
  canCreateEvents,
  targetableGroups,
  targetableMembers,
} from "@/lib/lms/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  // Avatars for everyone this person can see, so the board can show a small
  // photo next to each assignee in their "Assigned by me" list.
  const visible = visibleMembers(me.email);
  const avatarMap = await getAvatars(visible.map((m) => m.email));

  const lite = (m: typeof MEMBERS[number]) => ({
    email: m.email,
    name: `${m.firstName} ${m.lastName}`,
    group: m.group,
    avatar: avatarMap[m.email.toLowerCase()] ?? null,
    // Used by History to say who a task came from — a co-lead or NMT.
    lead: m.roles.lead,
    nmt: m.roles.nmtLeader,
  });
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

  return NextResponse.json({
    me: {
      email: me.email,
      name: `${me.firstName} ${me.lastName}`,
      group: me.group,
      roles: me.roles,
      avatar: avatarMap[me.email.toLowerCase()] ?? null,
    },
    can: {
      assignTasks: canAssignTasks(me),
      createEvents: canCreateEvents(me),
    },
    assignableMembers: assignableMembers(me).map(lite).sort(byName),
    assignScopes: allowedAssignScopes(me),
    assignableGroups: assignableGroups(me),
    eventScopes: allowedEventScopes(me),
    targetableGroups: targetableGroups(me),
    eventMemberTargets: targetableMembers(me).map(lite).sort(byName),
    allMembers: visibleMembers(me.email).map(lite).sort(byName),
  });
}
