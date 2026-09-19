"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Remembers which dashboard items this person has already had on screen, so
 * only genuinely NEW ones get the attention pulse.
 *
 * Stored per account in this browser's localStorage — no table, no API call.
 * Keys are opaque strings chosen by the caller (e.g. `a:<taskId>` for a task
 * assigned to me, `p:<taskId>:<submittedAt>` for a submission awaiting my
 * approval — a re-submission gets a new key, so it pulses again).
 *
 * FIRST RUN on a browser (nothing stored yet): every item that exists right now
 * is recorded as already seen. Otherwise rolling this out — or opening the
 * dashboard on a new laptop — would make every existing task pulse at once.
 */
const MAX_KEYS = 1500; // ~75 KB at most; oldest marks drop off first

export function useSeenMarks(email: string, liveKeys: string[] | null) {
  const storageKey = email ? `rishi:seen:v1:${email.toLowerCase()}` : "";
  const [state, setState] = useState<{ key: string; seen: Set<string> } | null>(null);

  // Initialise once real data has loaded (liveKeys !== null) for this account.
  useEffect(() => {
    if (!storageKey || !liveKeys) return;
    if (state?.key === storageKey) return;
    let stored: unknown = null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) stored = JSON.parse(raw);
    } catch { /* storage blocked / corrupt → treat as first run */ }
    const firstRun = !Array.isArray(stored);
    const seen = new Set<string>(firstRun ? liveKeys : (stored as unknown[]).filter((k): k is string => typeof k === "string"));
    if (firstRun) persist(storageKey, seen);
    setState({ key: storageKey, seen });
  }, [storageKey, liveKeys, state]);

  const ready = state?.key === storageKey;

  const isNew = useCallback(
    (key: string) => ready && !!state && !state.seen.has(key),
    [ready, state],
  );

  const markSeen = useCallback((keys: string[]) => {
    setState((prev) => {
      if (!prev || keys.every((k) => prev.seen.has(k))) return prev;
      const seen = new Set(prev.seen);
      for (const k of keys) seen.add(k);
      persist(prev.key, seen);
      return { key: prev.key, seen };
    });
  }, []);

  return { isNew, markSeen };
}

function persist(storageKey: string, seen: Set<string>) {
  try {
    const all = Array.from(seen); // Set keeps insertion order → oldest first
    window.localStorage.setItem(storageKey, JSON.stringify(all.slice(-MAX_KEYS)));
  } catch { /* quota / private mode — pulses just repeat next visit */ }
}
