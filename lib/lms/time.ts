/**
 * Wall-clock times for the club, which lives in Berkeley.
 *
 * `due_at` is a timestamptz and the server runs in UTC, so a naive string like
 * "2026-07-21T23:59:00" is read as 11:59 PM UTC — which is 4:59 PM here. Every
 * imported deadline landed seven hours early because of exactly that. Anything
 * that means a local wall-clock time has to be converted explicitly.
 */
export const CLUB_TZ = "America/Los_Angeles";

/** Milliseconds the club's timezone is offset from UTC at a given instant. */
function tzOffsetMs(at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: CLUB_TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value])) as Record<string, string>;
  const asIfUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  return asIfUtc - at.getTime();
}

/**
 * The exact instant of a local wall-clock time, as an ISO string.
 *
 * Resolved twice because the offset itself depends on the instant: on the two
 * DST changeover days a single pass can land an hour out.
 */
export function clubTimeToISO(
  year: number, month: number, day: number, hour = 23, minute = 59,
): string {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  let ts = naive;
  for (let i = 0; i < 2; i++) ts = naive - tzOffsetMs(new Date(ts));
  return new Date(ts).toISOString();
}

/** Same, from "YYYY-MM-DD" plus an optional time. */
export function clubDateToISO(day: string, hour = 23, minute = 59): string {
  const [y, m, d] = day.split("-").map(Number);
  return clubTimeToISO(y, m, d, hour, minute);
}
