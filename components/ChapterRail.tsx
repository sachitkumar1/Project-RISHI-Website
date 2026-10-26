"use client";

import { useEffect, useState } from "react";

/**
 * The home page's chapter rail: small chapter numbers and labels on a fine
 * rule, fixed at the left edge on wide screens. It appears once you're past
 * the hero, marks the chapter you're in, flips to light text over the green
 * sections, and each entry is a real #link (Lenis glides there on desktop).
 * Hidden on narrow screens, where there's no gutter for it.
 */
export default function ChapterRail({ chapters }: { chapters: { id: string; n: string; label: string }[] }) {
  const [active, setActive] = useState<string | null>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const els = chapters.map((c) => document.getElementById(c.id)).filter((x): x is HTMLElement => !!x);
    if (!els.length) return;
    // A chapter is "current" while it crosses the middle of the screen.
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        setActive(el.id);
        setDark(el.dataset.tone === "dark");
      }
    }, { rootMargin: "-50% 0px -50% 0px", threshold: 0 });
    els.forEach((el) => io.observe(el));
    // Before the first chapter (the hero) the rail stays hidden.
    const first = els[0];
    const onScroll = () => { if (first.getBoundingClientRect().top > window.innerHeight * 0.5) setActive(null); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, [chapters]);

  return (
    <nav
      aria-label="Page chapters"
      className={`chapter-rail fixed left-6 top-1/2 z-40 hidden -translate-y-1/2 xl:block ${active ? "is-on" : ""} ${dark ? "text-paper" : "text-pine-deep"}`}
    >
      <ol className="space-y-3">
        {chapters.map((c) => {
          const on = c.id === active;
          return (
            <li key={c.id}>
              <a href={`#${c.id}`} aria-current={on ? "true" : undefined} className="group flex items-center gap-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em]">
                <span className={`tabular-nums transition-opacity duration-300 ${on ? "opacity-100" : "opacity-70"}`}>{c.n}</span>
                <span className={`block h-px bg-current transition-[width,opacity] duration-500 ease-out ${on ? "w-10 opacity-100" : "w-4 opacity-50 group-hover:w-7"}`} />
                {/* The label only stays out on very wide screens, where the gutter can
                    hold it without touching the content; elsewhere it shows on hover. */}
                <span className={`transition-[opacity,translate] duration-500 ease-out ${on ? "min-[1700px]:translate-x-0 min-[1700px]:opacity-100" : ""} -translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-90 group-focus-visible:translate-x-0 group-focus-visible:opacity-90`}>{c.label}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
