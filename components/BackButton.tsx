"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * A back control on every page, returning to the previous page the person
 * actually visited on this site.
 *
 * It uses the browser's own history, which is what makes "the exact page they
 * were on" work — including scroll position and any state the browser restored.
 * Popups aren't routes and never push a history entry, so they're skipped for
 * free rather than needing to be filtered out.
 *
 * The button hides itself when there's nowhere in-app to go back to. Without
 * that check, the first page of a session would offer a back button that dumps
 * the person on whatever site they came from. Depth is tracked per tab in
 * sessionStorage: it survives reloads, and a new tab starts clean.
 */
const KEY = "rishi:nav-depth";

export default function BackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [depth, setDepth] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const stored = Number(sessionStorage.getItem(KEY) ?? "0");
    // A reload lands on the same path — don't count it as a new step.
    const last = sessionStorage.getItem(`${KEY}:path`);
    const next = last === pathname ? stored : stored + 1;

    sessionStorage.setItem(KEY, String(next));
    sessionStorage.setItem(`${KEY}:path`, pathname ?? "");
    setDepth(next);
  }, [pathname]);

  if (depth <= 1) return null;

  return (
    <div className="container-rishi pt-[calc(var(--header-h)+1rem)]">
      <button
        onClick={() => {
          // Keep the counter honest so the button disappears at the start.
          const n = Math.max(0, Number(sessionStorage.getItem(KEY) ?? "1") - 1);
          sessionStorage.setItem(KEY, String(n));
          router.back();
        }}
        className="inline-flex items-center gap-2 rounded-full border border-pine/20 px-3.5 py-1.5 text-sm font-semibold text-pine-deep transition-colors hover:bg-pine/5"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        Back
      </button>
    </div>
  );
}
