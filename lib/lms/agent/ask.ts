/**
 * Answer one question:
 *
 *   per-member daily limit → retrieve (permission-filtered) → model chain →
 *   validate citations → log usage
 *
 * Model chain, in order, skipping any step that's unavailable:
 *   1. Gemini Flash models (free), in order — each skipped for the rest of the
 *                                day once its daily quota is spent, or for 10 min
 *                                when overloaded; a per-minute limit is retried once
 *   2. Claude Haiku (paid)     — only while this month's spend + this call's worst
 *                                case stays under AI_HAIKU_MONTHLY_USD. Reserved
 *                                atomically in Postgres before the call.
 *   3. Gemini fallback (free)  — so questions still get answered after 1 and 2.
 */
import type { Member } from "@/lib/members";
import {
  agentConfig, ANSWER_DEADLINE_MS, BUSY_BACKOFF_MS, HAIKU_PRICE, MAX_ANSWER_TOKENS, nextPacificMidnight, sb,
  startOfPacificDay, startOfPacificMonth, usingSupabase,
} from "./config";
import { anthropicGenerate, geminiGenerate, ModelError, type Generation } from "./models";
import { retrieve, type QueryEmbedder, type Source } from "./retrieve";

export type Turn = { q: string; a: string };
export type AskResult =
  | {
      ok: true;
      answer: string;
      sources: (Source & { cited: boolean })[];
      model: string | null;       // label shown under the answer
      remainingToday: number;
    }
  | { ok: false; error: string; code: "limit" | "no_model" | "not_configured" | "error"; remainingToday?: number };

export const labelFor = (provider: string, model: string) =>
  provider === "anthropic" ? "Claude Haiku" : /lite/i.test(model) ? "Gemini Flash-Lite" : "Gemini Flash";

// ------------------------------------------------------------- prompt
export function buildPrompt(question: string, sources: Source[], history: Turn[], today = new Date()) {
  const system = [
    "You answer questions for members of Project RISHI at UC Berkeley, a student-run nonprofit doing rural development work in Bharog Baneri, India.",
    "Answer ONLY from the club documents provided in the user message. They are excerpts from the club's Google Drive.",
    "Cite every factual claim with the source number in square brackets, e.g. [2] or [1][3], placed right after the claim. Use only the numbers given.",
    "If the documents don't contain the answer, say so plainly in one or two sentences and, if useful, say which kind of document would have it. Never guess or fill gaps with general knowledge.",
    "Never invent names, dates, numbers, organisations or quotes.",
    "For questions about the 'last' or 'latest' time something happened, compare the dates shown for each source and any dates inside the text, and say which date you're going by.",
    "Be concise: lead with a direct answer in one or two sentences, then supporting detail as short paragraphs or a short '- ' list. No headings. Plain text; **bold** is fine sparingly.",
    `Today's date is ${today.toISOString().slice(0, 10)}.`,
  ].join("\n");

  const docs = sources
    .map((s) => {
      const where = [s.year, s.path].filter(Boolean).join(" / ");
      const when = s.modifiedAt ? `last edited ${s.modifiedAt.slice(0, 10)}` : "date unknown";
      return `[${s.n}] ${s.name}${where ? ` — ${where}` : ""} — ${when}\n${s.excerpts.join("\n…\n")}`;
    })
    .join("\n\n---\n\n");

  const convo = history.length
    ? `Earlier in this conversation (for context only):\n${history
        .slice(-2)
        .map((t) => `Q: ${t.q}\nA: ${t.a.slice(0, 1200)}`)
        .join("\n\n")}\n\n`
    : "";

  const user = `DOCUMENTS\n\n${docs}\n\n=====\n\n${convo}QUESTION: ${question}`;
  return { system, user };
}

// ---------------------------------------------------------- citations
/** Keep only citations that point at a real source; report which were cited. */
export function checkCitations(text: string, count: number): { text: string; cited: Set<number> } {
  const cited = new Set<number>();
  const cleaned = text
    .replace(/\[(\d+(?:\s*[,;]\s*\d+)*)\]/g, (_, list: string) => {
      const ok = list.split(/[,;]/).map((x) => Number(x.trim())).filter((n) => n >= 1 && n <= count);
      ok.forEach((n) => cited.add(n));
      return ok.map((n) => `[${n}]`).join("");
    })
    .replace(/[ \t]+([.,;:])/g, "$1")
    .trim();
  return { text: cleaned, cited };
}

