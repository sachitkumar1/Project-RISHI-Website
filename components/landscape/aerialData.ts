// Terrain data for the 3D aerial scene (aerial.ts): real elevation around
// Bharog Baneri's area of Sirmaur, baked by scripts/landscape/bake_terrain.py.
// Shared by the background worker (which turns height images into geometry)
// and the scene. No three.js here.

/** One region of terrain: a north-up grid in local metres (x east, y north). */
export type Region = {
  name: "detail" | "mid" | "far";
  /** km east of the centre, west → east */
  xr: [number, number];
  /** km north of the centre, south → north */
  yr: [number, number];
  /** height samples (columns, rows) */
  grid: [number, number];
};

// Centre: 30.600° N, 77.460° E (Renuka / Dadahu, Sirmaur).
export const REGIONS: Region[] = [
  { name: "detail", xr: [-8, 8], yr: [-12, 8], grid: [640, 800] },
  { name: "mid", xr: [-22, 22], yr: [-20, 40], grid: [440, 600] },
  { name: "far", xr: [-180, 180], yr: [-80, 280], grid: [360, 360] },
];

export const heightUrl = (r: Region) => `/images/landscape/terrain-${r.name}-height.png`;
export const colorUrl = (r: Region, small: boolean) => `/images/landscape/terrain-${r.name}${small ? "-sm" : ""}.avif`;

export type Built = {
  name: Region["name"];
  /** vertex positions in scene space: x east, y up, z = −north (metres) */
  positions: Float32Array;
  index: Uint32Array;
  /** full-resolution heights (row 0 = north) as half floats, for the valley-fog lookup */
  heights: Uint16Array;
};

/** float → IEEE half (for a half-float texture), done here so the page doesn't have to. */
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
function toHalf(v: number) {
  f32[0] = v;
  const x = u32[0], sign = (x >> 16) & 0x8000;
  let e = ((x >> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
  if (e <= 0) return sign;                         // tiny → 0 (heights never are)
  if (e >= 31) return sign | 0x7c00;               // overflow → inf
  m = m + 0x1000;                                  // round
  if (m & 0x800000) { m = 0; e += 1; if (e >= 31) return sign | 0x7c00; }
  return sign | (e << 10) | (m >> 13);
}

/** Decode a height image (h = R·256 + G − 1000 metres) into a grid. */
async function heights(url: string, w: number, h: number): Promise<Float32Array> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const canvas: OffscreenCanvas | HTMLCanvasElement = typeof OffscreenCanvas !== "undefined"
    ? new OffscreenCanvas(w, h)
    : Object.assign(document.createElement("canvas"), { width: w, height: h });
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = px[i * 4] * 256 + px[i * 4 + 1] - 1000;
  return out;
}

/** Build one region's grid geometry, keeping every `step`-th sample. */
export async function build(r: Region, step: number): Promise<Built> {
  const [W, H] = r.grid;
  const hs = await heights(heightUrl(r), W, H);
  const cols = Math.floor((W - 1) / step) + 1, rows = Math.floor((H - 1) / step) + 1;
  const positions = new Float32Array(cols * rows * 3);
  const x0 = r.xr[0] * 1000, sx = (r.xr[1] - r.xr[0]) * 1000;
  const yN = r.yr[1] * 1000, sy = (r.yr[1] - r.yr[0]) * 1000;
  let k = 0;
  for (let j = 0; j < rows; j++) {
    const row = Math.min(H - 1, j * step);
    for (let i = 0; i < cols; i++) {
      const col = Math.min(W - 1, i * step);
      positions[k++] = x0 + (col / (W - 1)) * sx;
      positions[k++] = hs[row * W + col];
      positions[k++] = -(yN - (row / (H - 1)) * sy);
    }
  }
  const index = new Uint32Array((cols - 1) * (rows - 1) * 6);
  k = 0;
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      index[k++] = a; index[k++] = c; index[k++] = b;
      index[k++] = b; index[k++] = c; index[k++] = d;
    }
  }
  const half = new Uint16Array(hs.length);
  for (let i = 0; i < hs.length; i++) half[i] = toHalf(hs[i]);
  return { name: r.name, positions, index, heights: half };
}
