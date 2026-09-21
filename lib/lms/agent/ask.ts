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
  agentConfig, DEFAULT_DEPTH, DEPTHS, toCredits, type Depth, ANSWER_DEADLINE_MS, BUSY_BACKOFF_MS, HAIKU_PRICE, nextPacificMidnight, sb,
  startOfPacificDay, startOfPacificMonth, usingSupabase,
} from "./config";
import { anthropicGenerate, geminiGenerate, ModelError, type Generation } from "./models";
import { retrieve, type QueryEmbedder, type Source } from "./retrieve";
import { indexBacklog } from "./admin";

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
/** How to write, per depth. Detail comes from specifics — names, dates,
 *  numbers, what was decided and what happened next — not from padding. */
const STYLE: Record<Depth, string> = {
  quick:
    "Answer in one solid paragraph of four to six sentences (roughly 80–130 words) with the key facts: who, what, " +
    "when, and how it turned out. Use a short '- ' list only if the answer is genuinely a list of items.",
  standard:
    "Give a thorough, specific answer. Open with a one- or two-sentence direct answer, then the supporting detail: " +
    "who was involved, when (dates), what was decided or done, numbers and outcomes, and what happened next. " +
    "Include the concrete specifics the documents give — names, dates, amounts, places and outcomes — rather than " +
    "summarising them away. Use short paragraphs or a '- ' list; roughly 250–450 words when the documents support it.",
  detailed:
    "Give a comprehensive, well-organised answer. Open with a two- or three-sentence summary, then cover every relevant " +
    "document: organise by time (a timeline) or by theme, whichever fits, with names, dates, figures, decisions, outcomes " +
    "and open questions. Point out where documents disagree or where the record has gaps. Use short **bold** lead-ins " +
    "for sections and '- ' lists where helpful; roughly 500–800 words when the documents support it.",
  deep:
    "Write a research report. Start with a short executive summary (3–5 sentences). Then a structured account with " +
    "**bold** section lead-ins: background, a dated timeline of what happened, people and partner organisations " +
    "involved, decisions and outcomes with figures, and lessons or open questions. Draw on as many of the documents " +
    "as are relevant and cite each claim. Call out contradictions between documents and gaps in the record. " +
    "Roughly 800–1,200 words when the documents support it; never pad beyond what they contain.",
};

