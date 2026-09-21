"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

/* RISHI AI — the archive agent's workspace.
 *
 *   ┌ rail ──────┐┌ conversation ─────────────────┐┌ sources ─────┐
 *   │ new chat   ││ question (display serif)       ││ [1] file     │
 *   │ this       ││ trace ▸ searching · reading …  ││     excerpt  │
 *   │ session    ││ answer with ① citations        ││ [2] file     │
 *   │ archive    ││                                ││              │
 *   │ status     ││ ╭ composer ──────────────────╮ ││              │
 *   └────────────┘└─╰────────────────────────────╯─┘└──────────────┘
 *
 * One signal colour (marigold) marks activity, citations and focus; pine is the
 * canvas. Model names arrive only for the people allowed to see them — the
 * server strips them for everyone else, so this component never has to hide one.
 */

type Source = {
  n: number; fileId: string; name: string; path: string; year: string | null;
  modifiedAt: string | null; link: string | null; cited: boolean; excerpts?: string[];
};
type Exchange = {
  id: number;
  q: string;
  status: "asking" | "done" | "error";
  startedAt: number;
  ms?: number;
  answer?: string;
  sources?: Source[];
  model?: string | null;
  error?: string;
  depth?: DepthKey;
};
type DepthKey = "quick" | "standard" | "detailed" | "deep";
type Status = {
  enabled: boolean;
  index?: { passages: number; semanticPct: number };
  credits?: { daily: number; left: number; unlimited?: boolean; resetsAt?: string };
  depths?: Record<DepthKey, { label: string; weight: number }>;
  defaultDepth?: DepthKey;
};
const DEPTH_ORDER: DepthKey[] = ["quick", "standard", "detailed", "deep"];
const DEPTH_HINT: Record<DepthKey, string> = {
  quick: "Short answer from up to 5 files",
  standard: "Thorough answer from up to 8 files",
  detailed: "Comprehensive answer from up to 12 files",
  deep: "Research report from up to 24 files — slowest",
};
const DEFAULT_WEIGHTS: Record<DepthKey, number> = { quick: 1, standard: 2, detailed: 4, deep: 8 };
const DEFAULT_LABELS: Record<DepthKey, string> = { quick: "Quick", standard: "Standard", detailed: "Detailed", deep: "Deep Research" };
const isDepthKey = (v: unknown): v is DepthKey => v === "quick" || v === "standard" || v === "detailed" || v === "deep";
const DEPTH_STORE = "rishi:ai-depth";

const EXAMPLES = [
  { q: "What happened with the microfinance initiative by Women's Empowerment?", tag: "Projects" },
  { q: "What did we say to Asha ji the last time we talked to her?", tag: "Partners" },
  { q: "What are some NGOs Women's Empowerment has worked with in the past?", tag: "NGOs" },
  { q: "What projects has Health worked on in the past year?", tag: "Health" },
];

// The pipeline's real stages, in order. Timing is approximate — the server
// answers in one request — but the order is exactly what happens.
const STAGES = [
  { at: 0, label: "Searching the archive" },
  { at: 1500, label: "Reading the most relevant passages" },
  { at: 3500, label: "Writing the answer" },
];

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

// ------------------------------------------------------------------ answer text
/** Paragraphs, "- " lists, **bold**, and [n] citations as buttons. The model's
 *  text is never injected as HTML. */
