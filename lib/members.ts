/**
 * ============================================================================
 *  MEMBER ALLOWLIST + ROLES
 * ============================================================================
 *  ONLY the emails listed here can log in to the Member Dashboard. This list
 *  is checked on the server when someone signs in with Google, so it cannot be
 *  bypassed from the browser.
 *
 *  Each member also has a PROJECT GROUP and a set of ROLES, used by the LMS to
 *  decide what they can do (assign tasks, create events, etc.).
 *
 *  PROJECT GROUP codes:  E = Education,  R = Water & Sanitation,
 *                        W = Women's Empowerment,  H = Health
 *  ROLES (Y/N in the spreadsheet):  nmtLeader, newbie, lead, internal,
 *                        vpp (VP/President), exec, outreach (Director of Outreach)
 *
 *  TO ADD A MEMBER: copy a line below, fill in their email, name, group, and
 *  roles. Capitalization of the email doesn't matter.
 * ============================================================================
 */

import type { ProjectGroup, RoleFlags } from "@/lib/lms/types";
import { PROJECT_GROUP_LABELS } from "@/lib/lms/types";

/** Every role flag, in the order they appear as columns on the roster sheet. */
export const ROLE_KEYS = [
  "nmtLeader", "newbie", "lead", "internal", "vpp", "exec",
  "outreach", "webmaster", "financeDirector", "internationalDirector", "president", "vpProjects", "vpInternal",
] as const;

export type Member = {
  email: string;
  firstName: string;
  lastName: string;
  group: ProjectGroup;
  roles: RoleFlags;
  /** Contact phone number (used for the member directory + SMS). Empty = none. */
  phone?: string;
  /** Test accounts: only the owner + the account itself can see/select these. */
  hidden?: boolean;
};

// Small helper so the list below stays short and readable.
export function roles(flags: Partial<RoleFlags>): RoleFlags {
  return {
    nmtLeader: false,
    newbie: false,
    lead: false,
    internal: false,
    vpp: false,
    exec: false,
    outreach: false,
    webmaster: false,
    financeDirector: false,
    internationalDirector: false,
    president: false,
    vpProjects: false,
    vpInternal: false,
    ...flags,
  };
}

/**
 * The roster as defined in code. This is the seed for the Google Sheet and the
 * fallback whenever the sheet-backed roster is empty or unavailable, so the
 * dashboard always works even if Sheets/Supabase are down.
 */
