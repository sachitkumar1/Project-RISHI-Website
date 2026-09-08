import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { getRosterMode, setRosterMode, refreshRoster, type RosterMode } from "@/lib/lms/roster";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate() {
  const me = await getCurrentMember();
  if (!me) return { error: "Not authorized", status: 401 as const };
  if (!me.roles.webmaster) return { error: "Webmaster only.", status: 403 as const };
  return { ok: true as const };
}

export async function GET() {
  const g = await gate();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  return NextResponse.json({ mode: await getRosterMode() });
}

/**
 * Switch the roster source (webmaster only). Takes effect immediately.
 *   { mode: "sheet" } → the Google Sheet controls the roster/logins.
 *   { mode: "code" }  → members.ts controls the roster/logins (the Sheet is ignored).
 */
export async function POST(req: Request) {
  const g = await gate();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: { mode?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  if (body.mode !== "sheet" && body.mode !== "code")
    return NextResponse.json({ error: 'mode must be "sheet" or "code".' }, { status: 400 });

  await setRosterMode(body.mode as RosterMode);
  await refreshRoster(); // apply now
  return NextResponse.json({ ok: true, mode: body.mode });
}
