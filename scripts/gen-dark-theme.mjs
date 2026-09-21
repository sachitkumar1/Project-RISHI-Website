#!/usr/bin/env node
/**
 * Generates app/dark-theme.css — the dashboard's dark mode.
 *
 *   node scripts/gen-dark-theme.mjs
 *
 * WHY GENERATED: the site styles everything with a small palette of Tailwind
 * colour classes (paper, ink, pine, sage, marigold, a few reds). Rather than add
 * a `dark:` twin to thousands of classes by hand, this scans the code for every
 * colour class actually used and writes one override per class, active only
 * when <html> has the `dark` class (set on /dashboard pages when a member
 * chooses dark mode — see components/ThemeToggle.tsx).
 *
 * RE-RUN IT after adding components that use new colour classes; otherwise a
 * new class simply keeps its light colour in dark mode.
 *
 * Rules of the mapping:
 *   • surfaces (paper, white) → deep green-black, a touch above the page
 *   • text (ink) → warm off-white; brand green text → soft mint
 *   • solid green buttons stay green (a little brighter), keeping light text
 *   • marigold stays marigold; its deep shade lightens for contrast
 *   • dark text ON a marigold button keeps its colour
 *   • anything inside [data-theme-fixed] is left alone (RISHI AI is already dark)
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "app/dark-theme.css");

// ---------------------------------------------------------------- palette
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const LIGHT = {
  paper: "#FBF8F1", ink: "#1B2620", pine: "#1E4D3A", "pine-deep": "#143628", "pine-soft": "#2C5F49",
  sage: "#5B7C6A", marigold: "#E2A02F", "marigold-deep": "#C27E18", "marigold-soft": "#F2C879",
  white: "#FFFFFF", black: "#000000",
  "red-50": "#FEF2F2", "red-100": "#FEE2E2", "red-200": "#FECACA", "red-300": "#FCA5A5",
  "red-500": "#EF4444", "red-600": "#DC2626", "red-700": "#B91C1C",
  "neutral-400": "#A3A3A3", "neutral-500": "#737373",
};
const D = {
  canvas: "#0C1612",   // page background
  surface: "#13201A",  // cards / panels (was paper)
  surface2: "#182820", // was white
  text: "#E6E2D5",     // was ink
  mint: "#7CC4A0",     // was pine, as text / tint / border
  mintLight: "#D9EEE2",// was pine-deep, as text (headings)
  sage: "#9DB8A9",
  // Solid greens: banners and primary buttons. Slightly deeper than the light
  // theme's pine so large banners sit quietly on the dark page.
  pineSolid: "#1F5541", pineDeepSolid: "#173D2F", pineSoftSolid: "#275E48",
  marigoldText: "#F2C879",
  redText: "#F4A095",
};

// Returns the dark colour for (property kind, colour, alpha) as [rgb, alpha],
// or null to keep the light colour.
function map(kind, color, alpha) {
  const solid = alpha === null;
  const a = solid ? 1 : alpha;
  const tint = (h, k = 1) => [hex(h), Math.min(1, a * k)];
  switch (color) {
    case "paper":
      if (kind === "bg" || kind === "grad") return [hex(D.surface), a];
      return null; // text/border/ring in paper sit on dark or green backgrounds already
    case "white":
      if (kind === "bg" || kind === "grad") return [hex(D.surface2), a];
      return null;
    case "ink":
      if (kind === "bg" && solid) return null; // a solid dark chip keeps its light text
      // Faint ink tints (≤20%) become faint light tints; heavy ones (≥40%) are
      // modal backdrops, which must darken the page, not wash it out.
      if (kind === "bg" && a >= 0.3) return [[3, 8, 6], Math.min(0.8, a + 0.2)];
      return [hex(D.text), a];
    case "pine": case "pine-soft":
      if (kind === "text" || kind === "placeholder" || kind === "decoration" || kind === "fill" || kind === "stroke") return [hex(D.mint), a];
      if (kind === "bg" || kind === "grad") return solid ? [hex(color === "pine" ? D.pineSolid : D.pineSoftSolid), 1] : tint(D.mint, 1.4);
      return solid ? [hex(D.mint), 0.55] : tint(D.mint, 1.25);
    case "pine-deep":
      if (kind === "text" || kind === "placeholder" || kind === "decoration" || kind === "fill" || kind === "stroke") return [hex(D.mintLight), a];
      if (kind === "bg" || kind === "grad") return solid ? [hex(D.pineDeepSolid), 1] : tint(D.mint, 1.4);
      return solid ? [hex(D.mint), 0.6] : tint(D.mintLight, 1.25);
    case "sage":
      if (kind === "text") return [hex(D.sage), a];
      return tint(D.mint, 1.2);
    case "marigold":
      return null;
    case "marigold-deep":
      if (kind === "text" || kind === "decoration") return [hex(D.marigoldText), a];
      return null;
    case "marigold-soft":
      if (kind === "bg" || kind === "grad") return [hex(LIGHT.marigold), solid ? 0.18 : Math.min(1, a * 0.3)];
      return null;
    case "red-50": case "red-100":
      if (kind === "bg") return [hex(D.redText), solid ? (color === "red-50" ? 0.1 : 0.15) : a * 0.2];
      return [hex(D.redText), a];
    case "red-200": case "red-300":
      if (kind === "bg") return [hex(D.redText), 0.2];
      return [hex(D.redText), solid ? 0.4 : a];
    case "red-500": case "red-600": case "red-700":
      if (kind === "bg" && solid) return null;
      return [hex(D.redText), a];
    case "neutral-400": case "neutral-500":
      if (kind === "text") return [hex(D.text), 0.5];
      return null;
    case "black":
      return null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------- scan
const files = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (/node_modules|\.next/.test(p)) continue;
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts|jsx|js)$/.test(f)) files.push(p);
  }
};
for (const d of ["app", "components", "lib"]) walk(path.join(ROOT, d));

const PAL = Object.keys(LIGHT).sort((a, b) => b.length - a.length).join("|");
const PREFIX = "bg|text|border-[trblxy]|border|ring-offset|ring|divide|from|via|to|placeholder|decoration|outline|fill|stroke|accent|caret";
const RE = new RegExp(`(?<![\\w-])((?:[a-z-]+:)*)(${PREFIX})-(${PAL})(?:\\/(\\d+|\\[[0-9.]+\\]))?(?![\\w-])`, "g");
const ARB = /(?<![\w-])((?:[a-z-]+:)*)(bg|text|border)-\[(#[0-9a-fA-F]{6})\](?![\w-])/g;

const found = new Map(); // class → { variants, prefix, color, alpha, arbitrary? }
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(RE)) {
    const alpha = m[4] === undefined ? null : m[4].startsWith("[") ? Number(m[4].slice(1, -1)) : Number(m[4]) / 100;
    found.set(m[0], { variants: m[1], prefix: m[2], color: m[3], alpha });
  }
  for (const m of src.matchAll(ARB)) found.set(m[0], { variants: m[1], prefix: m[2], arbitrary: m[3] });
}

// ---------------------------------------------------------------- emit
const esc = (s) => s.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
const rgba = ([r, g, b], a) => `rgb(${r} ${g} ${b} / ${+a.toFixed(3)})`;
const kindOf = (p) => p === "bg" ? "bg" : p === "text" ? "text" : p.startsWith("border") || p === "divide" ? "border"
  : p === "from" || p === "via" || p === "to" ? "grad" : p === "placeholder" ? "placeholder" : p === "decoration" ? "decoration"
  : p === "fill" ? "fill" : p === "stroke" ? "stroke" : p;
const PROP = {
  bg: ["background-color"], text: ["color"], border: ["border-color"], "border-t": ["border-top-color"],
  "border-b": ["border-bottom-color"], "border-l": ["border-left-color"], "border-r": ["border-right-color"],
  "border-x": ["border-left-color", "border-right-color"], "border-y": ["border-top-color", "border-bottom-color"],
  ring: ["--tw-ring-color"], "ring-offset": ["--tw-ring-offset-color"], divide: ["border-color"], placeholder: ["color"],
  decoration: ["text-decoration-color"], outline: ["outline-color"], fill: ["fill"], stroke: ["stroke"],
  accent: ["accent-color"], caret: ["caret-color"],
};
const PSEUDO = { hover: ":hover", focus: ":focus", "focus-visible": ":focus-visible", "focus-within": ":focus-within", disabled: ":disabled", active: ":active" };
const EXEMPT = ":not(:where([data-theme-fixed], [data-theme-fixed] *))";

const base = [], variant = [];
let skipped = 0;
for (const [cls, info] of [...found.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  if (info.prefix === "from" || info.prefix === "via" || info.prefix === "to") { skipped++; continue; } // gradients: none in the dashboard
  let value;
  if (info.arbitrary) {
    const [r, g, b] = hex(info.arbitrary);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    value = lum > 0.6 && info.prefix === "bg" ? [hex(D.text), 0.08] : [[r, g, b], 1]; // light arbitrary backgrounds → faint tint
  } else {
    value = map(kindOf(info.prefix), info.color, info.alpha) ?? [hex(LIGHT[info.color]), info.alpha ?? 1];
  }
  const props = PROP[info.prefix]; if (!props) { skipped++; continue; }

  const vs = info.variants.split(":").filter(Boolean);
  let group = "", pseudo = "", element = "";
  for (const v of vs) {
    if (v === "group-hover") group = ".group:hover ";
    else if (v === "placeholder") element = "::placeholder";
    else if (v === "before") element = "::before";
    else if (PSEUDO[v]) pseudo += PSEUDO[v];
  }
  if (info.prefix === "placeholder") element = "::placeholder";

  // Dark text stays dark on a marigold button (base state, and on hover).
  let keep = "";
  if (info.prefix === "text") keep = vs.includes("hover") ? `:not(.${esc("hover:bg-marigold")})` : vs.length ? "" : ":not(.bg-marigold)";

  const tail = info.prefix === "divide" ? " > :not([hidden]) ~ :not([hidden])" : "";
  const sel = `html.dark ${group}.${esc(cls)}${pseudo}${keep}${EXEMPT}${tail}${element}`;
  const decl = props.map((p) => `${p}:${rgba(value[0], value[1])}`).join(";");
  (vs.length ? variant : base).push(`${sel}{${decl}}`);
}

const css = `/* GENERATED by scripts/gen-dark-theme.mjs — do not edit by hand.
   ${found.size} colour classes from ${files.length} files. Re-run after adding components. */

