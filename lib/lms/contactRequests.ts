/**
 * Contact-info change REQUESTS. Members can't edit their directory email/phone
 * themselves; they send a request, which is emailed to the webmaster, who
 * applies it from the Member Directory (webmaster-only "Edit").
 */
import type { Member } from "@/lib/members";
import { getGmailConnection, sendViaConnection, NOTIFY_SENDER, NOTIFY_FROM_NAME } from "@/lib/lms/gmail";

/** Where requests go. Override with CONTACT_REQUESTS_TO in Vercel if needed. */
export const CONTACT_REQUESTS_TO = process.env.CONTACT_REQUESTS_TO || "sachitkumar2025@gmail.com";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type ContactRequest = {
  current: { email: string; phone: string };
  requested: { email?: string; phone?: string };
  note?: string;
};

export async function sendContactChangeRequest(m: Member, r: ContactRequest): Promise<void> {
  const conn = await getGmailConnection(NOTIFY_SENDER);
  if (!conn) throw new Error("The club's email account isn't connected right now, so the request couldn't be sent.");
  const name = `${m.firstName} ${m.lastName}`.trim();
  const row = (label: string, now: string, want?: string) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#5b6b62">${label}</td>` +
    `<td style="padding:6px 12px 6px 0">${esc(now || "—")}</td>` +
    `<td style="padding:6px 0;font-weight:600">${want === undefined ? '<span style="color:#9aa39e;font-weight:400">no change</span>' : esc(want || "(clear — use roster default)")}</td></tr>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1B2620">
<p><strong>${esc(name)}</strong> (${esc(m.email)}) asked to update their contact info in the Member Directory.</p>
<table style="border-collapse:collapse;font-size:14px">
<tr><td></td><td style="padding:6px 12px 6px 0;color:#5b6b62">Current</td><td style="padding:6px 0;color:#5b6b62">Requested</td></tr>
${row("Email", r.current.email, r.requested.email)}
${row("Phone", r.current.phone, r.requested.phone)}
</table>
${r.note ? `<p style="margin-top:14px"><span style="color:#5b6b62">Note:</span> ${esc(r.note)}</p>` : ""}
<p style="margin-top:18px;color:#5b6b62;font-size:13px">To approve: sign in with the webmaster account → Member Directory → <strong>Edit</strong> next to ${esc(name)}. Reply to this email to reach ${esc(m.firstName)}.</p>
</div>`;
  await sendViaConnection(conn, {
    fromEmail: conn.connectedGoogleEmail ?? conn.accountEmail,
    fromName: NOTIFY_FROM_NAME,
    to: [CONTACT_REQUESTS_TO],
    replyTo: r.current.email || m.email,
    subject: `Contact info change request — ${name}`,
    html,
  });
}
