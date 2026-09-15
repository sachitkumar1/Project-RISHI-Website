import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { signedUrlFor } from "@/lib/lms/files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A link that actually opens the file. Drive-mirrored items resolve to their
 * Drive link; uploaded ones get a signed URL that expires in ten minutes, so
 * the storage bucket can stay private.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const url = await signedUrlFor(me, params.id);
  if (!url) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ url });
}
