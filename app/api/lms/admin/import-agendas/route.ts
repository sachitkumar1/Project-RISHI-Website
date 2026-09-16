import crypto from "crypto";
import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { createMeeting } from "@/lib/lms/meetings";
import { createTasks, patchTask } from "@/lib/lms/store";
import { BASE_MEMBERS } from "@/lib/members";
import { getDriveAccessToken } from "@/lib/lms/drive";
import type { ProjectGroup } from "@/lib/lms/types";
import { clubDateToISO } from "@/lib/lms/time";
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
  WatSan:   { docId: "1dyxBP-lOKb5k_mI5FgbhP1hH9s34gAE6cRBFpEygHyI", group: "R", assigner: "riaprathinidhi1@berkeley.edu" },
};

/** Names in the docs that don't match the roster cleanly. */
const NAME_ALIASES: Record<string, string> = {
  shash: "shashwath",
  "ryan rapahel": "ryan raphael",              // typo in the Women's doc
  "yadukrishna ragu": "yadukrishna raghu",
  "ryan chittilappilly raphael": "ryan raphael",
  "ramit dharne": "ramit goyal",               // typo in the WatSan doc
  "maia berges": "maia berges voorhis",
  shrivishal: "srivishal",
};

/* -------------------------------------------------------------- statuses ---
   Four docs, four vocabularies. "Completed"/"complete"/"Done" all mean done;
   "In Progress"/"Not Started"/"Incomplete"/"Not Complete"/"Overdue" all mean
   it is still outstanding and the task should be LIVE on someone's dashboard.
   Some cells carry a status per person ("Thanuj: Extension Arya: Not Complete")
   and those are read per assignee rather than flattened to one verdict.        */

export type TaskState = "complete" | "open" | "extension" | "unknown";

function readState(raw: string): TaskState {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return "unknown";
  if (/extension/.test(t)) return "extension";
  // Check "not complete"/"incomplete" BEFORE "complete", or the substring wins.
  if (/\b(not started|not complete|incomplete|in progress|overdue|pending)\b/.test(t)) return "open";
  if (/\bcomplete|completed|done\b/.test(t)) return "complete";
  if (/late/.test(t)) return "complete"; // done, just after the deadline
  return "unknown";
}

/**
 * A status cell that names people ("Thanuj: Extension Arya: Not Complete").
 * Returns a lookup from lower-cased first name to that person's own state.
 */
