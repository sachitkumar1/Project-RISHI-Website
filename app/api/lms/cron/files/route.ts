import { syncDrive } from "@/lib/lms/drive";
import { indexContent } from "@/lib/lms/indexer";
import { startCronJob, type CronOutcome } from "@/lib/lms/cron";
import { buildIndexStepLocked } from "@/lib/lms/agent/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Re-index the club's Drive folders on a schedule, so files added or renamed in
 * Drive show up on the site without anyone pressing Sync now.
 *
 * Drive has no webhook we can use here without a public callback and channel
 * renewal, so this polls instead. That means the index is at most one interval
 * behind — it is not instant, and it never will be with polling.
 *
 * Safe to run as often as you like: syncDrive() only ever upserts and flags,
 * never deletes, and a failed walk aborts before touching the index.
 *
 * Answers 200 at once and runs in the background (see lib/lms/cron.ts) —
 * cron-job.org gives up after 30s and this takes longer.
 */
async function job(): Promise<CronOutcome> {
  const started = Date.now();
  const sync = await syncDrive();
  if (!sync.ok) return { ok: false, summary: `sync failed: ${sync.error ?? sync.skipped}`, detail: sync };

  // Then extract text for whatever's left of the 60s budget, leaving headroom.
  // A bigger Drive makes the walk longer, so the text budget shrinks rather than
  // the whole run overshooting. Anything left over goes to the next run.
  const left = () => 52_000 - (Date.now() - started);
  const budget = Math.min(20_000, left());
  const index = budget > 3_000 ? await indexContent(budget) : { ok: true, skipped: "no time left this run" };
  const remaining = "remaining" in index ? index.remaining : undefined;

  // Then keep the Ask agent's passages in step with whatever time is left.
  // Search keeps working on the previous passages until this catches up.
  const agent = left() > 5_000 ? await buildIndexStepLocked(left()) : null;

  return {
    ok: index.ok,
    summary: `synced ${sync.indexed ?? 0} items in ${sync.folders ?? 0} folders, ${sync.removed ?? 0} flagged removed; ` +
      `text: ${"indexed" in index ? index.indexed ?? 0 : 0} extracted, ${remaining ?? "?"} remaining; ` +
      (agent
        ? `ask: ${agent.chunk.chunks ?? 0} passages, ${agent.embed.embedded ?? 0} embedded` +
          `${agent.embed.stoppedBy ? ` (embedding paused: ${agent.embed.stoppedBy.slice(0, 60)})` : ""}`
        : "ask: no time left this run"),
    detail: { sync, index, agent },
  };
}

export async function GET(req: Request) {
  return startCronJob(req, "files", job);
}
export async function POST(req: Request) {
  return startCronJob(req, "files", job);
}
