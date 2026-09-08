// ============================================================================
//  LMS — shared types
// ============================================================================

export type ProjectGroup = "E" | "R" | "W" | "H";

export const PROJECT_GROUPS: ProjectGroup[] = ["E", "R", "W", "H"];

export const PROJECT_GROUP_LABELS: Record<ProjectGroup, string> = {
  E: "Education",
  R: "Water & Sanitation",
  W: "Women's Empowerment",
  H: "Health",
};

export type RoleFlags = {
  nmtLeader: boolean; // New Member Training leader
  newbie: boolean;
  lead: boolean; // head of a project group
  internal: boolean;
  vpp: boolean; // VP / President
  exec: boolean;
  outreach: boolean; // Director of Outreach (can post Newsletters)
  /** Site administrator. Implies every permission on the site, and is the only
   *  role that may manually sync the roster sheet. Never shown in the directory. */
  webmaster: boolean;
  // Specific Exec titles (under the "exec" umbrella):
  financeDirector: boolean; // Director of Finance
  internationalDirector: boolean; // Director of International Affairs
  // Specific VP/P titles (under the "vpp" umbrella):
  president: boolean;
  vpProjects: boolean; // VP of Projects
  vpInternal: boolean; // VP Internal
};

export type MemberProfile = {
  email: string;
  firstName: string;
  lastName: string;
  group: ProjectGroup;
  roles: RoleFlags;
};

// ---- Tasks ----
export type TaskStatus = "not_complete" | "pending" | "complete";

export type EmailTemplate = { subject: string; bodyHtml: string };

// A single entry in a task's activity history (one per assignee row).
export type TaskHistoryAction =
  | "created"
  | "submitted"
  | "approved"
  | "rejected"
  | "unmarked"
  | "edited"
  | "nudged";
export type TaskHistoryEntry = {
  id: string;
  action: TaskHistoryAction;
  actorEmail: string;
  at: string; // ISO
  note?: string; // optional comment attached to the action
};

// A comment (or reply) on a task. parentId null = top-level.
export type TaskComment = {
  id: string;
  authorEmail: string;
  body: string;
  at: string; // ISO
  parentId: string | null;
};

export type Task = {
  id: string;
  groupId: string; // shared by all copies created in one "assign to multiple people" action
  title: string;
  description: string;
  tags: string[];
  dueAt: string; // ISO datetime
  requiresFile: boolean; // legacy column — file upload deferred
  requireSubmission: boolean; // assigner requires a text/link submission before "done"
  emailTemplate: EmailTemplate | null;
  assignerEmail: string;
  assigneeEmail: string;
  status: TaskStatus;
  submittedAt: string | null; // when the assignee marked it done
  submissionText: string | null;
  submissionLink: string | null;
  history: TaskHistoryEntry[];
  comments: TaskComment[];
  remindersSent: string[]; // reminder keys already emailed (e.g. "3d", "overdue:2026-06-25")
  archived: boolean;
  createdAt: string;
};

export type NewTaskInput = {
  title: string;
  description: string;
  tags: string[];
  dueAt: string;
  requiresFile: boolean;
  requireSubmission: boolean;
  emailTemplate: EmailTemplate | null;
  assigneeEmails: string[]; // one task row is created per assignee
};

// ---- Events ----
export type EventScopeKind = "members" | "group" | "club" | "all_newbies";

export type ClubEvent = {
  id: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  creatorEmail: string;
  scopeKind: EventScopeKind;
  scopeEmails: string[]; // when scopeKind === "members"
  scopeGroups: ProjectGroup[]; // when scopeKind === "group"
  archived: boolean;
  createdAt: string;
};

export type NewEventInput = {
  title: string;
  description: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  scopeKind: EventScopeKind;
  scopeEmails: string[];
  scopeGroups: ProjectGroup[];
};

// ---- Notifications ----
export type Notification = {
  id: string;
  userEmail: string;
  title: string;
  body: string;
  kind: string;
  refId: string | null;
  read: boolean;
  createdAt: string;
};
