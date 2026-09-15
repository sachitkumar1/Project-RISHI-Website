import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import {
  clearVisibility,
  getDefaultAudience,
  listFoldersForSettings,
  normalizeAudience,
  setDefaultAudience,
  setVisibility,
} from "@/lib/lms/files";
import type { ProjectGroup } from "@/lib/lms/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate() {
  const me = await getCurrentMember();
  if (!me) return { error: "Not authorized", status: 401 as const };
  if (!me.roles.webmaster) return { error: "Webmaster only.", status: 403 as const };
  return { ok: true as const };
}

/** Every folder plus the audience currently in force on it. */
export async function GET() {
  const g = await gate();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  try {
    const [folders, defaultAudience] = await Promise.all([
      listFoldersForSettings(),
      getDefaultAudience(),
    ]);
    return NextResponse.json({ folders, defaultAudience });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * POST { folderId, audience, groups? }  → set one folder's audience
 * POST { folderId, inherit: true }      → drop its rule, inherit the parent's
 * POST { defaultAudience }              → change the club-wide fallback
 */
export async function POST(req: Request) {
  const g = await gate();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: {
    folderId?: string;
    audience?: string;
    groups?: string[];
    inherit?: boolean;
    defaultAudience?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    if (body.defaultAudience) {
      await setDefaultAudience(normalizeAudience(body.defaultAudience));
      return NextResponse.json({ ok: true });
    }

    if (!body.folderId) return NextResponse.json({ error: "Bad request" }, { status: 400 });

    if (body.inherit) {
      await clearVisibility(body.folderId);
      return NextResponse.json({ ok: true });
    }

    const audience = normalizeAudience(body.audience);
    const groups = (body.groups ?? []).filter((x): x is ProjectGroup =>
      x === "E" || x === "R" || x === "W" || x === "H",
    );
    if (audience === "groups" && groups.length === 0)
      return NextResponse.json({ error: "Pick at least one project group." }, { status: 400 });

    await setVisibility(body.folderId, audience, groups);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
