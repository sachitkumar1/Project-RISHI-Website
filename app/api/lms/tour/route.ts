import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { canAssignTasks, canCreateEvents } from "@/lib/lms/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configured = Boolean(url && key);
const sb = () => createClient(url as string, key as string, { auth: { persistSession: false } });

/**
 * Tour state for the person signed in, plus the flags that decide which steps
 * they see. A newbie shouldn't be walked through assigning work, and a general
 * member shouldn't be shown the webmaster's Settings panel.
 */
export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let completed = false;
  if (configured) {
    const { data } = await sb()
      .from("lms_profiles").select("tour_completed_at").eq("email", me.email.toLowerCase()).maybeSingle();
    completed = Boolean(data?.tour_completed_at);
  }

  return NextResponse.json({
    completed,
    firstName: me.firstName,
    flags: {
      assignTasks: canAssignTasks(me),
      createEvents: canCreateEvents(me),
      lead: me.roles.lead || me.roles.nmtLeader,
      exec: me.roles.exec || me.roles.vpp,
      vpp: me.roles.vpp,
      outreach: me.roles.outreach,
      webmaster: me.roles.webmaster,
    },
  });
}

/** POST { done: true } to finish, { done: false } to take the tour again. */
export async function POST(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  if (!configured) return NextResponse.json({ ok: true });

  let body: { done?: boolean };
  try { body = await req.json(); } catch { body = { done: true }; }

  // If the migration hasn't been run the column is missing; say so plainly
  // rather than silently leaving the tour to reappear on every visit.
  const { error } = await sb().from("lms_profiles").upsert(
    {
      email: me.email.toLowerCase(),
      tour_completed_at: body.done === false ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "email" },
  );
  if (error) {
    const missing = /tour_completed_at/.test(error.message);
    console.error("tour: couldn't save completion —", error.message);
    return NextResponse.json(
      { error: missing ? "Run migration-tour.sql — the tour can't be marked complete yet." : error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
