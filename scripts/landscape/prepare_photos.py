"""
Prepare the landscape photography used by the public site.

Not part of the build: run by hand when photos change. Needs Python 3 with
numpy, Pillow, scipy and onnxruntime, plus the Depth Anything V2 (base) ONNX
model:
    pip install numpy pillow scipy onnxruntime
    curl -L -o da2_base.onnx \
      https://huggingface.co/onnx-community/depth-anything-v2-base/resolve/main/onnx/model.onnx

    python3 scripts/landscape/prepare_photos.py <dir with source jpgs> <da2_base.onnx>

For each photo it writes, into public/images/landscape/:
  * <name>-2560.avif (journey shots) / -1920.avif (headers) / -1440.avif (phones)
                                        the graded photo; AVIF is ~2.5x smaller than
                                        WebP for foliage-heavy photos at equal quality
  * <name>-1600.webp                    fallback for browsers without AVIF
  * <name>-depth.png                    a depth map (journey shots only):
                                        white = near, black = far
Source photos and their licences are listed in lib/photoCredits.ts.
"""
import sys, os
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SRC, MODEL = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "images", "landscape")
os.makedirs(OUT, exist_ok=True)

# name: (source file, crop box as fractions l, t, r, b, depth map?)
PHOTOS = {
    # the home page's descent, top to bottom
    "ranges":   ("hero-bg.jpg",  (0, 0, 1, 1), True),       # Project RISHI's own photo near Bharog Baneri
    "valley":   ("navlay.jpg",   (0, 0, 1, 0.83), True),    # cropped above an out-of-focus leaf
    "terraces": ("kundakh.jpg",  (0, 0, 1, 1), True),
    "village":  ("sunisher.jpg", (0, 0, 1, 1), True),
    # inner-page headers
    "hamlet":    ("kataula.jpg",        (0, 0.08, 1, 0.92), False),
    "fields":    ("kundakh2.jpg",       (0, 0.05, 1, 0.95), False),
    "hillside":  ("kundakh_mtn.jpg",    (0, 0.12, 1, 1), False),
    "slopes":    ("sunisher2.jpg",      (0, 0.1, 1, 1), False),
    "deodars":   ("deodar_bind.jpg",    (0, 0, 1, 1), False),
    "dhauladhar": ("dhauladhar_cc0.jpg", (0, 0.1, 1, 1), False),
    "snowline":  ("dhauladhar_snow.jpg", (0, 0.05, 1, 1), False),
}

def grade(im: Image.Image) -> Image.Image:
    """A light, consistent grade so photos from different cameras sit together:
    a touch of contrast, vibrance (lifts muted colours more than vivid ones) and
    warmth in the highlights, like early-morning light."""
    x = np.asarray(im, dtype=np.float32) / 255.0
    x = 0.5 + (x - 0.5) * 1.05
    mx, mn = x.max(axis=2, keepdims=True), x.min(axis=2, keepdims=True)
    sat = (mx - mn) / (mx + 1e-5)
    lum = x @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    lum = lum[..., None]
    x = lum + (x - lum) * (1.0 + 0.18 * (1.0 - sat))
    hi = np.clip((lum - 0.55) / 0.45, 0, 1)
    x = x * (1 + hi * np.array([0.035, 0.012, -0.03], dtype=np.float32))
    return Image.fromarray((np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8))

def depth(im: Image.Image, sess) -> np.ndarray:
    """Relative depth from Depth Anything V2 (larger = nearer), normalised 0..1."""
    w, h = im.size
    th = 518; tw = int(round(w / h * th / 14)) * 14
    x = np.asarray(im.resize((tw, th), Image.BICUBIC), dtype=np.float32) / 255.0
    x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    d = sess.run(None, {"pixel_values": x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
    lo, hi = np.percentile(d, 0.5), np.percentile(d, 99.5)
    return np.clip((d - lo) / (hi - lo), 0, 1)

sess = None
for name, (src, box, want_depth) in PHOTOS.items():
    path = os.path.join(SRC, src)
    if not os.path.exists(path):
        print("missing", path); continue
    im = Image.open(path).convert("RGB")
    W, H = im.size
    im = im.crop((int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H)))
    g = grade(im)
    sized = lambda width: g if g.width <= width else g.resize((width, round(g.height * width / g.width)), Image.LANCZOS)
    for width in ((2560, 1440) if want_depth else (1920, 1440)):
        sized(width).save(os.path.join(OUT, f"{name}-{width}.avif"), quality={2560: 42, 1920: 46, 1440: 48}[width], speed=4)
    sized(1600).save(os.path.join(OUT, f"{name}-1600.webp"), quality=72, method=6)
    if want_depth:
        if sess is None:
            import onnxruntime as ort
            sess = ort.InferenceSession(MODEL)
        d = depth(im, sess)
        # Grow near objects a few pixels into what's behind them, then soften: the
        # stretch at an edge then happens in the background, not across a tree.
        d = ndimage.grey_dilation(d, size=(5, 5))
        dm = Image.fromarray((d * 255).astype(np.uint8)).resize((1024, round(1024 * im.height / im.width)), Image.BICUBIC)
        dm = dm.filter(ImageFilter.GaussianBlur(1.6))
        dm.save(os.path.join(OUT, f"{name}-depth.png"), optimize=True)
    print("done", name, im.size)
