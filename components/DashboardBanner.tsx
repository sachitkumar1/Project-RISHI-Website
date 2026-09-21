"use client";

/* eslint-disable @next/next/no-img-element */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Contours from "@/components/Contours";
import {
  BANNER_PHOTOS, BANNER_PRESETS, type BannerChoice,
} from "@/lib/lms/bannerPresets";

/**
 * The member's banner, used at the top of EVERY dashboard page (home, Files,
 * meetings, Directory, Lineage, Settings…), so a choice made in one place shows
 * everywhere. Only the member sees their choice. On the home page it has a
 * "Customize banner" button; while the picker is open the banner previews the
 * selection live.
 *
 * No choice yet (or "Reset to default") means: Pine in light mode, Midnight in
 * dark mode. The last-known choice is remembered in the browser, so pages open
 * with the right banner instead of flashing the default first.
 */

// Photos sit under a darkening wash so the white "Welcome" text always reads.
const PHOTO_OVERLAY =
  "linear-gradient(90deg, rgba(6,18,13,0.82) 0%, rgba(6,18,13,0.55) 45%, rgba(6,18,13,0.28) 100%)," +
  "linear-gradient(0deg, rgba(6,18,13,0.45) 0%, rgba(6,18,13,0) 45%)";

type Draft = { choice: BannerChoice; uploadUrl: string | null; pendingImage?: string };
type Saved = { choice: BannerChoice | null; uploadUrl: string | null }; // null choice = theme default

const CACHE_KEY = "rishi:banner:v1";
const CHANGE_EVENT = "rishi-banner-change";

/** Is the dashboard in dark mode right now? Follows the theme switch live. */
function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setDark(el.classList.contains("dark"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return dark;
}

const themeDefault = (dark: boolean): BannerChoice => ({ kind: "preset", id: dark ? "midnight" : "pine" });

/** The member's saved banner, shared by every banner on the page and across
 *  pages (remembered in the browser, refreshed from the server). */
function useSavedBanner(): [Saved, (s: Saved) => void] {
  const [saved, setSavedState] = useState<Saved>({ choice: null, uploadUrl: null });
  // Before paint: last-known choice, so there's no flash of the default.
  useLayoutEffect(() => {
    try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null"); if (c) setSavedState(c); } catch { /* ignore */ }
  }, []);
  const setSaved = useCallback((s: Saved) => {
    setSavedState(s);
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: s }));
  }, []);
  useEffect(() => {
    const on = (e: Event) => setSavedState((e as CustomEvent).detail);
    window.addEventListener(CHANGE_EVENT, on);
    fetch("/api/lms/profile/banner").then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const s: Saved = { choice: d.choice ?? null, uploadUrl: d.url ?? null };
        setSavedState(s);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
      })
      .catch(() => {});
    return () => window.removeEventListener(CHANGE_EVENT, on);
  }, []);
  return [saved, setSaved];
}

function Background({ d }: { d: Draft }) {
  const c = d.choice;
  if (c.kind === "preset") {
    const p = BANNER_PRESETS.find((x) => x.id === c.id) ?? BANNER_PRESETS[0];
    return (
      <>
        <div className={`absolute inset-0 ${p.background ? "" : "bg-pine"}`} style={p.background ? { background: p.background } : undefined} />
        {p.contours && <Contours className="absolute inset-0 h-full w-full" stroke={p.contours.color} opacity={p.contours.opacity} />}
      </>
    );
  }
  const src = c.kind === "photo" ? BANNER_PHOTOS.find((x) => x.id === c.id)?.src : d.pendingImage ?? d.uploadUrl;
  return (
    <>
      <div className="absolute inset-0 bg-pine-deep" />
      {src && <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `50% ${c.pos}%` }} />}
      <div className="absolute inset-0" style={{ background: PHOTO_OVERLAY }} />
    </>
  );
}

