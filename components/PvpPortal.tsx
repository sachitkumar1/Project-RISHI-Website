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
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardBanner from "@/components/DashboardBanner";

type Approval = { email: string; at: string };
type Note = { id: string; author: string; body: string; at: string };
type Kind = "meeting" | "message" | "question" | "task";
type Item = {
  id: string; kind: Kind; title: string; body: string; status: string;
  counterpart: string; scheduledAt: string | null; channel: string;
  approvals: Approval[]; notes: Note[]; ownerEmail: string; dueAt: string | null;
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
const labelCls = "text-xs font-semibold uppercase tracking-wide text-ink/45";
const btn = "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function PvpPortal() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [approvers, setApprovers] = useState<Person[]>([]);
  const [me, setMe] = useState("");
  const [tab, setTab] = useState<Kind>("meeting");
  const [err, setErr] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/lms/pvp");
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || "Couldn't load the portal.");
      setItems(d.items ?? []);
      setApprovers(d.approvers ?? []);
      setMe(d.me ?? "");
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't load the portal."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const nameOf = useCallback(
    (email: string) => approvers.find((p) => p.email === email.toLowerCase())?.name ?? email,
    [approvers],
  );
  const canApprove = approvers.some((p) => p.email === me);

  /** Every write returns the changed row; swap it in rather than re-fetching
   *  the whole board. One request per action, never two. */
  const act = async (payload: Record<string, unknown>) => {
    setErr(null);
    const r = await fetch("/api/lms/pvp", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) { setErr(d?.error || "That didn't work."); return null; }
    if (payload.action === "delete") setItems((x) => (x ?? []).filter((i) => i.id !== payload.id));
    else if (d?.item) setItems((x) => {
      const list = x ?? [];
      return list.some((i) => i.id === d.item.id) ? list.map((i) => (i.id === d.item.id ? d.item : i)) : [d.item, ...list];
    });
    return d;
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
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                on ? "border-pine bg-pine text-paper" : "border-pine/20 text-pine-deep hover:bg-pine/5"}`}>
              {b.tab}{n > 0 && <span className={`ml-1.5 text-xs ${on ? "text-paper/70" : "text-ink/40"}`}>{n}</span>}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-sm text-ink/55">{board.blurb}</p>
      {err && <p className="mt-3 rounded-xl border border-clay/30 bg-clay/10 px-3 py-2 text-sm text-clay">{err}</p>}

      <NewItem kind={tab} approvers={approvers} onCreate={(p) => act({ action: "create", kind: tab, ...p })} />

      <div className="mt-5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">
          {mine.length} {mine.length === 1 ? "item" : "items"}
        </span>
        <label className="flex items-center gap-1.5 text-xs text-ink/55">
          <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show finished
        </label>
      </div>

      {items === null ? (
        <p className="mt-6 text-sm text-ink/45">Loading…</p>
      ) : mine.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-pine/15 bg-pine/[0.03] px-4 py-6 text-center text-sm text-ink/55">{board.empty}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {mine.map((it) => (
            <Card key={it.id} item={it} me={me} canApprove={canApprove} approvers={approvers} nameOf={nameOf} act={act} />
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
  const [owner, setOwner] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setTitle(""); setBody(""); setCounterpart(""); setWhen(""); setOwner(""); setChannel("email"); };
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
            <p className="mt-1 text-xs text-ink/45">Leave blank and it sits under &ldquo;to set up&rdquo;.</p></div>
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
            <select className={inputCls} value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Nobody yet</option>
              {approvers.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
            </select></div>
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
              scheduledAt: kind === "meeting" ? iso : null, dueAt: kind === "task" ? iso : null, ownerEmail: owner,
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
function Card({ item, me, canApprove, approvers, nameOf, act }: {
  item: Item; me: string; canApprove: boolean; approvers: Person[];
  nameOf: (e: string) => string; act: (p: Record<string, unknown>) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(toLocalInput(item.scheduledAt));
  const approvedBy = new Set(item.approvals.map((a) => a.email.toLowerCase()));
  const allApproved = approvers.length > 0 && approvers.every((p) => approvedBy.has(p.email));
  const done = item.status === "done" || item.status === "sent" || item.status === "resolved";

  const setStatus = (status: string) => act({ action: "update", id: item.id, status });

  return (
    <div className={`rounded-2xl border p-4 ${done ? "border-pine/10 bg-pine/[0.02] opacity-70" : "border-pine/15 bg-paper"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm font-semibold text-ink ${done ? "line-through" : ""}`}>{item.title}</p>
          <p className="mt-0.5 text-xs text-ink/50">
            {item.kind === "meeting" && (
              <>{item.counterpart || "No one named yet"}
                {item.scheduledAt ? ` · ${fmtDate(item.scheduledAt)}` : " · not set up yet"}</>
            )}
            {item.kind === "message" && <>{item.channel || "email"} · {item.approvals.length} of {approvers.length} approved</>}
            {item.kind === "question" && <>asked by {nameOf(item.createdBy)} · {fmtDay(item.createdAt)}</>}
            {item.kind === "task" && (
              <>{item.ownerEmail ? nameOf(item.ownerEmail) : "unassigned"}
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
          {done && <button onClick={() => setStatus(item.kind === "message" ? "draft" : "open")} className={`${btn} text-ink/45 hover:bg-pine/5`}>Reopen</button>}
          <button onClick={() => setOpen((o) => !o)} className={`${btn} text-ink/45 hover:bg-pine/5`}>{open ? "Hide" : "Open"}</button>
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
                  ok ? "border-pine/30 bg-pine/10 text-pine-deep" : "border-ink/15 text-ink/45"}`}>
                {ok ? "✓" : "○"} {p.name.split(" ")[0]}{isMe && " (you)"}
              </span>
            );
          })}
          {canApprove && !done && (
            <button onClick={() => act({ action: "approve", id: item.id })}
              className={`${btn} ${approvedBy.has(me) ? "border border-pine/20 text-ink/50" : "bg-marigold text-pine-deep hover:brightness-95"}`}>
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
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="grow"><label className={labelCls}>When is it?</label>
                <input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} /></div>
              <button
                onClick={() => act({ action: "update", id: item.id, scheduledAt: when ? new Date(when).toISOString() : null, status: when ? "scheduled" : "to_set_up" })}
                className={`${btn} bg-pine text-paper hover:bg-pine-deep`}>Save</button>
            </div>
          )}

          <div className="mt-4">
            <p className={labelCls}>Notes</p>
            {item.notes.length === 0 && <p className="mt-1 text-xs text-ink/40">Nothing yet.</p>}
            <div className="mt-1 space-y-2">
              {item.notes.map((n) => (
                <div key={n.id} className="rounded-xl bg-pine/[0.04] px-3 py-2 text-sm text-ink/80">
                  <span className="text-xs font-semibold text-pine-deep">{nameOf(n.author)}</span>
                  <span className="ml-1.5 text-xs text-ink/40">{fmtDay(n.at)}</span>
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
            onClick={() => { if (confirm("Delete this for everyone? It can't be undone.")) void act({ action: "delete", id: item.id }); }}
            className="mt-4 text-xs font-semibold text-clay/80 hover:underline">Delete</button>
        </div>
      )}
    </div>
  );
}
