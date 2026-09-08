import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { pullRosterFromSheet, pushRosterToSheet } from "@/lib/lms/sheets";
import { isRosterFromSheet } from "@/lib/members";
import { getRosterMode, listRosterRows } from "@/lib/lms/roster";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Where is the roster currently coming from, and how many people are on it? */
export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  if (!me.roles.webmaster) return NextResponse.json({ error: "Webmaster only." }, { status: 403 });
  let rows = 0;
  try {
    rows = (await listRosterRows()).length;
  } catch {
    /* fall through — 0 means "code roster" */
  }
  return NextResponse.json({
    source: isRosterFromSheet() ? "sheet" : "code",
    mode: await getRosterMode(), // "code" = members.ts only; "sheet" = sheet controls logins
    rows,
    sheetUrl: `https://docs.google.com/spreadsheets/d/${process.env.ROSTER_SHEET_ID || "1dXFFftlCir1gEJYuNY7ms2ox8dkLjVfFlLpT-0SmFaw"}/edit`,
  });
}

/**
 * Pull the roster sheet in right now (exec only) — the "I just edited the sheet
 * and don't want to wait for the cron" button. Pushes the normalized roster back
 * afterwards so the sheet reflects exactly what the site is using.
 */
export async function POST() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  if (!me.roles.webmaster) return NextResponse.json({ error: "Webmaster only." }, { status: 403 });

  const pull = await pullRosterFromSheet();
  if (!pull.ok)
    return NextResponse.json(
      { ok: false, error: pull.error ?? pull.skipped ?? "Roster sync failed." },
      { status: 400 },
    );
  const push = await pushRosterToSheet();
  return NextResponse.json({ ok: true, members: pull.rows, note: pull.skipped, pushedBack: push.ok });
}
