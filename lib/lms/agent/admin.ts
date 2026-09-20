/** Webmaster-facing status, index building and model checks for the Ask agent. */
import { agentConfig, sb, startOfPacificDay, startOfPacificMonth, usingSupabase } from "./config";
import { buildChunks } from "./chunker";
import { embedPending } from "./embed";
import { anthropicGenerate, geminiEmbed, geminiGenerate, geminiListModels, ModelError } from "./models";

export type AgentStatus = {
  keys: { gemini: boolean; anthropic: boolean };
  models: { primary: string[]; fallback: string; haiku: string; embed: string };
  index: { filesPending: number; chunks: number; embedded: number };
  haiku: { spentThisMonth: number; cap: number };
  today: { questions: number; byModel: Record<string, number> };
  exhausted: Record<string, string>; // model → until (ISO), only while in effect
  dailyLimit: number;
};

const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

export async function agentStatus(): Promise<AgentStatus> {
  const cfg = agentConfig();
  const base = {
    keys: { gemini: !!cfg.geminiKey, anthropic: !!cfg.anthropicKey },
    models: { primary: cfg.primaryModels, fallback: cfg.fallbackModel, haiku: cfg.haikuModel, embed: cfg.embedModel },
    dailyLimit: cfg.dailyLimit,
  };
  if (!usingSupabase)
    return { ...base, index: { filesPending: 0, chunks: 0, embedded: 0 }, haiku: { spentThisMonth: 0, cap: cfg.haikuMonthlyUsd }, today: { questions: 0, byModel: {} }, exhausted: {} };

  const [filesPending, chunks, embedded, spend, todayRows, flags] = await Promise.all([
    count(sb().from("lms_files").select("id", { count: "exact", head: true }).is("chunked_at", null)),
    count(sb().from("lms_file_chunks").select("id", { count: "exact", head: true })),
    count(sb().from("lms_file_chunks").select("id", { count: "exact", head: true }).eq("embed_model", cfg.embedModel)),
    sb().rpc("lms_ai_spend_since", { p_provider: "anthropic", p_since: startOfPacificMonth() }),
    sb().from("lms_ai_usage").select("model").eq("status", "ok").gte("at", startOfPacificDay()).limit(5000),
    sb().from("lms_settings").select("key,value").like("key", "ai:exhausted:%"),
  ]);

  const byModel: Record<string, number> = {};
  for (const r of todayRows.data ?? []) byModel[r.model] = (byModel[r.model] ?? 0) + 1;
  const exhausted: Record<string, string> = {};
  for (const f of flags.data ?? []) {
    if (Date.parse(f.value) > Date.now()) exhausted[f.key.replace("ai:exhausted:", "")] = f.value;
  }
  return {
    ...base,
    index: { filesPending, chunks, embedded },
    haiku: { spentThisMonth: Number(spend.data ?? 0), cap: cfg.haikuMonthlyUsd },
    today: { questions: (todayRows.data ?? []).length, byModel },
    exhausted,
  };
}

/** How much of the library is searchable yet. Two tiny count queries. */
export async function indexBacklog(): Promise<{ chunks: number; filesPending: number; embedPending: number }> {
  if (!usingSupabase) return { chunks: 0, filesPending: 0, embedPending: 0 };
  const cfg = agentConfig();
  const [chunks, filesPending, embedPending] = await Promise.all([
    count(sb().from("lms_file_chunks").select("id", { count: "exact", head: true })),
    count(sb().from("lms_files").select("id", { count: "exact", head: true }).is("chunked_at", null)),
    cfg.geminiKey
      ? count(sb().from("lms_file_chunks").select("id", { count: "exact", head: true }).or(`embedding.is.null,embed_model.neq.${cfg.embedModel}`))
      : Promise.resolve(0),
  ]);
  return { chunks, filesPending, embedPending };
}

const BUILD_LOCK = "ai:build-lock";

/**
 * One bounded build step, skipped if another is already running (a question,
 * the cron and the Settings button can all trigger this). The lock expires on
 * its own, so a step killed midway can't block building forever.
 */
export async function buildIndexStepLocked(budgetMs: number) {
  if (!usingSupabase || budgetMs < 5_000) return null;
  const { data } = await sb().from("lms_settings").select("value").eq("key", BUILD_LOCK).maybeSingle();
  if (data?.value && Date.now() - Date.parse(data.value) < 75_000) return null;
  const now = new Date().toISOString();
  await sb().from("lms_settings").upsert({ key: BUILD_LOCK, value: now, updated_at: now }, { onConflict: "key" });
  try {
    return await buildIndexStep(budgetMs);
  } finally {
    await sb().from("lms_settings").delete().eq("key", BUILD_LOCK);
  }
}

/** Chunk, then embed, within one request's budget. Call until nothing remains. */
export async function buildIndexStep(budgetMs = 50_000) {
  const t0 = Date.now();
  const chunk = await buildChunks(Math.min(25_000, budgetMs * 0.5));
  const left = budgetMs - (Date.now() - t0);
  const embed = left > 3_000 ? await embedPending(left) : { ok: true, embedded: 0, stoppedBy: "no time left this run" };
  return { ok: chunk.ok && embed.ok, chunk, embed };
}

type Check = { name: string; model: string; ok: boolean; detail: string };

/** One tiny call per configured model. Haiku's check costs a fraction of a cent. */
export async function testModels(): Promise<{ checks: Check[]; availableGemini: string[] }> {
  const cfg = agentConfig();
  const checks: Check[] = [];
  const run = async (name: string, model: string, fn: () => Promise<string>) => {
    try { checks.push({ name, model, ok: true, detail: await fn() }); }
    catch (e) {
      const err = e as ModelError;
      checks.push({ name, model, ok: false, detail: `${err.kind ?? "error"}: ${err.message}` });
    }
  };
  const ping = "Reply with exactly: OK";
  if (cfg.geminiKey) {
    for (const model of cfg.primaryModels)
      await run("Gemini Flash", model, async () => (await geminiGenerate(model, "Be brief.", ping, 25_000)).text.slice(0, 40));
    await run("Gemini fallback", cfg.fallbackModel, async () => (await geminiGenerate(cfg.fallbackModel, "Be brief.", ping, 25_000)).text.slice(0, 40));
    await run("Embeddings", cfg.embedModel, async () => `${(await geminiEmbed(["test"], "RETRIEVAL_QUERY"))[0].length} dimensions`);
  } else {
    checks.push({ name: "Gemini", model: "—", ok: false, detail: "GEMINI_API_KEY is not set." });
  }
  if (cfg.anthropicKey) {
    await run("Claude Haiku", cfg.haikuModel, async () => (await anthropicGenerate(cfg.haikuModel, "Be brief.", ping, 25_000)).text.slice(0, 40));
  } else {
    checks.push({ name: "Claude Haiku", model: cfg.haikuModel, ok: false, detail: "ANTHROPIC_API_KEY is not set (optional)." });
  }
  // If a Gemini model id is wrong, list what this key CAN use, to pick from.
  const needList = checks.some((c) => c.name.startsWith("Gemini") && c.detail.startsWith("not_found"));
  const availableGemini = needList
    ? (await geminiListModels().catch(() => [])).filter((n) => /flash|embed/i.test(n))
    : [];
  return { checks, availableGemini };
}
