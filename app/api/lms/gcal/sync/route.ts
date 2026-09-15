import { NextResponse } from "next/server";
import { hasRealDueDate } from "@/lib/lms/importedTasks";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { listEventsForMember, listTasksForMember } from "@/lib/lms/store";
import { getConnection, setSyncedKeys, syncToCalendar, type GCalTime, type SyncItem } from "@/lib/lms/gcal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One minute, in ms. Google Calendar rejects zero-duration timed events
// ("timeRangeEmpty"), so a point-in-time task/event becomes a 1-minute sliver.
const MINUTE = 60 * 1000;
const ymd = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export async function POST() {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const conn = await getConnection(me.email);
  if (!conn || !conn.syncEnabled)
    return NextResponse.json({ error: "calendar_not_connected" }, { status: 403 });

  const allTasks = await listTasksForMember(me);
  // Only non-archived tasks assigned TO me (self-assigned included) sync.
  const tasks = allTasks.filter(
    (t) => !t.archived && t.assigneeEmail.toLowerCase() === me.email.toLowerCase()
  );
  const events = (await listEventsForMember(me)).filter((e) => !e.archived);

  const items: SyncItem[] = [
    ...tasks.filter((t) => hasRealDueDate(t.tags)).map((t) => {
      // Point-in-time: starts at the due moment, 1-minute sliver (8:00-8:01).
      const start = new Date(t.dueAt);
      const end = new Date(start.getTime() + MINUTE);
      return {
        key: `task:${t.id}`,
        kind: "task" as const,
        id: t.id,
        summary: `Task: ${t.title}`,
        description:
          `Project RISHI task` +
          (t.description ? `\n\n${t.description}` : "") +
          `\n\nStatus: ${t.status.replace("_", " ")}`,
        start: { dateTime: start.toISOString() } as GCalTime,
        end: { dateTime: end.toISOString() } as GCalTime,
      };
    }),
    ...events.map((ev) => {
      let start: GCalTime;
      let end: GCalTime;
      if (ev.allDay) {
        // All-day: Google end.date is exclusive, so +1 day past the last day.
        const s = new Date(ev.startAt);
        const lastDay = ev.endAt ? new Date(ev.endAt) : s;
        const endExclusive = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 1);
        start = { date: ymd(s) };
        end = { date: ymd(endExclusive) };
      } else {
        const s = new Date(ev.startAt);
        // Range if endAt given, else a 1-minute point.
        const e = ev.endAt ? new Date(ev.endAt) : new Date(s.getTime() + MINUTE);
        start = { dateTime: s.toISOString() };
        end = { dateTime: e.toISOString() };
      }
      return {
        key: `event:${ev.id}`,
        kind: "event" as const,
        id: ev.id,
        summary: `Event: ${ev.title}`,
        description: `Project RISHI event` + (ev.description ? `\n\n${ev.description}` : ""),
        start,
        end,
      };
    }),
  ];

  try {
    const result = await syncToCalendar(me.email, conn.refreshToken, conn.syncedKeys, items);
    await setSyncedKeys(me.email, items.map((i) => i.key));
    return NextResponse.json({ ok: true, ...result, total: result.created + result.updated });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 400 || status === 401 || status === 403)
      return NextResponse.json({ error: "calendar_permission" }, { status: 403 });
    return NextResponse.json({ error: "sync_failed" }, { status: 502 });
  }
}
