import { NextResponse } from "next/server";
import { syncDrive } from "@/lib/lms/drive";
import { indexContent } from "@/lib/lms/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Same auth as the reminders and sheets crons: Authorization: Bearer,
// x-cron-secret, or ?secret=.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  if (req.headers.get("x-cron-secret") === secret) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

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
 */
async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 401 });

  const started = Date.now();
  const result = await syncDrive();

  if (!result.ok) {
    console.error("cron/files: sync failed —", result.error ?? result.skipped);
    return NextResponse.json({ ...result, ms: Date.now() - started }, { status: 500 });
  }

  // Then extract text, in bounded batches, for as long as the request budget
  // allows. Whatever's left is picked up by the next run — `index.remaining`
  // says how much that is.
  const index = await indexContent(20_000);
  return NextResponse.json({ ...result, index, ms: Date.now() - started });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
