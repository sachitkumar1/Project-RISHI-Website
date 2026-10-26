"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

/**
 * The site's motion layer (mounted once in app/layout.tsx). Three jobs:
 *
 * 1. SMOOTH SCROLL (public pages only). Lenis eases mouse-wheel and trackpad
 *    scrolling so pages glide instead of stepping. Touch scrolling is left
 *    native (phones already have momentum). It's off on /dashboard, where
 *    panels, modals and lists scroll on their own, and off entirely for
 *    people who ask for reduced motion.
 *
 * 2. SCROLL-IN REVEALS for anything marked data-reveal (see <Reveal/> and
 *    <SectionHeading/>). The HTML ships fully visible. Only after the page has
 *    loaded do we hide the things that are still BELOW the screen, then play
 *    them in once as they arrive. So nothing can get stuck invisible: no
 *    JavaScript, slow JavaScript, link previews and screenshots all see the
 *    whole page. Things already on screen are never hidden.
 *
 * 3. The thin scroll-progress line at the top (public pages). It's pure CSS
 *    (a scroll-driven animation); this component only decides where it shows.
 */

const isDashboard = (p: string | null) => !!p && p.startsWith("/dashboard");

export default function SiteMotion() {
  const pathname = usePathname();

  // ---- 1. smooth scroll -------------------------------------------------
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || isDashboard(pathname)) return;
    const lenis = new Lenis({
      duration: 1.1,
      easing: (t: number) => 1 - Math.pow(1 - t, 3.2), // ease-out: quick to respond, soft to settle
      smoothWheel: true,
      anchors: { offset: -88 }, // in-page #links glide too, stopping below the header
    });
    let raf = 0;
    const loop = (time: number) => { lenis.raf(time); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    // A fresh instance per page reads the real scroll position, so Next's own
    // scroll-to-top on navigation and Back's scroll restore both still work.
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, [pathname]);

  // ---- 2. reveals -------------------------------------------------------
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        (e.target as HTMLElement).dataset.revealState = "in";
        io.unobserve(e.target);
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

    // Hide-then-reveal only what is still below the fold; leave the rest alone.
    const prime = (el: HTMLElement) => {
      if (el.dataset.revealState) return;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9) { el.dataset.revealState = "shown"; return; }
      el.dataset.revealState = "pending";
      io.observe(el);
    };
    const scan = (root: ParentNode) => root.querySelectorAll<HTMLElement>("[data-reveal]").forEach(prime);
    scan(document);

    // Content that arrives later (client-rendered lists, the photo wall).
    const mo = new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        if (n.matches("[data-reveal]")) prime(n);
        scan(n);
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Safety net: anything pending that is on screen after 4s gets shown, in
    // case an observer callback was ever missed. Printing shows everything.
    const failsafe = window.setTimeout(() => {
      document.querySelectorAll<HTMLElement>('[data-reveal-state="pending"]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) el.dataset.revealState = "in";
      });
    }, 4000);
    const showAll = () => document.querySelectorAll<HTMLElement>('[data-reveal-state="pending"]').forEach((el) => { el.dataset.revealState = "in"; });
    window.addEventListener("beforeprint", showAll);

    return () => { io.disconnect(); mo.disconnect(); clearTimeout(failsafe); window.removeEventListener("beforeprint", showAll); };
  }, [pathname]);

  // ---- 3. progress line -------------------------------------------------
  if (isDashboard(pathname)) return null;
  return <div aria-hidden className="scroll-progress" />;
}
