/**
 * Fills in embeddings for passages that don't have one yet (or were embedded
 * with a different model). Bounded by time; reports what's left.
 *
 * Search works WITHOUT embeddings (keyword search alone), so this can lag or
 * pause on a quota without breaking anything — answers just get better as more
 * passages are embedded.
 *
 * FREE-TIER PACING. Google's free tier counts EACH passage in a batch as one
 * request, against a limit of 100 per minute (measured: a batch of 100 was
 * refused with EmbedContentRequestsPerMinute…FreeTier = 100). The first version
 * sent batches of 100 back to back and stopped at the first refusal. Now it:
 *   • sends small batches and keeps under PER_MINUTE passages in any 60s window,
 *     leaving room for questions, which embed their query from the same quota;
 *   • waits and retries when Google says "retry in Ns";
 *   • on a DAILY limit, parks embedding until midnight Pacific;
 *   • spends at most AI_EMBED_DAILY_BUILD passages a day on building, so the
 *     day's quota isn't all gone before anyone asks a question.
 */
import { agentConfig, nextPacificMidnight, sb, startOfPacificDay, usingSupabase } from "./config";
import { geminiEmbed, ModelError } from "./models";
import { dbErr } from "./chunker";

export type Embedder = (texts: string[]) => Promise<number[][]>;
export const defaultEmbedder: Embedder = (t) => geminiEmbed(t, "RETRIEVAL_DOCUMENT");

export type EmbedResult = { ok: boolean; error?: string; embedded?: number; remaining?: number; stoppedBy?: string };

const BATCH = 40;
const PER_MINUTE = 80; // of Google's 100/min, leaving room for questions
const SPACING = Math.ceil((60_000 * BATCH) / PER_MINUTE); // 30s between batches
const dailyBuildCap = () => {
  const n = Number(process.env.AI_EMBED_DAILY_BUILD);
  return Number.isFinite(n) && n > 0 ? n : 800;
};

const PARK_KEY = (model: string) => `ai:exhausted:${model}`;
const COUNT_KEY = "ai:embed-count";
// Recent calls, shared by every build step (cron, Settings button, questions),
// so a new step knows what the previous one just spent of this minute.
const WINDOW_KEY = "ai:embed-window";

