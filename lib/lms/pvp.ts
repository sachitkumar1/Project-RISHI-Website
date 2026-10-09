// ============================================================================
//  PVP portal store — meetings to set up, message drafts, questions, to-dos.
// ----------------------------------------------------------------------------
//  A private workspace for the President and VPs. Four boards, one table,
//  separated by `kind` (see migration-pvp-portal.sql for why).
//
//  Deliberately NOT wired into tasks, events, the calendar or email: these are
//  the three of them thinking out loud, not club work. Nothing here notifies
//  anybody, and nothing here is sent anywhere.
// ============================================================================

import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MEMBERS, type Member } from "@/lib/members";
import { getConnections, pushCalendarEvent, removeCalendarEvent, type GCalTime } from "@/lib/lms/gcal";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

let _client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const lc = (s: string) => s.trim().toLowerCase();

export const PVP_KINDS = ["meeting", "message", "question", "task"] as const;
export type PvpKind = (typeof PVP_KINDS)[number];

export type PvpApproval = { email: string; at: string };
export type PvpNote = { id: string; author: string; body: string; at: string };

export type PvpItem = {
  id: string;
  kind: PvpKind;
  title: string;
  body: string;
  status: string;
  counterpart: string;
  scheduledAt: string | null;
  channel: string;
  approvals: PvpApproval[];
  notes: PvpNote[];
  ownerEmails: string[];
  durationMinutes: number;
  calendarPushed: string[];
  dueAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
};

/** Who may open the portal at all. Webmaster inherits vpp in currentUser.ts,
 *  so Sachit can support it without a carve-out. */
export function canUsePvp(m: Member | null | undefined): boolean {
  return !!m?.roles.vpp;
}

/** The people whose approval a message draft actually needs: the real VPs and
 *  President, never the hidden test accounts. Deriving this from the roster
 *  rather than hard-coding three addresses means a change of officers next
 *  year needs no code change — and it keeps the webmaster account, which
 *  inherits vpp, from blocking every draft forever. */
export function pvpApprovers(): Member[] {
  return MEMBERS.filter((m) => m.roles.vpp && !m.hidden);
}

/** Owners are only ever the three. Anything else is dropped rather than
 *  stored, so a stale or hand-crafted request can't park a task on someone
 *  who isn't in the portal. */
export function cleanOwners(emails: string[] | undefined): string[] {
  const allowed = new Set(pvpApprovers().map((m) => lc(m.email)));
  return Array.from(new Set((emails ?? []).map(lc).filter((e) => allowed.has(e))));
}

/** 5 minutes to a full day. Google Calendar rejects a zero-length timed
 *  event, and a meeting longer than a day is a typo. */
export function clampDuration(minutes: number | undefined): number {
  const n = Math.round(Number(minutes));
  if (!Number.isFinite(n)) return 30;
  return Math.min(1440, Math.max(5, n));
}

export function isFullyApproved(item: PvpItem): boolean {
  const need = pvpApprovers().map((m) => lc(m.email));
  if (need.length === 0) return false;
  const got = new Set(item.approvals.map((a) => lc(a.email)));
  return need.every((e) => got.has(e));
}

// ----------------------------------------------------------------- row <-> item
type Row = Record<string, unknown>;

function toItem(r: Row): PvpItem {
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    id: String(r.id),
    kind: String(r.kind) as PvpKind,
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
    status: String(r.status ?? "open"),
    counterpart: String(r.counterpart ?? ""),
    scheduledAt: (r.scheduled_at as string | null) ?? null,
    channel: String(r.channel ?? ""),
    approvals: arr<PvpApproval>(r.approvals),
    notes: arr<PvpNote>(r.notes),
    ownerEmails: arr<string>(r.owner_emails),
    durationMinutes: Number(r.duration_minutes ?? 30) || 30,
    calendarPushed: arr<string>(r.calendar_pushed),
    dueAt: (r.due_at as string | null) ?? null,
    createdBy: String(r.created_by ?? ""),
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
    archived: Boolean(r.archived),
  };
}

/** Everything the portal shows, in ONE query. Four boards on one page would
 *  otherwise be four round trips for a few dozen rows. `body` and `notes` are
 *  included because the page renders them — there is no second fetch. */
