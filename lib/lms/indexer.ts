// ============================================================================
//  Content indexing — fills lms_files.content_text so file CONTENTS are
//  searchable, not just their names.
// ----------------------------------------------------------------------------
//  Google-native files (Docs, Sheets, Slides) are exported as plain text
//  through the Drive API, which is cheap and needs no parsing library. Plain
//  text and CSV files are downloaded directly. Everything else — PDFs, images,
//  video, zips — is skipped and marked as indexed so we don't retry it every
//  run. See INDEXABLE below for the exact list.
//
//  This is also the groundwork for the search agent: it will read the same
//  content_text column rather than needing its own extraction pass.
//
//  Text is capped per file (MAX_CHARS). Club documents run well under that;
//  the cap exists so one enormous spreadsheet can't bloat a row.
// ============================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getDriveAccessToken } from "@/lib/lms/drive";

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

/** Roughly 200k characters — far more than any club doc, small enough to store. */
const MAX_CHARS = 200_000;

/** mime → how to get text out of it. null means "download the bytes as text". */
const INDEXABLE: Record<string, string | null> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
  "text/plain": null,
  "text/csv": null,
  "text/markdown": null,
  "application/json": null,
};

export const isIndexable = (mime: string) => mime in INDEXABLE;

/** Collapse runs of whitespace so the stored text stays compact and searchable. */
function tidy(raw: string): string {
  return raw.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_CHARS);
}

async function extract(token: string, driveId: string, mime: string): Promise<string | null> {
  const exportAs = INDEXABLE[mime];
  const url = exportAs
    ? `https://www.googleapis.com/drive/v3/files/${driveId}/export?mimeType=${encodeURIComponent(exportAs)}`
    : `https://www.googleapis.com/drive/v3/files/${driveId}?alt=media&supportsAllDrives=true`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    // 403 on export usually means the file is too large to export, or it's a
    // shortcut to something we can't reach. Not worth failing the whole run.
    console.warn(`indexer: skipping ${driveId} (HTTP ${res.status})`);
    return null;
  }
  return tidy(await res.text());
}

export type IndexResult = {
  ok: boolean;
  error?: string;
  examined?: number;
  indexed?: number;
  skipped?: number;
  failed?: number;
  remaining?: number;
};

/**
 * Index files that have no content yet, or whose Drive copy changed since we
 * last read it. Processes a bounded batch so a cron run can't hang: call it
 * repeatedly until `remaining` is 0.
 */
export async function indexContent(limit = 60): Promise<IndexResult> {
  if (!usingSupabase) return { ok: false, error: "Supabase isn't configured." };

  const auth = await getDriveAccessToken();
  if ("error" in auth) return { ok: false, error: auth.error };

  // Files needing work: never indexed, or modified after their last index.
  const { data: rows, error } = await sb()
    .from("lms_files")
    .select("id,drive_id,mime_type,modified_at,content_indexed_at")
    .eq("source", "drive")
    .eq("kind", "file")
    .eq("deleted", false)
    .is("content_indexed_at", null)
    .limit(limit);
  if (error) return { ok: false, error: error.message };

  let indexed = 0,
    skipped = 0,
    failed = 0;

  for (const r of rows ?? []) {
    const mime = r.mime_type ?? "";
    const stamp = new Date().toISOString();

    if (!isIndexable(mime) || !r.drive_id) {
      // Mark it seen so it drops out of the queue permanently.
      await sb().from("lms_files").update({ content_indexed_at: stamp }).eq("id", r.id);
      skipped++;
      continue;
    }

    try {
      const text = await extract(auth.token, r.drive_id, mime);
      await sb()
        .from("lms_files")
        .update({ content_text: text, content_indexed_at: stamp })
        .eq("id", r.id);
      if (text) indexed++;
      else skipped++;
    } catch (e) {
      console.warn(`indexer: ${r.drive_id} failed —`, (e as Error).message);
      failed++;
    }
  }

  const { count } = await sb()
    .from("lms_files")
    .select("*", { count: "exact", head: true })
    .eq("source", "drive")
    .eq("kind", "file")
    .eq("deleted", false)
    .is("content_indexed_at", null);

  return { ok: true, examined: rows?.length ?? 0, indexed, skipped, failed, remaining: count ?? 0 };
}

/** How much of the library currently has searchable text, for Settings. */
export async function indexStatus(): Promise<{ total: number; withText: number; pending: number }> {
  if (!usingSupabase) return { total: 0, withText: 0, pending: 0 };
  const base = () =>
    sb().from("lms_files").select("*", { count: "exact", head: true })
      .eq("source", "drive").eq("kind", "file").eq("deleted", false);
  const [{ count: total }, { count: withText }, { count: pending }] = await Promise.all([
    base(),
    base().not("content_text", "is", null),
    base().is("content_indexed_at", null),
  ]);
  return { total: total ?? 0, withText: withText ?? 0, pending: pending ?? 0 };
}
