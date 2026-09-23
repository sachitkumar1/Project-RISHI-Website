/**
 * Configuration for the "Ask" agent. Everything is an environment variable with
 * a sensible default, so a model id or limit can change without a code change.
 *
 * Required (Secret in Vercel):
 *   GEMINI_API_KEY      — Google AI Studio key (free tier). Answers + embeddings.
 *   ANTHROPIC_API_KEY   — optional. Enables the paid Haiku step.
 * Optional:
 *   AI_PRIMARY_MODELS       default "gemini-3.7-flash,gemini-3.5-flash" — free Flash
 *                           models tried in order. Each has its OWN daily free
 *                           quota, so listing two roughly doubles free capacity.
 *                           (gemini-3.8-flash was timing out when this was built.)
 *   AI_FALLBACK_MODEL       default gemini-3.5-flash-lite  (free, fast, large quota)
 *   ANTHROPIC_WORKSPACE_ID  needed only if the Anthropic key isn't workspace-scoped
 *   AI_HAIKU_MODEL          default claude-haiku-4-5
 *   AI_EMBED_MODEL          default gemini-embedding-001
 *   AI_HAIKU_MONTHLY_USD    default 5
 *   AI_DAILY_LIMIT          default 15 questions per member per day
 *   GEMINI_API_BASE / ANTHROPIC_API_BASE — override the API hosts (testing).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export const agentConfig = () => ({
  geminiKey: process.env.GEMINI_API_KEY || "",
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  primaryModels: (process.env.AI_PRIMARY_MODELS || process.env.AI_PRIMARY_MODEL || "gemini-3.7-flash,gemini-3.5-flash")
    .split(",").map((s) => s.trim()).filter(Boolean),
  anthropicWorkspace: process.env.ANTHROPIC_WORKSPACE_ID || "",
  fallbackModel: process.env.AI_FALLBACK_MODEL || "gemini-3.5-flash-lite",
  haikuModel: process.env.AI_HAIKU_MODEL || "claude-haiku-4-5",
  embedModel: process.env.AI_EMBED_MODEL || "gemini-embedding-001",
  haikuMonthlyUsd: num(process.env.AI_HAIKU_MONTHLY_USD, 5),
  dailyLimit: num(process.env.AI_DAILY_LIMIT, 15), // legacy: questions/day before depth levels
  dailyCredits: num(process.env.AI_DAILY_CREDITS, 60) * UNITS_PER_CREDIT,
  geminiBase: (process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com").replace(/\/$/, ""),
  anthropicBase: (process.env.ANTHROPIC_API_BASE || "https://api.anthropic.com").replace(/\/$/, ""),
});

/** Haiku 4.5 list price, USD per token. Used for the spend ledger. If Anthropic
 *  changes it, update here — the prepaid balance is the real backstop anyway. */
export const HAIKU_PRICE = { input: 1 / 1_000_000, output: 5 / 1_000_000 };

export const EMBED_DIMS = 768;
/** A question must finish inside Vercel's 60s. */
export const ANSWER_DEADLINE_MS = 54_000; // the route is cut off at 60s (maxDuration), so ~6s of margin
/** An overloaded / timed-out model is skipped for this long. Was 10 minutes,
 *  which let one "high demand" reply from Google push every question for the
 *  next 10 minutes onto paid Haiku. */
export const BUSY_BACKOFF_MS = 2 * 60_000;
export const MAX_ANSWER_TOKENS = 1200; // Haiku's "Test models" ping; answers use DEPTHS below

/**
 * Answer depth. The biggest levers on how detailed an answer is are how much of
 * the archive the model reads and what it's told to write — reasoning effort
 * matters less, and on Google's free tier "high" reasoning regularly runs past
 * the 60s request limit, so the top level uses "medium".
 *   weight: credits it costs. Members get AI_DAILY_CREDITS a day (default 60):
 *           60 quick, 15 standard, 7 detailed or 3 deep. Quick is the cheapest
 *           because it only ever uses the free, fast Flash-Lite (see ask.ts).
 */
export type Depth = "quick" | "standard" | "detailed" | "deep";
/** Stored cost units per displayed credit. 1 = costs are shown exactly as
 *  stored. (Set to 2 to allow half-credit prices while the database keeps whole
 *  numbers.) */
export const UNITS_PER_CREDIT = 1;
export const toCredits = (units: number) => units / UNITS_PER_CREDIT;
export const DEPTHS: Record<Depth, {
  label: string; weight: number; maxFiles: number; perFile: number; charBudget: number;
  maxTokens: number; thinking: "low" | "medium";
}> = {
  quick:    { label: "Quick",    weight: 1, maxFiles: 5,  perFile: 2, charBudget: 12_000, maxTokens: 1000, thinking: "low" },
  standard: { label: "Standard", weight: 4, maxFiles: 8,  perFile: 3, charBudget: 26_000, maxTokens: 2200, thinking: "low" },
  detailed: { label: "Detailed", weight: 8, maxFiles: 12, perFile: 4, charBudget: 40_000, maxTokens: 3200, thinking: "medium" },
  // Double Detailed's reading (24 files, ~20k tokens of source text) and a long,
  // structured report. Slowest level: 30–60s on a busy free tier.
  deep:     { label: "Deep Research", weight: 16, maxFiles: 24, perFile: 3, charBudget: 80_000, maxTokens: 4000, thinking: "medium" },
};
export const DEFAULT_DEPTH: Depth = "standard";
export const isDepth = (v: unknown): v is Depth => v === "quick" || v === "standard" || v === "detailed" || v === "deep";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

let _client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

// ---- Pacific time --------------------------------------------------------------
// Google's free quotas reset at midnight Pacific, and the club lives there, so
// "today" and "this month" are Pacific. Every timestamp produced here carries an
// explicit offset — never a naive local time.
const TZ = "America/Los_Angeles";

function pacificParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", timeZoneName: "longOffset",
  });
  const parts = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]));
  // timeZoneName looks like "GMT-07:00".
  const offset = (parts.timeZoneName || "GMT-08:00").replace("GMT", "") || "+00:00";
  return { y: parts.year, m: parts.month, d: parts.day, offset };
}

/** Midnight Pacific at the start of the given day, as a UTC ISO string. */
export function startOfPacificDay(now = new Date()): string {
  const p = pacificParts(now);
  return new Date(`${p.y}-${p.m}-${p.d}T00:00:00${p.offset}`).toISOString();
}

/** Midnight Pacific on the 1st of the current month, as a UTC ISO string. */
export function startOfPacificMonth(now = new Date()): string {
  const p = pacificParts(now);
  const first = new Date(`${p.y}-${p.m}-01T12:00:00Z`); // noon avoids DST edges
  const q = pacificParts(first);
  return new Date(`${p.y}-${p.m}-01T00:00:00${q.offset}`).toISOString();
}

/** The next midnight Pacific — when Google's daily free quotas reset. */
export function nextPacificMidnight(now = new Date()): string {
  const start = new Date(startOfPacificDay(now)).getTime();
  // 26h then snap back to that day's midnight: correct across DST changes.
  return startOfPacificDay(new Date(start + 26 * 3_600_000));
}
