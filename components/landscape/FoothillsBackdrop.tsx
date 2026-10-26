"use client";

import { useEffect, useRef, useState } from "react";
import type { Foothills } from "./engine";
import Ridgelines from "./Ridgelines";

/**
 * The home page's fixed backdrop: dawn over the foothills.
 *
 * It paints instantly as a CSS sky with drawn ridgelines (the "poster"). Once
 * the page has loaded and the browser is idle, the live 3D scene
 * (engine.ts, three.js) is fetched and fades in over it. Everything on the
 * page is readable from the first paint; the scene never blocks content.
 *
 * Scroll position maps straight to the camera, so fast scrolling simply flies
 * faster. Stays on the poster when: no WebGL, the person asked for reduced
 * motion (then the 3D scene renders once, still), data-saver is on, or the
 * device is very low-powered.
 */
export default function FoothillsBackdrop() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
    if (nav.connection?.saveData) return;
    if ((nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 1) return;
    const probe = document.createElement("canvas");
    const gl = (probe.getContext("webgl2") || probe.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return;
    // A software renderer (no GPU, or hardware acceleration switched off) draws
    // each frame on the CPU and would stall scrolling — keep the poster.
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    const debug = (window as Window & { __FOOTHILLS_DEBUG__?: boolean }).__FOOTHILLS_DEBUG__;
    if (!debug && /swiftshader|llvmpipe|software|basic render|softpipe/i.test(gpu)) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.matchMedia("(max-width: 767px)").matches;
    let scene: Foothills | null = null;
    let cancelled = false;

    const progress = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max > 0 ? window.scrollY / max : 0;
    };
    const onScroll = () => { if (!reduced) scene?.setProgress(progress()); };

    const start = async () => {
      const { createFoothills } = await import("./engine");
      if (cancelled) return;
      scene = createFoothills(el, { reduced, small });
      // With reduced motion the camera holds one composed view.
      scene.setProgress(reduced ? 0.12 : progress());
      await scene.firstFrame;
      if (!cancelled) setLive(true);
    };
    const w = window as Window & { requestIdleCallback?: (c: () => void, o?: { timeout: number }) => number };
    const idle = (cb: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 300));
    const kick = () => idle(() => { void start(); });
    if (document.readyState === "complete") kick(); else window.addEventListener("load", kick, { once: true });
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelled = true;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("load", kick);
      scene?.dispose();
    };
  }, []);

  return (
    <div aria-hidden className="foothills-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* the poster: instant, and the fallback */}
      <div className="absolute inset-0 dawn-sky" />
      <Ridgelines className="absolute inset-x-0 bottom-0 h-[62%] w-full" />
      <canvas
        ref={canvas}
        className={`absolute inset-0 h-full w-full transition-opacity duration-1000 ease-out ${live ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
