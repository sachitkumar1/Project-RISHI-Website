"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * The highlight behind the selected option in a tab bar or segmented toggle.
 * Every option that can be selected renders <ActivePill id="…"/> only when it
 * is the selected one; because they share a layoutId, framer-motion slides
 * the one pill from the old option to the new one.
 *
 * Why a spring and not a View Transition: a spring picks up from wherever it
 * is (position and speed) when someone clicks again mid-slide, and it never
 * blocks input. document.startViewTransition was tried here first and measured
 * to drop a click that lands during the transition.
 *
 * pointer-events-none matters: mid-slide the pill sits over a neighbouring
 * option, and without it a tap there would land on the pill's own button.
 *
 * The parent button needs `relative`, and its label `relative` so it paints
 * above the pill. Reduced motion: the pill jumps instead of sliding.
 */
export default function ActivePill({ id, className = "bg-pine" }: { id: string; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      layoutId={id}
      aria-hidden
      className={`pointer-events-none absolute inset-0 rounded-full ${className}`}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40, mass: 0.8 }}
    />
  );
}
