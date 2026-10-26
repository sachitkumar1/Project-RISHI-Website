"use client";

import { useEffect, useRef, useState } from "react";
import { blurBehind, placeholderFor } from "@/lib/imagePlaceholders";

/**
 * Justified gallery: every row is scaled to fill the full container width, so
 * the whole collage forms a clean rectangle (flush left/right/top/bottom) while
 * each photo keeps its natural shape — nothing gets cropped out.
 *
 * Site photos have their size and a tiny blurred preview precomputed
 * (lib/imagePlaceholders.ts), so the wall lays out immediately with each blur
 * at its photo's exact size and the photos fade in over them. Only a photo
 * missing from that file is measured by downloading it first.
 */
export default function PhotoWall({ images }: { images: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const known = () => images.map((src) => { const p = placeholderFor(src); return p ? p.w / p.h : 0; });
  const [aspects, setAspects] = useState<number[]>(() => (known().every((a) => a > 0) ? known() : []));

  // Track container width (responsive).
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measure each image's natural aspect ratio (width / height).
  useEffect(() => {
    const pre = known();
    if (pre.every((a) => a > 0)) { setAspects(pre); return; }
    let cancelled = false;
    Promise.all(
      images.map(
        (src, i) =>
          pre[i] > 0 ? pre[i] : new Promise<number>((resolve) => {
            const img = new window.Image();
            img.onload = () =>
              resolve(img.naturalWidth / img.naturalHeight || 1.4);
            img.onerror = () => resolve(1.4);
            img.src = src;
          })
      )
    ).then((res) => {
      if (!cancelled) setAspects(res);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  const gap = 10;
  const ready = width > 0 && aspects.length === images.length;

  // Pick a comfortable row height for the viewport, then a row count.
  const targetHeight = width < 480 ? 150 : width < 768 ? 190 : 250;
  const totalAspect = aspects.reduce((a, b) => a + b, 0) || 1;
  const rowCount = ready
    ? Math.max(1, Math.min(images.length, Math.round((totalAspect * targetHeight) / width)))
    : 1;

  // Split into `rowCount` contiguous rows with balanced aspect sums.
  const rows: number[][] = [];
  if (ready) {
    let i = 0;
    let remaining = totalAspect;
    let rowsLeft = rowCount;
    while (i < images.length && rowsLeft > 0) {
      const target = remaining / rowsLeft;
      let sum = 0;
      const row: number[] = [];
      while (i < images.length) {
        row.push(i);
        sum += aspects[i];
        i++;
        if (rowsLeft > 1 && sum >= target) break;
      }
      rows.push(row);
      remaining -= sum;
      rowsLeft--;
    }
    if (i < images.length && rows.length) {
      while (i < images.length) rows[rows.length - 1].push(i++);
    }
  }

  return (
    <div ref={ref} className="mt-10">
      {!ready && <div style={{ height: targetHeight * 2 }} />}
      {ready &&
        rows.map((row, r) => {
          const rowAspect = row.reduce((s, idx) => s + aspects[idx], 0);
          const rowHeight = (width - gap * (row.length - 1)) / rowAspect;
          const isLast = r === rows.length - 1;
          return (
            <div
              key={r}
              style={{
                display: "flex",
                gap,
                marginBottom: isLast ? 0 : gap,
              }}
            >
              {row.map((idx) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={idx}
                  src={images[idx]}
                  alt={`Project RISHI — life at the chapter ${idx + 1}`}
                  loading="lazy"
                  decoding="async"
                  style={{
                    height: rowHeight,
                    width: aspects[idx] * rowHeight,
                    objectFit: "cover",
                    ...blurBehind(images[idx]),
                  }}
                  className="rounded-xl border border-pine/10 transition-transform duration-300 hover:scale-[1.02]"
                />
              ))}
            </div>
          );
        })}
    </div>
  );
}