export const BASE_MEMBERS: Member[] = [
  { email: "sachitk@berkeley.edu", firstName: "Sachit", lastName: "Kumar", phone: "9494069649", group: "E", roles: roles({ nmtLeader: true, lead: true, internal: true, vpp: true, exec: true, outreach: true, newbie: true, financeDirector: true, webmaster: true }) },
  { email: "palakprabhakar1@berkeley.edu", firstName: "Palak", lastName: "Prabhakar", phone: "5106937982", group: "W", roles: roles({ lead: true }) },
  { email: "thanuj@berkeley.edu", firstName: "Thanuj", lastName: "Komatireddy", phone: "8186407964", group: "H", roles: roles({ exec: true, financeDirector: true }) },
  { email: "riaprathinidhi1@berkeley.edu", firstName: "Ria", lastName: "Prathinidhi", phone: "2246071782", group: "R", roles: roles({ lead: true }) },
  { email: "aarushimupparti@berkeley.edu", firstName: "Aarushi", lastName: "Mupparti", phone: "9257913510", group: "H", roles: roles({ lead: true }) },
  { email: "arnav.mishra@berkeley.edu", firstName: "Arnav", lastName: "Mishra", phone: "8455975632", group: "R", roles: roles({  }) },
  { email: "megha_ramachandran@berkeley.edu", firstName: "Megha", lastName: "Ramachandran", phone: "4255022431", group: "E", roles: roles({ lead: true }) },
  { email: "nikita_jadhav@berkeley.edu", firstName: "Nikita", lastName: "Jadhav", phone: "7604107935", group: "W", roles: roles({ exec: true, outreach: true }) },
  { email: "autkarsh@berkeley.edu", firstName: "Utkarsh", lastName: "Agarwal", phone: "5104733621", group: "E", roles: roles({ lead: true }) },
  { email: "tanyagoel101@berkeley.edu", firstName: "Tanya", lastName: "Goel", phone: "4087273570", group: "W", roles: roles({ vpp: true, exec: true, vpProjects: true }) },
  { email: "grishma_jain@berkeley.edu", firstName: "Grishma", lastName: "Jain", phone: "7142719759", group: "E", roles: roles({ vpp: true, exec: true, president: true }) },
  { email: "akotte@berkeley.edu", firstName: "Advik", lastName: "Kotte", phone: "9086359133", group: "W", roles: roles({ nmtLeader: true }) },
  { email: "aryaprince@berkeley.edu", firstName: "Arya", lastName: "Prince", phone: "5104534160", group: "H", roles: roles({  }) },
  { email: "maiabergesv@berkeley.edu", firstName: "Maia", lastName: "Berges", phone: "2025158791", group: "R", roles: roles({ lead: true }) },
  { email: "sachitkumar2025@gmail.com", firstName: "SachitLead", lastName: "Kumar", phone: "", group: "W", roles: roles({ lead: true }), hidden: true },
  { email: "sachitkumar2020@gmail.com", firstName: "SachitInternal", lastName: "Kumar", phone: "", group: "W", roles: roles({ internal: true }), hidden: true },
  { email: "kumarsachit2007@gmail.com", firstName: "SachitNMT", lastName: "Kumar", phone: "", group: "W", roles: roles({ nmtLeader: true }), hidden: true },
  { email: "anonymousposter1029@gmail.com", firstName: "SachitNewbie", lastName: "Kumar", phone: "", group: "W", roles: roles({ newbie: true }), hidden: true },
  { email: "ryancr@berkeley.edu", firstName: "Ryan", lastName: "Raphael", phone: "6696661405", group: "R", roles: roles({ vpp: true, exec: true, vpInternal: true }) },
  { email: "narayannirali@berkeley.edu", firstName: "Nirali", lastName: "Narayan", phone: "7205488016", group: "R", roles: roles({ nmtLeader: true }) },
  { email: "dilpreetvohra@berkeley.edu", firstName: "Jannat", lastName: "Vohra", phone: "9253023115", group: "W", roles: roles({ lead: true }) },
  // ---- Added from the 26–27 Master Roster ----
  { email: "jahanveersingh@berkeley.edu", firstName: "Jahan", lastName: "Singh", phone: "5597701709", group: "W", roles: roles({  }) },
  { email: "jiya.dharne@berkeley.edu", firstName: "Jiya", lastName: "Dharne", phone: "5103887239", group: "R", roles: roles({ exec: true, internationalDirector: true }) },
  { email: "kaavya_pravin@berkeley.edu", firstName: "Kaavya", lastName: "Pravin", phone: "9259845837", group: "H", roles: roles({  }) },
  { email: "keshav.kumar@berkeley.edu", firstName: "Keshav", lastName: "Kumar", phone: "4088582304", group: "R", roles: roles({  }) },
  { email: "krrishikasaxena@berkeley.edu", firstName: "Krrishika", lastName: "Saxena", phone: "7274552816", group: "H", roles: roles({ lead: true }) },
  { email: "pushkar_kairam@berkeley.edu", firstName: "Pushkar", lastName: "Kairam", phone: "5308132662", group: "W", roles: roles({  }) },
  { email: "ramitgoyal@berkeley.edu", firstName: "Ramit", lastName: "Goyal", phone: "4084109504", group: "R", roles: roles({  }) },
  { email: "rsudeora@berkeley.edu", firstName: "Rayan", lastName: "Sudeora", phone: "9259646250", group: "H", roles: roles({  }) },
  { email: "rayhan_jain@berkeley.edu", firstName: "Rayhan", lastName: "Jain", phone: "8188056294", group: "H", roles: roles({  }) },
  { email: "rheamaster@berkeley.edu", firstName: "Rhea", lastName: "Master", phone: "5106463319", group: "H", roles: roles({  }) },
  { email: "saavribiswal@berkeley.edu", firstName: "Saavri", lastName: "Biswal", phone: "6503138031", group: "R", roles: roles({  }) },
  { email: "sanjoli@berkeley.edu", firstName: "Sanjoli", lastName: "Gupta", phone: "6504604946", group: "E", roles: roles({  }) },
  { email: "senthil.shashwath@berkeley.edu", firstName: "Shashwath", lastName: "Senthil", phone: "5105133533", group: "W", roles: roles({  }) },
  { email: "shiama@berkeley.edu", firstName: "Shiama", lastName: "Srikantan", phone: "4154815881", group: "R", roles: roles({  }) },
  { email: "simar_26@berkeley.edu", firstName: "Simar", lastName: "Kaur", phone: "9095090700", group: "W", roles: roles({  }) },
  { email: "srivishal@berkeley.edu", firstName: "Srivishal", lastName: "Sudarshan", phone: "9165750398", group: "R", roles: roles({ internal: true }) },
  { email: "yadukrishnaraghu@berkeley.edu", firstName: "Yadukrishna", lastName: "Raghu", phone: "5105880030", group: "E", roles: roles({ internal: true }) },
  { email: "zahrahabib@berkeley.edu", firstName: "Zahra", lastName: "Habib", phone: "3107173017", group: "H", roles: roles({  }) },
  // ---- Added from the live roster sheet (Sep 2026) ----
  { email: "loyna_rism@berkeley.edu", firstName: "Loyna", lastName: "Rism", phone: "7147474650", group: "W", roles: roles({  }) },
  { email: "meeramahidhara@berkeley.edu", firstName: "Meera", lastName: "Mahidhara", phone: "", group: "W", roles: roles({  }) },
  { email: "nish_upad@berkeley.edu", firstName: "Nishanth", lastName: "Upadhyayula", phone: "5105572027", group: "W", roles: roles({  }) },
  //{ email: "rishit_pradhan@berkeley.edu", firstName: "Rishit", lastName: "Pradhan", phone: "6614977055", group: "H", roles: roles({  }) },
  { email: "sahaanamehta@berkeley.edu", firstName: "Sahaana", lastName: "Mehta", phone: "3109976323", group: "R", roles: roles({  }) },
  //{ email: "sara.khemani@berkeley.edu", firstName: "Sara", lastName: "Khemani", phone: "5107172645", group: "H", roles: roles({  }) },
  { email: "shipra_jha1@berkeley.edu", firstName: "Shipra", lastName: "Jha", phone: "8473458295", group: "H", roles: roles({  }) },
  { email: "surabhikhanna@berkeley.edu", firstName: "Surabhi", lastName: "Khanna", phone: "5594005999", group: "E", roles: roles({ lead: true }) },
  { email: "viploverahate@berkeley.edu", firstName: "Viplove", lastName: "Rahate", phone: "8588475623", group: "R", roles: roles({  }) }
];

