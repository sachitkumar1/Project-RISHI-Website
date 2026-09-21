#!/usr/bin/env node
/**
 * Generates app/ai-theme.css — light and dark modes for the RISHI AI page.
 *
 *   node scripts/gen-ai-theme.mjs
 *
 * RISHI AI (components/AskPanel.tsx) is designed dark and is excluded from the
 * dashboard's general dark theme ([data-theme-fixed]). This scans its colour
 * classes and writes, scoped to its root ([data-ai]):
 *   • LIGHT mode (no html.dark): the site's warm white page, dark ink text,
 *     white cards, deeper amber for small marigold text; marigold buttons and
 *     citation chips unchanged.
 *   • DARK mode (html.dark): the same design on a deeper background.
 * The theme is the dashboard's own light/dark setting (components/ThemeToggle).
 * Re-run after changing AskPanel's colour classes.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "components/AskPanel.tsx");
const OUT = path.join(ROOT, "app/ai-theme.css");

const INK = [27, 38, 32], PAPER = [251, 248, 241], WHITE = [255, 255, 255];
const AMBER_TEXT = [154, 95, 10]; // marigold that reads on white
const DARKER_BG = [10, 22, 18];   // was #143628
const DARKER_PANEL = [14, 31, 24]; // was #0F2A1F

const src = fs.readFileSync(SRC, "utf8");
const RE = /(?<![\w-])((?:[a-z-]+:)*)(bg|text|border(?:-[trblxy])?|placeholder|from|via|to|shadow)-(\[#0F2A1F\]|\[0_18px_50px_rgba\(0,0,0,0\.35\)\]|paper|pine-deep|marigold-soft|marigold)(\/(?:\d+|\[[0-9.]+\]))?(?![\w-])/g;
const found = new Map();
for (const m of src.matchAll(RE)) {
  const a = m[4] === undefined ? null : m[4].startsWith("/[") ? Number(m[4].slice(2, -1)) : Number(m[4].slice(1)) / 100;
  found.set(m[0], { variants: m[1], prefix: m[2], color: m[3], alpha: a });
}

const rgba = ([r, g, b], a = 1) => `rgb(${r} ${g} ${b} / ${+a.toFixed(3)})`;
const esc = (s) => s.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
const kind = (p) => (p === "text" || p === "placeholder" ? "text" : p.startsWith("border") ? "border" : p);

/** Light-mode value for a class, or null to leave it as is. */
function light({ prefix, color, alpha }) {
  const k = kind(prefix), a = alpha ?? 1;
  if (color === "paper") {
    if (k === "text") return { color: rgba(INK, a < 0.6 ? Math.min(1, a + 0.08) : a) };
    if (k === "bg") return { "background-color": rgba(INK, a * 0.9) };
    if (k === "border") return { "border-color": rgba(INK, Math.max(0.08, a * 0.9)) };
  }
  if (color === "pine-deep") {
    if (k === "bg") return { "background-color": rgba(PAPER, a) };
    if (prefix === "from") return { "--tw-gradient-from": `${rgba(PAPER, a)} var(--tw-gradient-from-position)`, "--tw-gradient-to": `${rgba(PAPER, 0)} var(--tw-gradient-to-position)`, "--tw-gradient-stops": "var(--tw-gradient-from), var(--tw-gradient-to)" };
    if (prefix === "via") return { "--tw-gradient-to": `${rgba(PAPER, 0)} var(--tw-gradient-to-position)`, "--tw-gradient-stops": `var(--tw-gradient-from), ${rgba(PAPER, a)} var(--tw-gradient-via-position), var(--tw-gradient-to)` };
    return null; // text-pine-deep sits on marigold buttons: unchanged
  }
  if (color === "[#0F2A1F]" && k === "bg") return { "background-color": rgba(WHITE) };
  if (color === "marigold-soft" && k === "text") return { color: rgba(AMBER_TEXT, alpha === null ? 1 : Math.min(1, a + 0.1)) };
  if (color.startsWith("[0_18px") && prefix === "shadow") return { "--tw-shadow": "0 12px 34px rgb(20 54 40 / 0.12)" };
  return null;
}

