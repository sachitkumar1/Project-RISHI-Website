import { getCurrentMember } from "@/lib/lms/currentUser";
import { bannerPathBelongsTo, readBannerImage } from "@/lib/lms/banner";

export const dynamic = "force-dynamic";

/**
 * A member's uploaded banner photo, served with a year-long "never changes"
 * cache. Each upload has a unique file name (it includes the upload time), so
 * replacing the photo produces a new address rather than a stale cached copy —
 * the browser downloads each photo once per device instead of on every visit.
 * Only the photo's owner can load it.
 */
export async function GET(req: Request) {
  const me = await getCurrentMember();
  if (!me) return new Response("Not authorized", { status: 401 });
  const path = new URL(req.url).searchParams.get("p") ?? "";
  if (!bannerPathBelongsTo(me.email, path)) return new Response("Not found", { status: 404 });
  const img = await readBannerImage(path);
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(img.bytes), {
    headers: {
      "Content-Type": img.type,
      "Content-Length": String(img.bytes.length),
      // private: browsers only, never shared caches (it's a member's own photo).
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
