/**
 * Fills in embeddings for passages that don't have one yet (or were embedded
 * with a different model). Bounded by time; reports what's left.
 *
 * Search works WITHOUT embeddings (keyword search alone), so this can lag,
 * stall on a quota, or be switched off without breaking anything — answers just
 * get better as more passages are embedded.
 */
import { agentConfig, sb, usingSupabase } from "./config";
import { geminiEmbed, ModelError } from "./models";
import { dbErr } from "./chunker";

export type Embedder = (texts: string[]) => Promise<number[][]>;
export const defaultEmbedder: Embedder = (t) => geminiEmbed(t, "RETRIEVAL_DOCUMENT");

export type EmbedResult = { ok: boolean; error?: string; embedded?: number; remaining?: number; stoppedBy?: string };

const BATCH = 100; // the API's per-request maximum

export async function embedPending(budgetMs = 20_000, embed: Embedder = defaultEmbedder): Promise<EmbedResult> {
  if (!usingSupabase) return { ok: false, error: "Supabase isn't configured." };
  const cfg = agentConfig();
  if (!cfg.geminiKey && embed === defaultEmbedder) return { ok: true, embedded: 0, stoppedBy: "no GEMINI_API_KEY" };
  const deadline = Date.now() + budgetMs;
  let embedded = 0;
  let stoppedBy: string | undefined;

  while (Date.now() < deadline) {
    const { data, error } = await sb()
      .from("lms_file_chunks").select("id,content")
      .or(`embedding.is.null,embed_model.neq.${cfg.embedModel}`)
      .order("id").limit(BATCH);
    if (error) return { ok: false, error: dbErr(error) };
    if (!data?.length) break;

    let vecs: number[][];
    try {
      vecs = await embed(data.map((r) => r.content as string));
    } catch (e) {
      // A quota or key problem: stop for now, keep what's done. Not a failure of
      // the job — keyword search still works and the next run carries on.
      stoppedBy = e instanceof ModelError ? `${e.kind}: ${e.message}` : (e as Error).message;
      break;
    }
    const { error: werr } = await sb().rpc("lms_set_chunk_embeddings", {
      p_ids: data.map((r) => r.id),
      p_embeddings: vecs.map((v) => `[${v.join(",")}]`),
      p_model: cfg.embedModel,
    });
    if (werr) return { ok: false, error: dbErr(werr) };
    embedded += data.length;
  }

  const { count } = await sb()
    .from("lms_file_chunks").select("id", { count: "exact", head: true })
    .or(`embedding.is.null,embed_model.neq.${cfg.embedModel}`);
  return { ok: true, embedded, remaining: count ?? undefined, stoppedBy };
}
