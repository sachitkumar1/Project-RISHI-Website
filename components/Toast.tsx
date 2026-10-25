"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Site-wide toasts: short messages at the bottom of the screen, optionally
 * with one action ("Undo"). Call `toast(...)` from anywhere in the browser;
 * <Toaster/> (mounted once in app/layout.tsx) shows them.
 *
 *  • role="status" + aria-live="polite": screen readers announce them without
 *    interrupting.
 *  • Stays clear of the home indicator (safe-area inset).
 *  • Enters and leaves on a spring, which turns around mid-way if a toast is
 *    dismissed while still sliding in; with reduced motion it just appears.
 *  • Hovering or focusing a toast pauses its timer, so an Undo can't vanish
 *    from under the pointer.
 */

export type ToastInput = {
  message: string;
  tone?: "info" | "error";
  /** One button, e.g. Undo. Clicking it runs onClick and closes the toast. */
  action?: { label: string; onClick: () => void };
  /** How long it stays up. Default 6s; undo toasts use 8s. */
  durationMs?: number;
  /** Runs once when the toast closes on its own (timer ran out), not when its action is used. */
  onExpire?: () => void;
};
type ToastItem = ToastInput & { id: number };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const EMPTY: ToastItem[] = [];

/** Show a toast. Returns a function that closes it early (without onExpire). */
export function toast(t: ToastInput): () => void {
  const id = nextId++;
  // At most three on screen; the oldest one is settled (expired) to make room.
  if (items.length >= 3) { const old = items[0]; items = items.slice(1); old.onExpire?.(); }
  items = [...items, { ...t, id }];
  emit();
  return () => dismiss(id);
}

function dismiss(id: number) {
  items = items.filter((x) => x.id !== id);
  emit();
}

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  const reduce = useReducedMotion();
  return (
    <div
      // Phones: sit above the floating Back button (bottom-left) rather than on it.
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+var(--safe-bottom))] z-[1300] flex flex-col items-center gap-2 px-4 sm:bottom-[calc(1.5rem+var(--safe-bottom))]"
    >
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout={!reduce}
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 520, damping: 38 }}
            className="pointer-events-auto"
          >
            <ToastView t={t} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastView({ t }: { t: ToastItem }) {
  useEffect(() => {
    let left = t.durationMs ?? 6000;
    let started = Date.now();
    let timer = setTimeout(expire, left);
    function expire() { dismiss(t.id); t.onExpire?.(); }
    const el = document.getElementById(`toast-${t.id}`);
    const pause = () => { clearTimeout(timer); left -= Date.now() - started; };
    const resume = () => { started = Date.now(); clearTimeout(timer); timer = setTimeout(expire, Math.max(left, 1500)); };
    el?.addEventListener("mouseenter", pause);
    el?.addEventListener("mouseleave", resume);
    el?.addEventListener("focusin", pause);
    el?.addEventListener("focusout", resume);
    return () => {
      clearTimeout(timer);
      el?.removeEventListener("mouseenter", pause);
      el?.removeEventListener("mouseleave", resume);
      el?.removeEventListener("focusin", pause);
      el?.removeEventListener("focusout", resume);
    };
    // A toast's content never changes after it's shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.id]);

  return (
    <div
      id={`toast-${t.id}`}
      role="status"
      aria-live="polite"
      className={`flex max-w-[min(92vw,30rem)] items-center gap-3 rounded-full py-2 pl-5 pr-2 text-sm font-medium shadow-xl ${
        t.tone === "error" ? "bg-red-800 text-paper" : "bg-pine-deep text-paper"
      } ${t.action ? "" : "pr-5"}`}
    >
      <span className="min-w-0 py-1">{t.message}</span>
      {t.action && (
        <button
          onClick={() => { dismiss(t.id); t.action!.onClick(); }}
          className="shrink-0 rounded-full bg-paper/15 px-3.5 py-1.5 text-sm font-semibold text-marigold-soft transition-colors hover:bg-paper/25"
        >
          {t.action.label}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Undo instead of "Are you sure?".
//
// undoable() is for deletes that can be held back for a few seconds: the
// screen removes the thing at once, a toast offers Undo for 8 seconds, and only
// when that runs out is the real request sent (commit). Undo just cancels it —
// the server never hears about it, so there's nothing to restore. If the
// delete then fails, the thing is put back and an error toast says so.
//
// Leaving the page doesn't lose a pending delete: on pagehide every pending
// commit runs straight away, so commit() should use fetch(..., { keepalive:
// true }), which lets the request finish after the tab is gone. Moving around
// inside the site keeps the toast (it lives in the root layout).
//
// `key` marks the thing as pending, and isPendingDelete(key) lets a list that
// refetches during the window leave it out instead of bringing it back.

const pendingCommits = new Map<number, () => void>();
const pendingKeys = new Set<string>();
let nextUndoId = 1;

export const isPendingDelete = (key: string) => pendingKeys.has(key);

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    for (const commit of Array.from(pendingCommits.values())) commit();
  });
}

export function undoable(o: {
  message: string;
  key?: string;
  undo: () => void;
  commit: () => Promise<unknown>;
  failMessage?: string;
}) {
  const token = nextUndoId++;
  let settled = false;
  if (o.key) pendingKeys.add(o.key);
  const finish = () => { settled = true; pendingCommits.delete(token); if (o.key) pendingKeys.delete(o.key); };
  const commit = () => {
    if (settled) return;
    finish();
    o.commit().catch((e: unknown) => {
      o.undo();
      toast({ tone: "error", message: `${o.failMessage ?? "Couldn't delete it, so it's back."} ${e instanceof Error ? e.message : ""}`.trim() });
    });
  };
  pendingCommits.set(token, commit);
  toast({
    message: o.message,
    durationMs: 8000,
    onExpire: commit,
    action: { label: "Undo", onClick: () => { if (settled) return; finish(); o.undo(); } },
  });
}
