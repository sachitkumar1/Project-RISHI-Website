/**
 * Shared plumbing for the scheduled jobs under /api/lms/cron/*.
 *
 * WHY THIS EXISTS: the jobs are triggered by cron-job.org, which gives up on a
 * request after 30 seconds and counts it as failed (and disables a job after
 * enough consecutive failures). The Drive sync alone walks for ~15-25s and then
 * extracts text, so it can't answer inside 30s.
 *
 * So a cron request is ACCEPTED immediately (202) and the job keeps running in
 * the background via Vercel's waitUntil, up to the function's maxDuration (60s).
 * The outcome is recorded in lms_settings under `cron:<name>` and echoed back
 * as `previous` on the next call, so cron-job.org's history still shows whether
 * the last run worked.
 *
 * `?wait=1` runs the job inline and returns the full result — for a manual run
 * from a terminal, not for the scheduler.
 */
import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

let _client: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

/** Authorization: Bearer <CRON_SECRET>, x-cron-secret, or ?secret=. */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  if (req.headers.get("x-cron-secret") === secret) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

export type CronOutcome = { ok: boolean; summary: string; detail?: unknown };

type CronStatus = {
  state: "running" | "ok" | "failed";
  startedAt: string;
  finishedAt?: string;
  ms?: number;
  summary?: string;
};

// In-memory fallback so local/demo runs without Supabase still behave.
const memStatus = new Map<string, CronStatus>();

async function readStatus(name: string): Promise<CronStatus | null> {
  if (!usingSupabase) return memStatus.get(name) ?? null;
  try {
    const { data } = await sb().from("lms_settings").select("value").eq("key", `cron:${name}`).maybeSingle();
    return data?.value ? (JSON.parse(data.value) as CronStatus) : null;
  } catch {
    return null;
  }
}

async function writeStatus(name: string, status: CronStatus): Promise<void> {
  if (!usingSupabase) { memStatus.set(name, status); return; }
  try {
    await sb().from("lms_settings").upsert(
      { key: `cron:${name}`, value: JSON.stringify(status), updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  } catch { /* status is informational — never fail the job over it */ }
}

/**
 * Authorize, then run `job` in the background and answer at once.
 *
 * `lockMs`: if the previous run is still marked running and started less than
 * this long ago, the new request is skipped rather than overlapping it. Longer
 * than maxDuration, so a run that was killed mid-way can't lock the job forever.
 */
export async function startCronJob(
  req: Request,
  name: string,
  job: () => Promise<CronOutcome>,
  { lockMs = 90_000 }: { lockMs?: number } = {},
): Promise<NextResponse> {
  if (!process.env.CRON_SECRET)
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 401 });

  const previous = await readStatus(name);
  if (previous?.state === "running" && Date.now() - Date.parse(previous.startedAt) < lockMs) {
    return NextResponse.json({ job: name, skipped: "previous run still in progress", previous }, { status: 202 });
  }

  const startedAt = new Date().toISOString();
  await writeStatus(name, { state: "running", startedAt });

  const work = (async (): Promise<CronOutcome & { ms: number }> => {
    const t0 = Date.now();
    let outcome: CronOutcome;
    try {
      outcome = await job();
    } catch (e) {
      outcome = { ok: false, summary: `crashed: ${(e as Error).message}` };
    }
    const ms = Date.now() - t0;
    if (!outcome.ok) console.error(`cron/${name}: ${outcome.summary}`);
    await writeStatus(name, {
      state: outcome.ok ? "ok" : "failed",
      startedAt,
      finishedAt: new Date().toISOString(),
      ms,
      summary: outcome.summary.slice(0, 300),
    });
    return { ...outcome, ms };
  })();

  if (new URL(req.url).searchParams.get("wait") === "1") {
    const done = await work;
    return NextResponse.json({ job: name, ...done }, { status: done.ok ? 200 : 500 });
  }

  // Keeps the function alive after the response until `work` settles (bounded
  // by maxDuration). Outside Vercel this is a no-op and Node just finishes it.
  waitUntil(work);
  // Kept small on purpose — cron-job.org only stores a short response body.
  return NextResponse.json({ job: name, accepted: true, startedAt, previous }, { status: 202 });
}
