"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Wraps a card and, when `active`, pulses it yellow twice (~3s) the first time
 * it is actually VISIBLE — scrolled into view, in a tab the person is looking
 * at. The task lists sit below a tall calendar, so pulsing on mount would
 * usually happen off-screen and be missed.
 *
 * `onSeen` fires as the pulse starts; the caller records the item as seen so it
 * never pulses again. The pulse itself is local state, so it finishes even
 * after the parent flips `active` back to false.
 */
export default function AttentionPulse({
  active, onSeen, children, className = "",
}: {
  active: boolean;
  onSeen: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pulse, setPulse] = useState(0); // bump to (re)start the animation
  const onSeenRef = useRef(onSeen);
  onSeenRef.current = onSeen;

  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    let done = false;
    let onVis: (() => void) | null = null;

    const fire = () => {
      if (done) return;
      done = true;
      setPulse((n) => n + 1);
      onSeenRef.current();
    };
    const whenLookedAt = () => {
      if (document.visibilityState === "visible") return fire();
      onVis = () => { if (document.visibilityState === "visible") fire(); };
      document.addEventListener("visibilitychange", onVis);
    };

    if (typeof IntersectionObserver === "undefined") { whenLookedAt(); return; }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) { io.disconnect(); whenLookedAt(); }
      },
      // Most of the card must be on screen, not just its top edge peeking in.
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      done = true;
      io.disconnect();
      if (onVis) document.removeEventListener("visibilitychange", onVis);
    };
  }, [active]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {children}
      {pulse > 0 && (
        <span
          key={pulse}
          aria-hidden
          data-attention-pulse
          className="attention-pulse pointer-events-none absolute inset-0 rounded-2xl"
          onAnimationEnd={() => setPulse(0)}
        />
      )}
    </div>
  );
}
