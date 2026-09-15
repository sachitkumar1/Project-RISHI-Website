// ============================================================================
//  Google Drive mirror — indexes the club's Drive folders into lms_files.
// ----------------------------------------------------------------------------
//  WHAT THIS DOES (and what it deliberately does NOT do)
//    It copies file *metadata* — names, folders, types, sizes, modified dates,
//    and the Drive link — into our own table so the site can render a real
//    file browser. It does NOT copy file bytes. Nothing is re-hosted, nothing
//    goes stale, and a doc edited in Drive is still the same doc here.
//
//  AUTH: the same Google service account already used for Sheets, with the
//  read-only Drive scope added. This is a service-account scope, NOT an OAuth
//  consent-screen scope — adding it does not trigger a Google verification
//  review and members never have to reconnect anything.
//
//  SETUP (one time):
//    1. Google Cloud Console → same project → APIs & Services → Enable
//       "Google Drive API".
//    2. In Drive, open EACH folder listed in YEAR_ROOTS below → Share → add
//       GOOGLE_SA_EMAIL as a Viewer. Without this the sync finds nothing.
//
//  SAFETY: a sync NEVER deletes rows. Items that disappear from Drive are
//  flagged deleted = true and stop showing; if a sync half-fails, or a folder
//  is briefly unshared, nothing is lost and the next good sync restores them.
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

// ---------------------------------------------------------------- what to index
/** The club's top-level Drive folder. Every school-year folder lives inside it. */
export const PARENT_FOLDER_ID = "1HuumMAhBWL-R0gZV58Brwrkz00NU-t29";

/**
 * Year folders we know about without asking Drive. These are the two the
 * service account was first shared on; anything else is discovered at sync time
 * (see discoverYearRoots), so sharing another year with GOOGLE_SA_EMAIL is all
 * it takes for it to appear — no code change, no redeploy.
 */
export const KNOWN_YEAR_ROOTS: { id: string; year: string; name: string }[] = [
  { id: "1avvwirYScoTAoQFu3vc2luYrpb8YDS2n", year: "2026-2027", name: "2026-2027 Project RISHI" },
  { id: "143aYpyAABNvMFDw6J5kRAbltJTk-MDKf", year: "2025-2026", name: "2025-2026 Project RISHI" },
  { id: "1mFLYlwwxU2LlCyfqNRDxAaEymBwj-CZb", year: "2020-2021", name: "2020-2021 Project RISHI" },
  { id: "1X5ZUAa3S0SHds1DrKJHqmejVZfoH6M0p", year: "2019-2020", name: "2019-2020 Project RISHI" },
  // 2016-2017 and 2017-2018 aren't shared with GOOGLE_SA_EMAIL yet. Share them
  // (or the parent folder) and they're picked up automatically — no code change.
];

/** Kept for callers that just want a list to show in Settings. */
export const YEAR_ROOTS = KNOWN_YEAR_ROOTS;

/**
 * Find every school-year folder the service account can reach.
 *
 * Reads the parent folder when it's shared, and merges in the known two so a
 * parent that isn't shared can never make existing years vanish. A folder
 * counts as a year if its name starts with something like "2019-2020".
 */
async function discoverYearRoots(token: string): Promise<{ id: string; year: string; name: string }[]> {
  const found = new Map<string, { id: string; year: string; name: string }>();
  for (const r of KNOWN_YEAR_ROOTS) found.set(r.id, r);

  try {
    for (const c of await listChildren(token, PARENT_FOLDER_ID)) {
      if (c.mimeType !== FOLDER_MIME) continue;
      const m = c.name.match(/(\d{4})\s*[-–—]\s*(\d{4})/);
      if (!m) continue;
      found.set(c.id, { id: c.id, year: `${m[1]}-${m[2]}`, name: c.name });
    }
  } catch (e) {
    // The parent not being shared is the normal case today, not an error.
    console.warn("drive: couldn't read the parent folder —", (e as Error).message);
  }
  return Array.from(found.values()).sort((a, b) => b.year.localeCompare(a.year));
}

