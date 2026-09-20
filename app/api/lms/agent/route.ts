import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { agentStatus, buildIndexStep, testModels } from "@/lib/lms/agent/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Webmaster only: the Ask agent's index, budget and model health. */
async function gate() {
  const me = await getCurrentMember();
  if (!me) return { error: "Not authorized", status: 401 as const };
  if (!me.roles.webmaster) return { error: "Webmaster only.", status: 403 as const };
  return { ok: true as const };
}

export async function GET() {
  const g = await gate();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json(await agentStatus());
}

/** { action: "build" } runs one bounded chunk+embed step; { action: "test" } pings each model. */
export async function POST(req: Request) {
  const g = await gate();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "build") {
    const r = await buildIndexStep(50_000);
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  }
  if (action === "test") return NextResponse.json(await testModels());
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
