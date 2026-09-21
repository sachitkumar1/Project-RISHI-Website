import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { getBanner, setBanner, uploadBanner, MAX_BANNER_BYTES } from "@/lib/lms/banner";
import { parseBanner } from "@/lib/lms/bannerPresets";

export const dynamic = "force-dynamic";

/** The signed-in member's banner. Always their OWN — the email comes from the session. */
export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  return NextResponse.json(await getBanner(me.email));
}

/** Choose a preset / club photo, re-position an uploaded photo, or reset ({ reset: true }). */
export async function PUT(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  try {
    if (body?.reset === true) await setBanner(me.email, null);
    else {
      const choice = parseBanner(body);
      if (!choice) return NextResponse.json({ error: "Unknown banner choice." }, { status: 400 });
      await setBanner(me.email, choice);
    }
    return NextResponse.json(await getBanner(me.email));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** Upload a photo (already shrunk in the browser): { image: "data:image/jpeg;base64,…", pos } */
export async function POST(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const m = typeof body?.image === "string" ? body.image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/) : null;
  if (!m) return NextResponse.json({ error: "Please use a JPEG, PNG or WebP image." }, { status: 400 });
  if (m[2].length > Math.ceil(MAX_BANNER_BYTES * 1.37)) return NextResponse.json({ error: "That image is too large." }, { status: 413 });
  try {
    await uploadBanner(me.email, Buffer.from(m[2], "base64"), Number(body?.pos ?? 50));
    return NextResponse.json(await getBanner(me.email));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
