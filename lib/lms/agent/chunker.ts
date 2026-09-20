/**
 * Splits each file's extracted text (lms_files.content_text) into passages the
 * agent can search, and keeps lms_file_chunks in step with the file index.
 *
 * Reads content_text, never re-extracts: the indexer already did that work.
 * A file is (re)chunked whenever chunked_at is null — new files, and files whose
 * text changed (a trigger clears chunked_at; see migration-agent.sql).
 */
import { sb, usingSupabase } from "./config";

const TARGET = 1500; // characters per passage (~375 tokens)
const MAX = 1900;
const OVERLAP = 200; // carried into the next passage so nothing is cut mid-thought

export type ChunkMeta = { name: string; year: string | null; path: string; modifiedAt: string | null };

/** Header on every passage, so a file's name, folder and date are searchable
 *  and the model always knows where a passage came from. */
export function chunkHeader(m: ChunkMeta): string {
  const where = [m.year, m.path].filter(Boolean).join(" / ");
  const when = m.modifiedAt ? ` · edited ${m.modifiedAt.slice(0, 10)}` : "";
  return `[${m.name}${where ? ` — ${where}` : ""}${when}]`;
}

/** Split text into passages of ~TARGET characters on paragraph/line/sentence
 *  boundaries, with a small overlap. Pure — no I/O. */
export function splitText(text: string): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= MAX) return [clean];

  // Break into small units that never exceed MAX on their own.
  const units: string[] = [];
  for (const para of clean.split(/\n\n/)) {
    if (para.length <= MAX) { units.push(para); continue; }
    for (const line of para.split(/\n/)) {
      if (line.length <= MAX) { units.push(line); continue; }
      const sentences = line.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [line];
      for (const s of sentences) {
        for (let i = 0; i < s.length; i += MAX) units.push(s.slice(i, i + MAX));
      }
    }
  }

  const out: string[] = [];
  let cur = "";
  for (const u of units) {
    if (cur && cur.length + u.length + 1 > TARGET) {
      out.push(cur.trim());
      // Overlap: the tail of the previous passage, starting at a word boundary.
      const tail = cur.slice(-OVERLAP);
      const cut = tail.indexOf(" ");
      cur = (cut >= 0 ? tail.slice(cut + 1) : tail) + "\n" + u;
    } else {
      cur = cur ? `${cur}\n${u}` : u;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** PostgREST errors can arrive with an empty message (e.g. a 431); say something useful. */
export const dbErr = (e: { message?: string; code?: string; details?: string; hint?: string }) =>
  e.message || e.details || e.hint || (e.code ? `database error ${e.code}` : "database error (empty response)");

export type ChunkResult = { ok: boolean; error?: string; files?: number; chunks?: number; remaining?: number };

/**
 * Chunk queued files until the time budget runs out. Per file: delete its old
 * passages, insert the new ones, then stamp chunked_at. If a run dies midway,
 * the file simply stays queued — the delete-then-insert makes a retry exact.
 */
export async function buildChunks(budgetMs = 20_000): Promise<ChunkResult> {
  if (!usingSupabase) return { ok: false, error: "Supabase isn't configured." };
  const deadline = Date.now() + budgetMs;
  const now = () => new Date().toISOString();
  let files = 0;
  let chunks = 0;

  // 1. Files with no text (images, video, folders…): clear any old passages and
  //    stamp them in bulk. Most of the library is this. Batches of 100 ids: the
  //    ids travel in the URL, and 500 of them (18 KB) is rejected with HTTP 431.
  for (;;) {
    if (Date.now() > deadline) break;
    const { data, error } = await sb()
      .from("lms_files").select("id")
      .is("chunked_at", null).is("content_text", null)
      .limit(100);
    if (error) return { ok: false, error: dbErr(error) };
    const ids = (data ?? []).map((r) => r.id as string);
    if (!ids.length) break;
    const del = await sb().from("lms_file_chunks").delete().in("file_id", ids);
    if (del.error) return { ok: false, error: dbErr(del.error) };
    const upd = await sb().from("lms_files").update({ chunked_at: now() }).in("id", ids);
    if (upd.error) return { ok: false, error: dbErr(upd.error) };
    files += ids.length;
    if (ids.length < 100) break;
  }

  // 2. Files with text: a few at a time (a Doc can hold 200k characters).
  while (Date.now() < deadline) {
    const { data, error } = await sb()
      .from("lms_files").select("id,name,year,path,modified_at,content_text")
      .is("chunked_at", null).not("content_text", "is", null)
      .limit(10);
    if (error) return { ok: false, error: dbErr(error) };
    if (!data?.length) break;

    for (const f of data) {
      if (Date.now() > deadline) break;
      const header = chunkHeader({ name: f.name, year: f.year, path: f.path ?? "", modifiedAt: f.modified_at });
      const rows = splitText(f.content_text ?? "").map((text, i) => ({
        file_id: f.id, chunk_index: i, content: `${header}\n${text}`,
      }));
      const del = await sb().from("lms_file_chunks").delete().eq("file_id", f.id);
      if (del.error) return { ok: false, error: dbErr(del.error) };
      for (let i = 0; i < rows.length; i += 100) {
        const ins = await sb().from("lms_file_chunks").insert(rows.slice(i, i + 100));
        if (ins.error) return { ok: false, error: dbErr(ins.error) };
      }
      const upd = await sb().from("lms_files").update({ chunked_at: now() }).eq("id", f.id);
      if (upd.error) return { ok: false, error: dbErr(upd.error) };
      files += 1;
      chunks += rows.length;
    }
  }

  const { count } = await sb()
    .from("lms_files").select("id", { count: "exact", head: true }).is("chunked_at", null);
  return { ok: true, files, chunks, remaining: count ?? undefined };
}
