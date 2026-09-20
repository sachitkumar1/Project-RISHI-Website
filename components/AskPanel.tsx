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
};
type Status = { enabled: boolean; dailyLimit: number; index?: { passages: number; semanticPct: number } };

const EXAMPLES = [
  { q: "What happened with the microfinance initiative by Women's Empowerment?", tag: "Projects" },
  { q: "What did we say to Asha ji the last time we talked to her?", tag: "Partners" },
  { q: "Have we worked with an NGO that deals with classroom infrastructure?", tag: "NGOs" },
  { q: "Who did we survey during the 2024 India trip?", tag: "Fieldwork" },
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

// ----------------------------------------------------------------------- page
export default function AskPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [thread, setThread] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null); // exchange id shown in the inspector
  const [activeN, setActiveN] = useState<number | null>(null);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const cardRefs = useRef(new Map<number, HTMLLIElement>());
  const exRefs = useRef(new Map<number, HTMLElement>());
  const busy = thread.some((t) => t.status === "asking");

  useEffect(() => {
    fetch("/api/lms/ask").then((r) => (r.ok ? r.json() : null)).then((d) => setStatus(d ?? { enabled: false, dailyLimit: 0 })).catch(() => setStatus({ enabled: false, dailyLimit: 0 }));
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
    setThread((t) => [...t.filter((x) => x.id !== replaceId), { id, q, status: "asking", startedAt }]);
    try {
      const r = await fetch("/api/lms/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, history }) });
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
  }, [draft, busy, status, thread]);

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
    <div className="relative min-h-[calc(100vh-var(--header-h))] bg-pine-deep text-paper">
      {/* texture: a faint survey grid */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]"
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
            <Link href="/dashboard" className="text-xs font-semibold text-paper/50 hover:text-paper xl:hidden">Dashboard</Link>
          </header>

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
                  RISHI AI reads across every document you have access to — project notes, partner calls, surveys,
                  budgets, meeting agendas — and answers with a citation for every claim.
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
              <div className="flex items-center justify-between px-3 pb-1 pt-1.5 font-mono text-[10px] text-paper/30">
                <span className="hidden sm:inline">enter to send · shift+enter for a new line</span>
                {remaining !== null && remaining < 999 && <span>{remaining} left today</span>}
              </div>
            </form>
          </div>
        </main>

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