/**
 * Drive items the sync skips entirely; a folder here is skipped with everything
 * inside it. Empty on purpose — the mirror stores metadata, not bytes, so even
 * the GM decks and trip videos cost no Supabase storage. Add an id here only to
 * keep something off the site deliberately.
 */
export const EXCLUDED_IDS = new Set<string>([]);

const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

// ---------------------------------------------------------------- auth token
const b64url = (buf: Buffer | string) =>
  (Buffer.isBuffer(buf) ? buf : Buffer.from(buf)).toString("base64url");

let cachedToken: { token: string; expiresAt: number } | null = null;

export type TokenResult = { token: string } | { error: string };

/** Exported so the content indexer can reuse the same cached token. */
export async function getDriveAccessToken(): Promise<TokenResult> {
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
      scope: "https://www.googleapis.com/auth/drive.readonly",
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
    const msg = `Could not sign with GOOGLE_SA_PRIVATE_KEY (${(e as Error).message}). Paste the private_key value from the service-account JSON exactly, including the \\n sequences.`;
    console.error("drive:", msg);
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
    console.error("drive:", msg);
    return { error: msg };
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return { error: "Google returned no access token." };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 120) * 1000,
  };
  return { token: cachedToken.token };
}

// ---------------------------------------------------------------- Drive walk
type DriveItem = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  modifiedTime?: string;
  owners?: { emailAddress?: string }[];
};

const FIELDS =
  "nextPageToken,files(id,name,mimeType,size,webViewLink,modifiedTime,owners(emailAddress))";

/** One page-through of a folder's direct children. */
async function listChildren(token: string, folderId: string): Promise<DriveItem[]> {
  const out: DriveItem[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: FIELDS,
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      orderBy: "folder,name",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        res.status === 404
          ? `Drive folder ${folderId} not found, or GOOGLE_SA_EMAIL hasn't been given access to it. Share the folder with the service account as a Viewer.`
          : `Drive API error (HTTP ${res.status}): ${body.slice(0, 300)}`,
      );
    }
    const data = (await res.json()) as { files?: DriveItem[]; nextPageToken?: string };
    out.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

type IndexRow = {
  source: "drive";
  drive_id: string;
  parent_id: string | null;
  name: string;
  mime_type: string;
  kind: "folder" | "file" | "shortcut";
  size_bytes: number | null;
  web_view_link: string | null;
  year: string;
  path: string;
  modified_at: string | null;
  owner_email: string | null;
  deleted: false;
  synced_at: string;
};

const kindOf = (mime: string): IndexRow["kind"] =>
  mime === FOLDER_MIME ? "folder" : mime === SHORTCUT_MIME ? "shortcut" : "file";

/** How many folders are listed from Drive at once. */
const WALK_CONCURRENCY = 8;

/**
 * Walk one year folder, level by level, listing folders in parallel.
 *
 * This used to recurse one folder at a time. With four school years mirrored
 * (221 folders) that took 77s — past Vercel's 60s ceiling — because almost all
 * of it was spent waiting on Drive rather than doing work. Listing a batch at a
 * time turns that wait into overlap.
 */