function perPersonStates(raw: string): Map<string, TaskState> {
  const out = new Map<string, TaskState>();
  const t = (raw ?? "").trim();
  if (!t.includes(":")) return out;
  // Split before each "Name:" so each chunk is one person's verdict.
  const chunks = t.split(/(?=[A-Z][a-zA-Z]*(?:,\s*[A-Z][a-zA-Z]*)*\s*:)/).filter(Boolean);
  for (const chunk of chunks) {
    const at = chunk.indexOf(":");
    if (at < 0) continue;
    const names = chunk.slice(0, at).split(/,|&|\band\b/).map((n) => n.trim()).filter(Boolean);
    const state = readState(chunk.slice(at + 1));
    if (state === "unknown") continue;
    for (const n of names) out.set(n.toLowerCase(), state);
  }
  return out;
}

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
  // Handles "Sept 8", "September 8th, 2026" and "PW #3 - Aug 12".
  const named = title.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s*(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?/i);
  if (named) {
    const m = MON[named[1].toLowerCase()];
    const y = named[3] ? Number(named[3]) : 2026;
    return `${y}-${String(m).padStart(2, "0")}-${String(Number(named[2])).padStart(2, "0")}`;
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
    return nextMeetingDate ? clubDateToISO(nextMeetingDate, 20, 0) : null;
  }

  const d = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!d) {
    // WatSan writes deadlines as "Sep 15, 2026" rather than 9/15/26.
    const MON: Record<string, number> = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
    const nm = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s*(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?/i);
    if (!nm) return null; // e.g. a bare "Overdue"
    return clubDateToISO(
      `${nm[3] ? Number(nm[3]) : 2026}-${String(MON[nm[1].toLowerCase()]).padStart(2, "0")}-${String(Number(nm[2])).padStart(2, "0")}`,
      23, 59,
    );
  }
  const [, mo, da, yr] = d;
  const y = yr ? (yr.length === 2 ? 2000 + Number(yr) : Number(yr)) : 2026;
  const day = `${y}-${String(Number(mo)).padStart(2, "0")}-${String(Number(da)).padStart(2, "0")}`;

  const t = s.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  // Deadlines are written in Berkeley local time, so convert rather than
  // handing Postgres a naive string it would read as UTC.
  if (!t) return clubDateToISO(day, 23, 59);
  let hh = Number(t[1]) % 12;
  if (/pm/i.test(t[3])) hh += 12;
  return clubDateToISO(day, hh, Number(t[2] ?? 0));
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

    const gOut: any = { group: src.group, assigner: src.assigner, meetings: [], carriedForward: 0 };

    /**
     * Some meetings restate the previous week's table verbatim to update its
     * statuses — Health's PW #5 and PW #6 are the same nine tasks. Importing
     * both would double them. A task is treated as carried forward only when
     * the title AND the written due date match exactly, so a genuinely
     * repeated task with a new deadline still comes through as its own task.
     */
    const lastSeen = new Map<string, number>();
    meetings.forEach((mm, idx) => {
      for (const t of mm.tasks) lastSeen.set(`${t.title.trim().toLowerCase()}|${t.due.trim().toLowerCase()}`, idx);
    });

    for (let i = 0; i < meetings.length; i++) {
      const m = meetings[i];
      const nextDate = meetings[i + 1]?.date ?? null;
      // Status now comes from each row, so no meeting is special any more.

      const mOut: any = { tab: m.tab, date: m.date, tabId: m.tabId, tasks: [] };
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
        const carryKey = `${t.title.trim().toLowerCase()}|${t.due.trim().toLowerCase()}`;
        if (lastSeen.get(carryKey) !== i) { gOut.carriedForward++; continue; } // a later meeting has the current version
        const rawNames = (t.whoLines.length > 1 ? t.whoLines : t.who.split(/,|&|\band\b|\//))
          .map((s) => s.trim()).filter(Boolean);

        // Each assignee is kept alongside the name the agenda used, because a
        // per-person status cell refers to people by first name.
        const people: { email: string; name: string }[] = [];
        let placeholderUsed = false;
        if (rawNames.some((n) => /^everyone$/i.test(n)) || rawNames.length === 0) {
          for (const mm of BASE_MEMBERS.filter((x) => x.group === src.group && !x.hidden))
            people.push({ email: mm.email, name: mm.firstName });
        } else {
          for (const n of rawNames) {
            if (/^everyone$/i.test(n)) continue;
            const e = resolveMember(n);
            if (e) { people.push({ email: e, name: n }); continue; }
            // Named in the agenda but no longer on the roster. The work still
            // has to belong to someone, so it falls to the group's lead as
            // their own task rather than to an address that can't be used.
            unresolved.add(n);
            people.push({ email: src.assigner, name: n });
            placeholderUsed = true;
          }
        }
        if (people.length === 0) people.push({ email: src.assigner, name: "Lead" });

        // Dedupe by email, keeping the first name we saw for each.
        const byEmail = new Map<string, { email: string; name: string }>();
        for (const pp of people) if (!byEmail.has(pp.email)) byEmail.set(pp.email, pp);
        const roster = Array.from(byEmail.values());
        const assignees = roster.map((r) => r.email);

        const status = t.status.trim();
        const perPerson = perPersonStates(status);
        const overall = readState(status);

        /** This person's state: their own verdict if the cell named them. */
        const stateFor = (name: string): TaskState => {
          const own = perPerson.get(name.trim().toLowerCase());
          if (own) return own;
          return perPerson.size > 0 ? "open" : overall;
        };

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
          states: roster.map((r) => `${r.name}:${stateFor(r.name)}`),
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
              dueAt: rec.dueAt ?? clubDateToISO(m.date, 23, 59),
              requiresFile: false,
              requireSubmission: false,
              emailTemplate: null,
              assigneeEmails: assignees,
            },
            src.assigner,
            meetingId ?? undefined,
          );

          for (const task of tasks) {
            const who = roster.find((r) => r.email === task.assigneeEmail);
            const state = stateFor(who?.name ?? "");
            const patch: Record<string, unknown> = {};

            if (state === "open") {
              // Still outstanding: a real, live task on that person's board.
              patch.status = "not_complete";
              patch.archived = false;
            } else if (state === "extension") {
              // Excused rather than finished — archived, but never marked done.
              patch.status = "not_complete";
              patch.archived = true;
            } else {
              // "complete", and "unknown" too: a blank status on a meeting that
              // has long passed means finished, not outstanding. Reopening
              // dozens of historical tasks nobody is working on would be worse
              // than filing them as done.
              patch.status = "complete";
              patch.archived = true;
              patch.submitted_at = clubDateToISO(m.date, 20, 0);
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
