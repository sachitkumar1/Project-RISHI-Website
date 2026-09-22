// ============================================================================
//  Mail merge — resolve {{tags}} for a recipient
// ----------------------------------------------------------------------------
//  Value precedence for each recipient:
//    1. defaults  — members resolve from the roster; non-members get a
//                   best-effort name derived from their email address
//    2. override  — a row from the sender's merge table / uploaded CSV
//                   (matched by email) overrides and extends the defaults
//
//  Tag matching is tolerant of case/spacing/underscores, so {{firstName}},
//  {{first name}} and {{First Name}} all resolve to the same value, and a
//  custom column called "Middle Name" is reachable as {{Middle Name}}.
// ============================================================================

import { findMember } from "@/lib/members";

// Default insert chips (fullName intentionally removed — use firstName + lastName).
export const MERGE_TAGS = [
  { tag: "{{firstName}}", label: "First name" },
  { tag: "{{lastName}}", label: "Last name" },
  { tag: "{{email}}", label: "Email" },
  { tag: "{{projectGroup}}", label: "Project group" },
];

const GROUP_LABELS: Record<string, string> = {
  E: "Education",
  R: "Water & Sanitation",
  W: "Women's Empowerment",
  H: "Health",
};

export const normalizeKey = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");

const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "");

// Best-effort name from an email's local part: jane.doe@x.com -> Jane / Doe.
function nameFromEmail(email: string): { first: string; last: string } {
  const local = (email.split("@")[0] || "").trim();
  const tokens = local
    .split(/[._\-+]+/)
    .map((t) => t.replace(/\d+$/g, ""))
    .filter((t) => t && !/^\d+$/.test(t));
  if (tokens.length === 0) {
    const f = titleCase(local.replace(/\d+/g, ""));
    return { first: f || "there", last: "" };
  }
  const parts = tokens.map(titleCase);
  return { first: parts[0], last: parts.length > 1 ? parts[parts.length - 1] : "" };
}

/** A row of override data keyed by ORIGINAL column name (as typed by the sender). */
export type MergeRow = Record<string, string>;
/** email(lowercased) -> override row (keyed by normalized column name). */
export type MergeMap = Record<string, Record<string, string>>;

/** Turn raw rows (each keyed by column name, including an Email column) into a
 *  lookup keyed by email, with each row's keys normalized. */
export function buildMergeMap(rows: MergeRow[]): MergeMap {
  const map: MergeMap = {};
  for (const row of rows) {
    const norm: Record<string, string> = {};
    let email = "";
    for (const [col, val] of Object.entries(row)) {
      const k = normalizeKey(col);
      norm[k] = (val ?? "").toString();
      if (k === "email") email = norm[k].trim().toLowerCase();
    }
    if (email) map[email] = norm;
  }
  return map;
}

function defaultsFor(email: string): Record<string, string> {
  const m = findMember(email);
  if (m) {
    return {
      firstname: m.firstName,
      lastname: m.lastName,
      email: m.email,
      projectgroup: m.group ? (GROUP_LABELS[m.group] ?? m.group) : "",
    };
  }
  const n = nameFromEmail(email);
  return { firstname: n.first, lastname: n.last, email };
}

const TAG_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Replace tags for one recipient. `override` is that recipient's row (normalized). */
export function applyMergeTags(
  text: string,
  recipientEmail: string,
  override?: Record<string, string>,
): string {
  const values = { ...defaultsFor(recipientEmail), ...(override ?? {}) };
  return text.replace(TAG_RE, (full, inner) => {
    const k = normalizeKey(inner);
    return k in values && values[k] !== undefined ? values[k] : full;
  });
}
