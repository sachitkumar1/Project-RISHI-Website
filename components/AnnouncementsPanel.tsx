"use client";

import { useCallback, useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import "@/components/editor/editor.css";

type Item = {
  id: string;
  authorName: string;
  authorAvatar: string | null;
  subject: string;
  bodyHtml: string;
  createdAt: string;
  read: boolean;
  canDelete: boolean;
};

const relTime = (iso: string) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const fullTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Megaphone({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  );
}

// Envelope icon. `unread` shows a filled dot (Gmail-style unread indicator).
function EnvelopeIcon({ unread, className = "" }: { unread: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7.5 8.5 6 8.5-6" />
      {unread && <circle cx="19" cy="6" r="3" fill="#e2a02f" stroke="none" />}
    </svg>
  );
}

export default function AnnouncementsPanel({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/lms/announcements");
      if (!r.ok) return;
      const d = await r.json();
      setItems(d.announcements ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener("rishi:refresh", onRefresh);
    return () => window.removeEventListener("rishi:refresh", onRefresh);
  }, [load]);

  const unread = items.filter((i) => !i.read).length;

  async function setRead(id: string, read: boolean) {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, read } : i)));
    setOpenItem((o) => (o && o.id === id ? { ...o, read } : o));
    try {
      await fetch(`/api/lms/announcements/${id}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read }),
      });
    } catch {
      /* optimistic */
    }
  }

  function open(item: Item) {
    setOpenItem(item);
    setConfirmDelete(false);
    if (!item.read) setRead(item.id, true);
  }

  function closeModal() {
    setOpenItem(null);
    setConfirmDelete(false);
  }

  async function remove(id: string) {
    setItems((list) => list.filter((i) => i.id !== id));
    closeModal();
    try {
      await fetch(`/api/lms/announcements/${id}`, { method: "DELETE" });
    } catch {
      /* optimistic */
    }
  }

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-pine/15 bg-pine/[0.03] ${compact ? "p-4" : "p-8"}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`grid place-items-center rounded-2xl bg-marigold text-pine-deep ${compact ? "h-9 w-9" : "h-12 w-12"}`}>
            <Megaphone className={compact ? "h-5 w-5" : "h-6 w-6"} />
          </span>
          <div>
            <h2 className={`font-display font-semibold text-pine-deep ${compact ? "text-lg" : "text-2xl"}`}>Announcements</h2>
            <p className={`${compact ? "text-[11px]" : "text-sm"} text-ink/55`}>{unread > 0 ? `${unread} unread` : "You're all caught up"}</p>
          </div>
        </div>
      </div>

      {/* List */}
      <div className={`${compact ? "mt-1" : "mt-5"} -mx-2 min-h-0 max-h-72 flex-1 overflow-y-auto px-2`}>
        {items.length === 0 && <p className={`${compact ? "py-1 text-[11px]" : "py-8 text-sm"} text-center text-ink/50`}>No announcements yet.</p>}
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => open(item)}
            className={`mb-2 flex w-full items-start gap-3 rounded-2xl border ${compact ? "p-2" : "p-3"} text-left transition-colors ${
              !item.read ? "border-marigold/40 bg-marigold-soft/20" : "border-pine/10 bg-paper hover:bg-pine/[0.03]"
            }`}
          >
            <Avatar src={item.authorAvatar} name={item.authorName} size={compact ? 28 : 36} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-ink/55">{item.authorName}</span>
                {!item.read && <span className="h-2 w-2 rounded-full bg-marigold" />}
                <span className="ml-auto text-[11px] text-ink/40">{relTime(item.createdAt)}</span>
              </div>
              <p className="mt-0.5 truncate font-semibold text-ink">{item.subject}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Read popup */}
      {openItem && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" onClick={closeModal}>
          <div
            className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-paper p-6 text-ink shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar src={openItem.authorAvatar} name={openItem.authorName} size={40} />
                <div>
                  <p className="text-sm font-semibold text-ink">{openItem.authorName}</p>
                  <p className="text-xs text-ink/45">{fullTime(openItem.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setRead(openItem.id, !openItem.read)}
                  title={openItem.read ? "Mark as unread" : "Mark as read"}
                  aria-label={openItem.read ? "Mark as unread" : "Mark as read"}
                  className="grid h-9 w-9 place-items-center rounded-full text-ink/55 hover:bg-ink/10 hover:text-pine-deep"
                >
                  <EnvelopeIcon unread={openItem.read} className="h-5 w-5" />
                </button>
                {openItem.canDelete && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    title="Delete announcement"
                    aria-label="Delete announcement"
                    className="grid h-9 w-9 place-items-center rounded-full text-ink/55 hover:bg-red-50 hover:text-red-600"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={closeModal}
                  title="Close"
                  aria-label="Close"
                  className="grid h-9 w-9 place-items-center rounded-full text-ink/55 hover:bg-ink/10 hover:text-ink"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Subject + body */}
            <h3 className="mt-5 font-display text-2xl font-semibold text-pine-deep">{openItem.subject}</h3>
            <div className="rte-content mt-3 text-[15px]" dangerouslySetInnerHTML={{ __html: openItem.bodyHtml }} />

            {/* Delete confirmation */}
            {confirmDelete && (
              <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-700">
                  Delete this announcement? It disappears from everyone&rsquo;s dashboard. (Emails already sent are unaffected.)
                </p>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => setConfirmDelete(false)} className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/5">
                    Cancel
                  </button>
                  <button onClick={() => remove(openItem.id)} className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
