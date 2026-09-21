/**
 * Dashboard banner choices — shared by the page (to draw them) and the server
 * (to validate them). No server imports here.
 *
 * Every option is designed for the white "Welcome, …" text on top of it: dark
 * colours/gradients, and photos under a darkening overlay.
 */
export type BannerChoice =
  | { kind: "preset"; id: string }
  | { kind: "photo"; id: string; pos: number }   // pos: vertical focus, 0 (top) – 100 (bottom)
  | { kind: "upload"; path: string; pos: number };

export type BannerPreset = {
  id: string;
  name: string;
  /** CSS background; null = the site's standard pine banner (dark-mode aware). */
  background: string | null;
  /** The contour-line texture drawn over it. */
  contours: { color: string; opacity: number } | null;
};

export const BANNER_PRESETS: BannerPreset[] = [
  { id: "pine", name: "Pine", background: null, contours: { color: "#FBF8F1", opacity: 0.12 } },
  { id: "midnight", name: "Midnight", background: "#0F2A1F", contours: { color: "#F2C879", opacity: 0.1 } },
  { id: "terraces", name: "Terraces", background: "linear-gradient(180deg, #1E4D3A 0%, #143628 100%)", contours: { color: "#F2C879", opacity: 0.22 } },
  { id: "dusk", name: "Valley dusk", background: "linear-gradient(115deg, #143628 0%, #1E4D3A 45%, #8A5A12 100%)", contours: { color: "#FBF8F1", opacity: 0.1 } },
  { id: "saffron", name: "Saffron", background: "linear-gradient(135deg, #B06E12 0%, #7A3E0E 100%)", contours: { color: "#FBF8F1", opacity: 0.12 } },
  { id: "dawn", name: "Himalayan dawn", background: "linear-gradient(160deg, #2B2140 0%, #6E3448 55%, #B8741A 100%)", contours: { color: "#FBF8F1", opacity: 0.1 } },
  { id: "monsoon", name: "Monsoon", background: "linear-gradient(135deg, #16323F 0%, #24545F 55%, #1E4D3A 100%)", contours: { color: "#FBF8F1", opacity: 0.12 } },
  { id: "charcoal", name: "Charcoal", background: "linear-gradient(135deg, #1B2620 0%, #0E1411 100%)", contours: { color: "#7CC4A0", opacity: 0.12 } },
];

export type BannerPhoto = { id: string; name: string; src: string; pos: number };

/** Photos already on the site (public/images) — the club's own. */
export const BANNER_PHOTOS: BannerPhoto[] = [
  { id: "himalayas", name: "The Himalayas", src: "/images/hero-bg.jpg", pos: 40 },
  { id: "team", name: "The team", src: "/images/team-photo.jpg", pos: 30 },
  { id: "evening", name: "Evening together", src: "/images/gallery/IMG_2908_Original.jpg", pos: 55 },
  { id: "fieldwork", name: "In the field", src: "/images/projects/primary-school-well.jpg", pos: 50 },
];

export const DEFAULT_BANNER: BannerChoice = { kind: "preset", id: "pine" };

const clampPos = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
};

/** Parse/validate a stored or submitted choice; anything invalid → null. */
export function parseBanner(v: unknown): BannerChoice | null {
  let o: unknown = v;
  if (typeof v === "string") { try { o = JSON.parse(v); } catch { return null; } }
  if (!o || typeof o !== "object") return null;
  const c = o as Record<string, unknown>;
  if (c.kind === "preset" && BANNER_PRESETS.some((p) => p.id === c.id)) return { kind: "preset", id: String(c.id) };
  if (c.kind === "photo" && BANNER_PHOTOS.some((p) => p.id === c.id)) return { kind: "photo", id: String(c.id), pos: clampPos(c.pos) };
  if (c.kind === "upload" && typeof c.path === "string" && /^banners\/[a-f0-9]{40}\/\d+\.(jpg|png|webp)$/.test(c.path))
    return { kind: "upload", path: c.path, pos: clampPos(c.pos) };
  return null;
}
