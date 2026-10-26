// The shape of the land, shared by the background worker (which builds the
// heavy geometry) and the scene (which only asks "how high is the ground
// here?" to keep the camera above it). Plain maths, no three.js.

import { fbm, ridged, noise2, rng } from "./noise";

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export const VILLAGE = { x: 30, z: -270 };
const STEP = 6.5; // terrace height

export const valleyX = (z: number) => 70 * Math.sin(z * 0.0035) - 30;

/** Height of the natural land (before terracing). */
export function natural(x: number, z: number): number {
  const dist = Math.max(0, -z + 100);
  let h = fbm(x * 0.0024, z * 0.0024, 5) * 70 + 40;
  h += ridged(x * 0.0016 + 3.1, z * 0.0016 - 1.7, 5) * (60 + dist * 0.3);
  const far = smooth(-850, -1500, z);
  h += far * (ridged(x * 0.0011, z * 0.0011 + 5, 6) * 640 + 160);
  const dv = (x - valleyX(z)) / (150 + dist * 0.1);
  h -= 75 * Math.exp(-dv * dv) * (1 - far);
  return h;
}

/** How much of the village's terraced hillside applies here (0..1). */
export const villageMask = (x: number, z: number) => smooth(270, 120, Math.hypot(x - VILLAGE.x, z - VILLAGE.z));

const hillside = (x: number, z: number) => 44 + (VILLAGE.z - z) * 0.42 + fbm(x * 0.01, z * 0.01, 3) * 9 + Math.abs(x - VILLAGE.x) * 0.06;

/** Final height, with terraces cut into the village hillside. */
export function height(x: number, z: number): { h: number; band: number; riser: boolean; m: number } {
  const m = villageMask(x, z);
  let h = mix(natural(x, z), hillside(x, z), m * 0.9);
  let band = -1, riser = false;
  if (m > 0.05) {
    const q = h / STEP, fl = Math.floor(q), fr = q - fl;
    const stepped = (fl + smooth(0.78, 1, fr)) * STEP; // flat field, then a short riser
    h = mix(h, stepped, Math.min(1, m * 1.4));
    band = fl; riser = fr > 0.78;
  }
  return { h, band, riser, m };
}

// ---- colours (linear-ish RGB 0..1, converted from the dawn palette) --------------
const hex = (s: string): [number, number, number] => {
  const n = parseInt(s.slice(1), 16);
  // sRGB → linear so three.js lighting treats them correctly
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
};
const P = {
  forest: hex("#3f6b3c"), meadow: hex("#6f9a52"), rock: hex("#8c877b"), snow: hex("#f4f6f8"),
  fields: [hex("#86ad55"), hex("#cfae5a"), hex("#5f9446")], riser: hex("#8b7a56"),
};
const lerp3 = (o: number[], c: [number, number, number], t: number) => { o[0] += (c[0] - o[0]) * t; o[1] += (c[1] - o[1]) * t; o[2] += (c[2] - o[2]) * t; };

function colorAt(x: number, z: number, hgt: ReturnType<typeof height>, o: number[]) {
  const { h, band, riser, m } = hgt;
  const e = 3;
  const slope = Math.hypot(height(x + e, z).h - height(x - e, z).h, height(x, z + e).h - height(x, z - e).h) / (2 * e);
  o[0] = P.forest[0]; o[1] = P.forest[1]; o[2] = P.forest[2];
  lerp3(o, P.meadow, smooth(20, 160, h) * 0.8);
  lerp3(o, P.rock, smooth(0.8, 1.5, slope) * 0.85);
  lerp3(o, P.rock, smooth(260, 420, h));
  const snowLine = 430 + noise2(x * 0.01, z * 0.01) * 60;
  lerp3(o, P.snow, smooth(snowLine, snowLine + 70, h) * smooth(0.0, 1.6, 2 - slope));
  if (m > 0.3 && band >= 0) lerp3(o, riser ? P.riser : P.fields[((band % 3) + 3) % 3], smooth(0.3, 0.6, m));
  const v = 1 + noise2(x * 0.05, z * 0.05) * 0.06;
  o[0] *= v; o[1] *= v; o[2] *= v;
}

/** One terrain sheet laid out exactly like THREE.PlaneGeometry rotated flat. */
export function buildSheet(cx: number, cz: number, w: number, d: number, segX: number, sinkVillage: number) {
  const segZ = Math.round(segX * d / w);
  const count = (segX + 1) * (segZ + 1);
  const heights = new Float32Array(count), colors = new Float32Array(count * 3);
  const o = [0, 0, 0];
  let i = 0;
  for (let iz = 0; iz <= segZ; iz++) {
    const z = cz + (iz * d) / segZ - d / 2;
    for (let ix = 0; ix <= segX; ix++, i++) {
      const x = cx + (ix * w) / segX - w / 2;
      const hg = height(x, z);
      heights[i] = hg.h - hg.m * sinkVillage;
      colorAt(x, z, hg, o);
      colors[i * 3] = o[0]; colors[i * 3 + 1] = o[1]; colors[i * 3 + 2] = o[2];
    }
  }
  return { heights, colors, segX, segZ };
}

/** Deodar pines: [x, y, z, rotY, scaleXZ, scaleY] and a colour shade each. */
export function placePines(count: number) {
  const r = rng(77);
  const out: number[] = [], shade: number[] = [];
  let tries = 0;
  while (out.length / 6 < count && tries++ < count * 30) {
    const x = (r() - 0.5) * 1500, z = 650 - r() * 1650;
    const { h, m } = height(x, z);
    if (m > 0.12 || h > 270) continue;
    if (fbm(x * 0.008 + 9, z * 0.008, 3) < -0.05) continue; // forests grow in patches
    const e = 4, slope = Math.hypot(height(x + e, z).h - height(x - e, z).h, height(x, z + e).h - height(x, z - e).h) / (2 * e);
    if (slope > 1.25) continue;
    const sc = 7 + r() * 7;
    out.push(x, h - 1, z, r() * Math.PI * 2, sc, sc * (0.9 + r() * 0.35));
    shade.push((r() - 0.5) * 0.16);
  }
  return { pines: new Float32Array(out), shade: new Float32Array(shade) };
}

/** Village houses on the terrace flats: [x, groundY, z, rotY, w, h, d, colourIndex]. */
export function placeHouses(count: number) {
  const r = rng(4);
  const out: number[] = [];
  let tries = 0;
  while (out.length / 8 < count && tries++ < 5000) {
    const a = r() * Math.PI * 2, rad = 25 + r() * 105;
    const x = VILLAGE.x + Math.cos(a) * rad * 1.2, z = VILLAGE.z + Math.sin(a) * rad * 0.8;
    const t = height(x, z);
    if (t.m < 0.6 || t.riser) continue;
    out.push(x, t.h, z, (r() - 0.5) * 0.3, 7 + r() * 5, 5 + r() * 3, 6 + r() * 4, Math.floor(r() * 5));
  }
  return new Float32Array(out);
}

/** Valley mist: [x, y, z, scale, opacity]. Thinner near the village so it reads. */
export function placeMist(count: number) {
  const r = rng(13);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const z = 420 - r() * 1500, x = valleyX(z) + (r() - 0.5) * 360;
    const nearVillage = smooth(320, 140, Math.hypot(x - VILLAGE.x, z - VILLAGE.z));
    out.push(x, natural(x, z) + 18 + r() * 30, z, 160 + r() * 260, (0.3 + r() * 0.26) * (1 - nearVillage * 0.85));
  }
  return new Float32Array(out);
}
