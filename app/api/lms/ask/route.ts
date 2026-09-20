import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { buildIndexStepLocked, indexBacklog } from "@/lib/lms/agent/admin";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { ask, type Turn } from "@/lib/lms/agent/ask";
import { agentConfig } from "@/lib/lms/agent/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Whether Ask is switched on, for the page to render the right state. */
export async function GET() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const cfg = agentConfig();
  return NextResponse.json({ enabled: !!(cfg.geminiKey || cfg.anthropicKey), dailyLimit: cfg.dailyLimit });
}

/** Only these people see which model answered (and model-specific errors).
 *  Everyone else just gets the answer. The model name is removed on the
 *  SERVER, so it never reaches anyone else's browser. */
const MODEL_VISIBLE_TO = new Set(["sachitk@berkeley.edu"]);
const canSeeModel = (m: { email: string; roles: { webmaster: boolean } }) =>
  m.roles.webmaster || MODEL_VISIBLE_TO.has(m.email.toLowerCase());

/** Ask a question. Body: { question, history?: [{ q, a }] } */
export async function POST(req: Request) {
  const started = Date.now();
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: { question?: unknown; history?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (question.length < 3) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });

  // History comes from the browser; keep it small and shaped.
  const history: Turn[] = Array.isArray(body.history)
    ? body.history
        .filter((t): t is Turn => !!t && typeof (t as Turn).q === "string" && typeof (t as Turn).a === "string")
        .slice(-2)
        .map((t) => ({ q: t.q.slice(0, 1000), a: t.a.slice(0, 2000) }))
    : [];

  try {
    const full = await ask(me, question, history);
    const status = full.ok ? 200 : full.code === "limit" ? 429 : full.code === "no_model" ? 503 : 500;
    const result = canSeeModel(me)
      ? full
      : full.ok
        ? { ...full, model: null }
        : full.code === "no_model"
          ? { ...full, error: "The assistant is busy right now. Please try again in a few minutes." }
          : full;
    // Self-healing index: if files are still waiting to be chunked or embedded,
    // spend what's left of this request's 60s working through them after the
    // answer is sent. The index never depends on one button or one cron job.
    waitUntil((async () => {
      try {
        const b = await indexBacklog();
        if (b.filesPending > 0 || b.embedPending > 0) await buildIndexStepLocked(55_000 - (Date.now() - started));
      } catch (e) { console.error("ask: background index step", e); }
    })());
    return NextResponse.json(result, { status });
  } catch (e) {
    console.error("ask:", e);
    return NextResponse.json({ ok: false, code: "error", error: "Something went wrong answering that." }, { status: 500 });
  }
}
