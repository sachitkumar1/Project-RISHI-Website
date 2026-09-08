// ============================================================================
//  Google Sheets sync — mirrors dashboard data into Google Sheets.
// ----------------------------------------------------------------------------
//  Two independent syncs:
//    • syncDirectoryToSheet()  → the member directory (DIRECTORY_SHEET_ID)
//    • syncTasksToSheet()      → every task + submission (TASK_SHEET_ID), split
//                                across "Active Tasks", "Archived Tasks" and
//                                "Submissions" tabs.
//
//  Uses a Google service account (no user OAuth): the server signs a JWT with
//  the service account's private key, exchanges it for an access token, and
//  overwrites the sheet. Entirely best-effort — if the service-account env vars
//  aren't set, everything no-ops and nothing else breaks.
//
//  Setup (one time):
//   1. Google Cloud Console → same project → APIs & Services → Enable
//      "Google Sheets API".
//   2. IAM & Admin → Service Accounts → Create service account → create a JSON
//      key and download it.
//   3. Open EACH target Google Sheet → Share → add the service account's email
//      (client_email) as an Editor.
//   4. Set env vars (Vercel):
//        GOOGLE_SA_EMAIL        = the service account's client_email
//        GOOGLE_SA_PRIVATE_KEY  = the service account's private_key (PEM)
//        DIRECTORY_SHEET_ID     = the directory sheet ID (optional; default below)
//        TASK_SHEET_ID          = the task sheet ID      (optional; default below)
//        SHEETS_SYNC_MODE       = "realtime" (default) or "cron"
//      Redeploy.
//
//  SHEETS_SYNC_MODE controls the TASK sync only:
//    realtime — every task action pushes to the sheet immediately (~½s added to
//               the action; the hourly cron still runs as a safety net).
//    cron     — task actions don't touch the sheet; the hourly cron does it all.
// ============================================================================

import crypto from "crypto";
import { listDirectory } from "@/lib/lms/directory";
import { listAllTasks } from "@/lib/lms/store";
import { getRosterMode, listRosterRows, refreshRoster, replaceRoster, type RosterRow } from "@/lib/lms/roster";
import { BASE_MEMBERS, ROLE_KEYS, roles } from "@/lib/members";
import type { ProjectGroup, RoleFlags } from "@/lib/lms/types";
import { PROJECT_GROUP_LABELS } from "@/lib/lms/types";
import { findMember, memberFullName } from "@/lib/members";
import type { Task } from "@/lib/lms/types";

const DEFAULT_DIRECTORY_SHEET_ID = "1Ez251GH36MZ3Wq45BqkIe5h3HYzge2xpXInhUZiQRBo";
const DEFAULT_TASK_SHEET_ID = "1hW24j9Iag3BJMxne7T8H4jMzGJoa8NQNTWcWmaOigOE";
const DEFAULT_ROSTER_SHEET_ID = "1dXFFftlCir1gEJYuNY7ms2ox8dkLjVfFlLpT-0SmFaw";

const directorySheetId = () => process.env.DIRECTORY_SHEET_ID || DEFAULT_DIRECTORY_SHEET_ID;
const taskSheetId = () => process.env.TASK_SHEET_ID || DEFAULT_TASK_SHEET_ID;
const rosterSheetId = () => process.env.ROSTER_SHEET_ID || DEFAULT_ROSTER_SHEET_ID;

/** Should a task action push to the sheet immediately? */
export function taskSyncIsRealtime(): boolean {
  return (process.env.SHEETS_SYNC_MODE || "realtime").toLowerCase() !== "cron";
}

const TAB_ACTIVE = "Active Tasks";
const TAB_ARCHIVED = "Archived Tasks";
const TAB_SUBMISSIONS = "Submissions";

const b64url = (buf: Buffer | string) =>
  (Buffer.isBuffer(buf) ? buf : Buffer.from(buf)).toString("base64url");

/** What a sync attempt actually did — surfaced by /api/lms/cron/sheets so a
 *  silent failure is always diagnosable instead of invisible. */
