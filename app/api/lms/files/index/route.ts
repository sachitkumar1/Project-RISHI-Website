import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { indexContent, indexStatus } from "@/lib/lms/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Pull text out of files so their CONTENTS are searchable.
 *
 * Split out from the Drive sync: walking four school years and extracting text
 * in one request runs far past Vercel's 60s ceiling. Each call works for a
 * bounded time and reports `remaining`; call it until that hits 0. Being cut
 * short is safe — every file is stamped as it completes, so work never repeats.
 */
async function gate() {
  const me = await getCurrentMember();
  if (!me) return { error: "Not authorized", status: 401 as const };
  if (!me.roles.webmaster) return { error: "Webmaster only.", status: 403 as const };
  return { ok: true as const };
}

export async function GET() {
  const g = await gate();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json(await indexStatus());
}

export async function POST() {
  const g = await gate();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const result = await indexContent();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
