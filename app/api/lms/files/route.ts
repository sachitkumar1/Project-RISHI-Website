import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { listFolder, searchFiles } from "@/lib/lms/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/lms/files            → the top level (the school-year folders)
 * GET /api/lms/files?folder=ID  → that folder's visible contents + breadcrumbs
 * GET /api/lms/files?q=text     → name search across everything they can see
 *
 * Visibility is applied here, on the server. A folder the member isn't allowed
 * to open returns 404 rather than 403 — a restricted folder shouldn't announce
 * itself.
 */
export async function GET(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q");

  try {
    if (q) return NextResponse.json({ results: await searchFiles(me, q) });

    const folder = url.searchParams.get("folder");
    const view = await listFolder(me, folder && folder.length > 0 ? folder : null);
    if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(view);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
