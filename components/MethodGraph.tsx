"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The 5-step methodology as a rising line graph that plays as you scroll:
 * a marigold line draws itself from step to step, and each step pings
 * (a ripple and a glow) the moment the line reaches it.
 *
 * - The line follows the scroll and never retracts; a step that has pinged
 *   stays lit (nothing on the home page animates out).
 * - Without JavaScript, or for people who prefer reduced motion, every step is
 *   shown lit and the line complete, with no ripples.
 * - Desktop: a rising graph across the panel. Phones: the same idea running
 *   down the left edge, so labels stay large.
 */

// where each step sits on the graph (percent of width / height)
const PTS = [
  { x: 8, y: 80 }, { x: 29, y: 64 }, { x: 50, y: 50 }, { x: 71, y: 33 }, { x: 92, y: 14 },
];
// a smooth curve through the points (Catmull-Rom → cubic Bézier), in a 1000×300 box
function curve() {
  const P = PTS.map((p) => ({ x: p.x * 10, y: p.y * 3 }));
  let d = `M ${P[0].x} ${P[0].y}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] ?? P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
const PATH = curve();

export default function MethodGraph({ steps }: { steps: string[] }) {
  const root = useRef<HTMLDivElement>(null);
  const wide = useRef<SVGPathElement>(null);
  const [armed, setArmed] = useState(false); // false = static, everything lit
  const [progress, setProgress] = useState(1);
  const [lit, setLit] = useState(steps.length);
  // where along the drawn line each step sits (0..1), measured from the real path
  const stops = useRef<number[]>(steps.map((_, i) => i / (steps.length - 1)));

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = root.current;
    if (!el) return;
    // measure each point's position along the curve (by length), so a step
    // pings exactly when the drawn line arrives at it
    const path = wide.current;
    if (path) {
      const total = path.getTotalLength();
      const at = PTS.map((p) => {
        let best = 0, bestD = Infinity;
        for (let s = 0; s <= 200; s++) {
          const q = path.getPointAtLength((s / 200) * total);
          const dd = Math.hypot(q.x - p.x * 10, q.y - p.y * 3);
          if (dd < bestD) { bestD = dd; best = s / 200; }
        }
        return best;
      });
      stops.current = at;
    }
    setArmed(true);
    let max = 0, raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // starts as the graph's top comes up past 90% of the screen; complete
      // when the graph's middle reaches 45% (so the last step pings in view)
      const start = vh * 0.9, end = vh * 0.45 - r.height / 2;
      const p = Math.min(1, Math.max(0, (start - r.top) / Math.max(1, start - end)));
      if (p > max) {
        max = p;
        setProgress(p);
        setLit(stops.current.filter((s) => s <= p + 0.002).length);
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    setProgress(0); setLit(0);
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, []);

  const p = armed ? progress : 1;
  const on = armed ? lit : steps.length;

  return (
    <div ref={root} className="method-graph relative">
      {/* ---------- wide: a rising graph ---------- */}
      <div className="relative hidden h-[340px] lg:block">
        <svg aria-hidden viewBox="0 0 1000 300" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" fill="none">
          {/* faint guide lines, like a chart's grid */}
          <defs>
            <linearGradient id="method-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e2a02f" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#e2a02f" stopOpacity="0" />
            </linearGradient>
            {/* the area under the line is revealed left to right as the line draws */}
            <clipPath id="method-reveal"><rect x="0" y="0" height="300" width={1000 * Math.min(1, PTS[0].x / 100 + p * (PTS[4].x - PTS[0].x) / 100)} /></clipPath>
          </defs>
          {[60, 135, 210, 285].map((y) => <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="rgb(30 77 58 / 0.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          <path d={`${PATH} L ${PTS[4].x * 10} 300 L ${PTS[0].x * 10} 300 Z`} fill="url(#method-area)" clipPath="url(#method-reveal)" />
          <path d={PATH} stroke="rgb(30 77 58 / 0.14)" strokeWidth="3" strokeDasharray="1 9" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {/* soft glow under the drawn line */}
          <path d={PATH} pathLength={1} stroke="rgb(226 160 47 / 0.28)" strokeWidth="12" strokeLinecap="round" vectorEffect="non-scaling-stroke"
            style={{ strokeDasharray: 1, strokeDashoffset: 1 - p, filter: "blur(6px)" }} />
          <path ref={wide} d={PATH} pathLength={1} stroke="#e2a02f" strokeWidth="4.5" strokeLinecap="round" vectorEffect="non-scaling-stroke"
            style={{ strokeDasharray: 1, strokeDashoffset: 1 - p }} />
        </svg>
        <ol className="absolute inset-0">
          {steps.map((step, i) => (
            <li key={step} className="absolute" style={{ left: `${PTS[i].x}%`, top: `${PTS[i].y}%` }}>
              <Node lit={i < on} armed={armed} className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2" />
              <div className={`absolute left-1/2 w-40 -translate-x-1/2 text-center transition-[opacity,transform] duration-500 ease-out ${i % 2 ? "bottom-full mb-6" : "top-full mt-6"} ${i < on ? "opacity-100" : "translate-y-1 opacity-45"}`}>
                <span className="block font-mono text-[11px] uppercase tracking-[0.25em] text-ink/70">Step {i + 1}</span>
                <span className="mt-1 block font-display text-2xl font-semibold text-pine-deep">{step}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* ---------- narrow: the same path running down the page ---------- */}
      <ol className="relative ml-2 lg:hidden">
        <span aria-hidden className="absolute bottom-6 left-[19px] top-6 w-[3px] rounded-full bg-pine/10" />
        <span aria-hidden className="absolute left-[19px] top-6 w-[3px] origin-top rounded-full bg-marigold shadow-[0_0_12px_rgb(226_160_47/0.6)]"
          style={{ height: "calc(100% - 3rem)", transform: `scaleY(${p})` }} />
        {steps.map((step, i) => (
          <li key={step} className="relative flex items-center gap-5 py-4">
            <span className="relative z-10 grid w-10 place-items-center"><Node lit={i < on} armed={armed} className="relative" /></span>
            <span className={`transition-opacity duration-500 ${i < on ? "opacity-100" : "opacity-45"}`}>
              <span className="block font-mono text-[11px] uppercase tracking-[0.25em] text-ink/70">Step {i + 1}</span>
              <span className="block font-display text-2xl font-semibold text-pine-deep">{step}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Node({ lit, armed, className }: { lit: boolean; armed: boolean; className: string }) {
  return (
    <span className={`method-node ${lit ? "is-lit" : ""} ${armed && lit ? "is-pinged" : ""} ${className}`}>
      <span className="method-ring" />
      <span className="method-ring method-ring-2" />
      <span className="method-dot" />
    </span>
  );
}
