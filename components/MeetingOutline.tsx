"use client";

import { useRef } from "react";

export type Block = { id: string; kind: "heading" | "bullet"; text: string; indent: number };

const uid = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

/**
 * A Google-Docs-style outline: headings + nested bullets.
 *  - Enter        → new bullet below (same indent)
 *  - Tab / Shift-Tab → indent / outdent a bullet (0..3)
 *  - Backspace on an empty block → delete it, focus the previous
 * Read-only mode renders the same outline without inputs.
 */
export default function MeetingOutline({
  blocks, onChange, editable, placeholder,
}: {
  blocks: Block[];
  onChange: (next: Block[]) => void;
  editable: boolean;
  placeholder?: string;
}) {
  const refs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const focusBlock = (id: string, toEnd = true) => {
    requestAnimationFrame(() => {
      const el = refs.current[id];
      if (el) { el.focus(); if (toEnd) el.setSelectionRange(el.value.length, el.value.length); }
    });
  };
  const set = (next: Block[]) => onChange(next);
  const patch = (id: string, p: Partial<Block>) => set(blocks.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const addAfter = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id);
    const nb: Block = { id: uid(), kind: "bullet", text: "", indent: blocks[i]?.indent ?? 0 };
    const next = [...blocks.slice(0, i + 1), nb, ...blocks.slice(i + 1)];
    set(next); focusBlock(nb.id);
  };
  const remove = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id);
    if (blocks.length === 1) { patch(id, { text: "" }); return; }
    const prev = blocks[i - 1];
    set(blocks.filter((b) => b.id !== id));
    if (prev) focusBlock(prev.id);
  };
  const move = (id: string, dir: -1 | 1) => {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };

  if (!editable) {
    return (
      <div className="space-y-1.5">
        {blocks.filter((b) => b.text.trim() || b.kind === "heading").map((b) =>
          b.kind === "heading" ? (
            <h4 key={b.id} className="pt-3 font-display text-lg font-semibold text-pine-deep first:pt-0">{b.text || "Untitled section"}</h4>
          ) : (
            <div key={b.id} className="flex gap-2 text-sm text-ink/80" style={{ paddingLeft: `${b.indent * 1.5}rem` }}>
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pine/40" />
              <span className="whitespace-pre-wrap">{b.text}</span>
            </div>
          ),
        )}
        {blocks.every((b) => !b.text.trim()) && <p className="text-sm text-ink/40">Nothing here yet.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {blocks.map((b) => (
        <div key={b.id} className="group/row flex items-start gap-1.5" style={{ paddingLeft: `${b.indent * 1.5}rem` }}>
          {/* row handle: type toggle */}
          <button
            type="button"
            onClick={() => patch(b.id, { kind: b.kind === "heading" ? "bullet" : "heading" })}
            title={b.kind === "heading" ? "Make bullet" : "Make heading"}
            className="mt-2 grid h-5 w-5 shrink-0 place-items-center rounded text-ink/30 hover:bg-pine/5 hover:text-pine"
          >
            {b.kind === "heading" ? <span className="text-[11px] font-bold">H</span> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
          </button>

          <textarea
            ref={(el) => { refs.current[b.id] = el; }}
            value={b.text}
            rows={1}
            placeholder={b.kind === "heading" ? "Section heading" : (placeholder ?? "Type here…")}
            onChange={(e) => { patch(b.id, { text: e.target.value }); const t = e.target; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addAfter(b.id); }
              else if (e.key === "Tab") { e.preventDefault(); patch(b.id, { indent: Math.min(3, Math.max(0, b.indent + (e.shiftKey ? -1 : 1))) }); }
              else if (e.key === "Backspace" && b.text === "") { e.preventDefault(); remove(b.id); }
              else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && (e.metaKey || e.altKey)) { e.preventDefault(); move(b.id, e.key === "ArrowUp" ? -1 : 1); }
            }}
            className={`w-full resize-none overflow-hidden bg-transparent py-1.5 outline-none placeholder:text-ink/25 ${b.kind === "heading" ? "font-display text-lg font-semibold text-pine-deep" : "text-sm text-ink/85"}`}
          />

          {/* hover controls */}
          <div className="mt-1 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
            <button type="button" onClick={() => move(b.id, -1)} title="Move up" className="grid h-6 w-6 place-items-center rounded text-ink/30 hover:bg-pine/5 hover:text-pine">↑</button>
            <button type="button" onClick={() => move(b.id, 1)} title="Move down" className="grid h-6 w-6 place-items-center rounded text-ink/30 hover:bg-pine/5 hover:text-pine">↓</button>
            <button type="button" onClick={() => remove(b.id)} title="Delete" className="grid h-6 w-6 place-items-center rounded text-ink/30 hover:bg-red-50 hover:text-red-500">✕</button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => { const nb: Block = { id: uid(), kind: "bullet", text: "", indent: 0 }; set([...blocks, nb]); focusBlock(nb.id); }}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-ink/40 hover:bg-pine/5 hover:text-pine"
      >
        + Add line
      </button>
      <p className="mt-1 text-[11px] text-ink/30">Enter for a new line · Tab / Shift-Tab to indent · click on the • or H to switch between bullet/heading</p>
    </div>
  );
}
