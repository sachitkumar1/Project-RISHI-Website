"use client";

// ============================================================================
//  PVP portal — the President and VPs' own workspace.
// ----------------------------------------------------------------------------
//  Four boards: meetings to set up, message drafts awaiting all three
//  approvals, open questions, and PVP to-dos. Private to the three of them.
//
//  The whole page is ONE request. Every action returns the updated row, which
//  is patched into local state — nothing re-fetches the list after a write.
// ============================================================================

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashboardBanner from "@/components/DashboardBanner";
import ActivePill from "@/components/ActivePill";
import { Line, SkeletonRegion, useShowAfter } from "@/components/Skeleton";
import { isPendingDelete, toast, undoable } from "@/components/Toast";

type Approval = { email: string; at: string };
type Note = { id: string; author: string; body: string; at: string };
type Kind = "meeting" | "message" | "question" | "task";
type Item = {
  id: string; kind: Kind; title: string; body: string; status: string;
  counterpart: string; scheduledAt: string | null; channel: string;
  approvals: Approval[]; notes: Note[]; ownerEmails: string[]; durationMinutes: number;
  calendarPushed: string[]; dueAt: string | null;
  createdBy: string; createdAt: string; updatedAt: string; archived: boolean;
};
type Person = { email: string; name: string };

const BOARDS: { kind: Kind; tab: string; blurb: string; empty: string }[] = [
  { kind: "meeting", tab: "Meetings", blurb: "", empty: "Nobody on the list" },
  { kind: "message", tab: "Messages", blurb: "", empty: "No drafts waiting" },
  { kind: "question", tab: "Questions", blurb: "", empty: "Nothing open" },
  { kind: "task", tab: "Tasks", blurb: "", empty: "Nothing to do" },
];

const inputCls = "mt-1 w-full rounded-xl border border-pine/15 bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-pine/40";
const labelCls = "text-xs font-semibold uppercase tracking-wide text-ink/65";
const btn = "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const fmtTime = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
/** "Oct 20, 3:00 PM – 3:30 PM" — one date, both ends. */
const fmtSpan = (iso: string | null, minutes: number) => {
  if (!iso) return "";
  const s = new Date(iso);
  const e = new Date(s.getTime() + (minutes || 30) * 60_000);
  return `${fmtDate(iso)} – ${fmtTime(e)}`;
};
const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const fmtMins = (m: number) => (m % 60 === 0 ? `${m / 60} hr${m === 60 ? "" : "s"}` : `${m} min`);
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Stale-while-revalidate, the same way as the dashboard board (LmsBoard): the
// last board is kept in memory for this visit only, shown at once when you come
// back, and refreshed quietly on return, on focus (at most every 2 minutes) and
// when the network comes back. A full page load starts empty.
type PvpSnapshot = { items: Item[]; approvers: Person[]; recipients: Person[]; me: string };
let pvpCache: PvpSnapshot | null = null;
const REVALIDATE_ON_FOCUS_MS = 2 * 60_000;

