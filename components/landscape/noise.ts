// Small, dependency-free 2D gradient noise + fractal sums, used to shape the
// foothills. Deterministic (seeded), so the landscape is identical on every
// visit and every device.

const PERM = new Uint8Array(512);
(function seed(s: number) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // xorshift shuffle with a fixed seed
  for (let i = 255; i > 0; i--) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    const j = (s >>> 0) % (i + 1);
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})(20120412);

const G = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function grad(h: number, x: number, y: number) { const g = G[h & 7]; return g[0] * x + g[1] * y; }

/** Perlin-style gradient noise in roughly [-1, 1]. */
export function noise2(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const X = xi & 255, Y = yi & 255;
  const aa = PERM[PERM[X] + Y], ab = PERM[PERM[X] + Y + 1];
  const ba = PERM[PERM[X + 1] + Y], bb = PERM[PERM[X + 1] + Y + 1];
  const u = fade(xf), v = fade(yf);
  return lerp(
    lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
    lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
    v,
  ) * 1.4;
}

/** Fractal Brownian motion: smooth rolling hills. */
export function fbm(x: number, y: number, octaves = 5): number {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < octaves; i++) { s += a * noise2(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}

/** Ridged fractal: sharp crests, like Himalayan ridgelines. */
export function ridged(x: number, y: number, octaves = 5): number {
  let a = 0.5, f = 1, s = 0, w = 1;
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(noise2(x * f, y * f));
    n *= n; n *= w; w = Math.min(1, n * 2);
    s += n * a; f *= 2.1; a *= 0.5;
  }
  return s;
}

/** Tiny seeded PRNG for scattering trees and houses. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
