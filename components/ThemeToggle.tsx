"use client";

import { useEffect, useState } from "react";

/**
 * Dashboard dark mode.
 *
 * The choice is stored per browser (localStorage "rishi:theme"). Dark mode only
 * ever applies on /dashboard pages: <DashboardTheme/> (in app/dashboard/layout)
 * adds the `dark` class to <html> while a dashboard page is open and removes it
 * when you leave, so the public site always looks the same. A tiny script in the
 * root layout applies it before first paint, so there's no flash of light mode.
 * The colours themselves live in app/dark-theme.css (generated).
 */
export const THEME_KEY = "rishi:theme";
const EVENT = "rishi-theme-change";

export function readTheme(): "dark" | "light" {
  try { return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light"; } catch { return "light"; }
}

function setTheme(t: "dark" | "light") {
  try { window.localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  document.documentElement.classList.toggle("dark", t === "dark");
  window.dispatchEvent(new CustomEvent(EVENT, { detail: t }));
}

/** Keeps <html class="dark"> in step with the choice while on the dashboard. */
export function DashboardTheme() {
  useEffect(() => {
    const apply = () => document.documentElement.classList.toggle("dark", readTheme() === "dark");
    apply();
    const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY) apply(); }; // other tabs
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.documentElement.classList.remove("dark"); // leaving the dashboard
    };
  }, []);
  return null;
}

function useTheme() {
  const [theme, set] = useState<"dark" | "light">("light");
  useEffect(() => {
    set(readTheme());
    const on = (e: Event) => set((e as CustomEvent).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return theme;
}

/** Round sun/moon button, styled like the other dashboard header buttons. */
export default function ThemeToggle() {
  const theme = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      aria-pressed={dark}
      data-theme-toggle
      className="relative grid h-10 w-10 place-items-center rounded-full border border-paper/30 text-paper transition-colors hover:bg-paper hover:text-pine-deep"
    >
      {dark ? (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
        </svg>
      )}
    </button>
  );
}

/** The same choice as a labelled switch, for the Settings page. */
export function ThemeSetting() {
  const theme = useTheme();
  return (
    <div className="mx-auto mt-6 flex max-w-xl items-center justify-between gap-4 rounded-3xl border border-pine/15 bg-pine/[0.03] p-6">
      <div>
        <h2 className="font-display text-lg font-semibold text-pine-deep">Appearance</h2>
        <p className="mt-1 text-sm text-ink/60">Dark mode applies to the dashboard in this browser.</p>
      </div>
      <div role="radiogroup" aria-label="Theme" className="flex shrink-0 rounded-full border border-pine/20 p-1">
        {(["light", "dark"] as const).map((t) => (
          <button key={t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition-colors ${theme === t ? "bg-pine text-paper" : "text-ink/60 hover:text-ink"}`}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
