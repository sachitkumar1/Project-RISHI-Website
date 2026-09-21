/**
 * Next week's meeting pages, created automatically.
 *
 * The groups meet on Tuesdays. From 12:00 AM Pacific on the Wednesday after a
 * meeting, each project group should already have a page for the following
 * Tuesday — e.g. after the Sep 15 meeting, Sep 22's pages exist from 12:00 AM on
 * Sep 16.
 *
 * ensureUpcomingMeetings() is idempotent: it creates only what's missing, so
 * it's safe to call from several places. It runs from the reminders cron
 * (every 5 min) and whenever anyone opens a group's meeting list, so a page
 * exists by the time anyone looks, even if a scheduler is down.
 *
 * Titles follow each group's own style: the group's latest title with its date
 * swapped for the new one ("Education — 09/15" → "Education — 09/22",
 * "Health — PW #6- Sept 15" → "Health — PW #7- Sept 22").
 *
 * Set AUTO_MEETINGS=off in Vercel to pause it (e.g. over winter break).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createMeeting, listMeetings } from "./meetings";
import { PROJECT_GROUP_LABELS, type ProjectGroup } from "./types";

const GROUPS: ProjectGroup[] = ["E", "R", "W", "H"];
export const AUTO_CREATOR = "auto@ucbprojectrishi.org";
const TZ = "America/Los_Angeles";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
let _c: SupabaseClient | null = null;
const sb = () => (_c ??= createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } }));

// ---------------------------------------------------------------- dates
/** Today's date in Pacific time, as yyyy-mm-dd. */
export function pacificToday(now = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`); // noon UTC: date arithmetic never crosses a day boundary
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay(); // 0 Sun … 2 Tue

/**
 * The Tuesday whose page should exist right now: the Tuesday after the most
 * recent Tuesday that is already over. On a Tuesday itself that's today (its
 * page was made the previous Wednesday); Wednesday to Monday it's next Tuesday.
 */
export function upcomingTuesday(now = new Date()): string {
  const today = pacificToday(now);
  const back = (weekday(today) - 2 + 7) % 7 || 7; // days since the last FINISHED Tuesday
  return addDays(addDays(today, -back), 7);
}

// ---------------------------------------------------------------- titles
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ordinal = (n: number) => {
  const t = n % 100;
  return `${n}${t >= 11 && t <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
};

/**
 * Re-date a title in its own style. Handles "09/15", "9/15/26", "9/15/2026",
 * "September 15th", "Sept 15", "Sep. 15, 2026" and bumps a "#6" to "#7".
 * Returns null if the title has no recognisable date.
 */
export function redateTitle(title: string, newDate: string, zeroPad?: boolean): string | null {
  const [y, m, d] = newDate.split("-").map(Number);
  let out: string | null = null;

  // numeric: M/D, MM/DD, M/D/YY, M/D/YYYY
  const num = title.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?(?!\d)/);
  if (num) {
    // Zero-padding can't be read off "12/29", so the caller passes what the
    // group's recent titles show; otherwise a leading 0 in this title decides.
    const padded = zeroPad ?? (num[1].startsWith("0") || num[2].startsWith("0"));
    const pad = (v: number) => (padded ? String(v).padStart(2, "0") : String(v));
    const yr = num[3] ? (num[3].length === 4 ? String(y) : String(y).slice(2)) : null;
    out = title.replace(num[0], `${pad(m)}/${pad(d)}${yr ? `/${yr}` : ""}`);
  } else {
    // month name: "September 15th", "Sept 15", "Sep. 15, 2026"
    const re = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)(\.?)(\s+)(\d{1,2})(st|nd|rd|th)?(,?\s*\d{4})?/i;
    const mm = title.match(re);
    if (mm) {
      // Keep the style: a full month name stays full ("September" → "October");
      // an abbreviation stays abbreviated ("Sept"/"Sep" → "Oct").
      const isFull = MONTHS.some((x) => x.toLowerCase() === mm[1].toLowerCase());
      const name = isFull
        ? MONTHS[m - 1]
        : mm[1].toLowerCase() === "sept" ? (m === 9 ? "Sept" : SHORT[m - 1]) : SHORT[m - 1];
      const day = mm[5] ? ordinal(d) : String(d);
      const year = mm[6] ? mm[6].replace(/\d{4}/, String(y)) : "";
      out = title.replace(mm[0], `${name}${mm[2]}${mm[3]}${day}${year}`);
    }
  }
  if (out === null) return null;
  // "PW #6" → "PW #7": the running meeting number
  return out.replace(/#(\d+)/, (_, n: string) => `#${Number(n) + 1}`);
}

function titleFor(group: ProjectGroup, recentTitles: string[], date: string): string {
  const zeroPad = recentTitles.some((t) => /(^|[^\d])0\d\/|\/0\d(?!\d)/.test(t)) ? true : undefined;
  // The most recent title that actually contains a date (a page titled just
  // "Water and Sanitation" can't show the style, so look further back).
  for (const t of recentTitles) {
    const redated = redateTitle(t, date, zeroPad);
    if (redated) return redated;
  }
  const [y, m, d] = date.split("-").map(Number);
  return `${PROJECT_GROUP_LABELS[group]} — ${m}/${d}/${String(y).slice(2)}`;
}

// ---------------------------------------------------------------- ensure
const LOCK_KEY = "meetings:auto-lock";

export type EnsureResult = { date: string; created: { group: ProjectGroup; title: string }[]; skipped?: string };

export async function ensureUpcomingMeetings(now = new Date()): Promise<EnsureResult> {
  const date = upcomingTuesday(now);
  if ((process.env.AUTO_MEETINGS ?? "").toLowerCase() === "off") return { date, created: [], skipped: "AUTO_MEETINGS=off" };
  if (!usingSupabase) return { date, created: [], skipped: "no database" };

  // Cheap check first: one query for which groups already have that date.
  const have = async () => {
    const { data, error } = await sb().from("lms_meetings").select("group_code").eq("meeting_date", date);
    if (error) throw new Error(error.message);
    return new Set((data ?? []).map((r) => r.group_code as string));
  };
  let present = await have();
  if (GROUPS.every((g) => present.has(g))) return { date, created: [] };

  // Something's missing: take a short lock so two triggers can't both create it.
  const { data: lock } = await sb().from("lms_settings").select("value").eq("key", LOCK_KEY).maybeSingle();
  if (lock?.value && Date.now() - Date.parse(lock.value) < 60_000) return { date, created: [], skipped: "another run is creating them" };
  const stamp = new Date().toISOString();
  await sb().from("lms_settings").upsert({ key: LOCK_KEY, value: stamp, updated_at: stamp }, { onConflict: "key" });
  try {
    present = await have(); // re-check inside the lock
    const created: EnsureResult["created"] = [];
    for (const g of GROUPS) {
      if (present.has(g)) continue;
      const past = (await listMeetings(g)).filter((mt) => mt.date && mt.date < date); // newest first
      const latest = past[0];
      const title = titleFor(g, past.slice(0, 6).map((mt) => mt.title), date);
      await createMeeting(g, AUTO_CREATOR, { title, date, location: latest?.location ?? "" });
      created.push({ group: g, title });
    }
    return { date, created };
  } finally {
    await sb().from("lms_settings").delete().eq("key", LOCK_KEY);
  }
}
