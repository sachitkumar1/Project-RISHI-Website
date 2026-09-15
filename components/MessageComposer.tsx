"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import RichTextEditor from "@/components/editor/RichTextEditor";
import MergeTable, { defaultColumns, emptyRow, makeCol, type Col, type Rows } from "@/components/MergeTable";
import EmailChipsInput from "@/components/EmailChipsInput";
import { parseCsv } from "@/lib/csvParse";

const normalize = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");
const DEFAULT_KEYS = new Set(["firstname", "lastname", "email", "projectgroup", "fullname"]);

type Lite = { email: string; name: string; group: string };
type Mode = "announcement" | "email" | "newsletter";
type Options = {
  modes: Mode[];
  me: { exec: boolean; lead: boolean; group: string };
  announce: { scopes: Array<"members" | "group" | "club">; groups: string[]; targetableMembers: Lite[] };
  email: { allMembers: Lite[] };
  newsletter: { memberCount: number; subscriberCount: number };
  senders: { clubConnected: boolean; clubAddress: string; personalConnected: boolean; personalAddress: string };
  mergeTags: Array<{ tag: string; label: string }>;
};

const GROUP_LABELS: Record<string, string> = {
  E: "Education",
  R: "Water & Sanitation",
  W: "Women's Empowerment",
  H: "Health",
};
const MODE_LABEL: Record<Mode, string> = { announcement: "Announcement", email: "Email", newsletter: "Newsletter" };

export type ComposerPrefill = { subject: string; bodyHtml: string; cc: string[] };

// Build merge columns from the {{tokens}} in a template: one column per unique
// token (preserving how it was written), plus a mandatory Email column.
function columnsFromTemplate(...texts: string[]): Col[] {
  const seen = new Set<string>();
  const cols: Col[] = [];
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  for (const text of texts) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const name = m[1].trim();
      const key = normalize(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      cols.push(makeCol(name));
    }
  }
  if (!seen.has("email")) cols.push(makeCol("Email"));
  return cols;
}