export type SyncResult = {
  ok: boolean;
  skipped?: string; // set when the sync deliberately did nothing
  error?: string;   // set when it tried and failed
  rows?: number;
  sheetId?: string;
};

// ---------------------------------------------------------------- auth token
// Access tokens last an hour, so cache it in the module — this removes a full
// round-trip from every sync and keeps real-time syncing cheap.
let cachedToken: { token: string; expiresAt: number } | null = null;

type TokenResult = { token: string } | { error: string };

async function getAccessToken(): Promise<TokenResult> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return { token: cachedToken.token };

  const email = process.env.GOOGLE_SA_EMAIL;
  let key = process.env.GOOGLE_SA_PRIVATE_KEY;
  if (!email || !key)
    return {
      error:
        "Not configured: GOOGLE_SA_EMAIL and/or GOOGLE_SA_PRIVATE_KEY is missing from this environment. Set them and redeploy.",
    };
  key = key.replace(/\\n/g, "\n"); // env may store escaped newlines

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claim}`;
  let signature: string;
  try {
    signature = b64url(crypto.sign("RSA-SHA256", Buffer.from(unsigned), key));
  } catch (e) {
    const msg = `Could not sign with GOOGLE_SA_PRIVATE_KEY (${(e as Error).message}). The key is probably malformed — paste the private_key value from the JSON exactly, including the \\n sequences.`;
    console.error("sheets:", msg);
    return { error: msg };
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const msg = `Google rejected the service-account credentials (HTTP ${res.status}): ${body.slice(0, 300)}`;
    console.error("sheets:", msg);
    return { error: msg };
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return { error: "Google returned no access token." };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 120) * 1000, // refresh 2min early
  };
  return { token: cachedToken.token };
}

/** Turn a failed Sheets HTTP response into a message that names the fix. */
async function describeSheetsError(res: Response, id: string): Promise<string> {
  const body = await res.text().catch(() => "");
  const email = process.env.GOOGLE_SA_EMAIL ?? "(unset)";
  if (res.status === 403 && /SERVICE_DISABLED|has not been used|disabled/i.test(body))
    return `Google Sheets API is not enabled for this Google Cloud project. Enable it (APIs & Services → Enable APIs → "Google Sheets API"), wait a minute, then retry. Raw: ${body.slice(0, 200)}`;
  if (res.status === 403)
    return `Permission denied on sheet ${id}. Share that Google Sheet with ${email} as an Editor. Raw: ${body.slice(0, 200)}`;
  if (res.status === 404)
    return `Sheet ${id} not found — check the sheet ID. Raw: ${body.slice(0, 200)}`;
  return `HTTP ${res.status}: ${body.slice(0, 300)}`;
}

// --------------------------------------------------------------- sheet utils
type Row = (string | number)[];

/** Create any tabs that don't exist yet (the sheet may only have "Sheet1"). */
async function ensureTabs(token: string, id: string, titles: string[]): Promise<string | null> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const msg = await describeSheetsError(res, id);
    console.error("sheets:", msg);
    return msg;
  }
  const data = (await res.json()) as { sheets?: { properties?: { title?: string } }[] };
  const existing = new Set((data.sheets ?? []).map((s) => s.properties?.title).filter(Boolean));
  const missing = titles.filter((t) => !existing.has(t));
  if (missing.length === 0) return null;

  const add = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
    }),
  });
  if (!add.ok) {
    const msg = await describeSheetsError(add, id);
    console.error("sheets:", msg);
    return msg;
  }
  return null;
}

/** Overwrite whole tabs in one shot: clear the old block, then write the new. */
async function writeTabs(
  token: string,
  id: string,
  tabs: { title: string; values: Row[]; lastColumn: string }[],
): Promise<string | null> {
  // 1) Clear every tab's block in a single call.
  const clearRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchClear`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ranges: tabs.map((t) => `'${t.title}'!A:${t.lastColumn}`) }),
    },
  );
  if (!clearRes.ok) {
    const msg = await describeSheetsError(clearRes, id);
    console.error("sheets: clear failed —", msg);
    return msg;
  }

  // 2) Write every tab's fresh data in a single call.
  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: tabs.map((t) => ({
          range: `'${t.title}'!A1`,
          majorDimension: "ROWS",
          values: t.values,
        })),
      }),
    },
  );
  if (!writeRes.ok) {
    const msg = await describeSheetsError(writeRes, id);
    console.error("sheets: write failed —", msg);
    return msg;
  }
  return null;
}

