"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up when it scrolls into view (e.g. "1,400").
 *
 * The real value is server-rendered, so it's correct without JavaScript and in
 * link previews. It only counts if it starts below the screen; years (e.g.
 * "2008") never count, and reduced motion shows the value as is. Digits are
 * tabular so the width never jitters while counting.
 */
export default function CountUp({ value, className = "" }: { value: string; className?: string }) {
  const m = value.match(/^([^\d]*)([\d,]+)(.*)$/);
  const target = m ? Number(m[2].replace(/,/g, "")) : NaN;
  const isYear = /^(19|20)\d{2}$/.test(value.trim());
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || !m || isYear || !Number.isFinite(target)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return; // already on screen: leave it
    const fmt = (n: number) => `${m[1]}${n.toLocaleString("en-US")}${m[3]}`;
    setShown(fmt(0));
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now(), dur = 1400;
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - p, 4);
        setShown(fmt(Math.round(target * eased)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
    // The value is static per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      <span className="sr-only">{value}</span>
      <span aria-hidden>{shown}</span>
    </span>
  );
}
