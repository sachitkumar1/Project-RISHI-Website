// ============================================================================
//  Gmail — send-only connection store, OAuth, and message sending
// ----------------------------------------------------------------------------
//  Mirrors the Google Calendar module. Uses the SEND-ONLY scope (gmail.send),
//  which can inject outgoing mail but cannot read, list, or delete anything in
//  the mailbox. Two kinds of connection:
//    - personal: keyed by a member's own email (they send "as themselves")
//    - shared:   keyed by the club address ucberkeley@projectrishi.org
//  Each stores a refresh token server-side (Supabase when configured).
// ============================================================================

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

/** The shared club sending address for announcements, newsletters, and
 *  manually-composed emails. Only this account may be saved under this key. */
export const SHARED_SENDER = "ucberkeley@projectrishi.org";
export const SHARED_FROM_NAME = "Project RISHI";

/** A SEPARATE club account used only for automated notification emails
 *  (task/event notifications, reminders, and nudges). Kept apart from
 *  SHARED_SENDER on purpose. */
export const NOTIFY_SENDER = "projectrishiucberkeley@gmail.com";
export const NOTIFY_FROM_NAME = "Project RISHI";

// gmail.send to send; openid+email so we learn which account was connected.
const SCOPE = "https://www.googleapis.com/auth/gmail.send openid email";
const lc = (e: string) => e.trim().toLowerCase();

export function redirectUri(): string {
  const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  return `${base}/api/lms/gmail/callback`;
}

// ---- Connection record -----------------------------------------------------
export type GmailConnection = {
  accountEmail: string;
  refreshToken: string;
  connectedGoogleEmail: string | null;
  isShared: boolean;
};

const mem = new Map<string, GmailConnection>();

export async function getGmailConnection(accountEmail: string): Promise<GmailConnection | null> {
  const key = lc(accountEmail);
  if (usingSupabase) {
    const { data, error } = await sb().from("lms_gmail").select("*").eq("account_email", key).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      accountEmail: data.account_email,
      refreshToken: data.refresh_token,
      connectedGoogleEmail: data.connected_google_email ?? null,
      isShared: data.is_shared ?? false,
    };
  }
  return mem.get(key) ?? null;
}

export async function saveGmailConnection(
  accountEmail: string,
  refreshToken: string,
  connectedGoogleEmail: string | null,
  isShared: boolean,
  connectedBy: string,
): Promise<void> {
  const key = lc(accountEmail);
  if (usingSupabase) {
    const { error } = await sb().from("lms_gmail").upsert(
      {
        account_email: key,
        refresh_token: refreshToken,
        connected_google_email: connectedGoogleEmail ? lc(connectedGoogleEmail) : null,
        is_shared: isShared,
        connected_by: lc(connectedBy),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_email" },
    );
    if (error) throw new Error(error.message);
    return;
  }
  mem.set(key, { accountEmail: key, refreshToken, connectedGoogleEmail, isShared });
}

export async function removeGmailConnection(accountEmail: string): Promise<void> {
  const key = lc(accountEmail);
  if (usingSupabase) {
    const { error } = await sb().from("lms_gmail").delete().eq("account_email", key);
    if (error) throw new Error(error.message);
    return;
  }
  mem.delete(key);
}

// ---- OAuth -----------------------------------------------------------------
export function buildGmailConsentUrl(state: string): string {
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

/** Exchange the auth code → refresh token + the connected account's email. */
export async function exchangeGmailCode(
  code: string,
): Promise<{ refreshToken: string; email: string | null } | null> {
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
  if (!res.ok) return null;
  const data = (await res.json()) as { refresh_token?: string; id_token?: string };
  if (!data.refresh_token) return null;
  return { refreshToken: data.refresh_token, email: emailFromIdToken(data.id_token) };
}

// Pull the email claim out of the id_token (no verification needed — it came
// straight from Google's token endpoint over TLS).
function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split(".")[1];
    const json = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
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
    const e = new Error("refresh_failed") as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ---- Sending ---------------------------------------------------------------
const b64url = (s: string | Buffer) =>
  Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// RFC 2047 encode a header value if it contains non-ASCII (so emoji subjects work).
const encHeader = (v: string) =>
  // eslint-disable-next-line no-control-regex
  /[^\u0000-\u007f]/.test(v) ? `=?UTF-8?B?${Buffer.from(v).toString("base64")}?=` : v;

export type OutgoingAttachment = { filename: string; mimeType: string; contentBase64: string };

export type SendArgs = {
  fromEmail: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  /** Where replies go (e.g. the member who sent a request). */
  replyTo?: string;
  attachments?: OutgoingAttachment[];
};

function buildMime(a: SendArgs): string {
  const fromHeader = a.fromName ? `${encHeader(a.fromName)} <${a.fromEmail}>` : a.fromEmail;
  const baseHeaders = [
    `From: ${fromHeader}`,
    `To: ${a.to.join(", ")}`,
    a.cc && a.cc.length ? `Cc: ${a.cc.join(", ")}` : null,
    a.bcc && a.bcc.length ? `Bcc: ${a.bcc.join(", ")}` : null,
    a.replyTo ? `Reply-To: ${a.replyTo.replace(/[\r\n]/g, "")}` : null,
    `Subject: ${encHeader(a.subject)}`,
    "MIME-Version: 1.0",
  ].filter(Boolean) as string[];

  if (!a.attachments || a.attachments.length === 0) {
    return [...baseHeaders, 'Content-Type: text/html; charset="UTF-8"', "", a.html].join("\r\n");
  }

  const boundary = `b_${Math.random().toString(36).slice(2)}`;
  const parts: string[] = [
    ...baseHeaders,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    a.html,
  ];
  for (const att of a.attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}; name="${att.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${att.filename}"`,
      "",
      att.contentBase64.replace(/(.{76})/g, "$1\r\n"),
    );
  }
  parts.push(`--${boundary}--`);
  return parts.join("\r\n");
}

/** Send one message from a connected account. Returns the Gmail message id. */
export async function sendViaConnection(conn: GmailConnection, args: SendArgs): Promise<string> {
  const token = await accessTokenFromRefresh(conn.refreshToken);
  const raw = b64url(buildMime(args));
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const e = new Error(`gmail_send_${res.status}: ${body.slice(0, 200)}`) as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}