async function walk(
  token: string,
  rootId: string,
  year: string,
  at: string,
  acc: IndexRow[],
  seen: Set<string>,
): Promise<void> {
  // Each queued entry is a folder still to be listed, plus its breadcrumb path.
  let level: { id: string; path: string }[] = [{ id: rootId, path: "" }];

  for (let depth = 0; depth < 12 && level.length > 0; depth++) {
    const next: { id: string; path: string }[] = [];

    for (let i = 0; i < level.length; i += WALK_CONCURRENCY) {
      const batch = level.slice(i, i + WALK_CONCURRENCY);
      const listings = await Promise.all(
        batch.map(async (f) => ({ folder: f, children: await listChildren(token, f.id) })),
      );

      for (const { folder, children } of listings) {
        for (const c of children) {
          if (EXCLUDED_IDS.has(c.id)) continue;
          if (seen.has(c.id)) continue; // a file can live in two folders; index it once
          seen.add(c.id);

          const kind = kindOf(c.mimeType);
          acc.push({
            source: "drive",
            drive_id: c.id,
            parent_id: folder.id,
            name: c.name,
            mime_type: c.mimeType,
            kind,
            size_bytes: c.size ? Number(c.size) : null,
            web_view_link: c.webViewLink ?? null,
            year,
            path: folder.path,
            modified_at: c.modifiedTime ?? null,
            owner_email: c.owners?.[0]?.emailAddress ?? null,
            deleted: false,
            synced_at: at,
          });

          if (kind === "folder")
            next.push({ id: c.id, path: folder.path ? `${folder.path}/${c.name}` : c.name });
        }
      }
    }
    level = next;
  }
}

export type DriveSyncResult = {
  ok: boolean;
  error?: string;
  indexed?: number;
  folders?: number;
  removed?: number;
  skipped?: string;
};

/**
 * Re-index both year folders. Upserts everything found, then soft-deletes any
 * previously-indexed Drive row that this run didn't see.
 */
export async function syncDrive(): Promise<DriveSyncResult> {
  if (!usingSupabase) return { ok: false, skipped: "Supabase isn't configured in this environment." };

  const auth = await getDriveAccessToken();
  if ("error" in auth) return { ok: false, error: auth.error };

  const at = new Date().toISOString();
  const rows: IndexRow[] = [];
  const seen = new Set<string>();

  const roots = await discoverYearRoots(auth.token);

  try {
    for (const root of roots) {
      // The year folder itself is the top of the tree the browser shows.
      rows.push({
        source: "drive",
        drive_id: root.id,
        parent_id: null,
        name: root.name,
        mime_type: FOLDER_MIME,
        kind: "folder",
        size_bytes: null,
        web_view_link: `https://drive.google.com/drive/folders/${root.id}`,
        year: root.year,
        path: "",
        modified_at: null,
        owner_email: null,
        deleted: false,
        synced_at: at,
      });
      seen.add(root.id);
      await walk(auth.token, root.id, root.year, at, rows, seen);
    }
  } catch (e) {
    // Bail without touching the index — a partial walk must never look like
    // "these files were deleted".
    return { ok: false, error: (e as Error).message };
  }

  if (rows.length === 0)
    return {
      ok: false,
      error:
        "Drive returned nothing for either folder. That almost always means GOOGLE_SA_EMAIL hasn't been shared on them yet.",
    };

  // Upsert in chunks — one big payload can exceed the request limit.
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb()
      .from("lms_files")
      .upsert(rows.slice(i, i + 200), { onConflict: "drive_id" });
    if (error) return { ok: false, error: error.message };
  }

  // Anything Drive-sourced we didn't see this run is gone from Drive. Flag it,
  // never delete it.
  const { data: removedRows, error: delErr } = await sb()
    .from("lms_files")
    .update({ deleted: true })
    .eq("source", "drive")
    .eq("deleted", false)
    .lt("synced_at", at)
    .select("id");
  if (delErr) return { ok: false, error: delErr.message };

  // Files edited in Drive are queued for re-indexing by the
  // lms_files_reindex trigger (see migration-files.sql), which clears
  // content_text whenever modified_at changes. It's done in the database
  // because PostgREST filters compare against literals, not other columns.

  return {
    ok: true,
    indexed: rows.length,
    folders: rows.filter((r) => r.kind === "folder").length,
    removed: removedRows?.length ?? 0,
  };
}

/** When the index was last refreshed, for the Settings panel. */
export async function lastDriveSync(): Promise<string | null> {
  if (!usingSupabase) return null;
  const { data } = await sb()
    .from("lms_files")
    .select("synced_at")
    .eq("source", "drive")
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.synced_at ?? null;
}
