import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { canEditTemplate } from "@/lib/lms/permissions";
import { getTemplate, setTemplate } from "@/lib/lms/meetings";
import { PROJECT_GROUPS, type MeetingBlock, type ProjectGroup } from "@/lib/lms/types";

export const dynamic = "force-dynamic";
const isGroup = (g: unknown): g is ProjectGroup => PROJECT_GROUPS.includes(g as ProjectGroup);

export async function GET(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const group = new URL(req.url).searchParams.get("group");
  if (!isGroup(group)) return NextResponse.json({ error: "Unknown group." }, { status: 400 });
  const tpl = await getTemplate(group);
  return NextResponse.json({ template: tpl, canEdit: canEditTemplate(me, group) });
}

export async function PUT(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  let body: { group?: string; blocks?: MeetingBlock[]; body?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  if (!isGroup(body.group)) return NextResponse.json({ error: "Unknown group." }, { status: 400 });
  if (!canEditTemplate(me, body.group))
    return NextResponse.json({ error: "Only leads of this group can edit the template." }, { status: 403 });
  await setTemplate(body.group, Array.isArray(body.blocks) ? body.blocks : [], typeof body.body === "string" ? body.body : "");
  return NextResponse.json({ ok: true });
}