function AnswerText({ text, onCite }: { text: string; onCite: (n: number) => void }) {
  const inline = (line: string, key: string) =>
    line.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, i) => {
      const cite = part.match(/^\[(\d+)\]$/);
      if (cite) {
        const n = Number(cite[1]);
        return (
          <button key={`${key}-${i}`} onClick={() => onCite(n)} aria-label={`Show source ${n}`}
            className="mx-0.5 inline-grid h-[1.2rem] min-w-[1.2rem] -translate-y-[0.2em] place-items-center rounded-md border border-marigold/40 bg-marigold/10 px-1 align-baseline font-mono text-[0.65rem] font-semibold text-marigold-soft transition-colors hover:border-marigold hover:bg-marigold hover:text-pine-deep">
            {n}
          </button>
        );
      }
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={`${key}-${i}`} className="font-semibold text-paper">{part.slice(2, -2)}</strong>;
      return <React.Fragment key={`${key}-${i}`}>{part}</React.Fragment>;
    });
  return (
    <div className="space-y-3 text-[15px] leading-7 text-paper/80">
      {text.split(/\n{2,}/).flatMap((b, bi) => {
        // A paragraph can mix an intro line with list items ("We did:\n* a\n* b"),
        // so group consecutive bullet / non-bullet lines instead of requiring
        // the whole paragraph to be one or the other.
        const isBullet = (l: string) => /^\s*[-*•]\s+/.test(l);
        const groups: { list: boolean; lines: string[] }[] = [];
        for (const l of b.split("\n").filter((x) => x.trim())) {
          const list = isBullet(l);
          const last = groups[groups.length - 1];
          if (last && last.list === list) last.lines.push(l); else groups.push({ list, lines: [l] });
        }
        return groups.map((g, gi) => g.list ? (
          <ul key={`${bi}-${gi}`} className="space-y-1.5">
            {g.lines.map((l, li) => (
              <li key={li} className="relative pl-5 before:absolute before:left-1 before:top-[0.7em] before:h-1 before:w-1 before:rounded-full before:bg-marigold">
                {inline(l.replace(/^\s*[-*•]\s+/, ""), `${bi}-${gi}-${li}`)}
              </li>
            ))}
          </ul>
        ) : (
          <p key={`${bi}-${gi}`}>{g.lines.map((l, li) => <React.Fragment key={li}>{li > 0 && <br />}{inline(l, `${bi}-${gi}-${li}`)}</React.Fragment>)}</p>
        ));
      })}
    </div>
  );
}

// ----------------------------------------------------------------------- trace
function Trace({ ex }: { ex: Exchange }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (ex.status !== "asking") return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [ex.status]);

  if (ex.status !== "asking") {
    const n = ex.sources?.filter((s) => s.cited).length ?? 0;
    return (
      <p className="font-mono text-[11px] tracking-wide text-paper/40">
        {ex.status === "done"
          ? `${ex.sources?.length ? `${n || ex.sources.length} ${n === 1 || (!n && ex.sources.length === 1) ? "source" : "sources"}` : "no sources"} · ${secs(ex.ms ?? 0)}`
          : `stopped · ${secs(ex.ms ?? 0)}`}
      </p>
    );
  }
  const elapsed = now - ex.startedAt;
  const active = STAGES.filter((s) => elapsed >= s.at).length - 1;
  return (
    <ol className="space-y-2" role="status" aria-live="polite">
      {STAGES.map((s, i) => (
        <li key={s.label} className={`flex items-center gap-3 text-sm transition-opacity ${i > active ? "opacity-30" : ""}`}>
          <span className="relative grid h-4 w-4 place-items-center">
            {i < active ? (
              <svg className="h-3.5 w-3.5 text-marigold" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12l5 5L20 7" /></svg>
            ) : i === active ? (
              <>
                <span className="absolute h-4 w-4 animate-ping rounded-full bg-marigold/40" />
                <span className="h-2 w-2 rounded-full bg-marigold" />
              </>
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-paper/40" />
            )}
          </span>
          <span className={i === active ? "text-paper" : "text-paper/55"}>{s.label}</span>
          {i === active && <span className="ml-auto font-mono text-[11px] text-paper/40">{secs(elapsed)}</span>}
        </li>
      ))}
    </ol>
  );
}

