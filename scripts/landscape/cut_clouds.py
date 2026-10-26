"""
Cut the real cumulus clouds out of the team's own photo (public/images/hero-bg.jpg)
so the 3D aerial scene can float them in its sky. Run by hand:

    python3 scripts/landscape/cut_clouds.py

Writes public/images/landscape/clouds.webp: the cumulus bank (the scene mirrors
and scales it for variety), with
alpha, keyed against the blue sky (the sky's own gradient is modelled row by row
and "un-mixed" from the cloud edges, so edges carry no blue fringe).
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
src = np.asarray(Image.open(os.path.join(ROOT, "public/images/hero-bg.jpg")).convert("RGB")).astype(np.float64)

# sky model: for each row, the median colour of clearly-blue pixels
blue = (src[..., 2] - src[..., 0] > 70)
H = src.shape[0]
sky = np.zeros((H, 3))
for y in range(H):
    m = blue[y]
    sky[y] = np.median(src[y][m], axis=0) if m.sum() > 40 else sky[y - 1]
sky = ndimage.uniform_filter1d(sky, 25, axis=0)

# x0, y0, x1, y1: the cumulus towers, above the hazy band near the horizon
# (lower down the sky turns milky and would key as cloud)
CUTS = [(1030, 395, 2135, 612)]
outs = []
for (x0, y0, x1, y1) in CUTS:
    px = src[y0:y1, x0:x1]
    sk = np.repeat(sky[y0:y1, None, :], x1 - x0, axis=1)
    # cloud = how far red has risen above the sky's red (clouds are white, sky is blue)
    a = np.clip((px[..., 0] - sk[..., 0] - 18) / 95.0, 0, 1)
    a = a * a * (3 - 2 * a)
    # the base dissolves into haze (it meets the ridges in the photo)
    h = y1 - y0
    fade = np.clip((h - np.arange(h)) / (0.32 * h), 0, 1)[:, None] ** 1.5
    side = np.minimum(np.clip(np.arange(x1 - x0) / 30, 0, 1), np.clip((x1 - x0 - np.arange(x1 - x0)) / 30, 0, 1))[None, :]
    a = a * fade * side
    col = (px - (1 - a[..., None]) * sk) / np.maximum(a[..., None], 0.08)
    col = np.clip(col, 0, 255)
    outs.append(np.dstack([col, a * 255]).astype(np.uint8))

W = sum(o.shape[1] for o in outs) + 8 * len(outs)
Hh = max(o.shape[0] for o in outs)
atlas = np.zeros((Hh, W, 4), np.uint8)
x = 0
rects = []
for o in outs:
    atlas[: o.shape[0], x : x + o.shape[1]] = o
    rects.append((x, 0, o.shape[1], o.shape[0]))
    x += o.shape[1] + 8
Image.fromarray(atlas, "RGBA").save(os.path.join(ROOT, "public/images/landscape/clouds.webp"), quality=88, alpha_quality=90, method=6)
print("atlas", atlas.shape, "rects", rects)
