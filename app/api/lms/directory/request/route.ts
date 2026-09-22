import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { listDirectory } from "@/lib/lms/directory";
import { sendContactChangeRequest } from "@/lib/lms/contactRequests";
import { formatPhone } from "@/lib/lms/phone";

export const dynamic = "force-dynamic";

/**
 * A member asks the webmaster to change their directory contact info.
 * Body: { contactEmail?, phone?, note? } — only the fields they want changed.
 * Nothing is changed here; the request is emailed to the webmaster.
 */
export async function POST(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  let body: { contactEmail?: unknown; phone?: unknown; note?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
  const email = str(body.contactEmail, 200);
  const phoneRaw = str(body.phone, 40);
  const note = str(body.note, 1000);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return NextResponse.json({ error: "That doesn't look like a valid email." }, { status: 400 });

  const mine = (await listDirectory()).find((e) => e.loginEmail === me.email.toLowerCase());
  const current = { email: mine?.email ?? me.email, phone: mine?.phone ?? "" };
  const requested: { email?: string; phone?: string } = {};
  if (email !== undefined && email !== "" && email.toLowerCase() !== current.email.toLowerCase()) requested.email = email;
  if (phoneRaw !== undefined && phoneRaw !== "") {
    const p = formatPhone(phoneRaw);
    if (p !== current.phone) requested.phone = p;
  }
  if (!requested.email && !requested.phone)
    return NextResponse.json({ error: "Enter a new email or phone number that's different from your current one." }, { status: 400 });

  try {
    await sendContactChangeRequest(me, { current, requested, note: note || undefined });
  } catch (e) {
    console.error("contact request:", (e as Error).message);
    return NextResponse.json({ error: "Couldn't send your request right now — please try again later." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