export default function PvpPortal() {
  const [items, setItems] = useState<Item[] | null>(() => pvpCache?.items ?? null);
  const showSkeleton = useShowAfter(items === null);
  const [approvers, setApprovers] = useState<Person[]>(() => pvpCache?.approvers ?? []);
  // Everyone a meeting is pushed to, including the webmaster, so the calendar
  // line can show a name instead of a raw address.
  const [recipients, setRecipients] = useState<Person[]>(() => pvpCache?.recipients ?? []);
  const [me, setMe] = useState(() => pvpCache?.me ?? "");
  const lastFetchRef = useRef(0);
  const [tab, setTab] = useState<Kind>("meeting");
  const [err, setErr] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async (background = false) => {
    lastFetchRef.current = Date.now();
    try {
      const r = await fetch("/api/lms/pvp");
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || "Couldn't load the portal.");
      // Keep the old arrays when nothing changed, so nothing re-renders.
      const keep = <T,>(prev: T, next: T) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
      // Anything deleted a moment ago stays hidden while its Undo is open.
      setItems((p) => keep(p, ((d.items ?? []) as Item[]).filter((i) => !isPendingDelete(`pvp:${i.id}`))));
      setApprovers((p) => keep(p, d.approvers ?? []));
      setRecipients((p) => keep(p, d.recipients ?? []));
      setMe(d.me ?? "");
    } catch (e) {
      // A failed background refresh keeps what's on screen.
      if (!background) setErr(e instanceof Error ? e.message : "Couldn't load the portal.");
    }
  }, []);
  useEffect(() => { void load(!!pvpCache); }, [load]);
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchRef.current < REVALIDATE_ON_FOCUS_MS) return;
      void load(true);
    };
    const onOnline = () => void load(true);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [load]);
  // Keep the cache in step with every change on screen, including writes.
  useEffect(() => { if (items) pvpCache = { items, approvers, recipients, me }; }, [items, approvers, recipients, me]);

  const nameOf = useCallback(
    (email: string) => {
      const e = email.toLowerCase();
      return (approvers.find((p) => p.email === e) ?? recipients.find((p) => p.email === e))?.name ?? email;
    },
    [approvers, recipients],
  );
  const canApprove = approvers.some((p) => p.email === me);

  /** Every write returns the changed row; swap it in rather than re-fetching
   *  the whole board. One request per action, never two.
   *
   *  `optimistic`: for small, predictable changes (status, approve) the card
   *  changes the moment it's clicked. If the server says no — or the request
   *  never arrives — that one card goes back to how it was and a toast says
   *  why. The server's reply replaces the guess either way. */
  const act = async (payload: Record<string, unknown>, optimistic?: (i: Item) => Item) => {
    setErr(null);
    const id = typeof payload.id === "string" ? payload.id : null;
    const before = optimistic && id ? (items ?? []).find((i) => i.id === id) : undefined;
    if (before && optimistic) setItems((x) => (x ?? []).map((i) => (i.id === before.id ? optimistic(i) : i)));
    const rollback = (msg: string) => {
      if (before) {
        setItems((x) => (x ?? []).map((i) => (i.id === before.id ? before : i)));
        toast({ tone: "error", message: `Couldn't save that, so it's back as it was. ${msg}` });
      } else setErr(msg);
    };
    let r: Response; let d: { error?: string; item?: Item } | null;
    try {
      r = await fetch("/api/lms/pvp", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      d = await r.json().catch(() => null);
    } catch { rollback("Check your connection."); return null; }
    if (!r.ok) { rollback(d?.error || "That didn't work."); return null; }
    if (payload.action === "delete") setItems((x) => (x ?? []).filter((i) => i.id !== payload.id));
    else if (d?.item) {
      const fresh = d.item;
      setItems((x) => {
        const list = x ?? [];
        return list.some((i) => i.id === fresh.id) ? list.map((i) => (i.id === fresh.id ? fresh : i)) : [fresh, ...list];
      });
    }
    return d;
  };

  /** Delete with Undo: the card goes at once, and the delete is only sent
   *  when the 8s Undo toast runs out (components/Toast.tsx → undoable). */
  const removeItem = (id: string) => {
    const list = items ?? [];
    const at = list.findIndex((i) => i.id === id);
    if (at < 0) return;
    const gone = list[at];
    setItems((x) => (x ?? []).filter((i) => i.id !== id));
    undoable({
      key: `pvp:${id}`,
      message: `Deleted “${gone.title}”`,
      undo: () => setItems((x) => {
        const l = x ?? [];
        if (l.some((i) => i.id === id)) return l;
        const copy = l.slice(); copy.splice(Math.min(at, copy.length), 0, gone); return copy;
      }),
      commit: async () => {
        const r = await fetch("/api/lms/pvp", {
          method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", id }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || "");
      },
    });
  };

  const board = BOARDS.find((b) => b.kind === tab)!;
  const DONE: Record<Kind, string> = { meeting: "done", message: "sent", question: "resolved", task: "done" };
  const mine = useMemo(
    () => (items ?? []).filter((i) => i.kind === tab && (showDone || i.status !== DONE[tab])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, tab, showDone],
  );
  const openCount = (k: Kind) => (items ?? []).filter((i) => i.kind === k && i.status !== DONE[k]).length;

  return (
    // Banner header then a content section, the same shape as Directory and
    // Lineage. The banner is also what clears the fixed navbar — a plain
    // heading at the top of the page renders underneath it.
    <>
      <DashboardBanner>
        <div className="container-rishi relative z-10 py-12">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-paper/80 hover:text-paper">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
            Back to dashboard
          </Link>
          <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">PVP</h1>
          <p className="mt-2 max-w-xl text-sm text-paper/70">
          </p>
        </div>
      </DashboardBanner>

      <section className="container-rishi py-10"><div className="mx-auto max-w-3xl">

      <div className="flex flex-wrap gap-2">
        {BOARDS.map((b) => {
          const on = b.kind === tab;
          const n = openCount(b.kind);
          return (
            <button key={b.kind} onClick={() => setTab(b.kind)}
              className={`relative rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                on ? "border-pine text-paper" : "border-pine/20 text-pine-deep hover:bg-pine/5"}`}>
              {on && <ActivePill id="pvp-tab" />}
              <span className="relative">{b.tab}{n > 0 && <span className={`ml-1.5 text-xs tabular-nums ${on ? "text-paper/70" : "text-ink/65"}`}>{n}</span>}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-sm text-ink/70">{board.blurb}</p>
      {err && <p className="mt-3 rounded-xl border border-red-600/30 bg-red-600/10 px-3 py-2 text-sm text-red-700">{err}</p>}

      {/* key={tab}: a fresh, closed editor on every tab switch */}
      <NewItem key={tab} kind={tab} approvers={approvers} onCreate={(p) => act({ action: "create", kind: tab, ...p })} />

      <div className="mt-5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink/65">
          {mine.length} {mine.length === 1 ? "item" : "items"}
        </span>
        <label className="flex items-center gap-1.5 text-xs text-ink/70">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show finished
        </label>
      </div>

      {items === null ? (
        showSkeleton ? (
          // Card's own shell and text sizes, so the list doesn't shift on arrival.
          <SkeletonRegion label="Loading the board…" className="mt-3 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-pine/15 bg-paper p-4">
                <Line className="text-sm font-semibold" w={["55%", "70%", "45%"][i]} />
                <Line className="mt-0.5 text-xs" w="35%" />
              </div>
            ))}
          </SkeletonRegion>
        ) : null
      ) : mine.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-pine/15 bg-pine/[0.03] px-4 py-6 text-center text-sm text-ink/70">{board.empty}</p>
      ) : tab === "meeting" ? (
        // Meetings split in two: the ones with a time on them, soonest first,
        // then the ones still to arrange. Sorting the booked ones by date is
        // the whole use of that heading.
        <div className="mt-3 space-y-6">
          {([
            ["Set up", mine.filter((i) => i.scheduledAt).sort((a, b) => Date.parse(a.scheduledAt as string) - Date.parse(b.scheduledAt as string))],
            ["Not set up yet", mine.filter((i) => !i.scheduledAt)],
          ] as [string, Item[]][]).map(([heading, group]) => (
            <div key={heading}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink/65">
                {heading}<span className="ml-1.5 tabular-nums text-ink/65">{group.length}</span>
              </h2>
              {group.length === 0 ? (
                <p className="mt-2 text-sm text-ink/65">
                  {heading === "Set up" ? "Nothing booked yet." : "Everything on the list has a time."}
                </p>
              ) : (
                <div className="mt-2 space-y-3">
                  {group.map((it) => (
                    <Card key={it.id} item={it} me={me} canApprove={canApprove} approvers={approvers} nameOf={nameOf} act={act} onDelete={removeItem} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {mine.map((it) => (
            <Card key={it.id} item={it} me={me} canApprove={canApprove} approvers={approvers} nameOf={nameOf} act={act} onDelete={removeItem} />
          ))}
        </div>
      )}
      </div></section>
    </>
  );
}

// ------------------------------------------------------------------ new item
function NewItem({ kind, approvers, onCreate }: {
  kind: Kind; approvers: Person[]; onCreate: (p: Record<string, unknown>) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [counterpart, setCounterpart] = useState("");
  const [channel, setChannel] = useState("email");
  const [when, setWhen] = useState("");
  const [owners, setOwners] = useState<string[]>([]);
  const [mins, setMins] = useState(30);
  const [busy, setBusy] = useState(false);

  const reset = () => { setTitle(""); setBody(""); setCounterpart(""); setWhen(""); setOwners([]); setMins(30); setChannel("email"); };
  const ADD: Record<Kind, string> = {
    meeting: "Add someone to meet", message: "Add a draft", question: "Add a question", task: "Add a to-do",
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="mt-5 w-full rounded-2xl border border-dashed border-pine/25 px-4 py-3 text-sm font-semibold text-pine-deep hover:bg-pine/5">
        + {ADD[kind]}
      </button>
    );
  }
  return (
    <div className="mt-5 rounded-2xl border border-pine/15 bg-pine/[0.03] p-4">
      <div>
        <label className={labelCls}>{kind === "meeting" ? "What's it about?" : kind === "message" ? "What's the message for?" : "Title"}</label>
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus
          placeholder={kind === "meeting" ? "Partnership chat" : kind === "message" ? "Partnership request with Ruchi" : kind === "question" ? "Do we use big give funds?" : "Reply to Sachit"} />
      </div>

      {kind === "meeting" && (
        <>
          <div className="mt-3"><label className={labelCls}>Who</label>
            <input className={inputCls} value={counterpart} onChange={(e) => setCounterpart(e.target.value)} placeholder="Name, org, or a few people" /></div>
          <div className="mt-3"><label className={labelCls}>When, if it&apos;s already booked</label>
            <input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} />
            <p className="mt-1 text-xs text-ink/65">Leave blank and it stays under &ldquo;Not set up yet&rdquo;.</p></div>
          <div className="mt-3"><label className={labelCls}>How long</label>
            <select className={inputCls} value={mins} onChange={(e) => setMins(Number(e.target.value))}>
              {DURATIONS.map((m) => <option key={m} value={m}>{fmtMins(m)}</option>)}
            </select>
            {when && <p className="mt-1 text-xs text-ink/65">{fmtSpan(new Date(when).toISOString(), mins)}</p>}</div>
        </>
      )}

      {kind === "message" && (
        <div className="mt-3"><label className={labelCls}>Going out by</label>
          <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="email">Email</option><option value="instagram">Instagram</option>
            <option value="text">Text</option><option value="other">Something else</option>
          </select></div>
      )}

      {kind === "task" && (
        <>
          <div className="mt-3"><label className={labelCls}>Whose job (optional)</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {approvers.map((p) => (
                <label key={p.email}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                    owners.includes(p.email) ? "border-pine/40 bg-pine/10 text-pine-deep" : "border-pine/15 text-ink/70"}`}>
                  <input type="checkbox" checked={owners.includes(p.email)}
                    onChange={() => setOwners((x) => x.includes(p.email) ? x.filter((y) => y !== p.email) : [...x, p.email])} />
                  {p.name}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-ink/65">
              {owners.length === 0 ? "Nobody — it just sits on the list." : "Pick as many as you like."}
            </p></div>
          <div className="mt-3"><label className={labelCls}>By when (optional)</label>
            <input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} /></div>
        </>
      )}

      <div className="mt-3">
        <label className={labelCls}>{kind === "message" ? "The draft" : "Details"}</label>
        <textarea className={inputCls} rows={kind === "message" ? 6 : 3} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder={kind === "message" ? "Paste the message" : "Anything the other two should know."} />
      </div>

      <div className="mt-4 flex gap-2">
        <button disabled={busy || !title.trim()}
          onClick={async () => {
            setBusy(true);
            const iso = when ? new Date(when).toISOString() : null;
            const r = await onCreate({
              title, body, counterpart, channel: kind === "message" ? channel : "",
              scheduledAt: kind === "meeting" ? iso : null, dueAt: kind === "task" ? iso : null,
              ownerEmails: owners, durationMinutes: mins,
            });
            setBusy(false);
            if (r) { reset(); setOpen(false); }
          }}
          className={`${btn} bg-pine text-paper hover:bg-pine-deep disabled:opacity-50`}>
          {busy ? "Adding…" : "Add"}
        </button>
        <button onClick={() => { reset(); setOpen(false); }} className={`${btn} border border-pine/20 text-pine-deep`}>Cancel</button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------- card
function Card({ item, me, canApprove, approvers, nameOf, act, onDelete }: {
  item: Item; me: string; canApprove: boolean; approvers: Person[];
  nameOf: (e: string) => string; act: (p: Record<string, unknown>, optimistic?: (i: Item) => Item) => Promise<unknown>;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(toLocalInput(item.scheduledAt));
  const [mins, setMins] = useState(item.durationMinutes || 30);
  const approvedBy = new Set(item.approvals.map((a) => a.email.toLowerCase()));
  const allApproved = approvers.length > 0 && approvers.every((p) => approvedBy.has(p.email));
  const done = item.status === "done" || item.status === "sent" || item.status === "resolved";

  // One request at a time per card: the change already shows, and a second
  // click racing the first could land them in the wrong order.
  const [busy, setBusy] = useState(false);
  const run = async (payload: Record<string, unknown>, optimistic?: (i: Item) => Item) => {
    if (busy) return;
    setBusy(true);
    try { await act(payload, optimistic); } finally { setBusy(false); }
  };
  const setStatus = (status: string) => run({ action: "update", id: item.id, status }, (i) => ({ ...i, status }));
  const toggleApproval = () => run({ action: "approve", id: item.id }, (i) => ({
    ...i,
    approvals: i.approvals.some((a) => a.email.toLowerCase() === me)
      ? i.approvals.filter((a) => a.email.toLowerCase() !== me)
      : [...i.approvals, { email: me, at: new Date().toISOString() }],
  }));

  return (
    <div className={`rounded-2xl border p-4 ${done ? "border-pine/10 bg-pine/[0.02] opacity-70" : "border-pine/15 bg-paper"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm font-semibold text-ink ${done ? "line-through" : ""}`}>{item.title}</p>
          <p className="mt-0.5 text-xs text-ink/70">
            {item.kind === "meeting" && (
              <>{item.counterpart || "No one named yet"}
                {item.scheduledAt ? ` · ${fmtSpan(item.scheduledAt, item.durationMinutes)}` : " · not set up yet"}</>
            )}
            {item.kind === "message" && <>{item.channel || "email"} · {item.approvals.length} of {approvers.length} approved</>}
            {item.kind === "question" && <>asked by {nameOf(item.createdBy)} · {fmtDay(item.createdAt)}</>}
            {item.kind === "task" && (
              <>{item.ownerEmails.length ? item.ownerEmails.map(nameOf).join(", ") : "nobody yet"}
                {item.dueAt ? ` · due ${fmtDate(item.dueAt)}` : ""}</>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {item.kind === "meeting" && !done && item.scheduledAt && (
            <button onClick={() => setStatus("done")} className={`${btn} border border-pine/20 text-pine-deep hover:bg-pine/5`}>Met</button>
          )}
          {item.kind === "message" && !done && allApproved && (
            <button onClick={() => setStatus("sent")} className={`${btn} bg-pine text-paper hover:bg-pine-deep`}>Sent it</button>
          )}
          {item.kind === "question" && !done && (
            <button onClick={() => setStatus("resolved")} className={`${btn} border border-pine/20 text-pine-deep hover:bg-pine/5`}>Resolved</button>
          )}
          {item.kind === "task" && !done && (
            <button onClick={() => setStatus("done")} className={`${btn} border border-pine/20 text-pine-deep hover:bg-pine/5`}>Done</button>
          )}
          {done && <button onClick={() => setStatus(item.kind === "message" ? "draft" : "open")} className={`${btn} text-ink/65 hover:bg-pine/5`}>Reopen</button>}
          <button onClick={() => setOpen((o) => !o)} className={`${btn} text-ink/65 hover:bg-pine/5`}>{open ? "Hide" : "Open"}</button>
        </div>
      </div>

      {/* Message approvals sit on the face of the card — it's the whole point. */}
      {item.kind === "message" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {approvers.map((p) => {
            const ok = approvedBy.has(p.email);
            const isMe = p.email === me;
            return (
              <span key={p.email}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                  ok ? "border-pine/30 bg-pine/10 text-pine-deep" : "border-ink/15 text-ink/65"}`}>
                {ok ? "✓" : "○"} {p.name.split(" ")[0]}{isMe && " (you)"}
              </span>
            );
          })}
          {canApprove && !done && (
            <button onClick={() => void toggleApproval()} disabled={busy}
              className={`${btn} ${approvedBy.has(me) ? "border border-pine/20 text-ink/70" : "bg-marigold text-pine-deep hover:brightness-95"}`}>
              {approvedBy.has(me) ? "Take back my approval" : "Approve"}
            </button>
          )}
          {allApproved && !done && <span className="text-xs font-semibold text-pine-deep">All three approved — ready to send.</span>}
        </div>
      )}

      {open && (
        <div className="mt-4 border-t border-pine/10 pt-3">
          {item.body && (
            <div className={item.kind === "message"
              ? "whitespace-pre-wrap rounded-xl border border-pine/15 bg-pine/[0.03] p-3 text-sm text-ink/80"
              : "whitespace-pre-wrap text-sm text-ink/75"}>{item.body}</div>
          )}

          {item.kind === "meeting" && !done && (
            <>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="grow"><label className={labelCls}>When is it?</label>
                  <input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} /></div>
                <div className="w-32"><label className={labelCls}>How long</label>
                  <select className={inputCls} value={mins} onChange={(e) => setMins(Number(e.target.value))}>
                    {DURATIONS.map((m) => <option key={m} value={m}>{fmtMins(m)}</option>)}
                  </select></div>
                <button
                  onClick={() => act({ action: "update", id: item.id, durationMinutes: mins,
                    scheduledAt: when ? new Date(when).toISOString() : null, status: when ? "scheduled" : "to_set_up" })}
                  className={`${btn} bg-pine text-paper hover:bg-pine-deep`}>Save</button>
              </div>
              {when && <p className="mt-1.5 text-xs text-ink/70">{fmtSpan(new Date(when).toISOString(), mins)}</p>}
            </>
          )}

          {/* Whose calendar actually has it. Worth stating plainly: anyone who
              hasn't connected Google Calendar silently gets nothing. */}
          {item.kind === "meeting" && item.scheduledAt && (
            <p className="mt-3 text-xs text-ink/70">
              {item.calendarPushed.length
                ? `On the calendar of ${item.calendarPushed.map(nameOf).join(", ")}.`
                : "Not on anyone's Google Calendar yet — nobody in PVP has connected one."}
            </p>
          )}

          <div className="mt-4">
            <p className={labelCls}>Notes</p>
            {item.notes.length === 0 && <p className="mt-1 text-xs text-ink/65">Nothing yet.</p>}
            <div className="mt-1 space-y-2">
              {item.notes.map((n) => (
                <div key={n.id} className="rounded-xl bg-pine/[0.04] px-3 py-2 text-sm text-ink/80">
                  <span className="text-xs font-semibold text-pine-deep">{nameOf(n.author)}</span>
                  <span className="ml-1.5 text-xs text-ink/65">{fmtDay(n.at)}</span>
                  <p className="mt-0.5 whitespace-pre-wrap">{n.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input className={inputCls} style={{ marginTop: 0 }} value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note…" onKeyDown={async (e) => {
                  if (e.key === "Enter" && note.trim()) { const r = await act({ action: "note", id: item.id, body: note }); if (r) setNote(""); }
                }} />
              <button disabled={!note.trim()}
                onClick={async () => { const r = await act({ action: "note", id: item.id, body: note }); if (r) setNote(""); }}
                className={`${btn} border border-pine/20 text-pine-deep disabled:opacity-40`}>Add</button>
            </div>
          </div>

          <button
            onClick={() => onDelete(item.id)}
            className="mt-4 text-xs font-semibold text-red-700/80 hover:underline">Delete</button>
        </div>
      )}
    </div>
  );
}
