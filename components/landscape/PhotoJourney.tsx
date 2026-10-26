"use client";

import { useEffect, useRef, useState } from "react";
import type { Journey } from "./journey";
import { SHOTS, shotSrc, shotFallback, shotWeights, journeyPosition, overscan, photoScale } from "./shots";

/**
 * The home page's fixed backdrop: a descent through real photographs of the
 * Himalayan foothills, from the ranges above Bharog Baneri down to a terraced
 * hillside village.
 *
 * Two layers:
 *  1. Photos (plain <picture>s). They paint immediately, follow the scroll with
 *     a slow push-in and cross-dissolve, and are all that runs for people who
 *     prefer reduced motion (dissolves only), without WebGL, on data-saver, or
 *     on low-powered devices.
 *  2. The live scene (journey.ts), started once the page has loaded and the
 *     browser is idle: the same photos with depth, so the camera moves into
 *     them, with mist, birds and focus pulls. It sits over the photos and
 *     hands back to them if the device can't keep up.
 *
 * Which photo shows where: elements with `data-shot="n"` mark where shot n is
 * composed (centred on screen). Scroll position maps straight to the journey,
 * so a fast scroll simply travels faster; nothing waits.
 */
export default function PhotoJourney() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  const imgs = useRef<(HTMLImageElement | null)[]>([]);
  const [live, setLive] = useState(false);
  const [wanted, setWanted] = useState(1); // how many photos to fetch so far (in order)

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.matchMedia("(max-width: 767px)").matches;
    let anchors: number[] = [];
    let pos = 0, raf = 0, journey: Journey | null = null, cancelled = false;
    let want = 1;

    const measure = () => {
      anchors = Array.from(document.querySelectorAll<HTMLElement>("[data-shot]"))
        .sort((a, b) => Number(a.dataset.shot) - Number(b.dataset.shot))
        .map((el) => { const r = el.getBoundingClientRect(); return r.top + window.scrollY + r.height / 2; });
    };

    // the photo layer: opacity for the dissolve, a slow push-in for movement
    const paint = () => {
      raf = 0;
      pos = journeyPosition(anchors, window.scrollY + window.innerHeight / 2);
      journey?.setPosition(pos);
      const on = shotWeights(pos, SHOTS.length);
      layers.current.forEach((el, i) => {
        if (!el) return;
        const w = on.find((x) => x.index === i);
        el.style.opacity = w ? String(i === on[0].index ? 1 : w.alpha) : "0";
        el.style.visibility = w ? "visible" : "hidden";
        if (!reduced) el.style.transform = `scale(${photoScale(SHOTS[i], w ? w.t : 0).toFixed(4)})`;
      });
      // fetch one photo ahead of where we are
      const need = Math.min(SHOTS.length, Math.floor(pos) + 2);
      if (need > want) { want = need; setWanted(need); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const onResize = () => { measure(); onScroll(); };

    measure(); paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    // content above can change height (fonts, images): keep anchors honest
    const ro = new ResizeObserver(onResize); ro.observe(document.body);

    // ---- the live scene -----------------------------------------------------
    const canRun = () => {
      if (reduced) return false;
      // test-only: start on any machine but keep the slow-frame watchdog
      if ((window as Window & { __JOURNEY_FORCE__?: boolean }).__JOURNEY_FORCE__) return true;
      const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
      if (nav.connection?.saveData) return false;
      if ((nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 1) return false;
      const probe = document.createElement("canvas");
      const gl = (probe.getContext("webgl2") || probe.getContext("webgl")) as WebGLRenderingContext | null;
      if (!gl) return false;
      // A software renderer (no GPU, or acceleration switched off) draws on the
      // CPU and would stall scrolling: stay on the photos.
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const gpu = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      const debug = (window as Window & { __JOURNEY_DEBUG__?: boolean }).__JOURNEY_DEBUG__;
      return debug || !/swiftshader|llvmpipe|software|basic render|softpipe/i.test(gpu);
    };

    // hand each photo to the scene once the photo layer has it (same file, one download)
    const feed = () => {
      if (!journey) return;
      imgs.current.forEach((img, i) => {
        if (!img) return;
        const give = () => img.currentSrc && journey?.load(i, img.currentSrc);
        if (img.complete && img.naturalWidth) give(); else img.addEventListener("load", give, { once: true });
      });
    };

    const start = async () => {
      if (!canRun() || !canvas.current) return;
      const { createJourney } = await import("./journey");
      if (cancelled || !canvas.current) return;
      journey = createJourney(canvas.current, { small });
      journey.onGiveUp(() => {
        // too slow on this device: fade back to the photos, then free the GPU memory
        setLive(false);
        window.setTimeout(() => { journey?.dispose(); journey = null; }, 900);
      });
      journey.setPosition(pos);
      feed();
      await journey.firstFrame;
      if (!cancelled) setLive(true);
    };
    const w = window as Window & { requestIdleCallback?: (c: () => void, o?: { timeout: number }) => number };
    const idle = (cb: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 300));
    const kick = () => idle(() => {
      // after the page is in, quietly fetch the next photo too
      if (want < 2) { want = 2; setWanted(2); }
      void start();
    });
    if (document.readyState === "complete") kick(); else window.addEventListener("load", kick, { once: true });
    const feedTimer = window.setInterval(feed, 800); // picks up photos as they arrive

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearInterval(feedTimer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("load", kick);
      ro.disconnect();
      journey?.dispose();
    };
  }, []);

  // Decode each photo as soon as it arrives (off the main thread), so the
  // moment it dissolves in costs nothing.
  useEffect(() => {
    imgs.current.forEach((img) => {
      if (!img || img.dataset.decoded) return;
      img.dataset.decoded = "1";
      img.decode?.().catch(() => { /* shown anyway when it's needed */ });
    });
  }, [wanted]);

  return (
    <div aria-hidden className="photo-journey pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#2a3a2c]">
      {SHOTS.map((s, i) => (
        <div
          key={s.name}
          ref={(el) => { layers.current[i] = el; }}
          className="journey-layer absolute inset-0"
          style={{ opacity: i === 0 ? 1 : 0, visibility: i === 0 ? "visible" : "hidden", transform: `scale(${overscan(s)})` }}
        >
          {i < wanted && (
            <picture>
              {/* phones get the 1440px photo whatever their pixel density: four
                  full-size photos would cost a phone too much memory */}
              <source media="(max-width: 767px)" type="image/avif" srcSet={shotSrc(s.name, 1440, "avif")} />
              <source
                type="image/avif"
                srcSet={`${shotSrc(s.name, 1440, "avif")} 1440w, ${shotSrc(s.name, 2560, "avif")} 2560w`}
                sizes="125vw"
              />
              <img
                ref={(el) => { imgs.current[i] = el; }}
                src={shotFallback(s.name)}
                alt=""
                decoding="async"
                fetchPriority={i === 0 ? "high" : "low"}
                className="h-full w-full object-cover"
                style={{ objectPosition: `${s.focusX * 100}% ${s.focusY * 100}%` }}
              />
            </picture>
          )}
        </div>
      ))}
      <canvas
        ref={canvas}
        className={`absolute inset-0 h-full w-full transition-opacity duration-700 ease-out ${live ? "opacity-100" : "opacity-0"}`}
      />
      {/* lens vignette: draws the eye in and settles the edges */}
      <div className="journey-vignette absolute inset-0" />
    </div>
  );
}
