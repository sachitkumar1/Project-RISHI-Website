"use client";

import { useState } from "react";
import { formatPhoneInput } from "@/lib/lms/phone";

/**
 * "Request a change" to your directory contact info. Nothing changes directly —
 * the request is emailed to the webmaster, who applies it if approved.
 */
export default function ContactRequestForm({ current, onDone }: {
  current: { email: string; phone: string };
  onDone?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/lms/directory/request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactEmail: email, phone, note }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Couldn't send your request.");
      setSent(true);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't send your request."); }
    setBusy(false);
  }

  if (sent) {
    return (
      <div data-contact-request-sent className="rounded-2xl border border-pine/15 bg-pine/[0.05] p-4 text-sm text-ink/75">
        <p className="font-semibold text-pine-deep">Request sent</p>
        <p className="mt-1">The webmaster will update your contact info once they&apos;ve approved it.</p>
        {onDone && <button onClick={onDone} className="mt-3 rounded-full border border-pine/20 px-4 py-1.5 text-xs font-semibold text-pine-deep hover:bg-pine/5">Close</button>}
      </div>
    );
  }

  const field = "mt-1.5 w-full rounded-xl border border-pine/20 px-4 py-2.5 text-sm outline-none focus:border-pine";
  return (
    <div data-contact-request-form>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-2xl bg-ink/[0.03] px-4 py-3 text-sm">
        <dt className="text-ink/50">Current email</dt><dd className="truncate text-ink/80">{current.email || "—"}</dd>
        <dt className="text-ink/50">Current phone</dt><dd className="text-ink/80">{current.phone || "—"}</dd>
      </dl>
      <label className="mt-4 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">New email</span>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Leave blank to keep the current one" className={field} />
      </label>
      <label className="mt-3 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">New phone</span>
        <input value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} placeholder="Leave blank to keep the current one" className={field} />
      </label>
      <label className="mt-3 block">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">Note (optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} placeholder="Anything the webmaster should know" className={`${field} resize-none`} />
      </label>
      <p className="mt-2 text-[11px] text-ink/45">Your request is emailed to the webmaster, who makes the change once they approve it. This never changes the email you log in with.</p>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <button onClick={send} disabled={busy || (!email.trim() && !phone.trim())}
        className="mt-4 rounded-full bg-pine px-5 py-2 text-sm font-semibold text-paper hover:bg-pine-deep disabled:opacity-50">
        {busy ? "Sending…" : "Send request"}
      </button>
    </div>
  );
}
