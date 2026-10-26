import type { CSSProperties } from "react";

// fixed, seeded positions (no randomness at render, so server and browser agree)
const MOTES = Array.from({ length: 22 }, (_, i) => {
  const r = (n: number) => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); };
  return { left: 6 + r(1) * 88, top: 30 + r(2) * 65, size: 2 + r(3) * 4, dur: 14 + r(4) * 16, delay: -r(5) * 30, drift: (r(6) - 0.5) * 80 };
});

/**
 * Pollen and dust drifting up through the hero's dawn light: a few tiny warm
 * specks that rise slowly and twinkle. CSS only; nothing runs with reduced
 * motion (they're simply not shown).
 */
export default function Motes() {
  return (
    <div aria-hidden className="motes pointer-events-none absolute inset-0 overflow-clip">
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="mote"
          style={{ left: `${m.left}%`, top: `${m.top}%`, width: m.size, height: m.size, "--dur": `${m.dur}s`, "--delay": `${m.delay}s`, "--drift": `${m.drift}px` } as CSSProperties}
        />
      ))}
    </div>
  );
}
