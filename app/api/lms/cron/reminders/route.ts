import { NextResponse } from "next/server";
import { hasRealDueDate, isPlaceholderEmail } from "@/lib/lms/importedTasks";
import { listRemindableTasks, markRemindersSent } from "@/lib/lms/store";
import { notifyTaskReminder } from "@/lib/lms/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Reminder windows BEFORE the due time. Each fires once.
const BEFORE = [
  { key: "3d", ms: 3 * 86_400_000, phrase: "in 3 days" },
  { key: "1d", ms: 86_400_000, phrase: "in 1 day" },
  { key: "6h", ms: 6 * 3_600_000, phrase: "in 6 hours" },
  { key: "3h", ms: 3 * 3_600_000, phrase: "in 3 hours" },
  { key: "1h", ms: 3_600_000, phrase: "in 1 hour" },
] as const;

const utcDate = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD

function overduePhrase(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `by ${days} day${days === 1 ? "" : "s"}`;
  }
  const h = Math.max(1, hours);
  return `by ${h} hour${h === 1 ? "" : "s"}`;
}

// Accept the secret via Authorization: Bearer, x-cron-secret, or ?secret=.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  if (req.headers.get("x-cron-secret") === secret) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

async function run(req: Request) {
  if (!process.env.CRON_SECRET)
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 401 });

  const tasks = await listRemindableTasks();
  const now = Date.now();
  let sent = 0;

  for (const t of tasks) {
    // Imported stand-ins: the due date isn't real and the address can't receive
    // mail. Real tasks — including ones created by the agenda import — still
    // get their normal reminders.
    if (!hasRealDueDate(t.tags) || isPlaceholderEmail(t.assigneeEmail)) continue;
    const due = new Date(t.dueAt).getTime();
    const created = new Date(t.createdAt).getTime();
    const already = new Set(t.remindersSent ?? []);
    const toMark = new Set(already);
    const sends: Array<{ state: "due" | "past due"; phrase: string }> = [];

    if (now < due) {
      // Find the current (closest) window we've entered that hasn't been sent
      // and whose moment is after the task was created.
      const entered = BEFORE.filter(
        (w) => now >= due - w.ms && due - w.ms >= created && !already.has(w.key),
      );
      if (entered.length) {
        // smallest ms = closest to due = the one to actually send now
        const current = entered.reduce((a, b) => (a.ms <= b.ms ? a : b));
        sends.push({ state: "due", phrase: current.phrase });
        toMark.add(current.key);
        // Suppress any larger windows whose moment has already passed.
        for (const w of BEFORE) if (w.ms >= current.ms && now >= due - w.ms) toMark.add(w.key);
      }
    } else {
      // Past due — one reminder per calendar day.
      const key = `overdue:${utcDate(new Date(now))}`;
      if (!already.has(key)) {
        sends.push({ state: "past due", phrase: overduePhrase(now - due) });
        toMark.add(key);
      }
    }

    if (sends.length) {
      for (const s of sends) {
        await notifyTaskReminder(t, s.state, s.phrase).catch(() => {});
        sent++;
      }
      await markRemindersSent(t.id, Array.from(toMark)).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, scanned: tasks.length, sent });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