export function buildPrompt(question: string, sources: Source[], history: Turn[], today = new Date(), depth: Depth = DEFAULT_DEPTH) {
  const system = [
    "You answer questions for members of Project RISHI at UC Berkeley, a student-run nonprofit doing rural development work in Bharog Baneri, India.",
    "Answer ONLY from the club documents provided in the user message. They are excerpts from the club's Google Drive.",
    "Cite every factual claim with the source number in square brackets, e.g. [2] or [1][3], placed right after the claim. Use only the numbers given.",
    "If the documents answer only PART of the question, give everything they do contain — with citations — and then say briefly what's missing. Don't open with \"the documents don't contain…\" when they contain useful pieces. Only if nothing relevant is there at all, say so plainly and, if useful, say which kind of document would have it. Never guess or fill gaps with general knowledge.",
    "Never invent names, dates, numbers, organisations or quotes.",
    "For questions about the 'last' or 'latest' time something happened, compare the dates shown for each source and any dates inside the text, and say which date you're going by.",
    STYLE[depth] + " No markdown headings (#); plain text, with **bold** and '- ' lists as described.",
    "Use every source that is relevant, not just the first one, and never pad: if the documents only support a short answer, give a short answer.",
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
/** Credits spent today: the sum of each answered question's depth weight.
 *  Before the weight column exists (migration not run yet) every question
 *  counts as a standard one. */
export async function creditsUsedToday(email: string): Promise<number> {
  const base = () => sb().from("lms_ai_usage").select("weight")
    .eq("user_email", email.toLowerCase()).eq("status", "ok").gte("at", startOfPacificDay()).limit(1000);
  const { data, error } = await base();
  if (!error) return (data ?? []).reduce((a, r) => a + (Number((r as { weight?: number }).weight) || 1), 0);
  const { count } = await sb().from("lms_ai_usage").select("id", { count: "exact", head: true })
    .eq("user_email", email.toLowerCase()).eq("status", "ok").gte("at", startOfPacificDay());
  return (count ?? 0) * DEPTHS[DEFAULT_DEPTH].weight;
}

/** Write with the depth columns; if they don't exist yet, write without them. */
const missingColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST204" || e.code === "42703" || /column .* (does not exist|could not find)|schema cache/i.test(e.message ?? ""));
async function insertUsage(row: Record<string, unknown>, extra: Record<string, unknown>) {
  const { error } = await sb().from("lms_ai_usage").insert({ ...row, ...extra });
  if (missingColumn(error)) await sb().from("lms_ai_usage").insert(row);
}
async function updateUsage(id: unknown, row: Record<string, unknown>, extra: Record<string, unknown>) {
  const { error } = await sb().from("lms_ai_usage").update({ ...row, ...extra }).eq("id", id);
  if (missingColumn(error)) await sb().from("lms_ai_usage").update(row).eq("id", id);
}

async function logFree(email: string, model: string, g: Generation | null, status: "ok" | "failed", question: string, depth: Depth) {
  await insertUsage({
    user_email: email.toLowerCase(), provider: "gemini", model, status,
    input_tokens: g?.inputTokens ?? null, output_tokens: g?.outputTokens ?? null,
    cost_usd: 0, question: question.slice(0, 500),
  }, { depth, weight: DEPTHS[depth].weight });
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
  // Keep the exact reason, so Settings can show it (and Google's quota numbers)
  // instead of anyone having to guess why a model was skipped.
  try {
    await sb().from("lms_settings").upsert({
      key: `ai:last-error:${model}`,
      value: JSON.stringify({ at: new Date().toISOString(), kind: err.kind, message: err.message.slice(0, 160), quota: err.quota ?? null }),
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });
  } catch { /* diagnostics only */ }
  if (err.kind === "quota_day") await markExhausted(model, nextPacificMidnight());
  else if (err.kind === "overloaded") await markExhausted(model, new Date(Date.now() + BUSY_BACKOFF_MS).toISOString());
  else if (err.kind === "no_credit") await markExhausted(model, new Date(Date.now() + 3_600_000).toISOString());
}

async function tryGemini(model: string, system: string, user: string, email: string, question: string, timeoutMs: number, depth: Depth): Promise<Generation | null> {
  if (Date.now() < (await exhaustedUntil(model))) return null;
  const stopAt = Date.now() + timeoutMs;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const g = await geminiGenerate(model, system, user, Math.max(2_000, stopAt - Date.now()),
        { maxTokens: DEPTHS[depth].maxTokens, thinking: DEPTHS[depth].thinking });
      await logFree(email, model, g, "ok", question, depth);
      return g;
    } catch (e) {
      const err = e as ModelError;
      // One quick retry: on a short per-minute limit, or on an INSTANT "high
      // demand" refusal (a timeout already used its time, so it isn't retried).
      const wait = err.kind === "overloaded" ? 2_000 : Math.max(1_000, err.retryAfterMs ?? 2_000);
      const retryable =
        (err.kind === "quota_minute" && wait <= 8_000) ||
        (err.kind === "overloaded" && !/no answer within/.test(err.message));
      if (retryable && attempt === 0 && stopAt - Date.now() > wait + 5_000) {
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      await noteFailure(model, err);
      if (err.kind === "not_found" || err.kind === "auth") console.error(`ask: gemini ${model} — ${err.kind}: ${err.message}`);
      await logFree(email, model, null, "failed", question, depth);
      return null;
    }
  }
  return null;
}

async function tryHaiku(system: string, user: string, email: string, question: string, timeoutMs: number, depth: Depth): Promise<Generation | null> {
  const cfg = agentConfig();
  if (!cfg.anthropicKey || cfg.haikuMonthlyUsd <= 0) return null;
  if (Date.now() < (await exhaustedUntil(cfg.haikuModel))) return null;

  // Worst case for THIS call: the whole prompt in, a maximum-length answer out.
  const estInput = Math.ceil((system.length + user.length) / 3.5);
  const estimate = estInput * HAIKU_PRICE.input + DEPTHS[depth].maxTokens * HAIKU_PRICE.output;
  const { data: reservation, error } = await sb().rpc("lms_ai_reserve", {
    p_user: email.toLowerCase(), p_provider: "anthropic", p_model: cfg.haikuModel,
    p_estimate: Number(estimate.toFixed(6)), p_cap: cfg.haikuMonthlyUsd,
    p_since: startOfPacificMonth(), p_question: question.slice(0, 500),
  });
  if (error || reservation == null) return null; // budget reached (or ledger unavailable — fail closed)

  try {
    const g = await anthropicGenerate(cfg.haikuModel, system, user, timeoutMs, DEPTHS[depth].maxTokens);
    const cost = g.inputTokens * HAIKU_PRICE.input + g.outputTokens * HAIKU_PRICE.output;
    await updateUsage(reservation, {
      status: "ok", input_tokens: g.inputTokens, output_tokens: g.outputTokens, cost_usd: Number(cost.toFixed(6)),
    }, { depth, weight: DEPTHS[depth].weight });
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
  opts: { embedQuery?: QueryEmbedder; depth?: Depth } = {},
): Promise<AskResult> {
  const depth: Depth = opts.depth ?? DEFAULT_DEPTH;
  const D = DEPTHS[depth];
  const deadline = Date.now() + ANSWER_DEADLINE_MS;
  if (!usingSupabase) return { ok: false, code: "not_configured", error: "The Ask agent needs the database." };
  const cfg = agentConfig();
  if (!cfg.geminiKey && !cfg.anthropicKey)
    return { ok: false, code: "not_configured", error: "No AI model is configured yet." };

  const q = question.trim().slice(0, 1000);
  const used = await creditsUsedToday(m.email);
  const unlimited = m.roles.webmaster;
  if (!unlimited && used + D.weight > cfg.dailyCredits) {
    const left = Math.max(0, cfg.dailyCredits - used);
    const fits = (Object.keys(DEPTHS) as Depth[]).filter((k) => DEPTHS[k].weight <= left).map((k) => DEPTHS[k].label);
    return {
      ok: false, code: "limit", remainingToday: toCredits(left),
      error: fits.length
        ? `Not enough left today for a ${D.label} answer — try ${fits.join(" or ")}. It resets at midnight.`
        : "You've used today's questions — they reset at midnight.",
    };
  }

  const context = history.length ? history[history.length - 1].q : undefined;
  const { sources } = await retrieve(m, q, { context, embedQuery: opts.embedQuery, budget: D });
  // Reported in ordinary credits (costs are counted in half-credits).
  const remaining = (n: number) => (unlimited ? 999 : toCredits(Math.max(0, cfg.dailyCredits - n)));

  if (!sources.length) {
    // Tell the truth about WHY nothing was found: an index that's still being
    // built is not the same as a question the files can't answer.
    const backlog = await indexBacklog();
    const building = backlog.chunks === 0 || backlog.filesPending > 50;
    return {
      ok: true,
      answer: building
        ? "The archive is still being indexed, so I can't search it properly yet. It builds itself in the background as questions come in — please try again in a few minutes."
        : "I couldn't find anything about that in the files you have access to. Try different words — names, places, or the kind of document (meeting notes, survey, budget) often help.",
      sources: [], model: null, remainingToday: remaining(used),
    };
  }

  const { system, user } = buildPrompt(q, sources, history, new Date(), depth);
  const chain: Attempt[] = [];
  const lite = cfg.geminiKey && cfg.fallbackModel && !cfg.primaryModels.includes(cfg.fallbackModel);
  // Quick answers go to Flash-Lite FIRST: in testing it answered every question
  // in ~2s, while the Flash models were often busy or slow. That keeps short
  // answers fast and saves the Flash models' small daily quotas (and paid Haiku)
  // for the longer levels. Other levels: Flash → Haiku → Flash-Lite.
  // Quick costs only half a credit, so it only ever uses FREE models — never paid
  // Haiku; heavy Quick use can't drain the monthly budget.
  if (depth === "quick" && lite) chain.push({ provider: "gemini", model: cfg.fallbackModel });
  if (cfg.geminiKey) for (const model of cfg.primaryModels) chain.push({ provider: "gemini", model });
  if (cfg.anthropicKey && depth !== "quick") chain.push({ provider: "anthropic", model: cfg.haikuModel });
  if (depth !== "quick" && lite) chain.push({ provider: "gemini", model: cfg.fallbackModel });

  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    // Leave room for the steps after this one; the last step gets whatever is left.
    const reserve = i < chain.length - 1 ? 12_000 : 0;
    const timeoutMs = Math.min(30_000, deadline - Date.now() - reserve);
    if (timeoutMs < 4_000) continue;
    const g = step.provider === "gemini"
      ? await tryGemini(step.model, system, user, m.email, q, timeoutMs, depth)
      : await tryHaiku(system, user, m.email, q, timeoutMs, depth);
    if (!g) continue;
    const { text, cited } = checkCitations(g.text, sources.length);
    return {
      ok: true,
      answer: text,
      sources: sources.map((s) => ({ ...s, cited: cited.has(s.n) })),
      model: labelFor(step.provider, step.model),
      remainingToday: remaining(used + D.weight),
    };
  }

  return {
    ok: false, code: "no_model", remainingToday: remaining(used),
    error: "The assistant couldn't get an answer right now — its free models are busy or used up for today, and the monthly paid budget is spent or unavailable. Try again in a few minutes.",
  };
}
