import { getCurrentMember } from "@/lib/lms/currentUser";
import { isAvatarPath, readAvatarFile } from "@/lib/lms/avatars";

export const dynamic = "force-dynamic";

/**
 * A member's profile photo, for signed-in members (as before — photos were
 * never public). Served with a year-long "never changes" cache: every photo has
 * its own file name, and a new photo gets a new one, so browsers download each
 * photo once per device instead of with every page.
 */
export async function GET(req: Request) {
  const me = await getCurrentMember();
  if (!me) return new Response("Not authorized", { status: 401 });
  const path = new URL(req.url).searchParams.get("p") ?? "";
  if (!isAvatarPath(path)) return new Response("Not found", { status: 404 });
  const img = await readAvatarFile(path);
  if (!img) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(img.bytes), {
    headers: {
      "Content-Type": img.type,
      "Content-Length": String(img.bytes.length),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
