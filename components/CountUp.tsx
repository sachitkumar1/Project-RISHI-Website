"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up once, the first time it scrolls into view
 * ("1,400" climbs from 0). Years count up over their last decades only.
 *
 * Without JavaScript, with reduced motion, or if it's already on screen when
 * the page loads, it simply shows the final value. Screen readers always get
 * the final value (the moving digits are hidden from them).
 */
export default function CountUp({ value, className = "" }: { value: string; className?: string }) {
  const target = Number(value.replace(/[^\d.]/g, ""));
  const isYear = /^\d{4}$/.test(value.trim()) && target > 1900;
  const from = isYear ? target - 40 : 0;
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<string | null>(null); // null = show the real value

  useEffect(() => {
    const el = ref.current;
    if (!el || !Number.isFinite(target)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return; // already visible: leave it
    const fmt = (n: number) => (isYear ? String(Math.round(n)) : Math.round(n).toLocaleString("en-US"));
    setShown(fmt(from));
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now(), dur = 1400;
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / dur), ease = 1 - Math.pow(1 - p, 3);
        setShown(p < 1 ? fmt(from + (target - from) * ease) : null);
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target, from, isYear]);

  return (
    <span ref={ref} className={className}>
      <span aria-hidden={shown !== null}>{shown ?? value}</span>
      {shown !== null && <span className="sr-only">{value}</span>}
    </span>
  );
}
