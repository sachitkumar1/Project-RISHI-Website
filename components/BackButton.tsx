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
 * It floats over the page rather than sitting in the layout, so it doesn't
 * push every page's content down or collide with each page's own header.
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
    <button
      onClick={() => {
        // Keep the counter honest so the button disappears at the start.
        const n = Math.max(0, Number(sessionStorage.getItem(KEY) ?? "1") - 1);
        sessionStorage.setItem(KEY, String(n));
        router.back();
      }}
      aria-label="Go back to the previous page"
      title="Back"
      /* Floats in the left margin, clear of the content column on wide screens
         and tucked into the bottom-left corner on narrow ones, where it can't
         cover text. Sits under modals (z-40) so a popup is never blocked. */
      className="fixed bottom-6 left-6 z-40 inline-flex items-center gap-2 rounded-full border border-pine/20 bg-paper/95 px-4 py-2.5 text-sm font-semibold text-pine-deep shadow-lg backdrop-blur transition-colors hover:bg-pine hover:text-paper"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M19 12H5M11 6l-6 6 6 6" />
      </svg>
      <span className="hidden sm:inline">Back</span>
    </button>
  );
}
