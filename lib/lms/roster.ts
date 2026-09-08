// ============================================================================
//  Roster — lets the Google Sheet control who can log in and what they can do,
//  without touching code.
// ----------------------------------------------------------------------------
//  HOW IT FITS TOGETHER
//    lib/members.ts   — the roster IN CODE (BASE_MEMBERS). Seeds the sheet and
//                       is the permanent fallback.
//    this file        — the roster IN THE DATABASE (lms_roster), which mirrors
//                       the Google Sheet. Pulled from the sheet by the cron or
//                       the manual "Sync roster" action.
//    applyRoster()    — swaps the live MEMBERS array over to the DB roster.
//
//  SOURCE OF TRUTH: once lms_roster has at least one active row, IT is the
//  roster — so adding a row in the sheet adds a member, and deleting a row (or
//  setting Active = FALSE) removes their access. If the table is empty or the
//  database is unreachable, the code roster is used instead, so the dashboard
//  can never lock everyone out.
// ============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyRoster, roles, type Member } from "@/lib/members";
import type { ProjectGroup, RoleFlags } from "@/lib/lms/types";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

let _client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!_client)
    _client = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false },
    });
  return _client;
}

const lc = (e: string) => e.trim().toLowerCase();

// ---------------------------------------------------------------- roster mode
// "code" (DEFAULT): ignore the Google Sheet; the roster comes only from
// members.ts (BASE_MEMBERS). "sheet": the Google-Sheet-backed roster controls
// logins, falling back to members.ts when empty. Persisted in lms_settings so
// it survives restarts and is shared across serverless instances; togglable by
// the webmaster from Settings.
export type RosterMode = "sheet" | "code";
const MODE_KEY = "roster_source";
let cachedMode: RosterMode = "code"; // safe default: members.ts only

export async function getRosterMode(): Promise<RosterMode> {
  if (!usingSupabase) return cachedMode;
  try {
    const { data, error } = await sb()
      .from("lms_settings").select("value").eq("key", MODE_KEY).maybeSingle();
    if (error) return cachedMode;             // DB blip → keep last known (default code)
    cachedMode = data?.value === "sheet" ? "sheet" : "code"; // anything but "sheet" → code
    return cachedMode;
  } catch {
    return cachedMode;
  }
}

export function currentRosterMode(): RosterMode {
  return cachedMode;
}

export async function setRosterMode(mode: RosterMode): Promise<void> {
  cachedMode = mode;
  if (usingSupabase) {
    const { error } = await sb().from("lms_settings").upsert(
      { key: MODE_KEY, value: mode, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
  }
}

/** A roster row as stored/edited. `active: false` blocks login without deleting. */
export type RosterRow = Member & { active: boolean };

// In-memory fallback (no Supabase configured — local dev).
let mem: RosterRow[] = [];

/* eslint-disable @typescript-eslint/no-explicit-any */
const rowToMember = (r: any): RosterRow => ({
  email: r.email,
  firstName: r.first_name ?? "",
  lastName: r.last_name ?? "",
  group: (r.group_code ?? "E") as ProjectGroup,
  phone: r.phone ?? "",
  hidden: Boolean(r.hidden),
  active: r.active !== false,
  roles: roles((r.roles ?? {}) as Partial<RoleFlags>),
});
const memberToRow = (m: RosterRow) => ({
  email: lc(m.email),
  first_name: m.firstName,
  last_name: m.lastName,
  group_code: m.group,
  phone: m.phone ?? "",
  hidden: Boolean(m.hidden),
  active: m.active !== false,
  roles: m.roles,
  updated_at: new Date().toISOString(),
});
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Every roster row, including inactive ones (so the sheet can show them). */
export async function listRosterRows(): Promise<RosterRow[]> {
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_roster").select("*");
    if (error) throw new Error(error.message);
    return (data ?? []).map(rowToMember);
  }
  return [...mem];
}

/** Replace the whole roster (used after pulling the sheet). */
export async function replaceRoster(rows: RosterRow[]): Promise<void> {
  if (usingSupabase) {
    const emails = rows.map((r) => lc(r.email));
    const { error: upErr } = await sb()
      .from("lms_roster")
      .upsert(rows.map(memberToRow), { onConflict: "email" });
    if (upErr) throw new Error(upErr.message);
    // Drop anyone no longer present in the sheet.
    if (emails.length > 0) {
      const { error: delErr } = await sb()
        .from("lms_roster")
        .delete()
        .not("email", "in", `(${emails.map((e) => `"${e}"`).join(",")})`);
      if (delErr) throw new Error(delErr.message);
    }
    return;
  }
  mem = [...rows];
}

// ------------------------------------------------------------------- caching
// The live roster is read synchronously all over the app, so we keep it in
// module memory and refresh it on a short TTL from the async entry points.
const TTL_MS = 30_000;
let loadedAt = 0;
let loading: Promise<void> | null = null;

async function load(): Promise<void> {
  try {
    // members.ts-only mode (the default): skip the sheet/DB roster entirely.
    if ((await getRosterMode()) === "code") {
      applyRoster(null); // null → BASE_MEMBERS (members.ts)
      loadedAt = Date.now();
      return;
    }
    const rows = await listRosterRows();
    const active = rows.filter((r) => r.active !== false);
    applyRoster(active.length > 0 ? active : null); // empty → fall back to code roster
    loadedAt = Date.now();
  } catch (e) {
    // Keep whatever roster is already live rather than locking anyone out.
    console.error("roster: load failed, keeping current roster —", (e as Error).message);
    loadedAt = Date.now(); // don't hammer a broken database on every request
  }
}

/**
 * Make sure the live roster is fresh. Cheap: a no-op unless the TTL expired,
 * and concurrent callers share one load.
 */
export async function ensureRoster(): Promise<void> {
  if (Date.now() - loadedAt < TTL_MS) return;
  if (!loading) loading = load().finally(() => { loading = null; });
  await loading;
}

/** Force a reload right now (after a sheet pull). */
export async function refreshRoster(): Promise<void> {
  loadedAt = 0;
  await ensureRoster();
}