export default function MessageComposer({
  initialMode,
  onClose,
  onPosted,
  prefill,
}: {
  initialMode: Mode;
  onClose: () => void;
  onPosted: (msg: string) => void;
  prefill?: ComposerPrefill;
}) {
  const hasTemplateTokens = prefill ? /\{\{\s*[^}]+?\s*\}\}/.test(prefill.subject + prefill.bodyHtml) : false;
  const [opts, setOpts] = useState<Options | null>(null);
  const [mode, setMode] = useState<Mode>(prefill ? "email" : initialMode);
  const [subject, setSubject] = useState(prefill?.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(prefill?.bodyHtml ?? "");
  const [cc, setCc] = useState<string[]>(prefill?.cc ?? []);
  const [mailMerge, setMailMerge] = useState(hasTemplateTokens);
  const [mergeSource, setMergeSource] = useState<"table" | "csv">("table");
  // Build-a-table data and CSV-imported data are kept separately so switching
  // between the two never loses what you built.
  const [tableCols, setTableCols] = useState<Col[]>(() =>
    hasTemplateTokens && prefill ? columnsFromTemplate(prefill.subject, prefill.bodyHtml) : defaultColumns(),
  );
  const [tableRows, setTableRows] = useState<Rows>(() => [emptyRow(tableCols)]);
  const [csvCols, setCsvCols] = useState<Col[]>([]);
  const [csvRows, setCsvRows] = useState<Rows>([]);
  const [csvNote, setCsvNote] = useState<string | null>(null);
  const [sender, setSender] = useState<"club" | "personal">("club");

  // announcement
  const [scopeKind, setScopeKind] = useState<"members" | "group" | "club">("members");
  const [annMembers, setAnnMembers] = useState<string[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  // email
  const [emailScope, setEmailScope] = useState<"members" | "group" | "club">("members");
  const [emailMembers, setEmailMembers] = useState<string[]>([]);
  const [emailGroups, setEmailGroups] = useState<string[]>([]);
  const [externalChips, setExternalChips] = useState<string[]>([]);

  const activeCols = mergeSource === "table" ? tableCols : csvCols;
  const activeRows = mergeSource === "table" ? tableRows : csvRows;

  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const insertRef = useRef<((t: string) => void) | null>(null);

  useEffect(() => {
    fetch("/api/lms/compose")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Options | null) => {
        if (!d) return;
        setOpts(d);
        if (mode === "announcement") setScopeKind(d.announce.scopes[0] ?? "members");
        setSender(d.senders.clubConnected ? "club" : "personal");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchMode(m: Mode) {
    setMode(m);
    setErr(null);
    setMailMerge(false);
    if (m === "newsletter") setSender("club");
    else if (opts) setSender(opts.senders.clubConnected ? "club" : "personal");
    if (m === "announcement" && opts) setScopeKind(opts.announce.scopes[0] ?? "members");
  }

  const externalEmails = externalChips;

  // Can this person use the club address for an EMAIL with the current recipients?
  const clubAllowedForEmail = useMemo(() => {
    if (!opts) return false;
    if (opts.me.exec) return true;
    if (!opts.me.lead) return false;
    if (externalEmails.length > 0) return false;
    if (emailScope === "club") return false; // whole club ≠ only own group
    if (emailScope === "group") return emailGroups.length === 1 && emailGroups[0] === opts.me.group;
    const groupEmails = new Set(opts.email.allMembers.filter((m) => m.group === opts.me.group).map((m) => m.email));
    return emailMembers.length > 0 && emailMembers.every((e) => groupEmails.has(e));
  }, [opts, emailMembers, emailGroups, emailScope, externalEmails]);

  function toggle<T>(list: T[], v: T): T[] {
    return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  }

  const filteredAnn = useMemo(
    () => (opts ? opts.announce.targetableMembers.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())) : []),
    [opts, q],
  );
  const filteredEmail = useMemo(
    () => (opts ? opts.email.allMembers.filter((m) => m.name.toLowerCase().includes(q.toLowerCase())) : []),
    [opts, q],
  );

  // Insert chips = default tags + a chip for each custom (non-default) column.
  const insertChips = useMemo(() => {
    const defaults = (opts?.mergeTags ?? []).map((t) => t.tag);
    const custom = activeCols
      .filter((c) => c.name.trim() && !DEFAULT_KEYS.has(normalize(c.name)))
      .map((c) => `{{${c.name.trim()}}}`);
    return [...defaults, ...Array.from(new Set(custom))];
  }, [opts, activeCols]);

  function loadCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const { columns, rows } = parseCsv(String(reader.result));
      if (columns.length === 0) { setCsvNote("That file looked empty."); return; }
      const cols = columns.map((name) => makeCol(name));
      const mapped = rows.map((r) => {
        const o: Record<string, string> = {};
        cols.forEach((c) => (o[c.id] = r[c.name] ?? ""));
        return o;
      });
      setCsvCols(cols);
      setCsvRows(mapped.length ? mapped : [emptyRow(cols)]);
      setCsvNote(`Imported ${mapped.length} row${mapped.length === 1 ? "" : "s"}, ${cols.length} columns.`);
    };
    reader.readAsText(file);
  }

  function enableMerge(on: boolean) {
    setMailMerge(on);
    if (on && tableCols.length === 0) {
      const cols = defaultColumns();
      setTableCols(cols);
      setTableRows([emptyRow(cols)]);
    }
  }

  async function submit() {
    if (!opts) return;
    setBusy(true);
    setErr(null);
    try {
      const payload: Record<string, unknown> = { mode, subject, bodyHtml, mailMerge, sender };
      if (mailMerge && mode !== "newsletter") {
        const rowsForSend = activeRows
          .map((r) => {
            const o: Record<string, string> = {};
            activeCols.forEach((c) => { if (c.name.trim()) o[c.name.trim()] = r[c.id] ?? ""; });
            return o;
          })
          .filter((o) => Object.values(o).some((v) => v && v.trim()));
        payload.mergeRows = rowsForSend;
      }
      if (mode === "announcement") {
        payload.scopeKind = scopeKind;
        payload.memberEmails = annMembers;
        payload.groups = groups;
      } else if (mode === "email") {
        payload.scopeKind = emailScope;
        payload.memberEmails = emailMembers;
        payload.groups = emailGroups;
        payload.externalEmails = externalEmails;
        payload.cc = cc;
        payload.sender = clubAllowedForEmail ? sender : "personal";
      }
      const res = await fetch("/api/lms/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't send.");
      const noun = mode === "email" ? "Email" : mode === "newsletter" ? "Newsletter" : "Announcement";
      onPosted(
        data.emailSent
          ? `${noun} sent to ${data.recipients} recipient${data.recipients === 1 ? "" : "s"}.`
          : `Saved, but the email didn't send: ${data.sendError ?? "unknown error"}.`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!opts) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" onClick={onClose}>
        <div className="rounded-2xl bg-paper px-6 py-4 text-sm text-ink/60">Loading…</div>
      </div>
    );
  }

  const senderUnavailable =
    mode !== "newsletter" &&
    ((sender === "club" && !opts.senders.clubConnected) || (sender === "personal" && !opts.senders.personalConnected));
  const sendLabel = mode === "email" ? "Send email" : mode === "newsletter" ? "Send newsletter" : "Post & send";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-paper p-6 text-ink shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Mode switch */}
        {opts.modes.length > 1 ? (
          <div className="mb-4 inline-flex rounded-full bg-ink/[0.06] p-1">
            {opts.modes.map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${mode === m ? "bg-pine text-paper" : "text-ink/60 hover:text-ink"}`}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
        ) : (
          <h3 className="mb-4 font-display text-xl font-semibold text-pine-deep">New {MODE_LABEL[mode].toLowerCase()}</h3>
        )}

        {/* Subject */}
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">
            Subject {mode === "email" && <span className="text-red-500">*</span>}
          </span>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={mode === "newsletter" ? "[NEWSLETTER]" : mode === "announcement" ? "[ANNOUNCEMENT]" : "Subject"}
            className="mt-1.5 w-full rounded-xl border border-ink/15 px-3 py-2 text-sm text-ink placeholder:text-ink/40"
          />
        </label>

        {/* Recipients */}
        <div className="mt-4">
          {mode === "newsletter" && (
            <p className="rounded-xl bg-marigold-soft/30 px-3 py-2.5 text-sm text-pine-deep">
              Goes to all <strong>{opts.newsletter.memberCount} members</strong> and{" "}
              <strong>{opts.newsletter.subscriberCount} website subscriber{opts.newsletter.subscriberCount === 1 ? "" : "s"}</strong>.
            </p>
          )}

          {mode === "announcement" && (
            <>
              <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">Send to</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {opts.announce.scopes.map((s) => (
                  <button key={s} onClick={() => setScopeKind(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${scopeKind === s ? "bg-pine text-paper" : "border border-ink/15 text-ink/70 hover:bg-ink/5"}`}>
                    {s === "members" ? "Specific people" : s === "group" ? "Project group" : "Whole club"}
                  </button>
                ))}
              </div>
              {scopeKind === "members" && (
                <div className="mt-3 rounded-xl border border-ink/12 p-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="mb-2 w-full rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm text-ink placeholder:text-ink/40" />
                  <div className="max-h-36 space-y-0.5 overflow-y-auto">
                    {filteredAnn.map((m) => (
                      <label key={m.email} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-ink hover:bg-ink/5">
                        <input type="checkbox" checked={annMembers.includes(m.email)} onChange={() => setAnnMembers((l) => toggle(l, m.email))} className="accent-pine" />
                        {m.name} <span className="text-xs text-ink/40">{GROUP_LABELS[m.group] ?? m.group}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {scopeKind === "group" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {opts.announce.groups.map((g) => (
                    <label key={g} className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium ${groups.includes(g) ? "bg-marigold text-pine-deep" : "border border-ink/15 text-ink/70"}`}>
                      <input type="checkbox" checked={groups.includes(g)} onChange={() => setGroups((l) => toggle(l, g))} className="hidden" />
                      {GROUP_LABELS[g] ?? g}
                    </label>
                  ))}
                </div>
              )}
              {scopeKind === "club" && <p className="mt-3 text-sm text-ink/60">Goes to every member of the club.</p>}
            </>
          )}

          {mode === "email" && (
            <>
              <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">Send to</span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {(["members", "group", "club"] as const).map((s) => (
                  <button key={s} onClick={() => setEmailScope(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${emailScope === s ? "bg-pine text-paper" : "border border-ink/15 text-ink/70 hover:bg-ink/5"}`}>
                    {s === "members" ? "Specific people" : s === "group" ? "Project group" : "Whole club"}
                  </button>
                ))}
              </div>

              {emailScope === "members" && (
                <div className="mt-3 rounded-xl border border-ink/12 p-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members…" className="mb-2 w-full rounded-lg border border-ink/15 px-2.5 py-1.5 text-sm text-ink placeholder:text-ink/40" />
                  <div className="max-h-32 space-y-0.5 overflow-y-auto">
                    {filteredEmail.map((m) => (
                      <label key={m.email} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm text-ink hover:bg-ink/5">
                        <input type="checkbox" checked={emailMembers.includes(m.email)} onChange={() => setEmailMembers((l) => toggle(l, m.email))} className="accent-pine" />
                        {m.name} <span className="text-xs text-ink/40">{GROUP_LABELS[m.group] ?? m.group}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {emailScope === "group" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(["E", "R", "W", "H"] as const).map((g) => (
                    <label key={g} className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium ${emailGroups.includes(g) ? "bg-marigold text-pine-deep" : "border border-ink/15 text-ink/70"}`}>
                      <input type="checkbox" checked={emailGroups.includes(g)} onChange={() => setEmailGroups((l) => toggle(l, g))} className="hidden" />
                      {GROUP_LABELS[g] ?? g}
                    </label>
                  ))}
                </div>
              )}
              {emailScope === "club" && <p className="mt-3 text-sm text-ink/60">Goes to every member of the club.</p>}

              <div className="mt-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">Other email addresses</span>
                <div className="mt-1.5">
                  <EmailChipsInput value={externalChips} onChange={setExternalChips} />
                </div>
              </div>

              <div className="mt-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">CC</span>
                <div className="mt-1.5">
                  <EmailChipsInput value={cc} onChange={setCc} placeholder="CC addresses (optional)…" />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Sender */}
        {mode === "newsletter" ? (
          <p className="mt-4 text-xs text-ink/50">Sent from the club email ({opts.senders.clubAddress}).</p>
        ) : (
          <div className="mt-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">Send from</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(mode === "announcement" || clubAllowedForEmail) && (
                <button onClick={() => setSender("club")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${sender === "club" ? "bg-pine text-paper" : "border border-ink/15 text-ink/70 hover:bg-ink/5"}`}>
                  Club ({opts.senders.clubAddress})
                </button>
              )}
              <button onClick={() => setSender("personal")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${sender === "personal" || (mode === "email" && !clubAllowedForEmail) ? "bg-pine text-paper" : "border border-ink/15 text-ink/70 hover:bg-ink/5"}`}>
                My email ({opts.senders.personalAddress})
              </button>
            </div>
            {mode === "email" && !clubAllowedForEmail && (
              <p className="mt-1.5 text-xs text-ink/45">The club email is only available when writing to your own project group.</p>
            )}
            {senderUnavailable && (
              <p className="mt-1.5 text-xs text-marigold-deep">That account isn&rsquo;t connected — connect it in Account settings first.</p>
            )}
          </div>
        )}

        {/* Mail merge (not available for newsletters) */}
        {mode !== "newsletter" && (
          <div className="mt-4 rounded-xl border border-ink/12 p-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={mailMerge} onChange={(e) => enableMerge(e.target.checked)} className="accent-pine" />
              <span className="text-sm font-semibold text-ink">Personalize with mail merge</span>
            </label>

            {mailMerge && (
              <div className="mt-3">
                <p className="text-xs text-ink/55">
                  Members fill in automatically. Add a row for anyone else (or to override / add attributes). The
                  <strong> Email</strong> column says who each row is for.
                </p>

                {/* source toggle */}
                <div className="mt-2 inline-flex rounded-full bg-ink/[0.06] p-1">
                  <button onClick={() => setMergeSource("table")} className={`rounded-full px-3 py-1 text-xs font-semibold ${mergeSource === "table" ? "bg-pine text-paper" : "text-ink/60"}`}>
                    Build a table
                  </button>
                  <button onClick={() => setMergeSource("csv")} className={`rounded-full px-3 py-1 text-xs font-semibold ${mergeSource === "csv" ? "bg-pine text-paper" : "text-ink/60"}`}>
                    Upload CSV
                  </button>
                </div>

                {mergeSource === "csv" && (
                  <div className="mt-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-ink/15 px-3 py-1.5 text-xs font-semibold text-ink/70 hover:bg-ink/5">
                      Choose .csv file
                      <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadCsv(f); e.target.value = ""; }} />
                    </label>
                    {csvNote && <span className="ml-2 text-xs text-ink/50">{csvNote}</span>}
                  </div>
                )}

                {/* The editable table only shows when building one. Uploading a
                    CSV hides it; the table you built is preserved for when you
                    switch back. CSV data, once imported, is shown for review. */}
                {mergeSource === "table" ? (
                  <div className="mt-3">
                    <MergeTable columns={tableCols} rows={tableRows} onChange={(c, r) => { setTableCols(c); setTableRows(r); }} />
                  </div>
                ) : (
                  csvCols.length > 0 && (
                    <div className="mt-3">
                      <MergeTable columns={csvCols} rows={csvRows} onChange={(c, r) => { setCsvCols(c); setCsvRows(r); }} />
                    </div>
                  )
                )}

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-ink/50">Insert:</span>
                  {insertChips.map((tag) => (
                    <button key={tag} onClick={() => insertRef.current?.(tag)} className="rounded-md bg-pine/10 px-2 py-0.5 text-xs font-medium text-pine hover:bg-pine/20">
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Body */}
        <div className="mt-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink/50">Message</span>
          <div className="mt-1.5">
            <RichTextEditor value={prefill?.bodyHtml ?? ""} onChange={setBodyHtml} registerInsert={(fn) => (insertRef.current = fn)} placeholder="Write your message…" />
          </div>
        </div>

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={onClose} disabled={busy} className="rounded-full px-4 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/5">Cancel</button>
          <button onClick={submit} disabled={busy || senderUnavailable} className="rounded-full bg-pine px-5 py-2 text-sm font-semibold text-paper hover:bg-pine-deep disabled:opacity-50">
            {busy ? "Sending…" : sendLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
