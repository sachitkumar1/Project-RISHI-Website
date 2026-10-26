"""
Fetch the real terrain and imagery around Bharog Baneri's area (Renuka / Dadahu,
Sirmaur) for the home page's 3D aerial scene. Run by hand; not part of the build.

    pip install numpy pillow scipy rasterio
    python3 scripts/landscape/fetch_terrain.py <work dir>

Sources (credited on /credits):
  * Elevation, detail + mid regions: Copernicus DEM GLO-30 (30 m), from the
    public AWS bucket copernicus-dem-30m.
  * Elevation, far region: Terrain Tiles (terrarium, zoom 9) from the public
    AWS bucket elevation-tiles-prod (SRTM / GMTED and others).
  * Imagery: Sentinel-2 cloudless 2022 by EOX IT Services (s2maps.eu),
    CC BY-NC-SA 4.0, contains modified Copernicus Sentinel data 2022.

Everything is resampled onto a flat local grid in metres centred on CENTER
(x east, y north), which is what the scene uses. Output: <work>/<region>.npz
with `height` (float32 metres) and `rgb` (uint8), plus a preview PNG.
"""
import io, math, os, sys, time, urllib.request
import numpy as np
from PIL import Image
from scipy import ndimage

WORK = sys.argv[1]
os.makedirs(WORK, exist_ok=True)
CENTER = (30.600, 77.460)   # lat, lon: Renuka / Dadahu, Sirmaur
UA = {"User-Agent": "ProjectRISHI-site-build/1.0 (ucbprojectrishi.org; one-off asset build)"}
M_LAT = 110574.0
M_LON = 111320.0 * math.cos(math.radians(CENTER[0]))

# region: x range (km), y range (km), height grid (w, h), image (w, h), imagery zoom
REGIONS = {
    "detail": ((-8, 8), (-12, 8), (640, 800), (2048, 2560), 14),
    "mid":    ((-22, 22), (-20, 40), (440, 600), (1536, 2048), 13),
    "far":    ((-180, 180), (-80, 280), (360, 360), (2048, 2048), 10),
}

def grid(xr, yr, w, h):
    """lat/lon for each cell centre of a north-up grid (row 0 = north)."""
    xs = np.linspace(xr[0] * 1000, xr[1] * 1000, w)
    ys = np.linspace(yr[1] * 1000, yr[0] * 1000, h)
    X, Y = np.meshgrid(xs, ys)
    return CENTER[0] + Y / M_LAT, CENTER[1] + X / M_LON

def merc(lat, lon, z):
    n = 256 * 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / math.pi) / 2 * n
    return x, y

def fetch(url, tries=4):
    for k in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except Exception as e:
            print("retry", url, e); time.sleep(3 + 5 * k)
    raise RuntimeError(url)

def tiles_mosaic(lat, lon, z, url_fmt, cache, mode):
    """Download the tiles covering lat/lon at zoom z and sample them at every point."""
    px, py = merc(lat, lon, z)
    tx0, tx1 = int(px.min() // 256), int(px.max() // 256)
    ty0, ty1 = int(py.min() // 256), int(py.max() // 256)
    os.makedirs(cache, exist_ok=True)
    W, H = (tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256
    mos = np.zeros((H, W, 3), np.uint8)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            fn = os.path.join(cache, f"{z}_{tx}_{ty}.{ 'png' if mode == 'terrarium' else 'jpg'}")
            if not os.path.exists(fn):
                open(fn, "wb").write(fetch(url_fmt.format(z=z, x=tx, y=ty)))
                time.sleep(0.12)  # be polite to the tile servers
            mos[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = np.asarray(Image.open(fn).convert("RGB"))
    cx, cy = px - tx0 * 256 - 0.5, py - ty0 * 256 - 0.5
    if mode == "terrarium":
        hgt = mos[..., 0].astype(np.float32) * 256 + mos[..., 1] + mos[..., 2] / 256.0 - 32768
        return ndimage.map_coordinates(hgt, [cy, cx], order=3, mode="nearest").astype(np.float32)
    return np.stack([ndimage.map_coordinates(mos[..., c].astype(np.float32), [cy, cx], order=3, mode="nearest") for c in range(3)], -1).clip(0, 255).astype(np.uint8)

def copernicus(lat, lon):
    import rasterio
    out = np.full(lat.shape, np.nan, np.float32)
    for la in range(int(np.floor(lat.min())), int(np.floor(lat.max())) + 1):
        for lo in range(int(np.floor(lon.min())), int(np.floor(lon.max())) + 1):
            name = f"Copernicus_DSM_COG_10_N{la:02d}_00_E{lo:03d}_00_DEM"
            fn = os.path.join(WORK, name + ".tif")
            if not os.path.exists(fn):
                open(fn, "wb").write(fetch(f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"))
            with rasterio.open(fn) as d:
                a = d.read(1).astype(np.float32)
                m = (lat >= la) & (lat < la + 1) & (lon >= lo) & (lon < lo + 1)
                r = (d.bounds.top - lat[m]) / d.res[1] - 0.5
                c = (lon[m] - d.bounds.left) / d.res[0] - 0.5
                out[m] = ndimage.map_coordinates(a, [r, c], order=3, mode="nearest")
    return out

for name, (xr, yr, hsz, isz, z) in REGIONS.items():
    t = time.time()
    lat, lon = grid(xr, yr, *hsz)
    if name == "far":
        h = tiles_mosaic(lat, lon, 9, "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", os.path.join(WORK, "terrarium"), "terrarium")
    else:
        h = copernicus(lat, lon)
    lat, lon = grid(xr, yr, *isz)
    rgb = tiles_mosaic(lat, lon, z, "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2022_3857/default/g/{z}/{y}/{x}.jpg", os.path.join(WORK, "s2"), "rgb")
    np.savez_compressed(os.path.join(WORK, name + ".npz"), height=h, rgb=rgb, xr=xr, yr=yr)
    Image.fromarray(rgb).resize((isz[0] // 4, isz[1] // 4)).save(os.path.join(WORK, name + "_preview.jpg"))
    print(name, "height", h.shape, float(np.nanmin(h)), float(np.nanmax(h)), "rgb", rgb.shape, f"{time.time() - t:.0f}s")
