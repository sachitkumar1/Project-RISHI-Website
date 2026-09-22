"use client";

import Link from "next/link";
import React from "react";

/**
 * A dashboard tile that's a normal link — or, when `locked`, a greyed-out card
 * with a lock that goes nowhere. Used for features new members get once they're
 * placed in a project group (RISHI AI, RISHI Lineage). The pages and APIs behind
 * these tiles enforce the same lock on the server; this is only the display.
 */
export default function GatedLink({ locked, href, className, lockedClassName, children }: {
  locked: boolean;
  href: string;
  className: string;
  /** Layout classes for the locked card (no hover effects). */
  lockedClassName: string;
  children: React.ReactNode;
}) {
  if (!locked) return <Link href={href} className={className}>{children}</Link>;
  return (
    <div aria-disabled="true" data-locked-tile title="Unlocks once you're placed in a project group"
      className={`relative cursor-not-allowed select-none rounded-3xl border border-dashed border-ink/15 bg-ink/[0.03] opacity-60 grayscale ${lockedClassName}`}>
      {children}
      <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-ink/10 text-ink/70" aria-label="Locked">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </span>
    </div>
  );
}