// ------------------------------------------------------------- directory sync
export async function syncDirectoryToSheet(): Promise<SyncResult> {
  const auth = await getAccessToken();
  if ("error" in auth) return { ok: false, skipped: auth.error };
  const token = auth.token;
  const id = directorySheetId();
  const entries = await listDirectory();
  const values: Row[] = [
    ["Name", "Role", "Project Group", "Email", "Phone"],
    ...entries.map((e) => [e.name, e.role, e.group, e.email, e.phone]),
  ];
  try {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/A:E:clear`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/A1?valueInputOption=RAW`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ range: "A1", majorDimension: "ROWS", values }),
      },
    );
    if (!res.ok) {
      const msg = await describeSheetsError(res, id);
      console.error("sheets: directory write failed —", msg);
      return { ok: false, error: msg, sheetId: id };
    }
    return { ok: true, rows: entries.length, sheetId: id };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("sheets: directory sync error", msg);
    return { ok: false, error: msg, sheetId: id };
  }
}

// ------------------------------------------------------------------ task sync
const nameOf = (email: string) => {
  const m = findMember(email);
  return m ? memberFullName(m) : email;
};
const who = (email: string) => `${nameOf(email)} <${email}>`;

const STATUS_LABEL: Record<string, string> = {
  not_complete: "Not complete",
  pending: "Pending approval",
  complete: "Complete",
};

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "";

/** Strip HTML so an email template reads sensibly in a spreadsheet cell. */
const htmlToText = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const TASK_HEADER: Row = [
  "Task ID", "Group ID", "Title", "Description", "Tags",
  "Date Assigned", "Due Date", "Assigned By", "Assigned To", "All Assignees",
  "Status", "Submitted At", "Submission Text", "Submission Link", "Submission File",
  "Submission Required", "Email Subject", "Email Body", "Submission History", "Last Activity",
];

/** One row per assignee — mirrors the dashboard's row-per-assignee task model. */
function taskRow(t: Task, groupAssignees: string[]): Row {
  const tpl = t.emailTemplate;
  // Every submit/approve/return event for this person, oldest first.
  const submissionEvents = t.history
    .filter((h) => ["submitted", "approved", "rejected", "unmarked"].includes(h.action))
    .map((h) => {
      const label =
        h.action === "submitted" ? "Submitted"
        : h.action === "approved" ? "Approved"
        : h.action === "rejected" ? "Returned"
        : "Unmarked";
      return `${fmtDate(h.at)} — ${label} by ${nameOf(h.actorEmail)}${h.note ? `: ${h.note}` : ""}`;
    })
    .join("\n");
  const last = t.history.length > 0 ? t.history[t.history.length - 1] : null;

  return [
    t.id,
    t.groupId || "",
    t.title,
    t.description || "",
    (t.tags || []).join(", "),
    fmtDate(t.createdAt),
    fmtDate(t.dueAt),
    who(t.assignerEmail),
    who(t.assigneeEmail),
    groupAssignees.map(nameOf).join(", "),
    STATUS_LABEL[t.status] ?? t.status,
    fmtDate(t.submittedAt),
    t.submissionText || "",
    t.submissionLink || "",
    "", // Submission File — reserved for file uploads (populated once implemented)
    t.requireSubmission ? "Yes" : "No",
    tpl?.subject || "",
    tpl?.bodyHtml ? htmlToText(tpl.bodyHtml) : "",
    submissionEvents,
    last ? `${fmtDate(last.at)} — ${last.action} by ${nameOf(last.actorEmail)}` : "",
  ];
}

