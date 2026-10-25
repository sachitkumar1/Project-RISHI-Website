"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Loading placeholders that take the shape of the real layout.
 *
 * Each screen builds its skeleton from the same wrapper and typography classes
 * as its loaded cards, so the grey lines sit exactly where the text will be and
 * nothing jumps when the data lands. A <Line> takes the line height of the
 * text classes you give it (e.g. "text-[15px] leading-snug") rather than a
 * guessed pixel height.
 *
 * Nothing shows for the first 300ms: most loads finish before then, and a
 * skeleton that flashes for a split second is worse than a brief blank.
 * The pulse uses Tailwind's animate-pulse, which the global reduced-motion
 * rule in globals.css freezes for people who ask for less motion.
 */

/** True once `active` has stayed true for `ms` — use it to delay a skeleton. */
export function useShowAfter(active: boolean, ms = 300) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active) { setShow(false); return; }
    const t = setTimeout(() => setShow(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return show;
}

/** One grey line, as tall as one line of text in `className`'s typography. */
export function Line({ className = "", w = "60%" }: { className?: string; w?: string }) {
  return (
    <span aria-hidden className={`block ${className}`}>
      <span className="inline-block animate-pulse rounded-md bg-ink/[0.08] align-middle text-transparent" style={{ width: w }}>
        &nbsp;
      </span>
    </span>
  );
}

/** A grey block that keeps the box of a real control (pass its classes and its label). */
export function Block({ className = "", children }: { className?: string; children?: ReactNode }) {
  return (
    <span aria-hidden className={`inline-block animate-pulse border-transparent bg-ink/[0.07] text-transparent ${className}`}>
      {children ?? " "}
    </span>
  );
}

/** Announces the wait to screen readers once, instead of every grey line. */
export function SkeletonRegion({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
