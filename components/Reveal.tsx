import type { ReactNode } from "react";

/**
 * Reveal — formerly a scroll-triggered fade + rise on every section.
 *
 * Retired in the design pass: content was invisible until it scrolled into
 * view, so slow phones, link previews and screenshots could catch blank
 * sections, and motion on every section diluted the one moment that matters
 * (the home hero, .hero-rise in globals.css). It now renders its children
 * as-is; the wrapper stays so the ~40 call sites keep working unchanged.
 */
export default function Reveal({
  children,
  className = "",
  as = "div",
}: {
  children: ReactNode;
  /** Ignored (kept for existing call sites). */
  delay?: number;
  /** Ignored (kept for existing call sites). */
  y?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const Tag = as;
  return <Tag className={className || undefined}>{children}</Tag>;
}