// ------------------------------------------------------------ ledger
async function questionsToday(email: string): Promise<number> {
  const { count } = await sb()
    .from("lms_ai_usage").select("id", { count: "exact", head: true })
    .eq("user_email", email.toLowerCase()).eq("status", "ok")
    .gte("at", startOfPacificDay());
  return count ?? 0;
}

async function logFree(email: string, model: string, g: Generation | null, status: "ok" | "failed", question: string) {
  await sb().from("lms_ai_usage").insert({
    user_email: email.toLowerCase(), provider: "gemini", model, status,
    input_tokens: g?.inputTokens ?? null, output_tokens: g?.outputTokens ?? null,
    cost_usd: 0, question: question.slice(0, 500),
  });
}

const EXHAUSTED_KEY = (model: string) => `ai:exhausted:${model}`;

async function exhaustedUntil(model: string): Promise<number> {
  const { data } = await sb().from("lms_settings").select("value").eq("key", EXHAUSTED_KEY(model)).maybeSingle();
  const t = data?.value ? Date.parse(data.value) : 0;
  return Number.isFinite(t) ? t : 0;
}
async function markExhausted(model: string, untilIso: string) {
  await sb().from("lms_settings").upsert(
    { key: EXHAUSTED_KEY(model), value: untilIso, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
}

// ------------------------------------------------------------ the chain
type Attempt = { provider: "gemini" | "anthropic"; model: string };

/** Skip a model after it fails in a way that will repeat: out of daily quota
 *  (until midnight PT), or overloaded (for a few minutes). */
async function noteFailure(model: string, err: ModelError) {
  if (err.kind === "quota_day") await markExhausted(model, nextPacificMidnight());
  else if (err.kind === "overloaded") await markExhausted(model, new Date(Date.now() + BUSY_BACKOFF_MS).toISOString());
  else if (err.kind === "no_credit") await markExhausted(model, new Date(Date.now() + 3_600_000).toISOString());
}

async function tryGemini(model: string, system: string, user: string, email: string, question: string, timeoutMs: number): Promise<Generation | null> {
  if (Date.now() < (await exhaustedUntil(model))) return null;
  const stopAt = Date.now() + timeoutMs;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const g = await geminiGenerate(model, system, user, Math.max(2_000, stopAt - Date.now()));
      await logFree(email, model, g, "ok", question);
      return g;
    } catch (e) {
      const err = e as ModelError;
      // One quick retry on a per-minute limit, if Google says it's short and we have time.
      const wait = Math.max(1_000, err.retryAfterMs ?? 2_000);
      if (err.kind === "quota_minute" && attempt === 0 && wait <= 8_000 && stopAt - Date.now() > wait + 5_000) {
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      await noteFailure(model, err);
      if (err.kind === "not_found" || err.kind === "auth") console.error(`ask: gemini ${model} — ${err.kind}: ${err.message}`);
      await logFree(email, model, null, "failed", question);
      return null;
    }
  }
  return null;
}

async function tryHaiku(system: string, user: string, email: string, question: string, timeoutMs: number): Promise<Generation | null> {
  const cfg = agentConfig();
  if (!cfg.anthropicKey || cfg.haikuMonthlyUsd <= 0) return null;
  if (Date.now() < (await exhaustedUntil(cfg.haikuModel))) return null;

  // Worst case for THIS call: the whole prompt in, a maximum-length answer out.
  const estInput = Math.ceil((system.length + user.length) / 3.5);
  const estimate = estInput * HAIKU_PRICE.input + MAX_ANSWER_TOKENS * HAIKU_PRICE.output;
  const { data: reservation, error } = await sb().rpc("lms_ai_reserve", {
    p_user: email.toLowerCase(), p_provider: "anthropic", p_model: cfg.haikuModel,
    p_estimate: Number(estimate.toFixed(6)), p_cap: cfg.haikuMonthlyUsd,
    p_since: startOfPacificMonth(), p_question: question.slice(0, 500),
  });
  if (error || reservation == null) return null; // budget reached (or ledger unavailable — fail closed)

  try {
    const g = await anthropicGenerate(cfg.haikuModel, system, user, timeoutMs);
    const cost = g.inputTokens * HAIKU_PRICE.input + g.outputTokens * HAIKU_PRICE.output;
    await sb().from("lms_ai_usage").update({
      status: "ok", input_tokens: g.inputTokens, output_tokens: g.outputTokens, cost_usd: Number(cost.toFixed(6)),
    }).eq("id", reservation);
    return g;
  } catch (e) {
    const err = e as ModelError;
    // A failed call isn't billed, EXCEPT one we gave up waiting on: Anthropic may
    // still finish and bill it, so a timeout keeps its worst-case reservation.
    await sb().from("lms_ai_usage")
      .update(err.kind === "overloaded" && /no answer within/.test(err.message)
        ? { status: "failed" }
        : { status: "failed", cost_usd: 0 })
      .eq("id", reservation);
    await noteFailure(cfg.haikuModel, err);
    if (err.kind !== "quota_minute") console.error(`ask: haiku — ${err.kind}: ${err.message}`);
    return null;
  }
}

export async function ask(
  m: Member,
  question: string,
  history: Turn[] = [],
  opts: { embedQuery?: QueryEmbedder } = {},
): Promise<AskResult> {
  const deadline = Date.now() + ANSWER_DEADLINE_MS;
  if (!usingSupabase) return { ok: false, code: "not_configured", error: "The Ask agent needs the database." };
  const cfg = agentConfig();
  if (!cfg.geminiKey && !cfg.anthropicKey)
    return { ok: false, code: "not_configured", error: "No AI model is configured yet." };

  const q = question.trim().slice(0, 1000);
  const used = await questionsToday(m.email);
  const unlimited = m.roles.webmaster;
  if (!unlimited && used >= cfg.dailyLimit)
    return { ok: false, code: "limit", error: `You've asked ${cfg.dailyLimit} questions today — the limit resets at midnight.`, remainingToday: 0 };

  const context = history.length ? history[history.length - 1].q : undefined;
  const { sources } = await retrieve(m, q, { context, embedQuery: opts.embedQuery });
  const remaining = (n: number) => (unlimited ? 999 : Math.max(0, cfg.dailyLimit - n));

  if (!sources.length) {
    return {
      ok: true,
      answer: "I couldn't find anything about that in the files you have access to. Try different words — names, places, or the kind of document (meeting notes, survey, budget) often help.",
      sources: [], model: null, remainingToday: remaining(used),
    };
  }

  const { system, user } = buildPrompt(q, sources, history);
  const chain: Attempt[] = [];
  if (cfg.geminiKey) for (const model of cfg.primaryModels) chain.push({ provider: "gemini", model });
  if (cfg.anthropicKey) chain.push({ provider: "anthropic", model: cfg.haikuModel });
  if (cfg.geminiKey && cfg.fallbackModel && !cfg.primaryModels.includes(cfg.fallbackModel))
    chain.push({ provider: "gemini", model: cfg.fallbackModel });

  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    // Leave room for the steps after this one; the last step gets whatever is left.
    const reserve = i < chain.length - 1 ? 12_000 : 0;
    const timeoutMs = Math.min(30_000, deadline - Date.now() - reserve);
    if (timeoutMs < 4_000) continue;
    const g = step.provider === "gemini"
      ? await tryGemini(step.model, system, user, m.email, q, timeoutMs)
      : await tryHaiku(system, user, m.email, q, timeoutMs);
    if (!g) continue;
    const { text, cited } = checkCitations(g.text, sources.length);
    return {
      ok: true,
      answer: text,
      sources: sources.map((s) => ({ ...s, cited: cited.has(s.n) })),
      model: labelFor(step.provider, step.model),
      remainingToday: remaining(used + 1),
    };
  }

  return {
    ok: false, code: "no_model", remainingToday: remaining(used),
    error: "The assistant couldn't get an answer right now — its free models are busy or used up for today, and the monthly paid budget is spent or unavailable. Try again in a few minutes.",
  };
}
