import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { MEMBERS, findMember, memberFullName } from "@/lib/members";
import { type ProjectGroup } from "@/lib/lms/types";
import {
  announceGroups,
  announceScopes,
  canAnnounceToEmails,
  canEmailFromClub,
  canPostAnnouncements,
  canPostNewsletter,
} from "@/lib/lms/permissions";
import {
  getGmailConnection,
  sendViaConnection,
  SHARED_SENDER,
  SHARED_FROM_NAME,
  type GmailConnection,
} from "@/lib/lms/gmail";
import { createAnnouncement } from "@/lib/lms/announcements";
import { createNewsletter, listSubscribers } from "@/lib/lms/newsletters";
import { applyMergeTags, buildMergeMap, type MergeMap, type MergeRow } from "@/lib/lms/merge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const lc = (e: string) => e.trim().toLowerCase();
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

type Body = {
  mode?: "announcement" | "email" | "newsletter";
  subject?: string;
  bodyHtml?: string;
  mailMerge?: boolean;
  mergeRows?: MergeRow[];
  sender?: "club" | "personal";
  scopeKind?: "members" | "group" | "club";
  groups?: string[];
  memberEmails?: string[];
  externalEmails?: string[];
  cc?: string[];
};

// Send to everyone, personalizing per-recipient when mail merge is on.
async function deliver(
  conn: GmailConnection,
  fromName: string,
  recipients: string[],
  subject: string,
  html: string,
  mailMerge: boolean,
  mergeMap: MergeMap,
  cc: string[] = [],
): Promise<{ sent: boolean; error: string | null }> {
  const fromEmail = conn.connectedGoogleEmail ?? conn.accountEmail;
  try {
    if (mailMerge) {
      for (const r of recipients) {
        const row = mergeMap[lc(r)];
        await sendViaConnection(conn, {
          fromEmail,
          fromName,
          to: [r],
          cc: cc.length ? cc : undefined,
          subject: applyMergeTags(subject, r, row),
          html: applyMergeTags(html, r, row),
        });
      }
    } else {
      await sendViaConnection(conn, { fromEmail, fromName, to: [fromEmail], cc: cc.length ? cc : undefined, bcc: recipients, subject, html });
    }
    return { sent: true, error: null };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

export async function POST(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const bodyHtml = (body.bodyHtml ?? "").trim();
  if (!bodyHtml || bodyHtml === "<p></p>")
    return NextResponse.json({ error: "Your message needs a body." }, { status: 400 });

  const mode = body.mode ?? "email";
  const mergeMap = mode !== "newsletter" && body.mailMerge ? buildMergeMap(body.mergeRows ?? []) : {};
  const mergeEmails = Object.keys(mergeMap);

  // =========================================================================
  //  NEWSLETTER  (mail merge intentionally disabled)
  // =========================================================================
  if (mode === "newsletter") {
    if (!canPostNewsletter(me))
      return NextResponse.json({ error: "Only the Director of Outreach can post newsletters." }, { status: 403 });
    const subject = (body.subject ?? "").trim() || "[NEWSLETTER]";

    const conn = await getGmailConnection(SHARED_SENDER);
    if (!conn)
      return NextResponse.json({ error: "The club email isn't connected yet. An exec needs to connect it." }, { status: 400 });

    const subs = await listSubscribers();
    const recipients = Array.from(new Set([...MEMBERS.map((m) => m.email), ...subs].map(lc)));

    const nl = await createNewsletter({
      authorEmail: me.email,
      authorName: memberFullName(me),
      senderEmail: conn.accountEmail,
      subject,
      bodyHtml,
      mailMerge: false,
    });
    const { sent, error } = await deliver(conn, SHARED_FROM_NAME, recipients, subject, bodyHtml, false, {});
    return NextResponse.json({ ok: true, id: nl.id, recipients: recipients.length, emailSent: sent, sendError: error });
  }

  const mailMerge = body.mailMerge === true;

  // =========================================================================
  //  ANNOUNCEMENT
  // =========================================================================
  if (mode === "announcement") {
    if (!canPostAnnouncements(me))
      return NextResponse.json({ error: "You can't post announcements." }, { status: 403 });
    const subject = (body.subject ?? "").trim() || "[ANNOUNCEMENT]";

    const allowedScopes = new Set(announceScopes(me));
    const scopeKind = body.scopeKind ?? "members";
    if (!allowedScopes.has(scopeKind))
      return NextResponse.json({ error: "You can't post to that audience." }, { status: 403 });

    let recipients: string[] = [];
    if (scopeKind === "club") {
      recipients = MEMBERS.map((m) => m.email);
    } else if (scopeKind === "group") {
      const allowedGroups = new Set(announceGroups(me));
      const picked = (body.groups ?? []).filter((g) => allowedGroups.has(g as ProjectGroup));
      if (picked.length === 0) return NextResponse.json({ error: "Pick at least one group." }, { status: 400 });
      // Members not in a project group yet aren't part of any group mailing.
      recipients = MEMBERS.filter((m) => m.group !== null && picked.includes(m.group)).map((m) => m.email);
    } else {
      const picked = body.memberEmails ?? [];
      if (picked.length === 0) return NextResponse.json({ error: "Pick at least one person." }, { status: 400 });
      if (!canAnnounceToEmails(me, picked))
        return NextResponse.json({ error: "You can't message one or more of those people." }, { status: 403 });
      recipients = picked;
    }
    recipients = Array.from(new Set(recipients.map(lc))).filter((e) => findMember(e));

    const senderChoice = body.sender === "personal" ? "personal" : "club";
    const conn = await getGmailConnection(senderChoice === "club" ? SHARED_SENDER : me.email);
    if (!conn)
      return NextResponse.json(
        { error: senderChoice === "club" ? "The club email isn't connected yet." : "Connect your Gmail first." },
        { status: 400 },
      );
    const fromName = senderChoice === "club" ? SHARED_FROM_NAME : memberFullName(me);

    const ann = await createAnnouncement({
      authorEmail: me.email,
      authorName: memberFullName(me),
      senderEmail: conn.accountEmail,
      subject,
      bodyHtml,
      recipientEmails: recipients,
      mailMerge,
      mergeData: mailMerge ? mergeMap : {},
    });
    const { sent, error } = await deliver(conn, fromName, recipients, subject, bodyHtml, mailMerge, mergeMap);
    return NextResponse.json({ ok: true, id: ann.id, recipients: recipients.length, emailSent: sent, sendError: error });
  }

  // =========================================================================
  //  EMAIL  (any member -> any members and/or any addresses)
  // =========================================================================
  const subject = (body.subject ?? "").trim();
  if (!subject) return NextResponse.json({ error: "Emails need a subject." }, { status: 400 });

  // Resolve member recipients from the chosen scope (any member can email anyone).
  let scopeMembers: string[] = [];
  const emailScope = body.scopeKind ?? "members";
  if (emailScope === "club") {
    scopeMembers = MEMBERS.map((m) => m.email);
  } else if (emailScope === "group") {
    const picked = (body.groups ?? []).filter((g) => ["E", "R", "W", "H"].includes(g));
    scopeMembers = MEMBERS.filter((m) => m.group !== null && picked.includes(m.group)).map((m) => m.email);
  } else {
    scopeMembers = (body.memberEmails ?? []).filter((e) => findMember(e));
  }
  const externalEmails = (body.externalEmails ?? []).map((e) => e.trim()).filter(isEmail).map(lc);
  const tableEmails = mailMerge ? mergeEmails.filter(isEmail) : [];
  const recipients = Array.from(new Set([...scopeMembers.map(lc), ...externalEmails, ...tableEmails]));
  if (recipients.length === 0) return NextResponse.json({ error: "Add at least one recipient." }, { status: 400 });

  const senderChoice = body.sender === "club" ? "club" : "personal";
  if (senderChoice === "club" && !canEmailFromClub(me, recipients))
    return NextResponse.json(
      { error: "You can only use the club email when writing to your own project group. Use your own email instead." },
      { status: 403 },
    );
  const conn = await getGmailConnection(senderChoice === "club" ? SHARED_SENDER : me.email);
  if (!conn)
    return NextResponse.json(
      { error: senderChoice === "club" ? "The club email isn't connected yet." : "Connect your Gmail first in Account settings." },
      { status: 400 },
    );
  const fromName = senderChoice === "club" ? SHARED_FROM_NAME : memberFullName(me);

  const cc = (body.cc ?? []).map((e) => e.trim()).filter(isEmail).map(lc).filter((e) => !recipients.includes(e));
  const { sent, error } = await deliver(conn, fromName, recipients, subject, bodyHtml, mailMerge, mergeMap, cc);
  return NextResponse.json({ ok: true, recipients: recipients.length, emailSent: sent, sendError: error });
}
