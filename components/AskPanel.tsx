"use client";

import React, { useEffect, useRef, useState } from "react";

type Source = {
  n: number; fileId: string; name: string; path: string; year: string | null;
  modifiedAt: string | null; link: string | null; cited: boolean;
};
type Exchange = {
  q: string;
  status: "asking" | "done" | "error";
  answer?: string;
  sources?: Source[];
  model?: string | null;
  error?: string;
};

const EXAMPLES = [
  "Have we worked with an NGO that deals with classroom infrastructure?",
  "What did we say to Asha ji the last time we talked to her?",
  "What did the Women's group decide about the sewing center?",
];

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

/** Render the model's plain text: paragraphs, "- " lists, **bold**, and [n]
 *  citations as links to the numbered source below. Nothing else is trusted
 *  as markup — the text is never injected as HTML. */
function AnswerText({ text, anchor, onCite }: { text: string; anchor: string; onCite: (n: number) => void }) {
  const inline = (line: string, key: string) =>
    line.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, i) => {
      const cite = part.match(/^\[(\d+)\]$/);
      if (cite) {
        const n = Number(cite[1]);
        return (
          <a key={`${key}-${i}`} href={`#${anchor}-${n}`} onClick={() => onCite(n)}
            className="mx-px inline-grid h-[1.15rem] min-w-[1.15rem] -translate-y-1 place-items-center rounded-full bg-marigold/25 px-1 align-baseline text-[0.65rem] font-semibold text-marigold-deep no-underline hover:bg-marigold hover:text-pine-deep"
            aria-label={`Source ${n}`}>{n}</a>
        );
      }
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>;
      return <React.Fragment key={`${key}-${i}`}>{part}</React.Fragment>;
    });

  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[15px] leading-7 text-ink/85">
      {blocks.map((b, bi) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul key={bi} className="list-disc space-y-1 pl-5 marker:text-marigold-deep">
              {lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*[-*•]\s+/, ""), `${bi}-${li}`)}</li>)}
            </ul>
          );
        }
        return <p key={bi}>{lines.map((l, li) => <React.Fragment key={li}>{li > 0 && <br />}{inline(l, `${bi}-${li}`)}</React.Fragment>)}</p>;
      })}
    </div>
  );
}

