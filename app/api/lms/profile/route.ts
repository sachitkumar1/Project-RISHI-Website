import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { roleLabels } from "@/lib/lms/permissions";
import { PROJECT_GROUP_LABELS } from "@/lib/lms/types";
import { getAvatar, setAvatar } from "@/lib/lms/store";

export const dynamic = "force-dynamic";

// Cap the stored avatar payload. After cropping to ~256px JPEG this is ~20-50KB;
// 400KB leaves generous headroom while blocking anyone POSTing a huge image.
const MAX_AVATAR_CHARS = 400_000;

export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const avatar = await getAvatar(me.email);
  return NextResponse.json({
    email: me.email,
    firstName: me.firstName,
    lastName: me.lastName,
    group: me.group,
    groupLabel: me.group ? PROJECT_GROUP_LABELS[me.group] : "Not assigned yet",
    roles: me.roles,
    roleLabels: roleLabels(me.roles),
    avatar,
  });
}

export async function PUT(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: { avatar?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const avatar = body.avatar ?? null;
  if (avatar !== null) {
    if (typeof avatar !== "string" || !avatar.startsWith("data:image/")) {
      return NextResponse.json({ error: "That doesn't look like an image." }, { status: 400 });
    }
    if (avatar.length > MAX_AVATAR_CHARS) {
      return NextResponse.json(
        { error: "That image is too large. Try cropping a smaller area." },
        { status: 413 },
      );
    }
  }

  // A member can only ever change their OWN avatar (email comes from the session).
  try {
    await setAvatar(me.email, avatar);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  // Hand back the photo's address (not the image data) for the page to show.
  return NextResponse.json({ ok: true, avatar: await getAvatar(me.email) });
}
