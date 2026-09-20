/**
 * Thin REST clients for the answering/embedding models. No SDKs: two small
 * fetch calls are easier to keep working than two more dependencies.
 *
 * Errors are classified, because the fallback chain depends on WHY a call
 * failed: a free daily quota that's gone until midnight is handled differently
 * from a per-minute blip or a wrong model id.
 */
import { agentConfig, EMBED_DIMS, MAX_ANSWER_TOKENS } from "./config";

export type ModelErrorKind =
  | "quota_day"     // free daily quota used up — skip this model until midnight PT
  | "quota_minute"  // per-minute limit — may retry after `retryAfterMs`
  | "no_credit"     // Anthropic prepaid balance is empty
  | "not_found"     // model id doesn't exist / isn't available to this key
  | "auth"          // bad or missing key
  | "overloaded"    // 503 / "high demand" / timed out — skip it for a while
  | "blocked"       // safety filter or empty answer
  | "other";

export class ModelError extends Error {
  /** For quota errors: Google's own name and number for the limit that was hit
   *  (e.g. GenerateRequestsPerDayPerProjectPerModel-FreeTier = 20). */
  public quota?: { id: string; value: string };
  constructor(public kind: ModelErrorKind, message: string, public retryAfterMs?: number) {
    super(message);
  }
}

export type Generation = { text: string; inputTokens: number; outputTokens: number };

const TIMEOUT_MS = 40_000;

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new ModelError("overloaded", `no answer within ${Math.round(timeoutMs / 1000)}s`);
    throw new ModelError("other", `network: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------- Gemini
/* eslint-disable @typescript-eslint/no-explicit-any */
function geminiError(status: number, body: any): ModelError {
  const msg: string = body?.error?.message ?? `HTTP ${status}`;
  if (status === 429) {
    const details: any[] = body?.error?.details ?? [];
    const quotaIds: string[] = details
      .filter((d) => String(d?.["@type"] ?? "").includes("QuotaFailure"))
      .flatMap((d) => (d.violations ?? []).map((v: any) => String(v.quotaId ?? "")));
    const retry = details.find((d) => String(d?.["@type"] ?? "").includes("RetryInfo"))?.retryDelay;
    const retryAfterMs = retry ? Math.ceil(parseFloat(String(retry)) * 1000) : undefined;
    const v = details.flatMap((d) => d.violations ?? []).find((x: any) => x?.quotaId);
    const err = quotaIds.some((q) => /PerDay/i.test(q))
      ? new ModelError("quota_day", msg)
      : new ModelError("quota_minute", msg, retryAfterMs);
    if (v) err.quota = { id: String(v.quotaId), value: String(v.quotaValue ?? "?") };
    return err;
  }
  if (status === 503 || status === 500 || /high demand|overloaded/i.test(msg)) return new ModelError("overloaded", msg);
  if (status === 404) return new ModelError("not_found", msg);
  if (status === 401 || status === 403) return new ModelError("auth", msg);
  if (status === 400 && /API key/i.test(msg)) return new ModelError("auth", msg);
  return new ModelError("other", msg);
}

export async function geminiGenerate(model: string, system: string, user: string, timeoutMs = TIMEOUT_MS): Promise<Generation> {
  const cfg = agentConfig();
  if (!cfg.geminiKey) throw new ModelError("auth", "GEMINI_API_KEY is not set.");
  const res = await post(
    `${cfg.geminiBase}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    { "x-goog-api-key": cfg.geminiKey },
    {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      // Room for a model that "thinks" before answering; the visible answer is
      // asked to stay short in the prompt itself. Gemini 3 models take a low
      // thinking level (older ones reject the field, so it's only sent to 3.x).
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: MAX_ANSWER_TOKENS * 4,
        ...(/^gemini-3/.test(model) ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
      },
    },
    timeoutMs,
  );
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw geminiError(res.status, body);
  const cand = body?.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .filter((p: any) => typeof p?.text === "string" && !p.thought)
    .map((p: any) => p.text)
    .join("")
    .trim();
  if (!text) throw new ModelError("blocked", `empty answer (finishReason ${cand?.finishReason ?? "none"})`);
  return {
    text,
    inputTokens: body?.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: (body?.usageMetadata?.candidatesTokenCount ?? 0) + (body?.usageMetadata?.thoughtsTokenCount ?? 0),
  };
}

