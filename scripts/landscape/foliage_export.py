"""
Export the painted plants (scripts/landscape/foliage-painter.html → PNGs) for
the home page's foliage (components/landscape/Foliage.tsx). Run by hand:

    python3 scripts/landscape/foliage_export.py <dir with deodar.png, fern.png, …>

For each plant: trimmed to its pixels, a sharp WebP and a pre-blurred WebP
(the page cross-fades the two to pull focus; blurring live would cost a lot).
"""
import os, sys
from PIL import Image, ImageFilter

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "images", "foliage")
os.makedirs(OUT, exist_ok=True)
WIDTH = {"deodar": 1100, "fern": 640, "rhodo": 900, "grass": 1100, "toran": 2000}
QUALITY = {"deodar": 74, "fern": 78, "rhodo": 84, "grass": 74, "toran": 84}
FEATHER = {"grass": 0.14}  # fade the sides of strips that would otherwise end in a hard edge
for name, w in WIDTH.items():
    im = Image.open(os.path.join(SRC, name + ".png")).convert("RGBA")
    im = im.crop(im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox())
    if im.width > w:
        im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    if name in FEATHER:
        import numpy as np
        a = np.asarray(im).astype(np.float32)
        x = np.linspace(0, 1, im.width)
        f = np.clip(np.minimum(x, 1 - x) / FEATHER[name], 0, 1) ** 1.5
        a[..., 3] *= f[None, :]
        im = Image.fromarray(a.astype(np.uint8), "RGBA")
    im.save(os.path.join(OUT, f"{name}.webp"), quality=QUALITY[name], alpha_quality=90, method=6)
    pad = 40
    big = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0)); big.paste(im, (pad, pad))
    # blur premultiplied, so edges don't pick up dark fringes
    r, g, b, a = big.split()
    import numpy as np
    arr = np.asarray(big).astype(np.float32); al = arr[..., 3:4] / 255
    pm = Image.fromarray(np.dstack([arr[..., :3] * al, arr[..., 3:4]]).astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(14))
    pa = np.asarray(pm).astype(np.float32); al2 = np.maximum(pa[..., 3:4] / 255, 1e-3)
    un = np.dstack([np.clip(pa[..., :3] / al2, 0, 255), pa[..., 3:4]]).astype(np.uint8)
    bl = Image.fromarray(un, "RGBA").crop((pad, pad, pad + im.width, pad + im.height))
    bl = bl.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    bl.save(os.path.join(OUT, f"{name}-blur.webp"), quality=70, alpha_quality=80, method=6)
    print(name, im.size, os.path.getsize(os.path.join(OUT, f"{name}.webp")) // 1000, "KB +", os.path.getsize(os.path.join(OUT, f"{name}-blur.webp")) // 1000, "KB")
