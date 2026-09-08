// ============================================================================
//  Google Calendar — connection store, OAuth, and Calendar API helpers
// ----------------------------------------------------------------------------
//  One-way sync: we push the member's dashboard tasks/events into THEIR Google
//  Calendar. Calendar permission is requested on-demand (not at login), so
//  normal sign-ins stay clean. Each connected member's refresh token is stored
//  server-side (Supabase when configured, in-memory otherwise).
// ============================================================================

import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function redirectUri(): string {
  const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  return `${base}/api/lms/gcal/callback`;
}

// ---- Connection record -----------------------------------------------------
export type GCalConnection = {
  email: string;
  refreshToken: string;
  syncEnabled: boolean;
  syncedKeys: string[]; // e.g. ["task:abc", "event:xyz"] — for delete reconciliation
};

const mem = new Map<string, GCalConnection>();
const lc = (e: string) => e.trim().toLowerCase();

export async function getConnection(email: string): Promise<GCalConnection | null> {
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_gcal").select("*").eq("user_email", lc(email)).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      email: data.user_email,
      refreshToken: data.refresh_token,
      syncEnabled: data.sync_enabled,
      syncedKeys: data.synced_keys ?? [],
    };
  }
  return mem.get(lc(email)) ?? null;
}

export async function saveConnection(email: string, refreshToken: string): Promise<void> {
  if (usingSupabase) {
    const { error } = await sb().from("lms_gcal").upsert(
      { user_email: lc(email), refresh_token: refreshToken, sync_enabled: true, updated_at: new Date().toISOString() },
      { onConflict: "user_email" }
    );
    if (error) throw new Error(error.message);
    return;
  }
  const existing = mem.get(lc(email));
  mem.set(lc(email), { email: lc(email), refreshToken, syncEnabled: true, syncedKeys: existing?.syncedKeys ?? [] });
}

export async function setSyncedKeys(email: string, keys: string[]): Promise<void> {
  if (usingSupabase) {
    const { error } = await sb().from("lms_gcal").update({ synced_keys: keys, updated_at: new Date().toISOString() }).eq("user_email", lc(email));
    if (error) throw new Error(error.message);
    return;
  }
  const c = mem.get(lc(email));
  if (c) c.syncedKeys = keys;
}

export async function removeConnection(email: string): Promise<void> {
  if (usingSupabase) {
    const { error } = await sb().from("lms_gcal").delete().eq("user_email", lc(email));
    if (error) throw new Error(error.message);
    return;
  }
  mem.delete(lc(email));
}

// ---- OAuth -----------------------------------------------------------------
export function buildConsentUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForRefreshToken(code: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("gcal: code exchange failed —", res.status, body.slice(0, 300));
    return null;
  }
  const data = (await res.json()) as { refresh_token?: string };
  if (!data.refresh_token)
    console.error("gcal: code exchange returned no refresh_token (Workspace policy or already-granted grant)");
  return data.refresh_token ?? null;
}

async function accessTokenFromRefresh(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Surface Google's real reason (invalid_grant, admin_policy_enforced,
    // access_denied, …) so Workspace-domain / verification issues are diagnosable.
    console.error("gcal: refresh token exchange failed —", res.status, body.slice(0, 300));
    const e = new Error("refresh_failed") as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ---- Calendar API ----------------------------------------------------------
export function gcalId(kind: "task" | "event", id: string, email: string): string {
  return crypto.createHash("sha1").update(`rishi:${kind}:${id}:${lc(email)}`).digest("hex");
}

type GCalBody = {
  id: string;
  summary: string;
  description: string;
  start: GCalTime;
  end: GCalTime;
};

async function upsertEvent(token: string, body: GCalBody): Promise<"created" | "updated"> {
  const insert = await fetch(CAL_BASE, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (insert.ok) return "created";
  if (insert.status === 409) {
    const patch = await fetch(`${CAL_BASE}/${body.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ summary: body.summary, description: body.description, start: body.start, end: body.end }),
    });
    if (patch.ok) return "updated";
    const e = new Error(`patch_${patch.status}`) as Error & { status?: number };
    e.status = patch.status;
    throw e;
  }
  const e = new Error(`insert_${insert.status}`) as Error & { status?: number };
  e.status = insert.status;
  throw e;
}

async function deleteEvent(token: string, id: string): Promise<void> {
  const res = await fetch(`${CAL_BASE}/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404/410 = already gone; treat as success.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const e = new Error(`delete_${res.status}`) as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
}

export type GCalTime = { dateTime: string } | { date: string };
export type SyncItem = {
  key: string; // "task:ID" | "event:ID"
  kind: "task" | "event";
  id: string;
  summary: string;
  description: string;
  start: GCalTime;
  end: GCalTime;
};

/** Push items, then delete any previously-synced items that are gone now. */
export async function syncToCalendar(
  email: string,
  refreshToken: string,
  previousKeys: string[],
  items: SyncItem[]
): Promise<{ created: number; updated: number; deleted: number }> {
  const token = await accessTokenFromRefresh(refreshToken);
  let created = 0,
    updated = 0,
    deleted = 0;

  for (const it of items) {
    const r = await upsertEvent(token, {
      id: gcalId(it.kind, it.id, email),
      summary: it.summary,
      description: it.description,
      start: it.start,
      end: it.end,
    });
    r === "created" ? created++ : updated++;
  }

  const currentKeys = new Set(items.map((i) => i.key));
  for (const key of previousKeys) {
    if (!currentKeys.has(key)) {
      const [kind, id] = key.split(":");
      await deleteEvent(token, gcalId(kind as "task" | "event", id, email));
      deleted++;
    }
  }
  return { created, updated, deleted };
}

/** Remove every event we ever pushed (used when a member unsyncs). */
export async function removeAllSynced(email: string, refreshToken: string, keys: string[]): Promise<void> {
  const token = await accessTokenFromRefresh(refreshToken);
  for (const key of keys) {
    const [kind, id] = key.split(":");
    await deleteEvent(token, gcalId(kind as "task" | "event", id, email));
  }
}
