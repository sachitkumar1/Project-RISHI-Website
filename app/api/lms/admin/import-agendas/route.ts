import crypto from "crypto";
import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { createMeeting } from "@/lib/lms/meetings";
import { createTasks, patchTask } from "@/lib/lms/store";
import { BASE_MEMBERS } from "@/lib/members";
import { getDriveAccessToken } from "@/lib/lms/drive";
import type { ProjectGroup } from "@/lib/lms/types";
import {
  TAG_NO_DUE_DATE, TAG_PLACEHOLDER_ASSIGNEE, placeholderEmail,
} from "@/lib/lms/importedTasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/* ============================================================================
   One-off migration: the 2026-2027 agenda docs → real LMS meetings and tasks.

   Run with ?dryRun=1 first — it returns exactly what it WOULD create without
   touching anything. Re-running the real import would duplicate everything,
   so it refuses unless ?confirm=IMPORT is passed.

   Notifications: this calls createTasks() from the store directly rather than
   going through /api/lms/tasks, which is what sends notifyTaskAssigned(). No
   member is emailed by this import — deliberately, since ~120 tasks would
   otherwise fire ~120 emails about work that's mostly already finished.
   ========================================================================== */

/** The Website-Friendly agendas: the same content with the smart chips
 *  flattened to text, so assignees and statuses are actually readable.
 *  Education has no Website-Friendly copy; its main doc never used chips. */
const SOURCE_DOCS: Record<string, { docId: string; group: ProjectGroup; assigner: string }> = {
  Health:   { docId: "1e86TNaF-08kMFrUi-pHuewoLt2qWkJnVvkmo93vSkEY", group: "H", assigner: "krrishikasaxena@berkeley.edu" },
  Womens:   { docId: "1qrKHtYYjSwfexgHcPf3LLTS3Q2d6PmMX254y1QBD6PI", group: "W", assigner: "palakprabhakar1@berkeley.edu" },
  Education:{ docId: "1LvhmlFo_cNc1zOoptraoWoVCMMoHLz18IWTeaAjxSNE", group: "E", assigner: "megha_ramachandran@berkeley.edu" },
};

