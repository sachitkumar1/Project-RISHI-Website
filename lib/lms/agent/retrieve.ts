/**
 * Find the passages that answer a question, for THIS member.
 *
 *   1. Hybrid search in Postgres: keyword (full-text) + meaning (embeddings).
 *      Either half can be missing — no key, quota gone, not embedded yet — and
 *      the other still works.
 *   2. Permissions: every hit is checked with the same rule the Files browser
 *      uses (files.ts). A member never gets an answer built from a file they
 *      couldn't open themselves.
 *   3. Nudges from the question: a year ("India trip 2024") favours that school
 *      year's folders; "last time" / "latest" favours recently edited files.
 *   4. Group by file: each file becomes ONE numbered source with up to three
 *      excerpts, so citations point at documents, not fragments.
 */
import type { Member } from "@/lib/members";
import { fileVisibilityCheck } from "@/lib/lms/files";
import { sb, usingSupabase } from "./config";
import { geminiEmbed } from "./models";
import { dbErr } from "./chunker";

export type Source = {
  n: number;
  fileId: string;
  name: string;
  path: string;
  year: string | null;
  modifiedAt: string | null;
  link: string | null;
  mimeType: string;
  excerpts: string[];
};

export type QueryEmbedder = (q: string) => Promise<number[] | null>;
// Capped at 5s: meaning-search is a bonus on top of keyword search, and a slow
// embedding call must never eat the time the answer itself needs (it used to be
// able to wait 40s before any model ran).
export const defaultQueryEmbedder: QueryEmbedder = async (q) => {
  try { return (await geminiEmbed([q], "RETRIEVAL_QUERY", 5_000))[0]; } catch { return null; }
};

const MATCH = 80;          // candidates from each half of the search
const MAX_FILES = 8;
const MAX_PER_FILE = 3;
const CHAR_BUDGET = 22_000; // ~5.5k tokens of excerpts in the prompt
const RRF_K = 60;

/** School years a question points at: "2024" → 2023-2024 and 2024-2025. */
export function yearHints(q: string): Set<string> {
  const out = new Set<string>();
  for (const m of Array.from(q.matchAll(/\b(19|20)(\d{2})\b/g))) {
    const y = Number(m[1] + m[2]);
    out.add(`${y - 1}-${y}`);
    out.add(`${y}-${y + 1}`);
  }
  return out;
}

const STOP = new Set(("a an and are as at be been but by can could did do does for from had has have he her " +
  "him his how i if in into is it its me my of on or our she so than that the their them then there these they " +
  "this to us was we were what when where which who whom why will with would you your about any all also am " +
  "ever get got just like more most much no not now only other out over past some such too up very").split(" "));

/** Adjacent meaningful word pairs in the question — "asha ji", "last time". */
export function questionPhrases(q: string): string[] {
  // Unicode-aware word match; built with the constructor because the project's
  // TypeScript target predates the regex-literal "u" flag.
  const words = q.toLowerCase().match(new RegExp("[\\p{L}\\p{N}']+", "gu")) ?? [];
  const out = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i], b = words[i + 1];
    if (!STOP.has(a) && !STOP.has(b) && a.length > 1 && b.length > 1) out.add(`${a} ${b}`);
  }
  return Array.from(out).slice(0, 12);
}

export const wantsRecent = (q: string) =>
  /\b(last|latest|most recent(ly)?|recent(ly)?|newest|current(ly)?|this year|lately)\b/i.test(q);

/** Drop the "[name — folder · date]" header the chunker adds; the prompt shows
 *  the file's details once per source instead. */
const stripHeader = (s: string) => (s.startsWith("[") ? s.slice(s.indexOf("\n") + 1) : s);