export async function listPvpItems(includeArchived = false): Promise<PvpItem[]> {
  if (!usingSupabase) return [];
  let q = sb().from("lms_pvp_items").select("*").order("created_at", { ascending: false }).limit(1000);
  if (!includeArchived) q = q.eq("archived", false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(toItem);
}

export type NewPvpItem = {
  kind: PvpKind;
  title: string;
  body?: string;
  counterpart?: string;
  scheduledAt?: string | null;
  channel?: string;
  ownerEmails?: string[];
  durationMinutes?: number;
  dueAt?: string | null;
};

const DEFAULT_STATUS: Record<PvpKind, string> = {
  meeting: "to_set_up",
  message: "draft",
  question: "open",
  task: "open",
};

export async function createPvpItem(input: NewPvpItem, actorEmail: string): Promise<PvpItem> {
  if (!usingSupabase) throw new Error("Supabase isn't configured.");
  const { data, error } = await sb()
    .from("lms_pvp_items")
    .insert({
      kind: input.kind,
      title: input.title.trim(),
      body: (input.body ?? "").trim(),
      // A meeting created with a time on it is already set up — otherwise it
      // would be born into the "Not set up yet" half of the board.
      status: input.kind === "meeting" && input.scheduledAt ? "scheduled" : DEFAULT_STATUS[input.kind],
      counterpart: (input.counterpart ?? "").trim(),
      scheduled_at: input.scheduledAt || null,
      channel: (input.channel ?? "").trim(),
      owner_emails: cleanOwners(input.ownerEmails),
      duration_minutes: clampDuration(input.durationMinutes),
      due_at: input.dueAt || null,
      created_by: lc(actorEmail),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toItem(data as Row);
}

export type PvpPatch = Partial<Pick<NewPvpItem, "title" | "body" | "counterpart" | "scheduledAt" | "channel" | "ownerEmails" | "durationMinutes" | "dueAt">> & {
  status?: string;
  archived?: boolean;
  calendarPushed?: string[];
};

export async function updatePvpItem(id: string, patch: PvpPatch): Promise<PvpItem> {
  if (!usingSupabase) throw new Error("Supabase isn't configured.");
  const row: Row = { updated_at: now() };
  if (patch.title !== undefined) row.title = patch.title.trim();
  if (patch.body !== undefined) row.body = patch.body.trim();
  if (patch.counterpart !== undefined) row.counterpart = patch.counterpart.trim();
  if (patch.scheduledAt !== undefined) row.scheduled_at = patch.scheduledAt || null;
  if (patch.channel !== undefined) row.channel = patch.channel.trim();
  if (patch.ownerEmails !== undefined) row.owner_emails = cleanOwners(patch.ownerEmails);
  if (patch.durationMinutes !== undefined) row.duration_minutes = clampDuration(patch.durationMinutes);
  if (patch.calendarPushed !== undefined) row.calendar_pushed = patch.calendarPushed.map(lc);
  if (patch.dueAt !== undefined) row.due_at = patch.dueAt || null;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.archived !== undefined) row.archived = patch.archived;

  const { data, error } = await sb().from("lms_pvp_items").update(row).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return toItem(data as Row);
}

export async function getPvpItem(id: string): Promise<PvpItem | null> {
  if (!usingSupabase) return null;
  const { data, error } = await sb().from("lms_pvp_items").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toItem(data as Row) : null;
}

export async function deletePvpItem(id: string): Promise<void> {
  if (!usingSupabase) throw new Error("Supabase isn't configured.");
  const { error } = await sb().from("lms_pvp_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Toggle one person's approval on a message draft.
 *
 *  Read-modify-write rather than a Postgres jsonb operator: PostgREST can't
 *  express "remove the element whose email matches" without an RPC, and at
 *  three approvers the extra read is a few hundred bytes. */
export async function togglePvpApproval(id: string, actorEmail: string): Promise<PvpItem> {
  if (!usingSupabase) throw new Error("Supabase isn't configured.");
  const { data, error } = await sb().from("lms_pvp_items").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  const item = toItem(data as Row);
  const me = lc(actorEmail);
  const had = item.approvals.some((a) => lc(a.email) === me);
  const next = had
    ? item.approvals.filter((a) => lc(a.email) !== me)
    : [...item.approvals, { email: me, at: now() }];
  const { data: saved, error: e2 } = await sb()
    .from("lms_pvp_items")
    .update({ approvals: next, updated_at: now() })
    .eq("id", id)
    .select("*")
    .single();
  if (e2) throw new Error(e2.message);
  return toItem(saved as Row);
}

export async function addPvpNote(id: string, actorEmail: string, body: string): Promise<PvpItem> {
  if (!usingSupabase) throw new Error("Supabase isn't configured.");
  const text = body.trim();
  if (!text) throw new Error("Write something first.");
  const { data, error } = await sb().from("lms_pvp_items").select("notes").eq("id", id).single();
  if (error) throw new Error(error.message);
  const existing = Array.isArray((data as Row).notes) ? ((data as Row).notes as PvpNote[]) : [];
  const next = [...existing, { id: uid(), author: lc(actorEmail), body: text, at: now() }];
  const { data: saved, error: e2 } = await sb()
    .from("lms_pvp_items")
    .update({ notes: next, updated_at: now() })
    .eq("id", id)
    .select("*")
    .single();
  if (e2) throw new Error(e2.message);
  return toItem(saved as Row);
}

// ---------------------------------------------------------------- calendars
//  A meeting that has a time on it lands on the Google Calendar of everyone in
//  PVP, plus the webmaster. Unscheduling or deleting it takes it off again.
//
//  Deliberately one push per person rather than the full-reconcile
//  syncToCalendar(): that one deletes any previously-synced key it isn't
//  given, so calling it with a single meeting would strip every task and
//  event off that person's calendar.


/** Whose calendars a scheduled meeting goes to. Driven by roles rather than a
 *  list of addresses, so next year's officers need no code change. */
export function pvpCalendarRecipients(): Member[] {
  return MEMBERS.filter((m) => m.roles.vpp || m.roles.webmaster);
}

export type CalendarResult = { pushed: string[]; removed: string[]; noCalendar: string[]; failed: string[] };
/** `item` comes back only when the sync actually rewrote calendar_pushed, so
 *  the caller can return the fresh row without a second read. */
export type CalendarSync = { result: CalendarResult; item: PvpItem | null };

/**
 * Put one meeting on (or take it off) the PVP calendars, and report who got it.
 *
 * Best-effort by design: a member who never connected their calendar, or whose
 * Google token has gone stale, must not stop the meeting being saved. The
 * result is reported back to the portal so the three of them can see whose
 * calendar actually has it.
 */
export async function syncMeetingToCalendars(item: PvpItem): Promise<CalendarSync> {
  const out: CalendarResult = { pushed: [], removed: [], noCalendar: [], failed: [] };
  if (item.kind !== "meeting") return { result: out, item: null };

  const wanted = !!item.scheduledAt && !item.archived;
  const had = new Set(item.calendarPushed.map(lc));
  const recipients = pvpCalendarRecipients();
  // Nothing to put on a calendar and nothing previously put there: no Google
  // call, no connection lookup, nothing.
  if (!wanted && had.size === 0) return { result: out, item: null };

  // One query for every connection rather than one per person.
  let conns: Map<string, { refreshToken: string; syncEnabled: boolean }>;
  try { conns = await getConnections(recipients.map((m) => m.email)); }
  catch { return { result: { ...out, failed: recipients.map((m) => lc(m.email)) }, item: null }; }

  await Promise.allSettled(
    recipients.map(async (m) => {
      const email = lc(m.email);
      const conn = conns.get(email);
      if (!conn || !conn.syncEnabled) { if (wanted) out.noCalendar.push(email); return; }

      try {
        if (wanted) {
          const start = new Date(item.scheduledAt as string);
          const end = new Date(start.getTime() + clampDuration(item.durationMinutes) * 60_000);
          await pushCalendarEvent(email, conn.refreshToken, {
            kind: "pvp", id: item.id,
            summary: `PVP: ${item.title}`,
            description:
              `Project RISHI — PVP meeting` +
              (item.counterpart ? `\n\nWith: ${item.counterpart}` : "") +
              (item.body ? `\n\n${item.body}` : ""),
            start: { dateTime: start.toISOString() } as GCalTime,
            end: { dateTime: end.toISOString() } as GCalTime,
          });
          out.pushed.push(email);
        } else if (had.has(email)) {
          await removeCalendarEvent(email, conn.refreshToken, "pvp", item.id);
          out.removed.push(email);
        }
      } catch { out.failed.push(email); }
    }),
  );

  // Remember exactly whose calendar holds it, so a later unschedule removes it
  // from those calendars and no others.
  const next = out.pushed.slice().sort();
  if (JSON.stringify(next) === JSON.stringify(item.calendarPushed.slice().sort())) {
    return { result: out, item: null }; // unchanged — no write, no re-read
  }
  try { return { result: out, item: await updatePvpItem(item.id, { calendarPushed: next }) }; }
  catch { return { result: out, item: null }; }
}

/** Called before a meeting row is deleted, so it doesn't linger on calendars. */
export async function removeMeetingFromCalendars(item: PvpItem): Promise<void> {
  if (item.kind !== "meeting" || item.calendarPushed.length === 0) return;
  const conns = await getConnections(item.calendarPushed);
  await Promise.allSettled(
    item.calendarPushed.map(async (email) => {
      const conn = conns.get(lc(email));
      if (conn?.syncEnabled) await removeCalendarEvent(lc(email), conn.refreshToken, "pvp", item.id);
    }),
  );
}
