"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * A soft marigold ring that trails the mouse on the public pages and swells
 * over anything clickable. It's an accent, not a replacement: the normal
 * cursor stays visible, so nothing about pointing or clicking changes.
 * Only with a precise pointer (mouse/trackpad), never on touch, never with
 * reduced motion, never on the dashboard.
 */
export default function CursorRing() {
  const ring = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const off = !!pathname?.startsWith("/dashboard");

  useEffect(() => {
    const el = ring.current;
    if (!el || off) return;
    const ok = window.matchMedia("(pointer: fine) and (hover: hover)").matches
      && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!ok) return;

    let x = -100, y = -100, rx = -100, ry = -100, s = 1, rs = 1, raf = 0, seen = false;
    const move = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      if (!seen) { rx = x; ry = y; seen = true; el.style.opacity = "1"; }
      const t = e.target as Element | null;
      s = t?.closest("a, button, [role='button'], summary, label, select") ? 1.8 : 1;
    };
    const leave = () => { el.style.opacity = "0"; seen = false; };
    const down = () => { rs = s * 0.8; };
    const tick = () => {
      // Ease towards the pointer: it trails a touch behind, then settles.
      rx += (x - rx) * 0.18; ry += (y - ry) * 0.18; rs += (s - rs) * 0.15;
      el.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%) scale(${rs})`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    window.addEventListener("pointerdown", down);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("pointerdown", down);
      el.style.opacity = "0";
    };
  }, [off]);

  if (off) return null;
  return <div ref={ring} aria-hidden className="cursor-ring" />;
}
