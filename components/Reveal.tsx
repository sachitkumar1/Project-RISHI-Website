import type { CSSProperties, ReactNode } from "react";

/**
 * Reveal — plays its children in once as they scroll into view.
 *
 * Server-rendered fully visible; components/SiteMotion.tsx hides it only if
 * it's still below the screen after the page loads, then animates it in when
 * it arrives (CSS in globals.css, "Scroll-in reveals"). Reduced motion: never
 * hidden, never animated.
 *
 *   variant  "rise" (default) · "fade" · "scale" (photos/cards) · "clip" (an
 *            image unmasking from its centre)
 *   delay    seconds; staggers siblings in a row
 */
export default function Reveal({
  children,
  delay = 0,
  variant = "rise",
  className = "",
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  variant?: "rise" | "fade" | "scale" | "clip";
  /** Ignored (kept for older call sites). */
  y?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const Tag = as;
  return (
    <Tag
      data-reveal={variant}
      className={className || undefined}
      style={delay ? ({ "--reveal-delay": `${Math.round(delay * 1000)}ms` } as CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