const SUBMISSION_HEADER: Row = [
  "When", "Task ID", "Task Title", "Person", "Event",
  "By", "Note", "Submission Text", "Submission Link", "Submission File",
];

/** One row per submission-related event, across every task — the full history. */
function submissionRows(tasks: Task[]): Row[] {
  const rows: { at: string; row: Row }[] = [];
  for (const t of tasks) {
    for (const h of t.history) {
      if (!["submitted", "approved", "rejected", "unmarked"].includes(h.action)) continue;
      const label =
        h.action === "submitted" ? "Submitted"
        : h.action === "approved" ? "Approved"
        : h.action === "rejected" ? "Returned for changes"
        : "Unmarked (approval taken back)";
      rows.push({
        at: h.at,
        row: [
          fmtDate(h.at),
          t.id,
          t.title,
          who(t.assigneeEmail),
          label,
          who(h.actorEmail),
          h.note || "",
          t.submissionText || "",
          t.submissionLink || "",
          "", // Submission File — reserved for file uploads
        ],
      });
    }
  }
  // Newest first.
  return rows.sort((a, b) => b.at.localeCompare(a.at)).map((r) => r.row);
}

/**
 * Mirror every task into the task sheet: active tasks, archived tasks, and the
 * full submission history, each on its own tab. Overwrites the tabs each run so
 * the sheet always matches the dashboard exactly.
 */
export async function syncTasksToSheet(): Promise<SyncResult> {
  const auth = await getAccessToken();
  if ("error" in auth) return { ok: false, skipped: auth.error };
  const token = auth.token;
  const id = taskSheetId();

  try {
    const tasks = await listAllTasks();

    // Everyone assigned within each batch, so a row can list its co-assignees.
    const byGroup = new Map<string, string[]>();
    for (const t of tasks) {
      const key = t.groupId || t.id;
      const arr = byGroup.get(key) ?? [];
      arr.push(t.assigneeEmail);
      byGroup.set(key, arr);
    }
    const rowFor = (t: Task) => taskRow(t, byGroup.get(t.groupId || t.id) ?? [t.assigneeEmail]);

    const sortByDue = (a: Task, b: Task) => a.dueAt.localeCompare(b.dueAt);
    const active = tasks.filter((t) => !t.archived).sort(sortByDue);
    const archived = tasks.filter((t) => t.archived).sort((a, b) => b.dueAt.localeCompare(a.dueAt));

    const tabErr = await ensureTabs(token, id, [TAB_ACTIVE, TAB_ARCHIVED, TAB_SUBMISSIONS]);
    if (tabErr) return { ok: false, error: tabErr, sheetId: id };
    const writeErr = await writeTabs(token, id, [
      { title: TAB_ACTIVE, lastColumn: "T", values: [TASK_HEADER, ...active.map(rowFor)] },
      { title: TAB_ARCHIVED, lastColumn: "T", values: [TASK_HEADER, ...archived.map(rowFor)] },
      { title: TAB_SUBMISSIONS, lastColumn: "J", values: [SUBMISSION_HEADER, ...submissionRows(tasks)] },
    ]);
    if (writeErr) return { ok: false, error: writeErr, sheetId: id };
    return { ok: true, rows: tasks.length, sheetId: id };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("sheets: task sync error", msg);
    return { ok: false, error: msg, sheetId: id };
  }
}

/** Fire the task sync only when real-time mode is on. Never throws. */
export async function syncTasksIfRealtime(): Promise<void> {
  if (!taskSyncIsRealtime()) return;
  await syncTasksToSheet().catch(() => {});
}

// ==========================================================================
//  ROSTER SYNC (two-way)
// --------------------------------------------------------------------------
//  push: dashboard roster  → the roster sheet (so the sheet is always seeded
//        and normalized, and shows exactly what the site is using)
//  pull: the roster sheet  → lms_roster → the live MEMBERS array (so adding a
//        row in the sheet grants access, with no code change)
// ==========================================================================

const TAB_ROSTER = "Roster";