/** Shrink a chosen photo in the browser (≤2000px wide JPEG) before uploading. */
async function shrink(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  if (file.size > 25_000_000) throw new Error("That photo is over 25 MB — please pick a smaller one.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => { throw new Error("This photo format can't be read here — try a JPEG or PNG (iPhone HEIC photos: take a screenshot of it, or export as JPEG)."); });
    const scale = Math.min(1, 2000 / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const same = (a: BannerChoice, b: BannerChoice) =>
  a.kind === b.kind && (a.kind === "preset" ? a.id === (b as typeof a).id : a.kind === "photo" ? a.id === (b as typeof a).id : true);

function Picker({ saved: savedRaw, fallback, draft, setDraft, onClose, onSaved }: {
  saved: Saved; fallback: BannerChoice; draft: Draft; setDraft: (d: Draft) => void; onClose: () => void; onSaved: (d: Saved) => void;
}) {
  const saved: Draft = { choice: savedRaw.choice ?? fallback, uploadUrl: savedRaw.uploadUrl };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const c = draft.choice;
  const hasUpload = !!(draft.pendingImage || saved.uploadUrl);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function pickFile(f: File | undefined) {
    if (!f) return;
    setError(null);
    try {
      const image = await shrink(f);
      setDraft({ choice: { kind: "upload", path: "pending", pos: 50 }, uploadUrl: saved.uploadUrl, pendingImage: image });
    } catch (e) { setError((e as Error).message); }
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      let r: Response;
      if (c.kind === "upload" && draft.pendingImage) {
        r = await fetch("/api/lms/profile/banner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: draft.pendingImage, pos: c.pos }) });
      } else {
        const body = c.kind === "upload" && saved.choice.kind === "upload" ? { ...c, path: saved.choice.path } : c;
        r = await fetch("/api/lms/profile/banner", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "Couldn't save your banner.");
      onSaved({ choice: d.choice ?? null, uploadUrl: d.url ?? null });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function reset() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/lms/profile/banner", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset: true }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't reset.");
      onSaved({ choice: null, uploadUrl: null }); // back to the theme default
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const tile = (active: boolean) =>
    `group relative block overflow-hidden rounded-xl text-left ring-offset-2 ring-offset-paper transition ${active ? "ring-2 ring-marigold" : "ring-1 ring-ink/10 hover:ring-pine/40"}`;

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 z-[70] p-3 sm:bottom-4 sm:left-auto sm:right-4 sm:w-[440px] sm:p-0" role="dialog" aria-modal="false" aria-labelledby="banner-picker-title">
      <div className="max-h-[70vh] overflow-y-auto rounded-3xl border border-pine/15 bg-paper p-5 text-ink shadow-[0_24px_60px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="banner-picker-title" className="font-display text-xl font-semibold text-pine-deep">Your banner</h2>
            <p className="mt-0.5 text-xs text-ink/55">Previewing live above. Only you see your banner.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-ink/50 hover:bg-ink/5 hover:text-ink">✕</button>
        </div>

        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink/45">Colours</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {BANNER_PRESETS.map((p) => (
            <button key={p.id} onClick={() => setDraft({ ...draft, choice: { kind: "preset", id: p.id }, pendingImage: undefined })}
              className={tile(c.kind === "preset" && c.id === p.id)} title={p.name} aria-label={p.name} aria-pressed={c.kind === "preset" && c.id === p.id}>
              <span className={`block aspect-[5/3] ${p.background ? "" : "bg-pine"}`} style={p.background ? { background: p.background } : undefined} />
              <span className="block truncate px-1.5 py-1 text-[10.5px] font-medium text-ink/70">{p.name}</span>
            </button>
          ))}
        </div>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink/45">Club photos</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {BANNER_PHOTOS.map((p) => (
            <button key={p.id} onClick={() => setDraft({ ...draft, choice: { kind: "photo", id: p.id, pos: p.pos }, pendingImage: undefined })}
              className={tile(c.kind === "photo" && c.id === p.id)} title={p.name} aria-label={p.name} aria-pressed={c.kind === "photo" && c.id === p.id}>
              <img src={p.src} alt="" className="block aspect-[5/3] w-full object-cover" style={{ objectPosition: `50% ${p.pos}%` }} />
              <span className="block truncate px-1.5 py-1 text-[10.5px] font-medium text-ink/70">{p.name}</span>
            </button>
          ))}
        </div>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink/45">Your own photo</p>
        <div className="mt-2 flex items-center gap-2">
          {hasUpload && (
            <button onClick={() => setDraft({ ...draft, choice: { kind: "upload", path: "pending", pos: c.kind === "upload" ? c.pos : saved.choice.kind === "upload" ? saved.choice.pos : 50 } })}
              className={`${tile(c.kind === "upload")} w-24 shrink-0`} aria-label="Your photo" aria-pressed={c.kind === "upload"}>
              <img src={draft.pendingImage ?? saved.uploadUrl ?? ""} alt="" className="block aspect-[5/3] w-full object-cover" />
            </button>
          )}
          <button onClick={() => fileRef.current?.click()} className="rounded-full border border-pine/25 px-4 py-2 text-sm font-semibold text-pine-deep hover:bg-pine/5">
            {hasUpload ? "Upload a different photo" : "Upload a photo"}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="hidden"
            onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>

        {(c.kind === "photo" || c.kind === "upload") && (
          <label className="mt-4 block">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink/45">Photo position</span>
            <input type="range" min={0} max={100} value={c.pos} aria-label="Photo position (top to bottom)"
              onChange={(e) => setDraft({ ...draft, choice: { ...c, pos: Number(e.target.value) } })}
              className="mt-2 w-full accent-[#E2A02F]" />
            <span className="flex justify-between text-[10.5px] text-ink/40"><span>Top</span><span>Bottom</span></span>
          </label>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex items-center justify-between gap-2">
          <button onClick={reset} disabled={busy} title="Pine in light mode, Midnight in dark mode" className="text-sm text-ink/55 hover:text-ink disabled:opacity-50">Reset to default</button>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="rounded-full px-4 py-2 text-sm font-semibold text-ink/65 hover:text-ink">Cancel</button>
            <button onClick={save} disabled={busy || (same(draft.choice, saved.choice) && !draft.pendingImage && (c.kind === "preset" || (saved.choice.kind !== "preset" && c.pos === (saved.choice as { pos: number }).pos)))}
              className="rounded-full bg-pine px-5 py-2 text-sm font-semibold text-paper hover:bg-pine-deep disabled:opacity-40">
              {busy ? "Saving…" : "Save banner"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function DashboardBanner({ children, customizable = false, className = "" }: {
  children: React.ReactNode;
  /** Show the "Customize banner" button (the dashboard home page). */
  customizable?: boolean;
  className?: string;
}) {
  const [saved, setSaved] = useSavedBanner();
  const dark = useIsDark();
  const [draft, setDraft] = useState<Draft | null>(null); // non-null while the picker is open
  const close = useCallback(() => setDraft(null), []);
  const fallback = themeDefault(dark);
  const shown: Draft = draft ?? { choice: saved.choice ?? fallback, uploadUrl: saved.uploadUrl };

  return (
    <section data-dashboard-banner={shown.choice.kind === "preset" ? shown.choice.id : shown.choice.kind}
      className={`relative overflow-hidden pt-[var(--header-h)] text-paper ${className}`}>
      <Background d={shown} />
      {children}
      {customizable && (
        <div className="container-rishi pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-end">
          <button onClick={() => setDraft(draft ? null : { choice: saved.choice ?? fallback, uploadUrl: saved.uploadUrl })} aria-expanded={!!draft}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-paper/25 bg-black/10 px-3 py-1.5 text-xs font-semibold text-paper/80 backdrop-blur-sm transition-colors hover:bg-paper hover:text-pine-deep">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" />
            </svg>
            Customize banner
          </button>
        </div>
      )}
      {draft && (
        <Picker saved={saved} fallback={fallback} draft={draft} setDraft={setDraft} onClose={close}
          onSaved={(d) => { setSaved(d); setDraft(null); }} />
      )}
    </section>
  );
}
