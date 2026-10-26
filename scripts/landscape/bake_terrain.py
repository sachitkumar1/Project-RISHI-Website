"""
Bake dawn light into the real terrain around Bharog Baneri's area, for the
home page's 3D aerial scene. Run by hand after fetch_terrain.py:

    python3 scripts/landscape/bake_terrain.py <work dir>

Satellite imagery is lit by a high late-morning sun. To make the scene read as
a real dawn, each region's imagery is:
  1. "de-lit": divided by an estimate of the satellite's own hill shading;
  2. re-lit for a low sun in the east-south-east: direct light with long,
     soft shadows cast by the actual ridges (ray-marched over the real
     heightfield, reaching tens of km), blue sky light in the shadows, and
     ambient occlusion in the folds of the valleys.
The aerial haze, sky, mist and clouds are added live in the browser.

Writes into public/images/landscape/:
  terrain-<region>.avif          lit colour (sRGB)
  terrain-<region>-sm.avif       half size, for phones
  terrain-<region>-height.png    heights in whole metres: h = R*256 + G - 1000 (B unused)
"""
import os, sys, math, json
import numpy as np
from PIL import Image
from scipy import ndimage

WORK = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "images", "landscape")

SUN_AZ, SUN_EL = 108.0, 8.5          # dawn: degrees from north (clockwise), above horizon
SAT_AZ, SAT_EL = 150.0, 52.0         # roughly the Sentinel-2 overpass sun
SUN_COL = np.array([1.0, 0.70, 0.44]) * 2.6
SKY_COL = np.array([0.36, 0.47, 0.66]) * 0.9

def unit(az, el):
    a, e = math.radians(az), math.radians(el)
    return np.array([math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)])  # x east, y north, z up

def load(name):
    d = np.load(os.path.join(WORK, name + ".npz"))
    return d["height"].astype(np.float64), d["rgb"], tuple(d["xr"]), tuple(d["yr"])

def sampler(h, xr, yr):
    """height at world (x, y) metres from a north-up grid."""
    H, W = h.shape
    def f(x, y):
        c = (x / 1000 - xr[0]) / (xr[1] - xr[0]) * (W - 1)
        r = (yr[1] - y / 1000) / (yr[1] - yr[0]) * (H - 1)
        return ndimage.map_coordinates(h, [r, c], order=1, mode="nearest")
    return f, (xr[0] <= 0) and True

def horizon_tan(x, y, h0, samplers, az, reach, step):
    """max tan(elevation) of the terrain seen from (x, y, h0) towards azimuth az."""
    dx, dy = math.sin(math.radians(az)), math.cos(math.radians(az))
    best = np.full(x.shape, -1.0)
    d = step
    while d <= reach:
        hs = None
        for (f, xr, yr) in samplers:      # first sampler that covers the point wins (finest first)
            px, py = x + dx * d, y + dy * d
            inside = (px >= xr[0] * 1000) & (px <= xr[1] * 1000) & (py >= yr[0] * 1000) & (py <= yr[1] * 1000)
            v = f(px, py)
            hs = np.where(inside, v, hs) if hs is not None else np.where(inside, v, np.nan)
        t = (hs - h0) / d
        best = np.fmax(best, np.nan_to_num(t, nan=-1.0))
        d += step * max(1.0, d / (step * 40))  # even steps near, growing with distance
    return best

