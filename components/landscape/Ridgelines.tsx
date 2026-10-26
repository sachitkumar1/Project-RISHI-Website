/**
 * Layered Himalayan ridgelines at dawn: snow peaks far off, then foothills
 * stepping forward from blue mist to deep pine, with a low marigold sun.
 * Pure SVG, so it paints instantly. It's the poster under the home page's
 * live 3D scene and the backdrop of the other pages' headers.
 *
 * Each layer carries a `ridge-layer` class and a --depth value; CSS moves
 * nearer layers further as you scroll (parallax), where supported.
 */
const LAYERS = [
  { d: "M0 250 L120 190 L190 214 L290 120 L360 168 L430 96 L520 160 L610 110 L700 176 L800 132 L880 186 L980 104 L1070 170 L1160 120 L1260 186 L1340 150 L1440 196 L1440 400 L0 400 Z", fill: "#c7d7df", depth: 0.15, snow: true },
  { d: "M0 262 C120 236 200 250 300 222 S470 246 560 218 S760 236 860 208 S1060 240 1160 214 S1340 234 1440 222 L1440 400 L0 400 Z", fill: "#a9c0b9", depth: 0.3 },
  { d: "M0 292 C140 266 240 288 360 262 S560 290 680 262 S900 286 1020 258 S1260 292 1440 266 L1440 400 L0 400 Z", fill: "#86a58b", depth: 0.5 },
  { d: "M0 322 C160 300 260 318 400 298 S640 326 780 300 S1040 322 1180 296 S1360 318 1440 306 L1440 400 L0 400 Z", fill: "#5d8462", depth: 0.75 },
  { d: "M0 352 C180 334 300 350 460 336 S720 356 880 338 S1160 356 1300 340 S1400 348 1440 344 L1440 400 L0 400 Z", fill: "#355e43", depth: 1 },
];

export default function Ridgelines({ className = "", sun = true }: { className?: string; sun?: boolean }) {
  return (
    <svg aria-hidden className={className} viewBox="0 0 1440 400" preserveAspectRatio="xMidYMax slice" fill="none">
      <defs>
        <radialGradient id="rl-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffd28a" stopOpacity="0.95" />
          <stop offset="0.35" stopColor="#ffc77a" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffc77a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="rl-snow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7f9fa" />
          <stop offset="0.35" stopColor="#e3ecef" />
          <stop offset="0.6" stopColor="#c7d7df" />
        </linearGradient>
        <linearGradient id="rl-mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbf8f1" stopOpacity="0" />
          <stop offset="1" stopColor="#fbf8f1" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {sun && <circle cx="1040" cy="150" r="170" fill="url(#rl-sun)" />}
      {LAYERS.map((l, i) => (
        <g key={i} className="ridge-layer" style={{ ["--depth" as string]: l.depth }}>
          <path d={l.d} fill={l.snow ? "url(#rl-snow)" : l.fill} />
          {/* a band of morning mist settling in front of each far layer */}
          {i < 3 && <path d={l.d} fill="url(#rl-mist)" />}
        </g>
      ))}
    </svg>
  );
}