async function getSetting(key: string): Promise<string | null> {
  const { data } = await sb().from("lms_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setSetting(key: string, value: string) {
  await sb().from("lms_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

/** Passages embedded by the builder so far today (Pacific). */
async function embeddedToday(): Promise<{ day: string; n: number }> {
  const day = startOfPacificDay();
  try {
    const v = JSON.parse((await getSetting(COUNT_KEY)) ?? "null");
    if (v && v.day === day && Number.isFinite(v.n)) return { day, n: v.n };
  } catch { /* fall through */ }
  return { day, n: 0 };
}

export async function embedPending(budgetMs = 20_000, embed: Embedder = defaultEmbedder): Promise<EmbedResult> {
  if (!usingSupabase) return { ok: false, error: "Supabase isn't configured." };
  const cfg = agentConfig();
  const real = embed === defaultEmbedder;
  if (!cfg.geminiKey && real) return { ok: true, embedded: 0, stoppedBy: "no GEMINI_API_KEY" };
  const deadline = Date.now() + budgetMs;

  const remainingCount = async () =>
    (await sb().from("lms_file_chunks").select("id", { count: "exact", head: true })
      .or(`embedding.is.null,embed_model.neq.${cfg.embedModel}`)).count ?? undefined;

  // Parked until midnight after hitting Google's daily limit?
  if (real) {
    const until = Date.parse((await getSetting(PARK_KEY(cfg.embedModel))) ?? "");
    if (Number.isFinite(until) && until > Date.now())
      return { ok: true, embedded: 0, remaining: await remainingCount(), stoppedBy: "Google's free daily embedding limit was reached — resumes after midnight Pacific" };
  }
  const today = real ? await embeddedToday() : { day: "", n: 0 };
  const cap = real ? dailyBuildCap() : Infinity;

  let embedded = 0;
  let stoppedBy: string | undefined;
  let sent: { at: number; n: number }[] = [];
  if (real) {
    try { sent = (JSON.parse((await getSetting(WINDOW_KEY)) ?? "[]") as { at: number; n: number }[]).filter((x) => x.at > Date.now() - 60_000); }
    catch { sent = []; }
  }
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  while (Date.now() < deadline) {
    if (today.n + embedded >= cap) {
      stoppedBy = `today's building allowance (${cap} passages) is used — the rest of the free quota is kept for questions; resumes after midnight Pacific`;
      break;
    }
    const size = Math.min(BATCH, cap - today.n - embedded);
    const { data, error } = await sb()
      .from("lms_file_chunks").select("id,content")
      .or(`embedding.is.null,embed_model.neq.${cfg.embedModel}`)
      .order("id").limit(size);
    if (error) return { ok: false, error: dbErr(error) };
    if (!data?.length) break;

    // Stay under PER_MINUTE passages in any rolling 60s window: wait for the
    // oldest call to age out if that fits in this step, otherwise stop here and
    // let the next step carry on (it reads the same window).
    // Batches are spread evenly — one every SPACING ms — rather than sent in a
    // burst, so the longest wait is one spacing (30s), which always fits in a
    // build step; a burst would force a ~60s wait that never fits.
    if (real && sent.length) {
      const inWindow = sent.filter((x) => x.at > Date.now() - 60_000);
      let next = sent[sent.length - 1].at + SPACING;
      if (inWindow.reduce((a, x) => a + x.n, 0) + data.length > PER_MINUTE && inWindow.length)
        next = Math.max(next, inWindow[0].at + 60_000);
      const wait = next - Date.now() + 250;
      if (wait > 0) {
        if (Date.now() + wait + 3_000 > deadline) { stoppedBy = "pacing to Google's free limit of 100 a minute — continues next run"; break; }
        await sleep(wait);
      }
    }

    let vecs: number[][] | null = null;
    for (let attempt = 0; attempt < 2 && !vecs; attempt++) {
      try {
        vecs = await embed(data.map((r) => r.content as string));
        sent.push({ at: Date.now(), n: data.length });
        if (real) await setSetting(WINDOW_KEY, JSON.stringify(sent.filter((x) => x.at > Date.now() - 60_000)));
      } catch (e) {
        const err = e instanceof ModelError ? e : new ModelError("other", (e as Error).message);
        if (err.kind === "quota_day") {
          await setSetting(PARK_KEY(cfg.embedModel), nextPacificMidnight());
          stoppedBy = "Google's free daily embedding limit was reached — resumes after midnight Pacific";
          break;
        }
        const wait = Math.min(20_000, err.retryAfterMs ?? 15_000) + 500;
        if (err.kind === "quota_minute" && attempt === 0 && Date.now() + wait + 5_000 < deadline) {
          await sleep(wait); // Google said "retry in Ns": do exactly that, once
          continue;
        }
        stoppedBy = err.kind === "quota_minute"
          ? "pacing to Google's free limit of 100 a minute — continues next run"
          : `${err.kind}: ${err.message}`;
        break;
      }
    }
    if (!vecs) break;

    const { error: werr } = await sb().rpc("lms_set_chunk_embeddings", {
      p_ids: data.map((r) => r.id),
      p_embeddings: vecs.map((v) => `[${v.join(",")}]`),
      p_model: cfg.embedModel,
    });
    if (werr) return { ok: false, error: dbErr(werr) };
    embedded += data.length;
    if (real) await setSetting(COUNT_KEY, JSON.stringify({ day: today.day, n: today.n + embedded }));
  }

  return { ok: true, embedded, remaining: await remainingCount(), stoppedBy };
}
