// The home page's descent from the ranges down to a hillside village, as real
// photographs. Each shot has a depth map (scripts/landscape/prepare_photos.py)
// so the live scene can move a camera *into* the photo with true parallax.
// Shared by the WebGL scene (journey.ts) and the photo layer that paints first
// and stands in for it (PhotoJourney.tsx).

export type Shot = {
  name: string;
  /** width / height of the prepared photo */
  aspect: number;
  /** what to keep in frame when the screen is narrower than the photo (0..1) */
  focusX: number;
  focusY: number;
  /** how far the camera pushes in over the shot, as a fraction of the nearest depth */
  push: number;
  /** sideways / upward drift over the shot (fraction of the nearest depth) */
  driftX: number;
  driftY: number;
  /** far / near distance ratio: how strongly depth separates (parallax strength) */
  depthRatio: number;
  /** valley mist strength */
  mist: number;
  /** birds cross this shot's sky */
  birds: boolean;
  alt: string;
};

export const SHOTS: Shot[] = [
  { name: "ranges", aspect: 2200 / 1650, focusX: 0.5, focusY: 0.42, push: 0.42, driftX: 0.02, driftY: 0.03, depthRatio: 9, mist: 0.3, birds: true,
    alt: "Forested ridges and blue mountains under a summer sky, near Bharog Baneri" },
  { name: "valley", aspect: 3840 / 2124, focusX: 0.4, focusY: 0.55, push: 0.38, driftX: -0.03, driftY: -0.02, depthRatio: 6, mist: 0.24, birds: true,
    alt: "A Himachal valley from above: a river winding past green terraced fields and scattered houses" },
  { name: "terraces", aspect: 3840 / 2560, focusX: 0.68, focusY: 0.5, push: 0.36, driftX: 0.03, driftY: -0.01, depthRatio: 4.5, mist: 0.12, birds: false,
    alt: "Terraced fields of young wheat climbing a hillside, with slate-roofed village houses" },
  { name: "village", aspect: 3840 / 2560, focusX: 0.45, focusY: 0.45, push: 0.34, driftX: -0.02, driftY: 0.01, depthRatio: 4.5, mist: 0.1, birds: false,
    alt: "Stone and slate houses above curving terraces of green crops in a Himachal village" },
];

/**
 * How much bigger than "cover" a shot is drawn, so camera moves never show its
 * edges. The photo layer scales by the same amount, so the live scene fades in
 * over it without the picture shifting.
 */
export const overscan = (s: Shot) => 1.12 + 1.5 * (Math.abs(s.driftX) + Math.abs(s.driftY));

/** Uniform zoom that approximates the live camera's push-in (for the photo layer). */
export const photoScale = (s: Shot, t: number) => overscan(s) * (1 + 0.14 * Math.max(-0.3, Math.min(1, t)));

export const shotSrc = (name: string, width: 1440 | 2560, ext: "avif") => `/images/landscape/${name}-${width}.${ext}`;
export const shotFallback = (name: string) => `/images/landscape/${name}-1600.webp`;
export const shotDepth = (name: string) => `/images/landscape/${name}-depth.png`;

/**
 * Where the page is in the journey: 0 = first shot composed, 1 = second shot
 * composed, … Each shot is composed when its anchor (an element with
 * data-shot="n") is centred on screen; in between, the camera pushes on and
 * the next shot dissolves in while a solid panel passes in front.
 */
export function journeyPosition(anchors: number[], viewportCenter: number): number {
  const n = anchors.length;
  if (n === 0) return 0;
  if (n === 1 || viewportCenter <= anchors[0]) {
    return Math.max(0, n > 1 ? (viewportCenter - anchors[0]) / (anchors[1] - anchors[0]) : 0);
  }
  for (let i = 0; i < n - 1; i++) {
    if (viewportCenter < anchors[i + 1]) return i + (viewportCenter - anchors[i]) / (anchors[i + 1] - anchors[i]);
  }
  // past the last shot: keep drifting in, but never dissolve into nothing
  const last = anchors[n - 1], span = anchors[n - 1] - anchors[n - 2];
  return n - 1 + Math.min(0.6, (viewportCenter - last) / span);
}

/** Camera progress through shot k (−0.3 while it dissolves in … 1 as it hands over). */
export const DISSOLVE_START = 0.66;
export function shotWeights(pos: number, count: number) {
  const k = Math.min(count - 1, Math.floor(pos));
  const f = pos - k;
  const out: { index: number; t: number; alpha: number }[] = [{ index: k, t: f, alpha: 1 }];
  if (k + 1 < count && f > DISSOLVE_START) {
    const a = (f - DISSOLVE_START) / (1 - DISSOLVE_START);
    out.push({ index: k + 1, t: -0.3 * (1 - a), alpha: a * a * (3 - 2 * a) });
  }
  return out;
}