// --------------------------------------------------------------------- sources
function SourceCard({ s, active, onRef }: { s: Source; active: boolean; onRef?: (el: HTMLLIElement | null) => void }) {
  const excerpt = (s.excerpts?.[0] ?? "").replace(/\s+/g, " ").trim();
  return (
    <li ref={onRef}
      className={`scroll-mt-4 rounded-xl border p-3 transition-colors ${active ? "border-marigold/70 bg-marigold/10" : s.cited ? "border-paper/15 bg-paper/[0.04]" : "border-paper/10 bg-transparent"}`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 grid h-5 min-w-[1.25rem] place-items-center rounded-md font-mono text-[0.65rem] font-semibold ${s.cited ? "bg-marigold text-pine-deep" : "bg-paper/10 text-paper/50"}`}>{s.n}</span>
        <div className="min-w-0 flex-1">
          {s.link ? (
            <a href={s.link} target="_blank" rel="noreferrer" className="group inline-flex items-start gap-1 text-sm font-medium leading-snug text-paper hover:text-marigold-soft">
              <span>{s.name}</span>
              <svg className="mt-0.5 h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7M9 7h8v8" /></svg>
            </a>
          ) : <span className="text-sm font-medium text-paper">{s.name}</span>}
          <p className="mt-0.5 truncate font-mono text-[10.5px] text-paper/40">
            {[s.year, s.path].filter(Boolean).join(" / ")}{s.modifiedAt ? ` · ${fmtDate(s.modifiedAt)}` : ""}
          </p>
          {excerpt && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-paper/55">{excerpt}</p>}
        </div>
      </div>
    </li>
  );
}

function SourceList({ sources, activeN, register }: { sources: Source[]; activeN: number | null; register?: (n: number, el: HTMLLIElement | null) => void }) {
  const [all, setAll] = useState(false);
  const cited = sources.filter((s) => s.cited);
  const shown = all || !cited.length ? sources : cited;
  return (
    <div>
      <ul className="space-y-2">
        {shown.map((s) => <SourceCard key={s.n} s={s} active={activeN === s.n} onRef={register ? (el) => register(s.n, el) : undefined} />)}
      </ul>
      {cited.length > 0 && cited.length < sources.length && (
        <button onClick={() => setAll((v) => !v)} className="mt-3 font-mono text-[11px] text-paper/50 hover:text-marigold-soft">
          {all ? "− only cited" : `+ ${sources.length - cited.length} more searched`}
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- save chat
/** Everything is built in the browser from the conversation on screen — saving
 *  never touches the server. */
const escHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function answerToHtml(text: string, anchor: string): string {
  const inline = (l: string) => escHtml(l)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(\d+)\]/g, `<a class="cite" href="#${anchor}-$1">$1</a>`);
  return text.split(/\n{2,}/).map((block) => {
    const lines = block.split("\n").filter((x) => x.trim());
    const out: string[] = []; let list: string[] = [];
    const flush = () => { if (list.length) { out.push(`<ul>${list.map((x) => `<li>${x}</li>`).join("")}</ul>`); list = []; } };
    let para: string[] = [];
    const flushP = () => { if (para.length) { out.push(`<p>${para.join("<br>")}</p>`); para = []; } };
    for (const l of lines) {
      if (/^\s*[-*•]\s+/.test(l)) { flushP(); list.push(inline(l.replace(/^\s*[-*•]\s+/, ""))); }
      else { flush(); para.push(inline(l)); }
    }
    flushP(); flush();
    return out.join("");
  }).join("");
}

function exportChat(thread: Exchange[], format: "html" | "md") {
  const done = thread.filter((t) => t.status === "done" && t.answer);
  if (!done.length) return;
  const when = new Date();
  const stamp = when.toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });
  const fileDate = when.toISOString().slice(0, 10);
  let body: string, type: string, ext: string;

  if (format === "md") {
    body = `# RISHI AI conversation\n\n_Saved ${stamp}_\n\n` + done.map((t, i) => {
      const srcs = (t.sources ?? []).filter((s) => s.cited || !(t.sources ?? []).some((x) => x.cited));
      return `## ${i + 1}. ${t.q}\n\n` +
        `_${DEFAULT_LABELS[t.depth ?? "standard"]} answer${t.model ? ` · ${t.model}` : ""}_\n\n${t.answer}\n\n` +
        (srcs.length ? `**Sources**\n\n${srcs.map((s) => `${s.n}. ${s.link ? `[${s.name}](${s.link})` : s.name}${s.year || s.path ? ` — ${[s.year, s.path].filter(Boolean).join(" / ")}` : ""}`).join("\n")}\n` : "");
    }).join("\n---\n\n");
    type = "text/markdown"; ext = "md";
  } else {
    const sections = done.map((t, i) => {
      const anchor = `q${i + 1}`;
      const srcs = (t.sources ?? []).filter((s) => s.cited || !(t.sources ?? []).some((x) => x.cited));
      return `<section><h2>${escHtml(t.q)}</h2>
<p class="meta">${DEFAULT_LABELS[t.depth ?? "standard"]} answer${t.model ? ` · ${escHtml(t.model)}` : ""}</p>
${answerToHtml(t.answer!, anchor)}
${srcs.length ? `<h3>Sources</h3><ol class="sources">${srcs.map((s) => `<li id="${anchor}-${s.n}" value="${s.n}">${s.link ? `<a href="${escHtml(s.link)}">${escHtml(s.name)}</a>` : escHtml(s.name)}<span>${escHtml([s.year, s.path].filter(Boolean).join(" / "))}</span></li>`).join("")}</ol>` : ""}
</section>`;
    }).join("\n");
    body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>RISHI AI conversation — ${escHtml(fileDate)}</title>
<style>
  body{font:16px/1.65 Georgia,"Times New Roman",serif;color:#1B2620;background:#FBF8F1;margin:0}
  main{max-width:760px;margin:0 auto;padding:48px 24px}
  header{border-bottom:3px solid #E2A02F;padding-bottom:16px;margin-bottom:32px}
  header h1{font-size:28px;margin:0;color:#143628} header p{margin:4px 0 0;color:#5b6b62;font:13px system-ui,sans-serif}
  section{margin:0 0 40px;padding-bottom:32px;border-bottom:1px solid #e3ddd0}
  h2{font-size:21px;color:#143628;margin:0 0 4px} h3{font:600 12px system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#5b6b62;margin:24px 0 8px}
  .meta{font:12px system-ui,sans-serif;color:#7a877f;margin:0 0 14px}
  a.cite{display:inline-block;min-width:1.2em;padding:0 4px;margin:0 1px;border-radius:4px;background:#F2C879;color:#143628;font:600 11px system-ui,sans-serif;text-align:center;text-decoration:none;vertical-align:1px}
  ol.sources{font:14px system-ui,sans-serif;padding-left:22px} ol.sources li{margin:4px 0} ol.sources span{display:block;color:#7a877f;font-size:12px}
  ol.sources a{color:#1F4D3A}
  @media print{body{background:#fff} a{color:inherit}}
</style></head><body><main>
<header><h1>RISHI AI conversation</h1><p>Project RISHI at UC Berkeley · saved ${escHtml(stamp)}</p></header>
${sections}
</main></body></html>`;
    type = "text/html"; ext = "html";
  }
  const url = URL.createObjectURL(new Blob([body], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url; a.download = `rishi-ai-chat-${fileDate}.${ext}`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SaveChatButton({ thread, compact = false }: { thread: Exchange[]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const ready = thread.some((t) => t.status === "done" && t.answer);
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} disabled={!ready} aria-haspopup="menu" aria-expanded={open}
        className={`flex items-center gap-2 rounded-lg border border-paper/15 text-paper/80 transition-colors hover:border-marigold/60 hover:text-paper disabled:opacity-40 ${compact ? "px-2.5 py-1.5 text-xs" : "w-full justify-between px-3 py-2 text-sm"}`}>
        Save chat
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
      </button>
      {open && (
        <div role="menu" className={`absolute z-30 mt-1.5 w-60 rounded-xl border border-paper/15 bg-[#0F2A1F] p-1.5 shadow-2xl ${compact ? "right-0" : "left-0"}`}>
          {([["html", "Document (.html)", "Opens in any browser; print it to PDF"], ["md", "Text (.md)", "For Notion, Google Docs or notes apps"]] as const).map(([f, label, hint]) => (
            <button key={f} role="menuitem" onClick={() => { exportChat(thread, f); setOpen(false); }}
              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-paper/10">
              <span className="block text-sm text-paper">{label}</span>
              <span className="block text-[11px] text-paper/45">{hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------- usage
function UsagePanel({ status, remaining }: { status: Status | null; remaining: number | null }) {
  const c = status?.credits;
  const unlimited = !!c?.unlimited || (remaining !== null && remaining >= 999);
  const daily = c?.daily ?? 30;
  const left = unlimited ? daily : Math.max(0, remaining ?? c?.left ?? daily);
  const reset = c?.resetsAt ? new Date(c.resetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "midnight";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10.5px] text-paper/35">Usage today</p>
        <p className="font-mono text-[11px] text-paper/70">{unlimited ? "unlimited" : `${left} / ${daily} credits`}</p>
      </div>
      {!unlimited && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-paper/10" role="meter" aria-valuemin={0} aria-valuemax={daily} aria-valuenow={left} aria-label="Credits left today">
          <div className="h-full rounded-full bg-marigold transition-all" style={{ width: `${(100 * left) / daily}%` }} />
        </div>
      )}
      <table className="mt-3 w-full font-mono text-[10.5px] text-paper/55">
        <tbody>
          {DEPTH_ORDER.map((d) => {
            const w = status?.depths?.[d]?.weight ?? DEFAULT_WEIGHTS[d];
            return (
              <tr key={d}>
                <td className="py-0.5 text-paper/75">{status?.depths?.[d]?.label ?? DEFAULT_LABELS[d]}</td>
                <td className="py-0.5 text-right">{w} {w === 1 ? "credit" : "credits"}</td>
                <td className="w-12 py-0.5 text-right text-paper/40">{unlimited ? "—" : `×${Math.floor(left / w)}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10.5px] leading-relaxed text-paper/35">
        {unlimited ? "No daily limit on this account." : `Resets at ${reset}. ×n is how many more answers of that level you can ask today.`}
      </p>
    </div>
  );
}

// ------------------------------------------------------- deep research notice
function DeepResearchNotice({ credits, onConfirm, onCancel }: { credits: { left: number; unlimited: boolean; weight: number }; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onCancel]);
  const n = Math.floor(credits.left / credits.weight);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-5" role="dialog" aria-modal="true" aria-labelledby="deep-title" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl border border-paper/15 bg-[#0F2A1F] p-6 text-paper shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="font-mono text-[10.5px] text-marigold-soft">Deep Research</p>
        <h2 id="deep-title" className="mt-1 font-display text-2xl font-semibold">A longer, slower answer</h2>
        <ul className="mt-4 space-y-2.5 text-sm leading-relaxed text-paper/75">
          <li><strong className="text-paper">Reads twice as much as Detailed:</strong> up to 24 files, then writes a structured report with a summary, timeline, people involved and open questions.</li>
          <li><strong className="text-paper">Takes about 30–60 seconds.</strong> Keep this page open while it works. If the assistant is very busy it may not finish in time, and you can simply try again.</li>
          <li><strong className="text-paper">Uses {credits.weight} credits per answer,</strong> {credits.unlimited ? "and this account has no daily limit." : `so you have ${n} Deep Research ${n === 1 ? "answer" : "answers"} left today.`}</li>
        </ul>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg px-4 py-2 text-sm text-paper/70 hover:text-paper">Cancel</button>
          <button onClick={onConfirm} disabled={!credits.unlimited && n < 1} autoFocus
            className="rounded-lg bg-marigold px-4 py-2 text-sm font-semibold text-pine-deep hover:bg-marigold-soft disabled:opacity-40">
            Use Deep Research
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------- page
export default function AskPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [thread, setThread] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null); // credits left today
  const [depth, setDepth] = useState<DepthKey>("standard");
  useEffect(() => {
    // Deep Research is never restored silently — it's slow and costly, so it
    // always goes through its notice first.
    try { const v = window.localStorage.getItem(DEPTH_STORE); if (isDepthKey(v) && v !== "deep") setDepth(v); } catch { /* ignore */ }
  }, []);
  const [deepNotice, setDeepNotice] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false); // phone-width usage sheet
  const applyDepth = (d: DepthKey) => { setDepth(d); try { window.localStorage.setItem(DEPTH_STORE, d); } catch { /* ignore */ } };
  const chooseDepth = (d: DepthKey) => { if (d === "deep" && depth !== "deep") setDeepNotice(true); else applyDepth(d); };
  const [selected, setSelected] = useState<number | null>(null); // exchange id shown in the inspector
  const [activeN, setActiveN] = useState<number | null>(null);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cardRefs = useRef(new Map<number, HTMLLIElement>());
  const exRefs = useRef(new Map<number, HTMLElement>());
  const busy = thread.some((t) => t.status === "asking");

  useEffect(() => {
    fetch("/api/lms/ask").then((r) => (r.ok ? r.json() : null))
      .then((d) => { setStatus(d ?? { enabled: false }); if (typeof d?.credits?.left === "number") setRemaining(d.credits.left); })
      .catch(() => setStatus({ enabled: false }));
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [thread.length]);
  useEffect(() => { // grow the composer with its content
    const el = inputRef.current; if (!el) return;
    el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [draft]);

  const inspected = useMemo(
    () => thread.find((t) => t.id === selected) ?? [...thread].reverse().find((t) => t.status === "done" && t.sources?.length),
    [thread, selected],
  );

  const submit = useCallback(async (text?: string, replaceId?: number) => {
    const q = (text ?? draft).trim();
    if (q.length < 3 || busy || !status?.enabled) return;
    if (text === undefined) setDraft("");
    const history = thread.filter((t) => t.status === "done" && t.answer).slice(-2).map((t) => ({ q: t.q, a: t.answer! }));
    const id = nextId.current++;
    const startedAt = Date.now();
    setThread((t) => [...t.filter((x) => x.id !== replaceId), { id, q, status: "asking", startedAt, depth }]);
    try {
      const r = await fetch("/api/lms/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, history, depth }) });
      const d = await r.json().catch(() => ({}));
      if (typeof d.remainingToday === "number") setRemaining(d.remainingToday);
      const ms = Date.now() - startedAt;
      setThread((t) => t.map((x) => (x.id !== id ? x : d.ok
        ? { ...x, status: "done", ms, answer: d.answer, sources: d.sources, model: d.model }
        : { ...x, status: "error", ms, error: d.error || "Something went wrong answering that." })));
      if (d.ok) { setSelected(id); setActiveN(null); }
    } catch {
      setThread((t) => t.map((x) => (x.id === id
        ? { ...x, status: "error", ms: Date.now() - startedAt, error: "The connection dropped before the answer arrived. This can happen if the page is left or the phone sleeps while it's working." }
        : x)));
    }
  }, [draft, busy, status, thread, depth]);

  const cite = (exId: number, n: number) => {
    setSelected(exId);
    setActiveN(n);
    // Desktop: the inspector card. Mobile: the inline list under the answer.
    requestAnimationFrame(() => {
      const card = window.matchMedia("(min-width: 1280px)").matches
        ? cardRefs.current.get(n)
        : document.getElementById(`src-${exId}-${n}`);
      card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const idx = status?.index;
  const statusLine = idx && idx.passages > 0
    ? `${idx.passages.toLocaleString()} passages · ${idx.semanticPct}% semantic`
    : "indexing";

  return (
    // data-theme-fixed: the dashboard's general dark theme leaves RISHI AI alone;
    // data-ai: RISHI AI's own light/dark versions (app/ai-theme.css, generated by
    // scripts/gen-ai-theme.mjs) follow the one dashboard-wide theme setting.
    <div data-theme-fixed data-ai className="relative min-h-[calc(100vh-var(--header-h))] bg-pine-deep text-paper">
      {/* texture: a faint survey grid */}
      <div aria-hidden data-ai-grid className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: "linear-gradient(to right, #FBF8F1 1px, transparent 1px), linear-gradient(to bottom, #FBF8F1 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)" }} />

      <div className="relative mx-auto grid max-w-[1440px] xl:grid-cols-[240px_minmax(0,1fr)_340px]">
        {/* ───────────── rail ───────────── */}
        <aside className="hidden border-r border-paper/10 xl:block">
          <div className="sticky top-[var(--header-h)] flex h-[calc(100vh-var(--header-h))] flex-col p-5">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-xs font-semibold text-paper/50 hover:text-paper">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
              Dashboard
            </Link>
            <button onClick={() => { setThread([]); setSelected(null); setActiveN(null); inputRef.current?.focus(); }} disabled={busy}
              className="mt-6 flex items-center justify-between rounded-lg border border-paper/15 px-3 py-2 text-sm text-paper/80 transition-colors hover:border-marigold/60 hover:text-paper disabled:opacity-40">
              New conversation
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
            </button>
            <div className="mt-2"><SaveChatButton thread={thread} /></div>
            <p className="mt-7 font-mono text-[10.5px] text-paper/35">This session</p>
            <ol className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto">
              {thread.length === 0 && <li className="text-xs text-paper/30">Nothing asked yet.</li>}
              {thread.map((t) => (
                <li key={t.id}>
                  <button onClick={() => { exRefs.current.get(t.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); if (t.status === "done") setSelected(t.id); }}
                    className={`w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors ${inspected?.id === t.id ? "bg-paper/10 text-paper" : "text-paper/55 hover:bg-paper/5 hover:text-paper/80"}`}>
                    {t.q}
                  </button>
                </li>
              ))}
            </ol>
            <div className="mt-4 border-t border-paper/10 pt-4">
              <UsagePanel status={status} remaining={remaining} />
            </div>
            <div className="mt-4 space-y-2 border-t border-paper/10 pt-4 font-mono text-[10.5px] leading-relaxed text-paper/45">
              <p className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${status?.enabled ? "bg-marigold shadow-[0_0_8px_#E2A02F]" : "bg-paper/30"}`} />
                {status == null ? "connecting…" : status.enabled ? "archive online" : "offline"}
              </p>
              <p>{statusLine}</p>
              <p className="text-paper/30">answers use only files you can open</p>
            </div>
          </div>
        </aside>

        {/* ─────────── conversation ─────────── */}
        <main className="flex min-h-[calc(100vh-var(--header-h))] min-w-0 flex-col px-5 sm:px-8">
          <header className="flex items-center justify-between gap-4 pb-2 pt-8">
            <div className="flex items-center gap-3">
              <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-marigold text-pine-deep">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /><path d="M8.5 11h5M11 8.5v5" /></svg>
              </span>
              <div>
                <h1 className="font-display text-2xl font-semibold leading-none">RISHI AI</h1>
                <p className="mt-1 font-mono text-[10.5px] text-paper/40 xl:hidden">{status?.enabled ? statusLine : "offline"}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 xl:hidden">
              <button onClick={() => setUsageOpen(true)} className="rounded-lg border border-paper/15 px-2.5 py-1.5 text-xs text-paper/80 hover:border-marigold/60">Usage</button>
              <SaveChatButton thread={thread} compact />
            </div>
          </header>
          {usageOpen && (
            <div className="fixed inset-0 z-[70] flex items-end bg-black/60 xl:hidden" onClick={() => setUsageOpen(false)} role="dialog" aria-modal="true" aria-label="Usage">
              <div className="w-full rounded-t-2xl border-t border-paper/15 bg-[#0F2A1F] p-5 pb-8" onClick={(e) => e.stopPropagation()}>
                <UsagePanel status={status} remaining={remaining} />
                <button onClick={() => setUsageOpen(false)} className="mt-4 w-full rounded-lg bg-paper/10 py-2 text-sm text-paper">Close</button>
              </div>
            </div>
          )}

          <div className="mx-auto w-full max-w-[760px] flex-1 pb-6 pt-6">
            {status && !status.enabled && (
              <p className="rounded-xl border border-dashed border-paper/20 p-5 text-sm text-paper/60">RISHI AI isn&apos;t switched on yet. The webmaster needs to add a Gemini API key.</p>
            )}

            {thread.length === 0 && status?.enabled && (
              <section className="pt-6 sm:pt-12">
                <h2 className="max-w-[18ch] font-display text-4xl font-semibold leading-[1.1] text-paper sm:text-5xl">
                  Ask Anything RISHI
                </h2>
                <p className="mt-4 max-w-[58ch] text-[15px] leading-7 text-paper/60">
                  RISHI AI reads across every document you have access to, such as project notes, partner calls, surveys,
                  budgets, meeting agendas, and more, and answers with a citation for every claim.
                </p>
                <div className="mt-8 grid gap-2.5 sm:grid-cols-2">
                  {EXAMPLES.map((e) => (
                    <button key={e.q} onClick={() => void submit(e.q)}
                      className="group rounded-xl border border-paper/15 bg-paper/[0.03] p-4 text-left transition-colors hover:border-marigold/60 hover:bg-paper/[0.06]">
                      <span className="font-mono text-[10.5px] text-marigold-soft/80">{e.tag}</span>
                      <span className="mt-1.5 block text-sm leading-snug text-paper/85 group-hover:text-paper">{e.q}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="space-y-12">
              {thread.map((t) => (
                <article key={t.id} ref={(el) => { if (el) exRefs.current.set(t.id, el); }} data-ask-exchange
                  onClick={() => t.status === "done" && setSelected(t.id)}
                  className={`scroll-mt-6 border-l-2 pl-5 transition-colors ${inspected?.id === t.id ? "border-marigold" : "border-paper/10"}`}>
                  <h2 className="font-display text-xl font-semibold leading-snug text-paper sm:text-2xl">{t.q}</h2>
                  <div className="mt-4"><Trace ex={t} /></div>

                  {t.status === "error" && (
                    <div className="mt-4 rounded-xl border border-marigold/30 bg-marigold/[0.07] p-4">
                      <p className="text-sm text-paper/80">{t.error}</p>
                      <button onClick={(e) => { e.stopPropagation(); void submit(t.q, t.id); }} disabled={busy}
                        className="mt-3 rounded-lg bg-marigold px-3.5 py-1.5 text-xs font-semibold text-pine-deep hover:bg-marigold-soft disabled:opacity-40">
                        Try again
                      </button>
                    </div>
                  )}

                  {t.status === "done" && t.answer && (
                    <div className="mt-4">
                      <AnswerText text={t.answer} onCite={(n) => cite(t.id, n)} />
                      {/* Below the desktop breakpoint, sources sit under the answer. */}
                      {t.sources && t.sources.length > 0 && (
                        <div className="mt-6 xl:hidden">
                          <p className="mb-2 font-mono text-[10.5px] text-paper/40">Sources</p>
                          <ul className="space-y-2">
                            {t.sources.filter((s) => s.cited || !t.sources!.some((x) => x.cited)).map((s) => (
                              <div key={s.n} id={`src-${t.id}-${s.n}`}><SourceCard s={s} active={inspected?.id === t.id && activeN === s.n} /></div>
                            ))}
                          </ul>
                        </div>
                      )}
                      <p className="mt-4 font-mono text-[10.5px] text-paper/30">
                        {t.model ? `${t.model} · ` : ""}check the sources for anything important
                      </p>
                    </div>
                  )}
                </article>
              ))}
            </div>
            <div ref={endRef} />
          </div>

          {/* composer */}
          <div className="sticky bottom-0 -mx-5 bg-gradient-to-t from-pine-deep via-pine-deep/95 to-transparent px-5 pb-5 pt-6 sm:-mx-8 sm:px-8">
            <form onSubmit={(e) => { e.preventDefault(); void submit(); }}
              className="mx-auto max-w-[760px] rounded-2xl border border-paper/15 bg-[#0F2A1F] p-2 shadow-[0_18px_50px_rgba(0,0,0,0.35)] transition-colors focus-within:border-marigold/70">
              <div className="flex items-end gap-2">
                <textarea ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
                  rows={1} maxLength={1000} aria-label="Your question"
                  placeholder={thread.length ? "Ask a follow-up…" : "Ask about projects, partners, surveys, meetings…"}
                  className="max-h-[180px] min-h-[2.75rem] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] text-paper outline-none placeholder:text-paper/30" />
                <button type="submit" disabled={busy || draft.trim().length < 3 || !status?.enabled} aria-label="Ask"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-marigold text-pine-deep transition-colors hover:bg-marigold-soft disabled:bg-paper/10 disabled:text-paper/30">
                  {busy
                    ? <span className="h-3 w-3 animate-pulse rounded-sm bg-current" />
                    : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 19V5M5 12l7-7 7 7" /></svg>}
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1 pt-1.5">
                <div role="radiogroup" aria-label="Answer depth" className="flex rounded-lg border border-paper/10 p-0.5">
                  {DEPTH_ORDER.map((d) => {
                    const w = status?.depths?.[d]?.weight ?? DEFAULT_WEIGHTS[d];
                    const disabled = remaining !== null && remaining < 999 && remaining < w;
                    return (
                      <button key={d} type="button" role="radio" aria-checked={depth === d} title={DEPTH_HINT[d]}
                        onClick={() => chooseDepth(d)} disabled={disabled}
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-30 ${depth === d ? "bg-marigold text-pine-deep" : "text-paper/55 hover:text-paper"}`}>
                        {status?.depths?.[d]?.label ?? DEFAULT_LABELS[d]}
                      </button>
                    );
                  })}
                </div>
                <span className="font-mono text-[10px] text-paper/35">
                  {remaining !== null && remaining < 999
                    ? (() => {
                        const w = status?.depths?.[depth]?.weight ?? DEFAULT_WEIGHTS[depth];
                        const n = Math.floor(remaining / w);
                        return `${n} ${status?.depths?.[depth]?.label ?? depth} ${n === 1 ? "answer" : "answers"} left today`;
                      })()
                    : <span className="hidden sm:inline">enter to send · shift+enter for a new line</span>}
                </span>
              </div>
            </form>
          </div>
        </main>

        {deepNotice && (
          <DeepResearchNotice
            credits={{
              left: remaining ?? status?.credits?.left ?? 0,
              unlimited: !!status?.credits?.unlimited || (remaining ?? 0) >= 999,
              weight: status?.depths?.deep?.weight ?? DEFAULT_WEIGHTS.deep,
            }}
            onConfirm={() => { applyDepth("deep"); setDeepNotice(false); inputRef.current?.focus(); }}
            onCancel={() => setDeepNotice(false)}
          />
        )}

        {/* ─────────── inspector ─────────── */}
        <aside className="hidden border-l border-paper/10 xl:block">
          <div className="sticky top-[var(--header-h)] h-[calc(100vh-var(--header-h))] overflow-y-auto p-5">
            <p className="font-mono text-[10.5px] text-paper/35">Sources</p>
            {inspected?.sources?.length ? (
              <>
                <p className="mt-1 line-clamp-2 text-xs text-paper/50">{inspected.q}</p>
                <div className="mt-4">
                  <SourceList key={inspected.id} sources={inspected.sources} activeN={activeN}
                    register={(n, el) => { if (el) cardRefs.current.set(n, el); else cardRefs.current.delete(n); }} />
                </div>
              </>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-paper/35">
                The files behind each answer appear here. Click a citation number to jump to its source.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
