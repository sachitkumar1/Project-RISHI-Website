import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { findMember } from "@/lib/members";
import { getContactOverride, listDirectory, setContactOverride } from "@/lib/lms/directory";
import { formatPhone } from "@/lib/lms/phone";
import { syncDirectoryToSheet } from "@/lib/lms/sheets";

export const dynamic = "force-dynamic";

// Any signed-in member can view the full directory.
export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const entries = await listDirectory();
  // canEditAll: the webmaster edits anyone's contact info (to apply requests).
  return NextResponse.json({ entries, me: me.email.toLowerCase(), canEditAll: !!me.roles.webmaster });
}

// Only the WEBMASTER edits directory contact info — anyone's, to apply the
// change requests members send (POST /api/lms/directory/request). Members can
// no longer edit their own directly.
export async function PUT(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  if (!me.roles.webmaster)
    return NextResponse.json({ error: "Contact info changes go through a request to the webmaster." }, { status: 403 });

  let body: { contactEmail?: string; phone?: string; loginEmail?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Light validation — both fields are optional; empty string clears the override.
  if (body.contactEmail !== undefined) {
    const e = body.contactEmail.trim();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      return NextResponse.json({ error: "That doesn't look like a valid email." }, { status: 400 });
  }
  if (body.phone !== undefined && body.phone.trim().length > 40)
    return NextResponse.json({ error: "Phone number is too long." }, { status: 400 });

  // Whose info: another member (by login email) or the webmaster's own.
  const target = body.loginEmail ? findMember(body.loginEmail) : me;
  if (!target) return NextResponse.json({ error: "No member with that email." }, { status: 404 });
  const phone = body.phone !== undefined ? formatPhone(body.phone) : undefined;
  await setContactOverride(target.email, { contactEmail: body.contactEmail, phone });
  const override = await getContactOverride(target.email);
  // Mirror the updated directory into the Google Sheet (best-effort).
  await syncDirectoryToSheet().catch(() => {});
  return NextResponse.json({ ok: true, override });
}
