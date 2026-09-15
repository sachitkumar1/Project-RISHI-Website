/**
 * Markers for tasks brought over from the 2026-2027 agenda docs.
 *
 * Some agenda rows don't carry enough information to be a real task: no due
 * date was ever written down, or the person named isn't on the roster. Those
 * still need to exist so the history is complete, so they're imported as
 * faithful-looking records with these markers in the existing `tags` column.
 *
 * Using tags rather than new columns is deliberate: no migration, no change to
 * `due_at` nullability, and nothing about tasks already on the site is altered.
 * Anything carrying a marker is a stand-in, not live work.
 */
export const TAG_NO_DUE_DATE = "imported:no-due-date";
export const TAG_PLACEHOLDER_ASSIGNEE = "imported:placeholder-assignee";

/** Domain for people named in an agenda who have no account on the site. */
export const PLACEHOLDER_DOMAIN = "imported.invalid";

export const isPlaceholderEmail = (email: string) =>
  email.toLowerCase().endsWith(`@${PLACEHOLDER_DOMAIN}`);

/** "sara.khemani@imported.invalid" → "Sara Khemani" */
export function placeholderName(email: string): string {
  return email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/** Build the address used to stand in for a person with no account. */
export const placeholderEmail = (name: string) =>
  `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}@${PLACEHOLDER_DOMAIN}`;

/** Markers are bookkeeping, not labels the club chose — keep them off the UI. */
export const isImportMarker = (tag: string) => tag.startsWith("imported:");

/** A task whose due date is a stand-in shows no date at all. */
export const hasRealDueDate = (tags: string[] | null | undefined) =>
  !(tags ?? []).includes(TAG_NO_DUE_DATE);