const ROSTER_HEADER: Row = [
  "Login Email", "First Name", "Last Name", "Project Group", "Phone",
  "Active", "Hidden", ...ROLE_KEYS.map((k) => String(k)),
];
// A:R — 7 fixed columns + one per role flag.
const ROSTER_LAST_COL = String.fromCharCode("A".charCodeAt(0) + 7 + ROLE_KEYS.length - 1);

const yesNo = (v: boolean) => (v ? "TRUE" : "FALSE");
/** Lenient truthiness so TRUE / yes / y / x / 1 / ✓ all work in the sheet. */
const isTrue = (v: unknown) => /^(true|yes|y|x|1|✓)$/i.test(String(v ?? "").trim());

/** Accept "E" or "Education" (etc). Falls back to Education. */
function parseGroup(v: unknown): ProjectGroup {
  const raw = String(v ?? "").trim();
  const code = raw.toUpperCase();
  if (["E", "R", "W", "H"].includes(code)) return code as ProjectGroup;
  const match = (Object.entries(PROJECT_GROUP_LABELS) as [ProjectGroup, string][]).find(
    ([, label]) => label.toLowerCase() === raw.toLowerCase(),
  );
  return match ? match[0] : "E";
}

function rosterRowToSheet(m: RosterRow): Row {
  return [
    m.email, m.firstName, m.lastName, m.group, m.phone ?? "",
    yesNo(m.active !== false), yesNo(Boolean(m.hidden)),
    ...ROLE_KEYS.map((k) => yesNo(Boolean(m.roles[k as keyof RoleFlags]))),
  ];
}

/** Write the current roster to the sheet (creates the tab if needed). */
export async function pushRosterToSheet(): Promise<SyncResult> {
  if ((await getRosterMode()) === "code")
    return { ok: true, skipped: "Roster is in members.ts-only mode — sheet roster sync is off." };
  const auth = await getAccessToken();
  if ("error" in auth) return { ok: false, skipped: auth.error };
  const id = rosterSheetId();
  try {
    // Prefer the DB roster; if it's empty this is the first run, so seed from code.
    let rows = await listRosterRows();
    if (rows.length === 0)
      rows = BASE_MEMBERS.map((m) => ({ ...m, active: true }) as RosterRow);

    const tabErr = await ensureTabs(auth.token, id, [TAB_ROSTER]);
    if (tabErr) return { ok: false, error: tabErr, sheetId: id };
    const writeErr = await writeTabs(auth.token, id, [
      {
        title: TAB_ROSTER,
        lastColumn: ROSTER_LAST_COL,
        values: [ROSTER_HEADER, ...rows.map(rosterRowToSheet)],
      },
    ]);
    if (writeErr) return { ok: false, error: writeErr, sheetId: id };
    return { ok: true, rows: rows.length, sheetId: id };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("sheets: roster push error", msg);
    return { ok: false, error: msg, sheetId: id };
  }
}

/**
 * Parse the Roster tab's raw grid into roster rows. Exported so the rules that
 * decide who can log in are directly testable.
 */