/** Dark-mode value: the same design, deeper. */
function dark({ prefix, color, alpha }) {
  const a = alpha ?? 1;
  if (color === "pine-deep" && prefix === "bg") return { "background-color": rgba(DARKER_BG, a) };
  if (color === "pine-deep" && prefix === "from") return { "--tw-gradient-from": `${rgba(DARKER_BG, a)} var(--tw-gradient-from-position)`, "--tw-gradient-to": `${rgba(DARKER_BG, 0)} var(--tw-gradient-to-position)`, "--tw-gradient-stops": "var(--tw-gradient-from), var(--tw-gradient-to)" };
  if (color === "pine-deep" && prefix === "via") return { "--tw-gradient-to": `${rgba(DARKER_BG, 0)} var(--tw-gradient-to-position)`, "--tw-gradient-stops": `var(--tw-gradient-from), ${rgba(DARKER_BG, a)} var(--tw-gradient-via-position), var(--tw-gradient-to)` };
  if (color === "[#0F2A1F]" && prefix === "bg") return { "background-color": rgba(DARKER_PANEL) };
  return null;
}

const PSEUDO = { hover: ":hover", focus: ":focus", "focus-within": ":focus-within", disabled: ":disabled", "focus-visible": ":focus-visible" };
function selector(scope, cls, variants) {
  const vs = variants.split(":").filter(Boolean);
  let group = "", pseudo = "", element = "";
  for (const v of vs) {
    if (v === "group-hover") group = ".group:hover ";
    else if (v === "placeholder") element = "::placeholder";
    else if (v === "before") element = "::before";
    else if (PSEUDO[v]) pseudo += PSEUDO[v];
  }
  if (cls.includes("placeholder:")) element = "::placeholder";
  // Dark text on a marigold button keeps its colour in light mode too.
  const keep = cls.startsWith("text-paper") && !vs.length ? ":not(.bg-marigold)" : "";
  // Match the RISHI AI root itself as well as everything inside it (the page
  // background lives on the root element).
  const [theme] = scope.split(" ");
  const self = group ? `${theme} [data-ai] ${group}` : `${theme} :is([data-ai], [data-ai] *)`;
  return `${self}.${esc(cls)}${pseudo}${keep}${element}`;
}

// Original colours, for "keep as is" rules on interactive states: a remapped
// base colour must never beat an unchanged hover colour (e.g. a citation chip's
// amber text vs its dark-on-marigold hover).
const ORIGINAL = { "pine-deep": [20, 54, 40], marigold: [226, 160, 47], "marigold-soft": [242, 200, 121], paper: PAPER };
const identity = ({ prefix, color, alpha }) => {
  const rgb = ORIGINAL[color]; if (!rgb) return null;
  const k = kind(prefix), a = alpha ?? 1;
  return k === "text" ? { color: rgba(rgb, a) } : k === "bg" ? { "background-color": rgba(rgb, a) } : k === "border" ? { "border-color": rgba(rgb, a) } : null;
};

const out = { lightBase: [], lightVar: [], darkBase: [], darkVar: [] };
for (const [cls, info] of [...found.entries()].sort()) {
  const hasVariant = !!info.variants;
  const l = light(info) ?? (hasVariant ? identity(info) : null), d = dark(info);
  const decl = (o) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";");
  if (l) (hasVariant ? out.lightVar : out.lightBase).push(`${selector("html:not(.dark) [data-ai]", cls, info.variants)}{${decl(l)}}`);
  if (d) (hasVariant ? out.darkVar : out.darkBase).push(`${selector("html.dark [data-ai]", cls, info.variants)}{${decl(d)}}`);
}

const css = `/* GENERATED by scripts/gen-ai-theme.mjs — do not edit by hand. RISHI AI light/dark. */

/* The faint survey-grid texture: dark lines on the light page. */
html:not(.dark) [data-ai] [data-ai-grid] {
  background-image: linear-gradient(to right, #1B2620 1px, transparent 1px), linear-gradient(to bottom, #1B2620 1px, transparent 1px) !important;
  opacity: 0.045 !important;
}
html:not(.dark) [data-ai] { color-scheme: light; }
html.dark [data-ai] { color-scheme: dark; }

${out.lightBase.join("\n")}
${out.lightVar.join("\n")}
${out.darkBase.join("\n")}
${out.darkVar.join("\n")}
`;
fs.writeFileSync(OUT, css);
console.log(`wrote ${path.relative(ROOT, OUT)}: ${found.size} classes → ${out.lightBase.length + out.lightVar.length} light rules, ${out.darkBase.length + out.darkVar.length} dark rules`);
