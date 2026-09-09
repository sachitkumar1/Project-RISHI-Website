// ============================================================================
//  LMS — permission engine
// ----------------------------------------------------------------------------
//  Pure functions that encode the rules from the spec. These are used on the
//  SERVER (in the API routes) to enforce who can do what, and on the client to
//  decide which buttons/options to show. Server enforcement is the source of
//  truth — the UI is just a convenience.
// ============================================================================

import { MEMBERS, canSeeMember, type Member } from "@/lib/members";
import type { ClubEvent, EventScopeKind, ProjectGroup, Task } from "@/lib/lms/types";

const eq = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

// ---------------------------------------------------------------- task assign
/** Can this member assign tasks to anyone at all? */
export function canAssignTasks(m: Member): boolean {
  return m.roles.lead || m.roles.nmtLeader || m.roles.vpp;
}

/** Can `assigner` assign a task to `assignee`? */
export function canAssignTaskTo(assigner: Member, assignee: Member): boolean {
  if (assigner.roles.vpp) return true; // VP/P → anyone in the club
  if (assigner.roles.lead && assignee.group === assigner.group) return true; // Lead → own group (incl. self)
  if (assigner.roles.nmtLeader && assignee.roles.newbie) return true; // NMT leader → newbies
  return false;
}

/** Every member this person is allowed to assign tasks to (hidden test accounts filtered out). */
export function assignableMembers(assigner: Member): Member[] {
  return MEMBERS.filter((m) => canAssignTaskTo(assigner, m) && canSeeMember(assigner.email, m));
}

/** Audience shapes available when ASSIGNING tasks (parallels event scopes). */
export type AssignScopeKind = "members" | "group" | "club";
export function allowedAssignScopes(m: Member): AssignScopeKind[] {
  const s = new Set<AssignScopeKind>();
  if (canAssignTasks(m)) s.add("members"); // pick specific people
  if (m.roles.lead) s.add("group"); // their own whole project group
  if (m.roles.vpp) {
    s.add("group"); // any whole project group
    s.add("club"); // everyone
  }
  return Array.from(s);
}

/** Which whole groups this person can assign a task to. */
export function assignableGroups(m: Member): ProjectGroup[] {
  if (m.roles.vpp) return ["E", "R", "W", "H"];
  if (m.roles.lead) return [m.group];
  return [];
}

// -------------------------------------------------------------- task complete
//  WHO CONTROLS COMPLETION:
//    Only the *manager* of a task — its assigner, plus that assigner's co-leads
//    (same project group) and co-NMT-leaders — may mark a task complete or
//    unmark it. This holds regardless of the doer's own club roles: a P/VP who
//    was assigned a task by someone else is just the doer, not a manager.
//
//    The doer (assignee) never marks their own task complete and never unmarks
//    it. On a task that *requires a submission*, the doer may submit proof of
//    work for review (→ "pending"); a manager then approves it to "complete".
//    A self-assigned task has no separate doer — the one person is the manager
//    and completes it directly through the manager controls.

/** True when the assignee is also the assigner (a task someone gave themselves). */
export function isSelfAssignedTask(task: Task): boolean {
  return eq(task.assigneeEmail, task.assignerEmail);
}

/**
 * The assignee submits proof of work for review → moves the task to "pending".
 * Only allowed for a genuine doer (not self-assigned); the self-assigner uses
 * the manager "mark complete" control instead.
 */
export function canSubmitTask(task: Task, actorEmail: string): boolean {
  return eq(task.assigneeEmail, actorEmail) && !isSelfAssignedTask(task);
}

/** A manager (assigner or co-lead/co-NMT) gives final approval → "complete". */
export function canApproveTask(actor: Member, task: Task): boolean {
  return canManageTask(actor, task);
}

/** A manager rejects a pending submission → back to "not_complete". */
export function canRejectTask(actor: Member, task: Task): boolean {
  return canManageTask(actor, task);
}

/**
 * Unmark a task as complete. ONLY a manager (assigner / co-lead / co-NMT) may
 * do this — never the doer of a task assigned to them by someone else.
 */
export function canUnmarkTask(actor: Member, task: Task): boolean {
  return canManageTask(actor, task);
}

// --------------------------------------------------------------- event create
/** Can this member create events at all? */
export function canCreateEvents(m: Member): boolean {
  return m.roles.nmtLeader || m.roles.lead || m.roles.internal || m.roles.vpp;
}