export function parseRosterGrid(
  grid: string[][],
): { rows: RosterRow[]; skipped: string[]; error?: string } {
  const header = grid[0].map((h) => String(h).trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const iEmail = col("Login Email");
  if (iEmail === -1)
    return { rows: [], skipped: [], error: `The Roster tab needs a "Login Email" column (found: ${grid[0].join(", ")}).` };

  const cell = (r: string[], i: number) => (i >= 0 && i < r.length ? r[i] : "");
  // The code roster is the reference for anything the sheet doesn't mention —
  // e.g. a sheet seeded before a new role column existed.
  const baseByEmail = new Map(BASE_MEMBERS.map((m) => [m.email.toLowerCase(), m]));
  const rows: RosterRow[] = [];
  const skipped: string[] = [];
  for (const r of grid.slice(1)) {
    const email = String(cell(r, iEmail) ?? "").trim().toLowerCase();
    if (!email) continue; // blank filler row
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { skipped.push(email); continue; }
    const base = baseByEmail.get(email);

    const flags: Partial<RoleFlags> = {};
    for (const k of ROLE_KEYS) {
      const i = col(k);
      const key = k as keyof RoleFlags;
      // A MISSING column means the sheet has no opinion about this role, so
      // keep whatever the code roster says. Only a column that is actually
      // present may turn a role off. (Without this, adding a new role flag in
      // code would silently strip it from everyone on the next sync.)
      flags[key] = i >= 0 ? isTrue(cell(r, i)) : Boolean(base?.roles[key]);
    }
    // FAILSAFE: the sheet may GRANT webmaster, but must never strip it from
    // someone who holds it in code — otherwise a stale sheet locks the admin
    // out of the very button needed to repair the roster.
    if (base?.roles.webmaster) flags.webmaster = true;

    const iActive = col("Active");
    const iHidden = col("Hidden");
    rows.push({
      email,
      firstName: String(cell(r, col("First Name")) ?? "").trim() || (base?.firstName ?? ""),
      lastName: String(cell(r, col("Last Name")) ?? "").trim() || (base?.lastName ?? ""),
      group: col("Project Group") >= 0 ? parseGroup(cell(r, col("Project Group"))) : (base?.group ?? "E"),
      phone: String(cell(r, col("Phone")) ?? "").trim(),
      hidden: iHidden >= 0 ? isTrue(cell(r, iHidden)) : Boolean(base?.hidden),
      // Missing Active column → treat the row as active.
      active: iActive === -1 ? true : isTrue(cell(r, iActive)),
      roles: roles(flags),
    });
  }

  return { rows, skipped };
}

/**
 * Read the roster sheet and make it the live roster.
 *
 * Deliberately conservative: a row without a valid-looking email is skipped,
 * and if the sheet yields no usable rows we do NOT wipe the roster (that would
 * lock everyone out) — we report an error and leave things as they are.
 */
export async function pullRosterFromSheet(): Promise<SyncResult> {
  if ((await getRosterMode()) === "code")
    return { ok: true, skipped: "Roster is in members.ts-only mode — sheet roster sync is off." };
  const auth = await getAccessToken();
  if ("error" in auth) return { ok: false, skipped: auth.error };
  const id = rosterSheetId();
  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/'${TAB_ROSTER}'!A:${ROSTER_LAST_COL}`,
      { headers: { Authorization: `Bearer ${auth.token}` } },
    );
    if (!res.ok) {
      const msg = await describeSheetsError(res, id);
      // No Roster tab yet → seed it from code instead of treating this as fatal.
      if (res.status === 400 || res.status === 404) {
        const seeded = await pushRosterToSheet();
        return seeded.ok
          ? { ok: true, rows: seeded.rows, skipped: "Roster tab was missing — seeded it from the code roster.", sheetId: id }
          : seeded;
      }
      return { ok: false, error: msg, sheetId: id };
    }
    const data = (await res.json()) as { values?: string[][] };
    const grid = data.values ?? [];
    if (grid.length < 2) {
      const seeded = await pushRosterToSheet();
      return seeded.ok
        ? { ok: true, rows: seeded.rows, skipped: "Roster tab was empty — seeded it from the code roster.", sheetId: id }
        : seeded;
    }

    const parsed = parseRosterGrid(grid);
    if (parsed.error) return { ok: false, error: parsed.error, sheetId: id };
    const { rows, skipped } = parsed;

    const active = rows.filter((r) => r.active);
    if (active.length === 0)
      return {
        ok: false,
        error: "Refusing to sync: the sheet has no active members, which would lock everyone out. Check the Login Email and Active columns.",
        sheetId: id,
      };

    await replaceRoster(rows);
    await refreshRoster();
    return {
      ok: true,
      rows: rows.length,
      sheetId: id,
      skipped: skipped.length ? `Ignored ${skipped.length} row(s) with an invalid email.` : undefined,
    };
  } catch (e) {
    const msg = (e as Error).message;
    console.error("sheets: roster pull error", msg);
    return { ok: false, error: msg, sheetId: id };
  }
}