html.dark { color-scheme: dark; }
html.dark body { background-color: ${D.canvas}; color: ${D.text}; }
:where(html.dark *, html.dark ::before, html.dark ::after) { border-color: rgb(230 226 213 / 0.12); }
html.dark ::selection { background-color: rgb(226 160 47 / 0.35); color: #fff; }

/* Form fields with no colour of their own: the site's surface instead of the
   browser's grey. :where() keeps this at zero priority, so any field that sets
   its own background (e.g. transparent) keeps it. */
:where(html.dark) :where(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select) {
  background-color: ${D.surface2};
}

/* Shared styles that aren't utility classes (globals.css / page-local CSS). */
html.dark .btn-primary { background-color: ${D.pineSolid}; }
html.dark .btn-primary:hover { background-color: ${D.pineDeepSolid}; }
html.dark .btn-ghost { border-color: rgb(124 196 160 / 0.4); color: ${D.mint}; }
html.dark .btn-ghost:hover { background-color: ${D.pineSolid}; border-color: ${D.pineSolid}; color: ${LIGHT.paper}; }
html.dark .field { background: ${D.surface2}; color: ${D.text}; border-color: rgb(124 196 160 / 0.25); }
html.dark .field::placeholder { color: rgb(230 226 213 / 0.4); }
html.dark .familytree { --ft-line: rgb(124 196 160 / 0.35); }
html.dark .ft-node { background: ${D.surface}; color: ${D.text}; border-color: rgb(124 196 160 / 0.25); }
html.dark .ft-node--me { background: ${LIGHT.marigold}; color: ${LIGHT["pine-deep"]}; border-color: ${LIGHT["marigold-deep"]}; }
html.dark .ft-badge { background: ${D.pineSolid}; color: ${LIGHT.paper}; }

/* The logo's lettering is black; swap to the light variant. */
html.dark img[data-logo="light"] { display: none; }
html:not(.dark) img[data-logo="dark"] { display: none; }

/* Base states first, then hover/focus variants, so interactions still win. */
${base.join("\n")}
${variant.join("\n")}
`;
fs.writeFileSync(OUT, css);
console.log(`wrote ${path.relative(ROOT, OUT)}: ${base.length + variant.length} rules (${base.length} base, ${variant.length} interactive), ${skipped} skipped`);