def bake(name, samplers):
    h, rgb, xr, yr = load(name)
    H, W = rgb.shape[:2]
    # heights at image resolution (for lighting); keep the DEM grid for the mesh
    hi = ndimage.zoom(h, (H / h.shape[0], W / h.shape[1]), order=3)
    cell_x = (xr[1] - xr[0]) * 1000 / (W - 1)
    cell_y = (yr[1] - yr[0]) * 1000 / (H - 1)
    gy, gx = np.gradient(ndimage.gaussian_filter(hi, 0.8), cell_y, cell_x)
    # image rows run north → south, so +row is −y
    nx, ny, nz = -gx, gy, np.ones_like(gx)
    nl = np.sqrt(nx * nx + ny * ny + nz * nz); nx, ny, nz = nx / nl, ny / nl, nz / nl
    def lambert(az, el):
        s = unit(az, el); return np.clip(nx * s[0] + ny * s[1] + nz * s[2], 0, 1)

    lin = (rgb.astype(np.float64) / 255.0) ** 2.2
    # light haze in satellite imagery lifts the blacks: take a little off
    lin = np.clip(lin - np.percentile(lin.reshape(-1, 3), 0.5, axis=0) * 0.7, 0, 1)
    sat = lambert(SAT_AZ, SAT_EL)
    albedo = lin / (0.42 + 0.58 * sat / max(1e-3, np.mean(sat)))[..., None]

    # lighting is computed on a coarser grid (fast), then upsampled
    sh_h, sh_w = (H // 2, W // 2) if name != "far" else (H // 4, W // 4)
    ys = np.linspace(yr[1] * 1000, yr[0] * 1000, sh_h)
    xs = np.linspace(xr[0] * 1000, xr[1] * 1000, sh_w)
    X, Y = np.meshgrid(xs, ys)
    own = (sampler(h, xr, yr)[0], xr, yr)
    h0 = own[0](X, Y) + 2.0
    tan_sun = math.tan(math.radians(SUN_EL))
    reach = 40000 if name != "far" else 160000
    step = 60 if name == "detail" else (150 if name == "mid" else 1200)
    ht = horizon_tan(X, Y, h0, samplers, SUN_AZ, reach, step)
    # soft penumbra (the sun is half a degree wide; distant ridges blur more)
    shadow = np.clip((tan_sun - ht) / 0.02 + 0.5, 0, 1)
    shadow = ndimage.gaussian_filter(shadow, 1.0)
    # ambient occlusion from 8 horizons
    ao = np.zeros_like(X)
    for az in range(0, 360, 45):
        t = horizon_tan(X, Y, h0, [own], az, 1800 if name != "far" else 20000, step)
        ao += np.sin(np.arctan(np.clip(t, 0, None)))
    ao = 1 - ao / 8
    up = lambda a: ndimage.zoom(a, (H / a.shape[0], W / a.shape[1]), order=1)
    shadow, ao = up(shadow), up(ao)

    direct = lambert(SUN_AZ, SUN_EL) * shadow
    skyl = ao ** 1.4 * (0.55 + 0.45 * nz)
    light = SUN_COL[None, None] * direct[..., None] + SKY_COL[None, None] * skyl[..., None]
    col = albedo * light
    # gentle filmic curve, then sRGB
    col = col * 1.25
    col = col / (1 + col * 0.35)
    out = (np.clip(col, 0, 1) ** (1 / 2.2) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(out).save(os.path.join(OUT, f"terrain-{name}.avif"), quality=52 if name != "far" else 46, speed=4)
    Image.fromarray(out).resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(OUT, f"terrain-{name}-sm.avif"), quality=54, speed=4)
    Image.fromarray(out).resize((W // 4, H // 4)).save(os.path.join(WORK, f"lit_{name}.jpg"), quality=90)

    # heights for the mesh (DEM grid), whole metres in R/G (1 m steps are invisible from the air)
    e = np.clip(np.round(h + 1000), 0, 65535).astype(np.uint32)
    enc = np.stack([(e >> 8) & 255, e & 255, np.zeros_like(e)], -1).astype(np.uint8)
    Image.fromarray(enc).save(os.path.join(OUT, f"terrain-{name}-height.png"), optimize=True)
    meta = {"xr": list(map(float, xr)), "yr": list(map(float, yr)), "grid": [int(h.shape[1]), int(h.shape[0])],
            "min": float(h.min()), "max": float(h.max())}
    print(name, meta, "shadowed %.0f%%" % (100 * (1 - shadow.mean())))
    return meta

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    # every region's shadows can be cast by any region's ridges (finest data first)
    all_samplers = []
    for n in ("detail", "mid", "far"):
        hh, _, xr, yr = load(n)
        all_samplers.append((sampler(hh, xr, yr)[0], xr, yr))
    only = sys.argv[2:] or ["detail", "mid", "far"]
    metas = {n: bake(n, all_samplers) for n in only}
    json.dump({**metas, "sun": [SUN_AZ, SUN_EL]}, open(os.path.join(WORK, "terrain-meta.json"), "w"), indent=1)
