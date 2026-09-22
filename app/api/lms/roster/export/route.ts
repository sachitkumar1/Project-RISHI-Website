import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { ensureRoster } from "@/lib/lms/roster";
import { MEMBERS, ROLE_KEYS, type Member } from "@/lib/members";
import type { RoleFlags } from "@/lib/lms/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const q = (v: string) => JSON.stringify(v ?? "");

/**
 * Render one member as the exact line format used in lib/members.ts.
 * Only the role flags that are actually true are emitted, matching how the
 * file is written by hand — roles() fills in the rest as false.
 */
function memberLine(m: Member): string {
  const flags = ROLE_KEYS.filter((k) => m.roles[k as keyof RoleFlags])
    .map((k) => `${k}: true`)
    .join(", ");
  const hidden = m.hidden ? ", hidden: true" : "";
  return `  { email: ${q(m.email)}, firstName: ${q(m.firstName)}, lastName: ${q(m.lastName)}, phone: ${q(m.phone ?? "")}, group: ${m.group ? q(m.group) : "null"}, roles: roles({ ${flags} })${hidden} },`;
}

/**
 * Generate the BASE_MEMBERS array for lib/members.ts from the live roster.
 *
 * Deliberately emits ONLY the array — not the whole file. The rest of
 * members.ts (types, roles(), memberRoleLabel, canSeeMember, …) is real code
 * that evolves independently; regenerating it would silently revert any future
 * edits made there. The array is the only part the sheet actually owns.
 */
export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  if (!me.roles.webmaster)
    return NextResponse.json({ error: "Webmaster only." }, { status: 403 });

  await ensureRoster();
  const rows = [...MEMBERS].sort((a, b) => a.email.localeCompare(b.email));
  const code = [
    "export const BASE_MEMBERS: Member[] = [",
    ...rows.map(memberLine),
    "];",
  ].join("\n");

  return NextResponse.json({ code, count: rows.length });
}
