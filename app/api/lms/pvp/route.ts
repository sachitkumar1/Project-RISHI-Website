import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import {
  PVP_KINDS,
  addPvpNote,
  canUsePvp,
  createPvpItem,
  deletePvpItem,
  listPvpItems,
  pvpApprovers,
  togglePvpApproval,
  updatePvpItem,
  usingSupabase,
  type PvpKind,
} from "@/lib/lms/pvp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The whole PVP portal, through one route.
 *
 * Every write is a POST with an `action`, rather than a route per verb. Four
 * boards across five verbs would otherwise be a lot of separate serverless
 * functions to cold-start for a page three people use.
 */

async function gate() {
  const me = await getCurrentMember();
  if (!me) return { error: "Not authorized", status: 401 as const };
  if (!canUsePvp(me)) return { error: "This space is for the President and VPs.", status: 403 as const };
  return { ok: true as const, me };
}

/** Names for the handful of people the portal can show, so the page never has
 *  to call /api/lms/meta as well. Three approvers plus whoever wrote a note. */
function people() {
  return pvpApprovers().map((m) => ({ email: m.email.toLowerCase(), name: `${m.firstName} ${m.lastName}` }));
}

export async function GET(req: Request) {
  const g = await gate();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!usingSupabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 503 });

  const includeArchived = new URL(req.url).searchParams.get("archived") === "1";
  try {
    // One query for all four boards, plus the names, in one response.
    const items = await listPvpItems(includeArchived);
    return NextResponse.json({ items, approvers: people(), me: g.me.email.toLowerCase() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const g = await gate();
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!usingSupabase) return NextResponse.json({ error: "Supabase isn't configured." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const action = String(body.action ?? "");
  const id = typeof body.id === "string" ? body.id : "";
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);

  try {
    switch (action) {
      case "create": {
        const kind = String(body.kind ?? "") as PvpKind;
        if (!PVP_KINDS.includes(kind)) return NextResponse.json({ error: "Unknown board." }, { status: 400 });
        const title = (str("title") ?? "").trim();
        if (!title) return NextResponse.json({ error: "Give it a title." }, { status: 400 });
        // An owner, when set, must be one of the three — not a free-text address.
        const owner = (str("ownerEmail") ?? "").trim().toLowerCase();
        if (owner && !pvpApprovers().some((m) => m.email.toLowerCase() === owner))
          return NextResponse.json({ error: "Owner must be one of the three." }, { status: 400 });
        const item = await createPvpItem(
          {
            kind, title,
            body: str("body"), counterpart: str("counterpart"), channel: str("channel"),
            scheduledAt: str("scheduledAt") ?? null, dueAt: str("dueAt") ?? null, ownerEmail: owner,
          },
          g.me.email,
        );
        return NextResponse.json({ item }, { status: 201 });
      }
      case "update": {
        if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
        const owner = str("ownerEmail");
        if (owner && owner.trim() && !pvpApprovers().some((m) => m.email.toLowerCase() === owner.trim().toLowerCase()))
          return NextResponse.json({ error: "Owner must be one of the three." }, { status: 400 });
        const item = await updatePvpItem(id, {
          title: str("title"), body: str("body"), counterpart: str("counterpart"),
          channel: str("channel"), status: str("status"),
          scheduledAt: body.scheduledAt === undefined ? undefined : (str("scheduledAt") ?? null),
          dueAt: body.dueAt === undefined ? undefined : (str("dueAt") ?? null),
          ownerEmail: owner,
          archived: typeof body.archived === "boolean" ? body.archived : undefined,
        });
        return NextResponse.json({ item });
      }
      case "approve": {
        if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
        // Only the three can sign off. The webmaster can read the board and
        // help, but must not be able to complete an approval on their behalf.
        const mine = g.me.email.toLowerCase();
        if (!pvpApprovers().some((m) => m.email.toLowerCase() === mine))
          return NextResponse.json({ error: "Only the President and VPs can approve." }, { status: 403 });
        const item = await togglePvpApproval(id, g.me.email);
        return NextResponse.json({ item });
      }
      case "note": {
        if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
        const item = await addPvpNote(id, g.me.email, str("body") ?? "");
        return NextResponse.json({ item });
      }
      case "delete": {
        if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
        await deletePvpItem(id);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