function normalize(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

/** Embed up to 100 texts. RETRIEVAL_DOCUMENT for passages, RETRIEVAL_QUERY for
 *  questions. Vectors are normalized (required below the model's full size). */
export async function geminiEmbed(texts: string[], task: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"): Promise<number[][]> {
  const cfg = agentConfig();
  if (!cfg.geminiKey) throw new ModelError("auth", "GEMINI_API_KEY is not set.");
  const model = `models/${cfg.embedModel}`;
  const res = await post(
    `${cfg.geminiBase}/v1beta/${model}:batchEmbedContents`,
    { "x-goog-api-key": cfg.geminiKey },
    {
      requests: texts.map((t) => ({
        model,
        content: { parts: [{ text: t.slice(0, 8000) }] },
        taskType: task,
        outputDimensionality: EMBED_DIMS,
      })),
    },
  );
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw geminiError(res.status, body);
  const vecs: number[][] = (body?.embeddings ?? []).map((e: any) => e?.values ?? []);
  if (vecs.length !== texts.length || vecs.some((v) => v.length !== EMBED_DIMS))
    throw new ModelError("other", `unexpected embedding shape (${vecs.length} × ${vecs[0]?.length ?? 0})`);
  return vecs.map(normalize);
}

export async function geminiListModels(): Promise<string[]> {
  const cfg = agentConfig();
  if (!cfg.geminiKey) return [];
  const res = await fetch(`${cfg.geminiBase}/v1beta/models?pageSize=200`, { headers: { "x-goog-api-key": cfg.geminiKey } });
  const body: any = await res.json().catch(() => ({}));
  return (body?.models ?? []).map((m: any) => String(m.name ?? "").replace(/^models\//, "")).filter(Boolean);
}

// ------------------------------------------------------------- Anthropic
export async function anthropicGenerate(model: string, system: string, user: string, timeoutMs = TIMEOUT_MS): Promise<Generation> {
  const cfg = agentConfig();
  if (!cfg.anthropicKey) throw new ModelError("auth", "ANTHROPIC_API_KEY is not set.");
  const res = await post(
    `${cfg.anthropicBase}/v1/messages`,
    {
      "x-api-key": cfg.anthropicKey,
      "anthropic-version": "2023-06-01",
      // Keys not scoped to a workspace must name one.
      ...(cfg.anthropicWorkspace ? { "anthropic-workspace-id": cfg.anthropicWorkspace } : {}),
    },
    {
      model,
      max_tokens: MAX_ANSWER_TOKENS,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: user }],
    },
    timeoutMs,
  );
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg: string = body?.error?.message ?? `HTTP ${res.status}`;
    if (/credit balance/i.test(msg)) throw new ModelError("no_credit", msg);
    if (res.status === 401 || res.status === 403) throw new ModelError("auth", msg);
    if (res.status === 404) throw new ModelError("not_found", msg);
    if (res.status === 429) throw new ModelError("quota_minute", msg);
    if (res.status === 529 || res.status >= 500) throw new ModelError("overloaded", msg);
    if (/workspace/i.test(msg)) throw new ModelError("auth", msg);
    throw new ModelError("other", msg);
  }
  const text = (body?.content ?? [])
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
  if (!text) throw new ModelError("blocked", "empty answer");
  return { text, inputTokens: body?.usage?.input_tokens ?? 0, outputTokens: body?.usage?.output_tokens ?? 0 };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