/**
 * THE LIVE ROSTER.
 *
 * Other modules import this binding and read it synchronously (permissions,
 * pickers, auth). To let the Google Sheet control membership without rewriting
 * every call site, we never REASSIGN this array — we mutate it in place, so
 * every existing importer sees the update immediately.
 *
 * It starts as the code roster and is replaced by the sheet-backed roster once
 * that has been loaded (see lib/lms/roster.ts).
 */
export const MEMBERS: Member[] = [...BASE_MEMBERS];

/** True when the live roster is currently coming from the sheet, not the code. */
let rosterFromSheet = false;
export const isRosterFromSheet = () => rosterFromSheet;

/**
 * Swap the live roster for a sheet-backed one. Passing an empty list (or null)
 * reverts to the code roster — a deliberate safety net so an empty or broken
 * sheet can never lock the whole club out of the dashboard.
 */
export function applyRoster(rows: Member[] | null): void {
  const next = rows && rows.length > 0 ? rows : BASE_MEMBERS;
  rosterFromSheet = Boolean(rows && rows.length > 0);
  MEMBERS.length = 0;
  MEMBERS.push(...next);
}

/** Look up a member by email (case-insensitive). Returns undefined if not allowed. */
export function findMember(email?: string | null): Member | undefined {
  if (!email) return undefined;
  const e = email.trim().toLowerCase();
  return MEMBERS.find((m) => m.email.toLowerCase() === e);
}

/** The full "First Last" name used to match a member to their lineage leaf. */
export function memberFullName(m: Member): string {
  return `${m.firstName} ${m.lastName}`;
}