/** Names in the docs that don't match the roster cleanly. */
const NAME_ALIASES: Record<string, string> = {
  shash: "shashwath",
  "ryan rapahel": "ryan raphael",     // typo in the Women's doc
  "yadukrishna ragu": "yadukrishna raghu",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

function resolveMember(raw: string): string | null {
  let n = norm(raw);
  n = NAME_ALIASES[n] ?? n;
  if (!n) return null;
  const parts = n.split(" ");
  const full = BASE_MEMBERS.filter((m) => norm(`${m.firstName} ${m.lastName}`) === n);
  if (full.length === 1) return full[0].email;
  if (parts.length === 1) {
    const exact = BASE_MEMBERS.filter((m) => norm(m.firstName) === n);
    if (exact.length === 1) return exact[0].email;
    const pre = BASE_MEMBERS.filter((m) => norm(m.firstName).startsWith(n));
    if (pre.length === 1) return pre[0].email;
  }
  const loose = BASE_MEMBERS.filter(
    (m) => norm(m.firstName) === parts[0] && norm(m.lastName).startsWith(parts[1] ?? ""),
  );
  return loose.length === 1 ? loose[0].email : null;
}

/* ---------------------------------------------------------------- doc parsing */
/* eslint-disable @typescript-eslint/no-explicit-any */
const runText = (el: any) => (el?.paragraph?.elements ?? []).map((e: any) => e.textRun?.content ?? "").join("");
const cellLines = (c: any): string[] =>
  (c?.content ?? []).map(runText).map((s: string) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const cellText = (c: any) => cellLines(c).join(" ").trim();

export type RawTask = {
  title: string; bullets: string[]; whoLines: string[]; who: string;
  status: string; due: string; notes: string;
};
export type RawMeeting = { tab: string; tabId: string; date: string; tasks: RawTask[] };

function parseTaskTable(tb: any): RawTask[] | null {
  const rows = tb.table.tableRows ?? [];
  const hdr = (rows[0]?.tableCells ?? []).map((c: any) => cellText(c).toLowerCase());
  const col = (...n: string[]) => hdr.findIndex((h: string) => n.some((x) => h.includes(x)));
  const iT = col("task"), iW = col("assigned"), iS = col("status"), iD = col("due", "date due"), iN = col("note", "proof");
  if (iT < 0) return null;
  return rows.slice(1).map((r: any) => {
    const cs = r.tableCells ?? [];
    return {
      title: cellText(cs[iT]), bullets: cellLines(cs[iT]),
      whoLines: iW >= 0 ? cellLines(cs[iW]) : [], who: iW >= 0 ? cellText(cs[iW]) : "",
      status: iS >= 0 ? cellText(cs[iS]) : "", due: iD >= 0 ? cellText(cs[iD]) : "",
      notes: iN >= 0 ? cellText(cs[iN]) : "",
    };
  }).filter((t: RawTask) => t.title);
}

/** Turn a tab title or heading into an ISO date. Everything here is 2026. */
function tabDate(title: string): string | null {
  const slash = title.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (slash) {
    const [, mo, da, yr] = slash;
    const y = yr ? (yr.length === 2 ? 2000 + Number(yr) : Number(yr)) : 2026;
    return `${y}-${String(Number(mo)).padStart(2, "0")}-${String(Number(da)).padStart(2, "0")}`;
  }
  const MON: Record<string, number> = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  const named = title.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s*(\d{1,2})/i);
  if (named) {
    const m = MON[named[1].toLowerCase()];
    return `2026-${String(m).padStart(2, "0")}-${String(Number(named[2])).padStart(2, "0")}`;
  }
  return null;
}

async function fetchDoc(token: string, id: string) {
  const r = await fetch(`https://docs.googleapis.com/v1/documents/${id}?includeTabsContent=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Docs API ${r.status} for ${id}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function meetingsFromDoc(doc: any, group: ProjectGroup): RawMeeting[] {
  const out: RawMeeting[] = [];

  if (group === "E") {
    // One "Agenda" tab; meetings are HEADING_2 date markers followed by tables.
    const tab = doc.tabs?.[0];
    const content = tab?.documentTab?.body?.content ?? [];
    let cur: RawMeeting | null = null;
    for (const el of content) {
      const t = runText(el).replace(/\s+/g, " ").trim();
      if (el.paragraph?.paragraphStyle?.namedStyleType === "HEADING_2" && /^\d{1,2}\/\d{1,2}$/.test(t)) {
        cur = { tab: t, tabId: tab.tabProperties.tabId, date: tabDate(t) ?? "", tasks: [] };
        out.push(cur);
        continue;
      }
      if (el.table && cur) {
        const parsed = parseTaskTable(el);
        if (parsed) cur.tasks.push(...parsed);
      }
    }
    return out;
  }

  // Health and Women's: one tab per meeting; Women's nests a "Tasks <date>" child.
  const walk = (tabs: any[], parent: RawMeeting | null) => {
    for (const t of tabs ?? []) {
      const title = t.tabProperties?.title ?? "";
      const tabId = t.tabProperties?.tabId ?? "";
      const tables = (t.documentTab?.body?.content ?? []).filter((e: any) => e.table);
      const tasks = tables.map(parseTaskTable).filter(Boolean).flat() as RawTask[];

      if (/^tasks/i.test(title) && parent) {
        parent.tasks.push(...tasks);
        walk(t.childTabs, parent);
        continue;
      }
      const date = tabDate(title);
      if (date) {
        const m: RawMeeting = { tab: title, tabId, date, tasks: [...tasks] };
        out.push(m);
        walk(t.childTabs, m);
        continue;
      }
      walk(t.childTabs, parent);
    }
  };
  walk(doc.tabs, null);
  return out;
}

/* ------------------------------------------------------------ field shaping */

/**
 * Due date rules, as specified:
 *   nothing parseable        → null (task still created)
 *   date + explicit time     → that moment
 *   date only                → 11:59 PM that day
 *   "next meeting"           → 8:00 PM on the following meeting's date
 */
function dueAtFor(raw: string, nextMeetingDate: string | null): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  if (/next meeting/i.test(s)) {
    return nextMeetingDate ? `${nextMeetingDate}T20:00:00` : null;
  }

  const d = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!d) return null; // e.g. a bare "Overdue"
  const [, mo, da, yr] = d;
  const y = yr ? (yr.length === 2 ? 2000 + Number(yr) : Number(yr)) : 2026;
  const day = `${y}-${String(Number(mo)).padStart(2, "0")}-${String(Number(da)).padStart(2, "0")}`;

  const t = s.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!t) return `${day}T23:59:00`;
  let hh = Number(t[1]) % 12;
  if (/pm/i.test(t[3])) hh += 12;
  return `${day}T${String(hh).padStart(2, "0")}:${t[2] ?? "00"}:00`;
}

/** A tidy title: first line, de-bulleted, trimmed to something readable. */
function shapeTitle(t: RawTask): string {
  let first = (t.bullets[0] ?? t.title).replace(/^[-•*\s]+/, "").trim();
  // A first line like "Calls:" is a label, not a task — pull in the next line
  // so the title says something on its own.
  let idx = 1;
  while ((first.endsWith(":") || first.length < 16) && t.bullets[idx]) {
    const nxt = t.bullets[idx].replace(/^[-•*\s]+/, "").trim();
    first = first.endsWith(":") ? `${first} ${nxt}` : `${first} — ${nxt}`;
    idx++;
  }
  // Some cells are one long run-on; cut at the first sentence-ish boundary.
  if (first.length > 95) {
    const cut = first.slice(0, 95);
    const at = Math.max(cut.lastIndexOf(" — "), cut.lastIndexOf(": "), cut.lastIndexOf(", "), cut.lastIndexOf(" "));
    first = (at > 40 ? cut.slice(0, at) : cut).trim().replace(/[,:;-]$/, "") + "…";
  }
  return first.replace(/\s+/g, " ") || "Untitled task";
}

/** How many leading bullets shapeTitle() folded into the title. */
function titleConsumed(t: RawTask): number {
  let first = (t.bullets[0] ?? t.title).replace(/^[-•*\s]+/, "").trim();
  let idx = 1;
  while ((first.endsWith(":") || first.length < 16) && t.bullets[idx]) {
    const nxt = t.bullets[idx].replace(/^[-•*\s]+/, "").trim();
    first = first.endsWith(":") ? `${first} ${nxt}` : `${first} — ${nxt}`;
    idx++;
  }
  return idx;
}

/** Everything that didn't fit in the title, plus notes and provenance. */
function shapeDescription(t: RawTask, groupLabel: string, meetingTab: string): string {
  const parts: string[] = [];
  const rest = t.bullets.slice(titleConsumed(t)).map((b) => b.replace(/^[-•*\s]+/, "").trim()).filter(Boolean);
  // If the title got truncated, keep the full original text.
  const firstFull = t.bullets.slice(0, titleConsumed(t)).join(" ").replace(/^[-•*\s]+/, "").trim();
  if (firstFull.length > 95) parts.push(firstFull);
  if (rest.length) parts.push(rest.map((r) => `• ${r}`).join("\n"));
  if (t.notes) parts.push(`Notes: ${t.notes}`);
  if (/extension granted/i.test(t.status)) parts.push("Extension granted at the time of import.");
  if (t.due && !/^\s*\d/.test(t.due)) parts.push(`Due as written in the agenda: ${t.due}`);
  parts.push(`Imported from the ${groupLabel} 2026-2027 agenda — meeting ${meetingTab}.`);
  return parts.join("\n\n");
}

const GROUP_LABEL: Record<ProjectGroup, string> = {
  E: "Education", W: "Women's Empowerment", H: "Health", R: "Water & Sanitation",
};

/* --------------------------------------------------------------- the import */

/** Returns a blocking reason, or null when it's safe to import. */
async function preflight(): Promise<string | null> {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false },
  });

  // 1. Has this already been run? Re-running would duplicate everything.
  const { count: already } = await sb
    .from("lms_tasks")
    .select("*", { count: "exact", head: true })
    .like("description", "%Imported from the %2026-2027 agenda%");
  if ((already ?? 0) > 0)
    return `${already} tasks from a previous import are already present. Delete those first (their descriptions contain "Imported from the ... 2026-2027 agenda") or this run would duplicate them.`;

  return null;
}

export async function POST(req: Request) {
  const me = await getCurrentMember();
  if (!me) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  if (!me.roles.webmaster) return NextResponse.json({ error: "Webmaster only." }, { status: 403 });

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("confirm") !== "IMPORT";

  // ---- preflight ----------------------------------------------------------
  // A half-finished import is worse than none: the first attempt failed partway
  // and had to be unpicked by hand. Both conditions are checked before a single
  // row is written.
  if (!dryRun) {
    const pre = await preflight();
    if (pre) return NextResponse.json({ error: pre }, { status: 409 });
  }

  const auth = await getDriveAccessToken();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: 500 });

  const summary: any = { dryRun, groups: {}, unresolvedNames: [] as string[] };
  const unresolved = new Set<string>();

  for (const [label, src] of Object.entries(SOURCE_DOCS)) {
    const doc = await fetchDoc(auth.token, src.docId);
    const meetings = meetingsFromDoc(doc, src.group)
      .filter((m) => m.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    const gOut: any = { group: src.group, assigner: src.assigner, meetings: [] };

    for (let i = 0; i < meetings.length; i++) {
      const m = meetings[i];
      const nextDate = meetings[i + 1]?.date ?? null;
      // The 9/8 meetings keep their real statuses; everything earlier is history.
      const isLatest = m.date === "2026-09-08";

      const mOut: any = { tab: m.tab, date: m.date, tabId: m.tabId, isLatest, tasks: [] };
      let meetingId: string | null = null;

      if (!dryRun) {
        const created = await createMeeting(src.group, src.assigner, {
          title: `${GROUP_LABEL[src.group]} — ${m.tab}`,
          date: m.date,
          location: "",
          attendees: [],
        });
        meetingId = created.id;
        mOut.meetingId = meetingId;
      }

      for (const t of m.tasks) {
        const rawNames = (t.whoLines.length > 1 ? t.whoLines : t.who.split(/,|&|\band\b|\//))
          .map((s) => s.trim()).filter(Boolean);

        let assignees: string[] = [];
        let placeholderUsed = false;
        if (rawNames.some((n) => /^everyone$/i.test(n)) || rawNames.length === 0) {
          assignees = BASE_MEMBERS.filter((mm) => mm.group === src.group && !mm.hidden).map((mm) => mm.email);
        } else {
          for (const n of rawNames) {
            if (/^everyone$/i.test(n)) continue;
            const e = resolveMember(n);
            if (e) { assignees.push(e); continue; }
            // Named in the agenda but not on the roster (inactive, or never a
            // member). The record still shows their name — it just points at a
            // placeholder address that can't log in or receive mail.
            unresolved.add(n);
            assignees.push(placeholderEmail(n));
            placeholderUsed = true;
          }
        }
        // A task whose only named person isn't on the roster still needs an
        // owner, so it falls to the group's lead rather than vanishing.
        if (assignees.length === 0) assignees = [src.assigner];
        assignees = Array.from(new Set(assignees));

        const status = t.status.trim();
        const live = isLatest && /^not complete$/i.test(status);
        const archived = !live;

        const realDue = dueAtFor(t.due, nextDate);
        const tags: string[] = [];
        if (!realDue) tags.push(TAG_NO_DUE_DATE);
        if (placeholderUsed) tags.push(TAG_PLACEHOLDER_ASSIGNEE);

        const rec: any = {
          title: shapeTitle(t),
          assignees,
          dueAt: realDue,
          tags,
          agendaStatus: status || "(blank)",
          result: live ? "live / not_complete" : archived && /extension granted/i.test(status)
            ? "archived / not_complete (extension)" : "archived / complete",
        };

        if (!dryRun) {
          const tasks = await createTasks(
            {
              title: rec.title,
              description: shapeDescription(t, GROUP_LABEL[src.group], m.tab),
              tags,
              // due_at is NOT NULL and stays that way. A task the agenda gave
              // no deadline for is stored against its meeting date and carries
              // TAG_NO_DUE_DATE, which is what makes the UI show "No due date".
              dueAt: rec.dueAt ?? `${m.date}T23:59:00`,
              requiresFile: false,
              requireSubmission: false,
              emailTemplate: null,
              assigneeEmails: assignees,
            },
            src.assigner,
            meetingId ?? undefined,
          );

          for (const task of tasks) {
            const patch: Record<string, unknown> = {};
            if (live) {
              patch.status = "not_complete";
              patch.archived = false;
            } else {
              patch.archived = true;
              patch.status = /extension granted/i.test(status) ? "not_complete" : "complete";
              if (patch.status === "complete") patch.submitted_at = new Date(`${m.date}T20:00:00`).toISOString();
            }
            await patchTask(task.id, patch);
          }
          rec.created = tasks.length;
        }

        mOut.tasks.push(rec);
      }
      gOut.meetings.push(mOut);
    }
    summary.groups[label] = gOut;
  }

  summary.unresolvedNames = Array.from(unresolved);
  summary.totals = {
    meetings: Object.values(summary.groups).reduce((s: number, g: any) => s + g.meetings.length, 0),
    tasks: Object.values(summary.groups).reduce(
      (s: number, g: any) => s + g.meetings.reduce((x: number, m: any) => x + m.tasks.length, 0), 0),
  };
  return NextResponse.json(summary);
}
