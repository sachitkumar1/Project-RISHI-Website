import type { CSSProperties, ReactNode } from "react";

/**
 * Illustrated foreground plants that frame the page: a deodar bough (the
 * Himalayan cedar, Himachal Pradesh's state tree), tall hill grass and
 * marigolds. Drawn from seeded shapes, so every visit (and the server render)
 * is identical.
 *
 * <Foliage> renders the plant twice — sharp, and pre-blurred — and CSS
 * cross-fades them as it passes the screen (out of focus → in focus → out),
 * like a camera's focus pulling across a foreground. Cross-fading two still
 * images costs far less than animating a blur. It also drifts faster than the
 * page (it's "closer to the camera"). Purely decorative and never in the way:
 * aria-hidden, no pointer events. Without scroll-driven animations it is
 * simply shown sharp.
 */

// --- seeded randomness so SSR and client draw the same plant ---------------------
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
}

// --- deodar bough ------------------------------------------------------------------
function deodarPaths(seed: number) {
  const r = seeded(seed);
  const branches: string[] = [];
  const tufts: { x: number; y: number; a: number; len: number; c: string }[] = [];
  const greens = ["#24452f", "#2f5a3d", "#3b6b46", "#1d3b28", "#466f4a"];
  // main limb sweeping in from the left edge and drooping, as deodars do
  const main = { x0: -20, y0: 40, x1: 520, y1: 150 };
  branches.push(`M${main.x0} ${main.y0} C 160 ${main.y0 - 10}, 330 ${main.y0 + 40}, ${main.x1} ${main.y1}`);
  const point = (t: number) => {
    const mt = 1 - t;
    const x = mt ** 3 * main.x0 + 3 * mt * mt * t * 160 + 3 * mt * t * t * 330 + t ** 3 * main.x1;
    const y = mt ** 3 * main.y0 + 3 * mt * mt * t * (main.y0 - 10) + 3 * mt * t * t * (main.y0 + 40) + t ** 3 * main.y1;
    return { x, y };
  };
  for (let i = 0; i < 9; i++) {
    const t = 0.12 + i * 0.1 + r() * 0.04;
    const p = point(t);
    const len = 70 + r() * 90 * (1 - t * 0.5);
    const dir = r() > 0.5 ? 1 : -1;
    const ex = p.x + len * 0.8, ey = p.y + dir * (20 + r() * 40) + 25;
    branches.push(`M${p.x.toFixed(1)} ${p.y.toFixed(1)} Q ${(p.x + len * 0.4).toFixed(1)} ${(p.y + dir * 8).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
    // needle tufts along each side branch
    for (let k = 0; k < 7; k++) {
      const u = k / 6;
      const tx = p.x + (ex - p.x) * u, ty = p.y + (ey - p.y) * u + Math.sin(u * 3) * 4;
      tufts.push({ x: tx, y: ty, a: r() * 360, len: 18 + r() * 14, c: greens[Math.floor(r() * greens.length)] });
    }
  }
  for (let k = 0; k < 26; k++) {
    const p = point(k / 25);
    tufts.push({ x: p.x, y: p.y, a: r() * 360, len: 20 + r() * 14, c: greens[Math.floor(r() * greens.length)] });
  }
  return { branches, tufts };
}

function Deodar({ seed = 3 }: { seed?: number }) {
  const { branches, tufts } = deodarPaths(seed);
  return (
    <svg viewBox="-20 0 560 260" className="h-full w-full overflow-visible" fill="none">
      {branches.map((d, i) => <path key={i} d={d} stroke="#4a3a2a" strokeWidth={i === 0 ? 7 : 2.6} strokeLinecap="round" />)}
      {tufts.map((t, i) => (
        <g key={i} transform={`translate(${t.x.toFixed(1)} ${t.y.toFixed(1)}) rotate(${t.a.toFixed(0)})`} stroke={t.c} strokeWidth="2.3" strokeLinecap="round">
          {/* a soft body under each needle cluster so the bough reads as foliage */}
          <ellipse rx={(t.len * 0.62).toFixed(1)} ry={(t.len * 0.34).toFixed(1)} fill={t.c} stroke="none" opacity="0.55" />
          {Array.from({ length: 11 }, (_, n) => {
            const ang = (n / 11) * Math.PI * 2;
            return <line key={n} x1="0" y1="0" x2={(Math.cos(ang) * t.len).toFixed(1)} y2={(Math.sin(ang) * t.len * 0.55).toFixed(1)} />;
          })}
        </g>
      ))}
    </svg>
  );
}

// --- tall grass + marigolds ----------------------------------------------------------
function Grass({ seed = 9, flowers = true }: { seed?: number; flowers?: boolean }) {
  const r = seeded(seed);
  const blades = Array.from({ length: 70 }, () => {
    const x = r() * 600, h = 90 + r() * 170, lean = (r() - 0.5) * 90;
    const c = ["#3f6b3c", "#5d8a4a", "#7aa257", "#a7a157", "#c8ab5c"][Math.floor(r() * 5)];
    return { d: `M${x.toFixed(1)} 300 Q ${(x + lean * 0.3).toFixed(1)} ${(300 - h * 0.6).toFixed(1)} ${(x + lean).toFixed(1)} ${(300 - h).toFixed(1)}`, c, w: 2 + r() * 2.5, sway: r() };
  });
  const blooms = flowers ? Array.from({ length: 7 }, () => ({ x: 40 + r() * 520, y: 120 + r() * 90, s: 0.8 + r() * 0.6 })) : [];
  return (
    <svg viewBox="0 0 600 300" className="h-full w-full overflow-visible" fill="none" preserveAspectRatio="xMidYMax meet">
      {blades.map((b, i) => (
        <path key={i} d={b.d} stroke={b.c} strokeWidth={b.w} strokeLinecap="round" className="grass-blade" style={{ ["--sway" as string]: b.sway } as CSSProperties} />
      ))}
      {blooms.map((f, i) => (
        <g key={`f${i}`} transform={`translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) scale(${f.s.toFixed(2)})`}>
          <path d={`M0 0 Q 6 60 -4 ${(300 - f.y) / f.s}`} stroke="#4d7a3e" strokeWidth="2.5" />
          {Array.from({ length: 14 }, (_, k) => (
            <ellipse key={k} cx="0" cy="-9" rx="5.5" ry="10" fill={k % 2 ? "#e2a02f" : "#d97a1e"} transform={`rotate(${(k * 360) / 14})`} />
          ))}
          <circle r="6" fill="#b85d12" />
          <circle r="3" fill="#8a4410" />
        </g>
      ))}
    </svg>
  );
}

const ART: Record<string, (p: { seed?: number }) => JSX.Element> = { deodar: Deodar, grass: Grass };

export default function Foliage({ kind, seed, className = "", flip = false, children }: {
  kind: "deodar" | "grass"; seed?: number; className?: string; flip?: boolean; children?: ReactNode;
}) {
  const Art = ART[kind];
  return (
    <div aria-hidden className={`foliage pointer-events-none absolute z-20 ${className}`} style={flip ? { transform: "scaleX(-1)" } : undefined}>
      <div className="foliage-drift h-full w-full">
        <div className="f-blur absolute inset-0"><Art seed={seed} /></div>
        <div className="f-sharp absolute inset-0"><Art seed={seed} /></div>
      </div>
      {children}
    </div>
  );
}