/** A short, human-readable role label for the member directory. */
export function memberRoleLabel(m: Member): string {
  const r = m.roles;
  const g = PROJECT_GROUP_LABELS[m.group];
  // A specific leadership title is shown on its own — it replaces the umbrella
  // "Exec" / "VP / President" terms and any other roles that person holds.
  if (r.president) return "President";
  if (r.vpProjects) return "VP of Projects";
  if (r.vpInternal) return "VP Internal";
  if (r.financeDirector) return "Director of Finance";
  if (r.internationalDirector) return "Director of International Affairs";
  if (r.outreach) return "Director of Outreach";
  // Otherwise, the general multi-role label.
  const parts: string[] = [];
  if (r.vpp) parts.push("VP / President");
  if (r.lead) parts.push(`${g} Lead`);
  if (r.nmtLeader) parts.push("NMT Leader");
  if (r.exec) parts.push("Exec");
  if (r.internal && parts.length === 0) parts.push("Internal");
  if (r.newbie && parts.length === 0) parts.push("Newbie");
  if (parts.length === 0) parts.push(`${g} Member`);
  return parts.join(" · ");
}

/**
 * Year at Berkeley per member (from the club's roster). Email-keyed so it applies
 * regardless of whether the live roster comes from members.ts or the Sheet.
 * Members not listed here have no year on file ("Not specified" in the directory).
 */
export const MEMBER_YEARS: Record<string, string> = {
  "aarushimupparti@berkeley.edu": "Junior",
  "arnav.mishra@berkeley.edu": "Junior",
  "akotte@berkeley.edu": "Senior",
  "grishma_jain@berkeley.edu": "Junior",
  "jahanveersingh@berkeley.edu": "Sophomore",
  "dilpreetvohra@berkeley.edu": "Junior",
  "jiya.dharne@berkeley.edu": "Junior",
  "kaavya_pravin@berkeley.edu": "Junior",
  "keshav.kumar@berkeley.edu": "Senior",
  "krrishikasaxena@berkeley.edu": "Junior",
  "loyna_rism@berkeley.edu": "Junior",
  "maiabergesv@berkeley.edu": "Sophomore",
  "megha_ramachandran@berkeley.edu": "Sophomore",
  "nikita_jadhav@berkeley.edu": "Junior",
  "narayannirali@berkeley.edu": "Junior",
  "palakprabhakar1@berkeley.edu": "Sophomore",
  "pushkar_kairam@berkeley.edu": "Junior",
  "ramitgoyal@berkeley.edu": "Junior",
  "rayhan_jain@berkeley.edu": "Sophomore",
  "rheamaster@berkeley.edu": "Senior",
  "riaprathinidhi1@berkeley.edu": "Sophomore",
  "ryancr@berkeley.edu": "Junior",
  "sachitk@berkeley.edu": "Sophomore",
  "sanjoli@berkeley.edu": "Junior",
  "senthil.shashwath@berkeley.edu": "Sophomore",
  "shiama@berkeley.edu": "Senior",
  "simar_26@berkeley.edu": "Sophomore",
  "srivishal@berkeley.edu": "Junior",
  "tanyagoel101@berkeley.edu": "Junior",
  "thanuj@berkeley.edu": "Sophomore",
  "yadukrishnaraghu@berkeley.edu": "Junior",
  "zahrahabib@berkeley.edu": "Sophomore",
};

export function memberYear(email?: string | null): string {
  return MEMBER_YEARS[(email ?? "").trim().toLowerCase()] ?? "";
}


/**
 * TEST-ACCOUNT VISIBILITY
 * Members flagged `hidden` (the SachitLead / SachitNMT / etc. test accounts)
 * are only visible to their owner and to the account itself. Everyone else
 * never sees or can select them in task/event pickers.
 */
const TEST_ACCOUNT_OWNER = "sachitk@berkeley.edu";
export function canSeeMember(viewerEmail: string | null | undefined, target: Member): boolean {
  if (!target.hidden) return true;
  const v = (viewerEmail ?? "").trim().toLowerCase();
  return v === TEST_ACCOUNT_OWNER || v === target.email.toLowerCase();
}
export function visibleMembers(viewerEmail: string | null | undefined): Member[] {
  return MEMBERS.filter((m) => canSeeMember(viewerEmail, m));
}