export async function retrieve(
  m: Member,
  question: string,
  opts: { context?: string; embedQuery?: QueryEmbedder } = {},
): Promise<{ sources: Source[]; usedEmbedding: boolean; candidates: number }> {
  if (!usingSupabase) return { sources: [], usedEmbedding: false, candidates: 0 };
  const q = [question, opts.context].filter(Boolean).join(" ").slice(0, 2000);

  const vec = await (opts.embedQuery ?? defaultQueryEmbedder)(q);
  const { data: hits, error } = await sb().rpc("lms_search_chunks", {
    q,
    q_embedding: vec ? `[${vec.join(",")}]` : null,
    match_count: MATCH,
    phrases: questionPhrases(q),
  });
  if (error) throw new Error(`search failed: ${dbErr(error)}`);
  if (!hits?.length) return { sources: [], usedEmbedding: !!vec, candidates: 0 };

  type Hit = { chunk_id: number; file_id: string; chunk_index: number; content: string; fts_pos: number | null; vec_pos: number | null };
  const rows = hits as Hit[];

  // Ids travel in the URL, so fetch in batches of 100 (a long URL gets HTTP 431).
  const fileIds = Array.from(new Set(rows.map((r) => r.file_id)));
  const files: Record<string, any>[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let i = 0; i < fileIds.length; i += 100) {
    const { data, error: ferr } = await sb()
      .from("lms_files")
      .select("id,name,path,year,modified_at,web_view_link,parent_id,mime_type,deleted")
      .in("id", fileIds.slice(i, i + 100));
    if (ferr) throw new Error(dbErr(ferr));
    files.push(...(data ?? []));
  }
  const canSee = await fileVisibilityCheck(m);
  const fileById = new Map(
    files.filter((f) => !f.deleted && canSee(f.parent_id ?? null)).map((f) => [f.id as string, f]),
  );

  // Score passages: reciprocal rank fusion, then the question's nudges.
  const years = yearHints(question);
  const recent = wantsRecent(question);
  const byNewest = Array.from(fileById.values())
    .sort((a, b) => String(b.modified_at ?? "").localeCompare(String(a.modified_at ?? "")))
    .map((f) => f.id as string);

  const scored = rows
    .filter((r) => fileById.has(r.file_id))
    .map((r) => {
      const f = fileById.get(r.file_id)!;
      let s = (r.fts_pos ? 1 / (RRF_K + r.fts_pos) : 0) + (r.vec_pos ? 1 / (RRF_K + r.vec_pos) : 0);
      if (years.size && f.year && years.has(f.year)) s *= 1.6;
      if (years.size && Array.from(years).some((y) => `${f.name} ${f.path}`.includes(y.slice(5)))) s *= 1.2;
      if (recent && byNewest.length > 1) s *= 1 + 0.6 * (1 - byNewest.indexOf(r.file_id) / (byNewest.length - 1));
      return { ...r, score: s };
    })
    .sort((a, b) => b.score - a.score);

  // Group by file, keeping each file's best passages.
  const perFile = new Map<string, typeof scored>();
  for (const h of scored) {
    const list = perFile.get(h.file_id) ?? [];
    if (list.length < MAX_PER_FILE) list.push(h);
    perFile.set(h.file_id, list);
  }
  const ranked = Array.from(perFile.entries())
    .map(([fileId, list]) => ({ fileId, list, score: list.reduce((s, h, i) => s + h.score / (i + 1), 0) }))
    .sort((a, b) => b.score - a.score);

  const sources: Source[] = [];
  let budget = CHAR_BUDGET;
  for (const { fileId, list } of ranked) {
    if (sources.length >= MAX_FILES || budget <= 0) break;
    const f = fileById.get(fileId)!;
    const excerpts: string[] = [];
    for (const h of [...list].sort((a, b) => a.chunk_index - b.chunk_index)) {
      const text = stripHeader(h.content).trim();
      if (!text || budget - text.length < 0 && excerpts.length) continue;
      excerpts.push(text);
      budget -= text.length;
    }
    if (!excerpts.length) continue;
    sources.push({
      n: sources.length + 1,
      fileId,
      name: f.name,
      path: f.path ?? "",
      year: f.year ?? null,
      modifiedAt: f.modified_at ?? null,
      link: f.web_view_link ?? null,
      mimeType: f.mime_type ?? "",
      excerpts,
    });
  }
  return { sources, usedEmbedding: !!vec, candidates: rows.length };
}
