"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Notification = {
  id: string;
  title: string;
  body: string;
  kind: string;
  refId: string | null;
  read: boolean;
  createdAt: string;
};

// Distinct panel background so the dropdown doesn't blend into the page.
const PANEL_BG = "var(--notif-panel-bg)"; // soft pine-tinted off-white (dark mode: app/dark-theme.css)

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
const fmtFull = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });

export default function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission>("default");
  const [selected, setSelected] = useState<Notification | null>(null);
  const [rect, setRect] = useState<{ top: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  const fireBrowser = useCallback((list: Notification[]) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (seen.current === null) return;
    for (const n of list) {
      if (!seen.current.has(n.id) && !n.read) {
        try { new Notification(n.title, { body: n.body, tag: n.id }); } catch { /* ignore */ }
      }
    }
  }, []);

  const fetchNotifs = useCallback(async () => {
    try {
      const res = await fetch("/api/lms/notifications", { headers: { "Content-Type": "application/json" } });
      if (!res.ok) return;
      const data = await res.json();
      const list: Notification[] = data.notifications ?? [];
      fireBrowser(list);
      seen.current = new Set(list.map((n) => n.id));
      setItems(list);
      setUnread(data.unread ?? list.filter((n) => !n.read).length);
    } catch { /* offline / not signed in */ }
  }, [fireBrowser]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) setPerm(Notification.permission);
    fetchNotifs();
    const t = setInterval(fetchNotifs, 20000);
    return () => clearInterval(t);
  }, [fetchNotifs]);

  // Position the portalled panel under the bell, and keep it there on scroll/resize.
  const reposition = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (b) setRect({ top: b.bottom + 8, right: Math.max(8, window.innerWidth - b.right) });
  }, []);
  useEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  // Close on outside click (button + panel are the "inside").
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || btnRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function requestPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try { setPerm(await Notification.requestPermission()); } catch { /* ignore */ }
  }

  async function markRead(id?: string) {
    try {
      await fetch("/api/lms/notifications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : {}),
      });
      setItems((prev) => prev.map((n) => (!id || n.id === id ? { ...n, read: true } : n)));
      setUnread((u) => (id ? Math.max(0, u - 1) : 0));
    } catch { /* ignore */ }
  }

  function openDetail(n: Notification) {
    setSelected(n);
    if (!n.read) markRead(n.id);
  }

  const panel = open && rect && (
    <div
      ref={panelRef}
      style={{ position: "fixed", top: rect.top, right: rect.right, backgroundColor: PANEL_BG, zIndex: 1000 }}
      className="w-[22rem] max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-pine/25 text-ink shadow-2xl ring-1 ring-pine/10"
    >
      <div className="flex items-center justify-between border-b border-pine/15 px-4 py-3">
        <p className="font-display text-sm font-semibold text-pine-deep">Notifications</p>
        {items.some((n) => !n.read) && (
          <button onClick={() => markRead()} className="text-xs font-medium text-pine-deep hover:underline">Mark all read</button>
        )}
      </div>

      {perm !== "granted" && (
        <button onClick={requestPermission} className="block w-full border-b border-pine/15 bg-marigold-soft/40 px-4 py-2 text-left text-xs text-marigold-deep hover:bg-marigold-soft/60">
          Turn on browser notifications →
        </button>
      )}

      <div className="max-h-[60vh] overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink/40">No notifications yet.</p>
        ) : (
          items.map((n) => (
            <button
              key={n.id}
              onClick={() => openDetail(n)}
              className={`block w-full border-b border-pine/10 px-4 py-3 text-left transition-colors hover:bg-pine/[0.05] ${n.read ? "" : "bg-marigold-soft/20"}`}
            >
              <div className="flex items-start gap-2">
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-marigold" />}
                <div className={n.read ? "pl-4" : ""}>
                  <p className="text-sm font-semibold text-ink">{n.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-ink/65">{n.body}</p>
                  <p className="mt-1 text-[11px] text-ink/40">{fmtWhen(n.createdAt)} · tap to open</p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );

  const detail = selected && (
    <div className="fixed inset-0 grid place-items-center bg-ink/40 p-4" style={{ zIndex: 1100 }} onClick={() => setSelected(null)}>
      <div className="w-full max-w-md overflow-y-auto rounded-3xl p-6 shadow-xl" style={{ backgroundColor: PANEL_BG, maxHeight: "85vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-pine-deep">{selected.title}</h3>
          <button onClick={() => setSelected(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink/50 hover:bg-ink/5" aria-label="Close">✕</button>
        </div>
        <p className="mt-1 text-xs text-ink/45">{fmtFull(selected.createdAt)}</p>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink/80">{selected.body}</p>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => { setOpen((o) => !o); if (perm === "default") requestPermission(); }}
        className="relative grid h-10 w-10 place-items-center rounded-full border border-paper/30 text-paper transition-colors hover:bg-paper hover:text-pine-deep"
        aria-label="Notifications"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-marigold px-1 text-[11px] font-bold text-pine-deep">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {mounted && panel && createPortal(panel, document.body)}
      {mounted && detail && createPortal(detail, document.body)}
    </>
  );
}
