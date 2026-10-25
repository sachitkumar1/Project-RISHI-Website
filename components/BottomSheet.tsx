"use client";

import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A phone-style bottom sheet you can swipe away.
 *
 *  • It follows the finger downward and closes past ~120px or on a quick
 *    downward flick; otherwise it springs back from wherever it was let go.
 *  • Opening and closing are springs too, so a sheet that's still sliding can
 *    be grabbed or dismissed mid-way without a jump.
 *  • A Close button (pass it in children), tapping the backdrop, and Escape
 *    all still work — swiping is never the only way out.
 *  • Reduced motion: no slide; it simply appears and disappears.
 *
 * Built on framer-motion (already used across the site) rather than adding a
 * sheet library.
 */
export default function BottomSheet({ open, onClose, label, className = "", panelClassName = "", children }: {
  open: boolean;
  onClose: () => void;
  label: string;
  /** Classes for the full-screen layer, e.g. "xl:hidden". */
  className?: string;
  /** Classes for the sheet itself (background, padding). */
  panelClassName?: string;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 420, damping: 40 };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Release speed from our own samples of the last ~100ms of the drag, so a
  // short, fast flick counts even when few move events arrive.
  const samples = useRef<{ t: number; y: number }[]>([]);
  const onDragStart = () => { samples.current = []; };
  const onDrag = (_: unknown, info: PanInfo) => {
    const now = performance.now();
    samples.current.push({ t: now, y: info.point.y });
    samples.current = samples.current.filter((p) => now - p.t <= 100);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const s = samples.current;
    const speed = s.length >= 2 ? ((s[s.length - 1].y - s[0].y) / Math.max(1, s[s.length - 1].t - s[0].t)) * 1000 : 0;
    if (info.offset.y > 120 || Math.max(speed, info.velocity.y) > 500) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className={`fixed inset-0 z-[70] flex items-end ${className}`} role="dialog" aria-modal="true" aria-label={label}>
          <motion.div
            className="absolute inset-0 bg-black/60"
            onClick={onClose}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.2 }}
          />
          <motion.div
            className={`relative w-full rounded-t-2xl ${panelClassName}`}
            initial={reduce ? false : { y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 1 }}
            dragTransition={{ bounceStiffness: 420, bounceDamping: 40 }}
            onDragStart={onDragStart}
            onDrag={onDrag}
            onDragEnd={onDragEnd}
          >
            {/* Grab handle: a visual cue that the sheet can be pulled down. */}
            <div aria-hidden className="mx-auto -mt-2 mb-3 h-1.5 w-10 rounded-full bg-current opacity-25" />
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