/** Which audience options this member may pick from when creating an event. */
export function allowedEventScopes(m: Member): EventScopeKind[] {
  const s = new Set<EventScopeKind>();
  if (m.roles.nmtLeader) {
    s.add("members");
    s.add("all_newbies");
  }
  if (m.roles.lead) {
    s.add("members");
    s.add("group"); // their own project group
  }
  if (m.roles.internal || m.roles.vpp) {
    s.add("members");
    s.add("group");
    s.add("club");
  }
  return Array.from(s);
}

/**
 * For a Lead/NMT leader, an event can only target their own people. This
 * returns the set of project groups a member is allowed to target with a
 * "group"-scoped event. VP/P and Internal may target any group.
 */
export function targetableGroups(m: Member): ProjectGroup[] {
  if (m.roles.internal || m.roles.vpp) return ["E", "R", "W", "H"];
  if (m.roles.lead) return [m.group];
  return [];
}

/**
 * Which individual members this person may pick when creating a
 * "specific members" event.
 *   - Internal / VP/P → anyone in the club.
 *   - Lead           → only members of their OWN project group.
 *   - NMT leader     → newbies (NMT events target new members).
 * Roles stack (e.g. a Lead who is also an NMT leader gets both sets).
 */
export function targetableMembers(m: Member): Member[] {
  const list = m.roles.internal || m.roles.vpp ? MEMBERS : (() => {
    const picked = new Map<string, Member>();
    if (m.roles.lead) MEMBERS.filter((x) => x.group === m.group).forEach((x) => picked.set(x.email, x));
    if (m.roles.nmtLeader) MEMBERS.filter((x) => x.roles.newbie).forEach((x) => picked.set(x.email, x));
    return Array.from(picked.values());
  })();
  return list.filter((x) => canSeeMember(m.email, x));
}

/** Server-side check: may this member target exactly these emails with a "members" event? */
export function canTargetMembers(m: Member, emails: string[]): boolean {
  const allowed = new Set(targetableMembers(m).map((x) => x.email.toLowerCase()));
  return emails.every((e) => allowed.has(e.trim().toLowerCase()));
}

// ----------------------------------------------------------- edit / delete
//  Who may edit / delete / approve / archive an existing task or event.
//
//  Ownership follows the CREATOR's peer group:
//    - The creator (task assigner / event creator) always has control.
//    - If the creator is a Lead, every Lead of the SAME project group shares
//      full control (co-leads).
//    - If the creator is an NMT leader, every NMT leader shares full control.
//  Roles stack. There is no blanket VP/P override: a VP/P who was *assigned*
//  something by their group's lead cannot manage it.

/** Everyone who shares control of things created by `creator` (incl. creator). */
export function peerEmails(creator: Member): string[] {
  const set = new Set<string>([creator.email.toLowerCase()]);
  if (creator.roles.lead) {
    MEMBERS.filter((m) => m.roles.lead && m.group === creator.group).forEach((m) =>
      set.add(m.email.toLowerCase()),
    );
  }
  if (creator.roles.nmtLeader) {
    MEMBERS.filter((m) => m.roles.nmtLeader).forEach((m) => set.add(m.email.toLowerCase()));
  }
  return Array.from(set);
}

/** Assigner emails whose tasks `me` may see/manage (me + co-leads + co-NMT). */
export function visibleAssignerEmails(me: Member): string[] {
  return peerEmails(me);
}

/** Can `actor` edit / delete / archive / approve this task? */
export function canManageTask(actor: Member, task: Task): boolean {
  return peerEmails(actor).includes(task.assignerEmail.trim().toLowerCase());
}

/** Who may comment on a task: the people RELEVANT to it — its managers (the
 *  assigner plus their co-leads / co-NMT-leaders) and the person it's assigned
 *  to. Nobody else. */
export function canCommentOnTask(actor: Member, task: Task): boolean {
  return canManageTask(actor, task) || eq(task.assigneeEmail, actor.email);
}

/** Can `actor` edit / delete / archive this event? */
export function canManageEvent(actor: Member, event: ClubEvent): boolean {
  return peerEmails(actor).includes(event.creatorEmail.trim().toLowerCase());
}

