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

/** Marker for "this needs the PDF parser", not a Drive export type. */
const PDF = "\u0000pdf";

/** PDFs above this are skipped — parsing them costs more than they're worth. */
const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** Roughly 200k characters — far more than any club doc, small enough to store. */
const MAX_CHARS = 200_000;

/**
 * mime → how to get text out of it.
 *   a string → ask Drive to export as that type (Google-native files)
 *   null     → download the bytes and treat them as text
 *   "PDF"    → download the bytes and parse them with unpdf
 */
const INDEXABLE: Record<string, string | null> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
  "application/pdf": PDF,
  "text/plain": null,
  "text/csv": null,
  "text/markdown": null,
  "application/json": null,
};

/**
 * Folders whose contents are never text-indexed, by folder id.
 *
 * Indexing copies a document's full text into the database. Search already
 * respects each folder's audience, so restricted material stays restricted —
 * but that governs who can FIND it, not whether it's stored. For material
 * where storing the text at all is the concern, list the folder here: its
 * files are still listed, previewable and openable, their contents are just
 * never read.
 */
export const CONTENT_INDEX_SKIP_FOLDERS = new Set<string>([
  // 25-26 financial reimbursement receipts. The submission form requires
  // screenshots showing the last four digits of a card or bank account, so the
  // text of these files is deliberately never stored.
  "1jmi7wpkSwy4seFixVgPg6cDM36IyrPqXQJRfinsurogUyXjd51ffgUTu5Fgvj-7O-pvvECcp",
]);

export const isIndexable = (mime: string) => mime in INDEXABLE;

/** Collapse runs of whitespace so the stored text stays compact and searchable. */
function tidy(raw: string): string {
  return raw.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_CHARS);
}

/** Pull readable text out of a PDF. Scanned PDFs legitimately yield nothing. */
async function extractPdf(bytes: ArrayBuffer): Promise<string | null> {
  if (bytes.byteLength > MAX_PDF_BYTES) return null;
  // Imported lazily so the PDF engine is only loaded when a PDF turns up.
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(doc, { mergePages: true });
  const out = tidy(Array.isArray(text) ? text.join("\n") : String(text ?? ""));
  // A scan with no text layer comes back essentially empty. Storing "" would
  // be indistinguishable from a real empty file, so return null.
  return out.length > 20 ? out : null;
}

async function extract(token: string, driveId: string, mime: string): Promise<string | null> {
  const how = INDEXABLE[mime];
  const url =
    how && how !== PDF
      ? `https://www.googleapis.com/drive/v3/files/${driveId}/export?mimeType=${encodeURIComponent(how)}`
      : `https://www.googleapis.com/drive/v3/files/${driveId}?alt=media&supportsAllDrives=true`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    // 403 on export usually means the file is too large to export, or it's a
    // shortcut to something we can't reach. Not worth failing the whole run.
    console.warn(`indexer: skipping ${driveId} (HTTP ${res.status})`);
    return null;
  }

  if (how === PDF) {
    try {
      return await extractPdf(await res.arrayBuffer());
    } catch (e) {
      // A malformed or encrypted PDF shouldn't take the run down with it.
      console.warn(`indexer: PDF ${driveId} unreadable —`, (e as Error).message);
      return null;
    }
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

/** How many extractions run at once. Drive tolerates this comfortably. */
const CONCURRENCY = 8;

/**
 * Pull text for every file that still needs it, working until the queue is
 * empty or the time budget runs out.
 *
 * The budget is 35s, not 60: the Drive walk runs first and Vercel kills the
 * whole request at 60s. A measured full first run took ~51s end to end, so the
 * headroom matters. Being cut short is safe anyway — each file is stamped as
 * it completes, so the next run resumes rather than restarting.
 *
 * Non-indexable files are retired up front in a single statement, so the loop
 * only ever touches files that can actually yield text. In practice one run
 * now covers the whole library rather than chipping away 60 rows at a time.
 */
export async function indexContent(budgetMs = 35_000): Promise<IndexResult> {
  if (!usingSupabase) return { ok: false, error: "Supabase isn't configured." };

  const auth = await getDriveAccessToken();
  if ("error" in auth) return { ok: false, error: auth.error };

  const deadline = Date.now() + budgetMs;
  const stamp = new Date().toISOString();

  // ---- 1. Retire everything that can never have text, in ONE statement ----
  // Photos, PDFs, videos, shortcuts and Forms make up most of the library.
  // Walking them 60 at a time through individual updates wasted whole runs.
  const { data: dropped } = await sb()
    .from("lms_files")
    .update({ content_indexed_at: stamp })
    .eq("source", "drive")
    .eq("kind", "file")
    .eq("deleted", false)
    .is("content_indexed_at", null)
    .not("mime_type", "in", `(${Object.keys(INDEXABLE).map((m) => `"${m}"`).join(",")})`)
    .select("id");
  const skipped = dropped?.length ?? 0;

  // ---- 2. Extract the rest, several at a time, until the budget runs out ----
  let indexed = 0,
    failed = 0,
    examined = 0;

  while (Date.now() < deadline) {
    const { data: rows, error } = await sb()
      .from("lms_files")
      .select("id,drive_id,mime_type,parent_id")
      .eq("source", "drive")
      .eq("kind", "file")
      .eq("deleted", false)
      .is("content_indexed_at", null)
      .in("mime_type", Object.keys(INDEXABLE))
      .limit(CONCURRENCY);
    if (error) return { ok: false, error: error.message };
    if (!rows || rows.length === 0) break; // queue drained

    examined += rows.length;
    await Promise.all(
      rows.map(async (r) => {
        const at = new Date().toISOString();
        try {
          const skip = CONTENT_INDEX_SKIP_FOLDERS.has(r.parent_id ?? "");
          const text =
            r.drive_id && !skip ? await extract(auth.token, r.drive_id, r.mime_type ?? "") : null;
          await sb()
            .from("lms_files")
            .update({ content_text: text, content_indexed_at: at })
            .eq("id", r.id);
          if (text) indexed++;
        } catch (e) {
          console.warn(`indexer: ${r.drive_id} failed —`, (e as Error).message);
          // Stamp it so one broken file can't wedge the queue forever.
          await sb().from("lms_files").update({ content_indexed_at: at }).eq("id", r.id);
          failed++;
        }
      }),
    );
  }

  const { count } = await sb()
    .from("lms_files")
    .select("*", { count: "exact", head: true })
    .eq("source", "drive")
    .eq("kind", "file")
    .eq("deleted", false)
    .is("content_indexed_at", null);

  return { ok: true, examined, indexed, skipped, failed, remaining: count ?? 0 };
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