function SourceList({ sources, anchor, flash }: { sources: Source[]; anchor: string; flash: number | null }) {
  const [showAll, setShowAll] = useState(false);
  const cited = sources.filter((s) => s.cited);
  const rest = sources.filter((s) => !s.cited);
  const shown = showAll || !cited.length ? sources : cited;

  return (
    <div className="mt-5 border-t border-pine/10 pt-4">
      <p className="text-xs font-semibold text-ink/50">
        {cited.length ? `From ${cited.length} ${cited.length === 1 ? "file" : "files"}` : "Files searched"}
      </p>
      <ol className="mt-2 space-y-1.5">
        {shown.map((s) => (
          <li key={s.n} id={`${anchor}-${s.n}`}
            className={`flex scroll-mt-28 gap-3 rounded-xl px-2 py-1.5 transition-colors ${flash === s.n ? "bg-marigold/20" : ""}`}>
            <span className={`mt-0.5 grid h-5 min-w-[1.25rem] place-items-center rounded-full text-[0.7rem] font-semibold ${s.cited ? "bg-marigold/25 text-marigold-deep" : "bg-ink/5 text-ink/40"}`}>
              {s.n}
            </span>
            <span className="min-w-0">
              {s.link ? (
                <a href={s.link} target="_blank" rel="noreferrer"
                  className="font-medium text-pine-deep underline decoration-pine/25 underline-offset-2 hover:decoration-pine">
                  {s.name}
                </a>
              ) : <span className="font-medium text-ink">{s.name}</span>}
              <span className="block truncate text-xs text-ink/45">
                {[s.year, s.path].filter(Boolean).join(" / ")}{s.modifiedAt ? `, edited ${fmtDate(s.modifiedAt)}` : ""}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {cited.length > 0 && rest.length > 0 && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-2 px-2 text-xs font-semibold text-pine hover:underline">
          {showAll ? "Show only the files cited" : `Also searched ${rest.length} more ${rest.length === 1 ? "file" : "files"}`}
        </button>
      )}
    </div>
  );
}

export default function AskPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [thread, setThread] = useState<Exchange[]>([]);
  const [draft, setDraft] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ i: number; n: number } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const busy = thread.some((t) => t.status === "asking");

  useEffect(() => {
    fetch("/api/lms/ask").then((r) => (r.ok ? r.json() : null)).then((d) => setEnabled(!!d?.enabled)).catch(() => setEnabled(false));
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [thread.length]);

  async function submit(text?: string) {
    const q = (text ?? draft).trim();
    if (q.length < 3 || busy) return;
    setDraft("");
    const history = thread.filter((t) => t.status === "done" && t.answer).slice(-2).map((t) => ({ q: t.q, a: t.answer! }));
    const idx = thread.length;
    setThread((t) => [...t, { q, status: "asking" }]);
    try {
      const r = await fetch("/api/lms/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const d = await r.json().catch(() => ({}));
      if (typeof d.remainingToday === "number") setRemaining(d.remainingToday);
      setThread((t) => t.map((x, i) => (i !== idx ? x : d.ok
        ? { q, status: "done", answer: d.answer, sources: d.sources, model: d.model }
        : { q, status: "error", error: d.error || "Something went wrong answering that." })));
    } catch {
      setThread((t) => t.map((x, i) => (i === idx ? { q, status: "error", error: "Couldn't reach the server." } : x)));
    }
  }

  if (enabled === false) {
    return (
      <p className="rounded-2xl border border-dashed border-pine/20 p-6 text-sm text-ink/55">
        Ask isn&apos;t switched on yet. The webmaster needs to add a Gemini API key.
      </p>
    );
  }

  return (
    <div>
      {thread.length === 0 && (
        <div className="mb-8">
          <p className="max-w-[60ch] text-[15px] leading-7 text-ink/70">
            Ask anything about the club&apos;s documents: past projects, calls with partners, surveys, meeting notes.
            Answers come only from files you can open yourself, and every claim links to where it came from.
          </p>
          <div className="mt-5 flex flex-col items-start gap-2">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => void submit(e)} disabled={!enabled}
                className="text-left text-sm font-medium text-pine hover:text-pine-deep hover:underline disabled:opacity-50">
                {e}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-10">
        {thread.map((t, i) => (
          <article key={i} data-ask-exchange>
            <h2 className="font-display text-xl font-semibold leading-snug text-pine-deep">{t.q}</h2>
            {t.status === "asking" && (
              <p className="mt-4 flex items-center gap-2 text-sm text-ink/50" role="status">
                <span className="h-2 w-2 animate-pulse rounded-full bg-marigold" />
                Reading through the files…
              </p>
            )}
            {t.status === "error" && (
              <p className="mt-4 rounded-xl bg-marigold-soft/30 px-4 py-3 text-sm text-ink/75">{t.error}</p>
            )}
            {t.status === "done" && t.answer && (
              <div className="mt-4">
                <AnswerText text={t.answer} anchor={`src-${i}`} onCite={(n) => {
                  setFlash({ i, n });
                  setTimeout(() => setFlash((f) => (f && f.i === i && f.n === n ? null : f)), 1600);
                }} />
                {t.sources && t.sources.length > 0 && (
                  <SourceList sources={t.sources} anchor={`src-${i}`} flash={flash?.i === i ? flash.n : null} />
                )}
                {t.model && <p className="mt-3 px-2 text-[11px] text-ink/35">Answered by {t.model}. Check the sources for anything important.</p>}
              </div>
            )}
          </article>
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        className="sticky bottom-4 z-10 mt-10 rounded-2xl border border-pine/20 bg-paper p-2 shadow-[0_8px_30px_rgba(20,54,40,0.12)]"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
            rows={1}
            maxLength={1000}
            placeholder={thread.length ? "Ask a follow-up…" : "Ask about the club's files…"}
            aria-label="Your question"
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink/35"
          />
          <button type="submit" disabled={busy || draft.trim().length < 3 || !enabled}
            className="shrink-0 rounded-xl bg-pine px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-pine-deep disabled:opacity-40">
            {busy ? "Asking…" : "Ask"}
          </button>
        </div>
        {remaining !== null && remaining < 999 && (
          <p className="px-3 pb-1 pt-1 text-[11px] text-ink/40">{remaining} {remaining === 1 ? "question" : "questions"} left today</p>
        )}
      </form>
      <div ref={bottom} />
    </div>
  );
}
