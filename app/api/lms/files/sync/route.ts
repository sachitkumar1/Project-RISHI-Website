import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { syncDrive, lastDriveSync, YEAR_ROOTS, EXCLUDED_IDS } from "@/lib/lms/drive";
import { uploadUsageBytes, MAX_UPLOAD_BYTES } from "@/lib/lms/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** A full walk of both folder trees takes a while on a cold token. */
export const maxDuration = 60;

async function gate() {
  const me = await getCurrentMember();
  if (!me) return { error: "Not authorized", status: 401 as const };
  if (!me.roles.webmaster) return { error: "Webmaster only.", status: 403 as const };
  return { ok: true as const };
}

/** Status for the Settings panel: when it last ran, how much storage uploads use. */
export async function GET() {
  const g = await gate();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const [lastSync, usedBytes] = await Promise.all([lastDriveSync(), uploadUsageBytes()]);
  return NextResponse.json({
    lastSync,
    usedBytes,
    maxUploadBytes: MAX_UPLOAD_BYTES,
    folders: YEAR_ROOTS,
    excludedCount: EXCLUDED_IDS.size,
    serviceAccount: process.env.GOOGLE_SA_EMAIL ?? null,
  });
}

/** Re-index both Drive folders now. Never deletes — see lib/lms/drive.ts. */
export async function POST() {
  const g = await gate();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const result = await syncDrive();
  if (!result.ok)
    return NextResponse.json(
      { error: result.error ?? result.skipped ?? "Sync failed." },
      { status: 500 },
    );
  return NextResponse.json(result);
}