// ----------------------------------------------------------- role display
/** Human-readable labels for a member's roles, for display on their profile. */
export function roleLabels(r: import("@/lib/lms/types").RoleFlags): string[] {
  const out: string[] = [];
  if (r.vpp) out.push("VP / President");
  if (r.exec) out.push("Exec");
  if (r.outreach) out.push("Director of Outreach");
  if (r.lead) out.push("Project Lead");
  if (r.internal) out.push("Internal");
  if (r.nmtLeader) out.push("New Member Training Leader");
  if (r.newbie) out.push("New Member");
  return out.length ? out : ["Member"];
}

/** Director of Outreach — the only role that can post Newsletters (Phase 5). */
export function isDirectorOfOutreach(m: Member): boolean {
  return m.roles.outreach;
}

// ============================================================================
//  Announcements — permissions (Phase 3)
// ----------------------------------------------------------------------------
//  Exec: announce to specific members (anyone), any whole group, or the whole
//        club. Leads: only members of their OWN project group.
// ============================================================================

export type AnnounceScopeKind = "members" | "group" | "club";

export function canPostAnnouncements(m: Member): boolean {
  return m.roles.exec || m.roles.lead;
}

export function announceScopes(m: Member): AnnounceScopeKind[] {
  if (m.roles.exec) return ["members", "group", "club"];
  if (m.roles.lead) return ["members", "group"];
  return [];
}

/** Whole groups this member may address. Exec → all; Lead → own group only. */
export function announceGroups(m: Member): ProjectGroup[] {
  if (m.roles.exec) return ["E", "R", "W", "H"];
  if (m.roles.lead) return [m.group];
  return [];
}

/** Individual members this person may address. Exec → anyone; Lead → own group. */
export function announceTargetableMembers(m: Member): Member[] {
  const list = m.roles.exec ? MEMBERS : MEMBERS.filter((x) => x.group === m.group && m.roles.lead);
  return list.filter((x) => canSeeMember(m.email, x));
}

/** Server-side guard: may this member address exactly these recipient emails? */
export function canAnnounceToEmails(m: Member, emails: string[]): boolean {
  if (!canPostAnnouncements(m)) return false;
  const allowed = new Set(announceTargetableMembers(m).map((x) => x.email.toLowerCase()));
  return emails.every((e) => allowed.has(e.trim().toLowerCase()));
}

// ============================================================================
//  Email & Newsletter — permissions (Phase 4)
// ============================================================================

/** Everyone can use the email tool. */
export function canSendEmail(_m: Member): boolean {
  return true;
}

/** Only the Director of Outreach can post Newsletters. */
export function canPostNewsletter(m: Member): boolean {
  return m.roles.outreach;
}

/** Which composer modes a member may open. */
export function availableModes(m: Member): Array<"email" | "announcement" | "newsletter"> {
  const modes: Array<"email" | "announcement" | "newsletter"> = ["email"];
  if (canPostAnnouncements(m)) modes.push("announcement");
  if (canPostNewsletter(m)) modes.push("newsletter");
  return modes;
}

/**
 * May this member send the EMAIL-mode message from the shared club account,
 * given the recipients? Exec always may. A lead may only if every recipient is
 * a member of the lead's own project group. Everyone else: personal only.
 */
export function canEmailFromClub(m: Member, recipientEmails: string[]): boolean {
  if (m.roles.exec) return true;
  if (!m.roles.lead) return false;
  const groupEmails = new Set(
    MEMBERS.filter((x) => x.group === m.group).map((x) => x.email.toLowerCase()),
  );
  return recipientEmails.every((e) => groupEmails.has(e.trim().toLowerCase()));
}

// ------------------------------------------------------------------- meetings
/** Who can CREATE a meeting for a group: that group's leads, or any VP/President. */
export function canCreateMeeting(m: Member, group: ProjectGroup): boolean {
  if (m.roles.vpp) return true;
  return m.roles.lead && m.group === group;
}
/** Who can EDIT a meeting's agenda/notes: any member of that group, or VP/P. */
export function canEditMeeting(m: Member, group: ProjectGroup): boolean {
  return m.group === group || m.roles.vpp;
}
/** Who can edit a group's meeting TEMPLATE: that group's leads, or VP/P. */
export function canEditTemplate(m: Member, group: ProjectGroup): boolean {
  return canCreateMeeting(m, group);
}
