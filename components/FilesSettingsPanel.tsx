"use client";

import { useEffect, useState } from "react";

type Status = {
  index?: { total: number; withText: number; pending: number };
  lastSync: string | null;
  usedBytes: number;
  maxUploadBytes: number;
  folders: { id: string; year: string; name: string }[];
  excludedCount: number;
  serviceAccount: string | null;
};

type Folder = {
  id: string;
  driveId: string | null;
  name: string;
  year: string | null;
  path: string;
  audience: "all" | "leads" | "exec" | "vpp" | "groups" | "group_leads" | "nmt";
  audienceGroups?: string[];
  audienceExplicit?: boolean;
};

const AUDIENCES: { value: Folder["audience"]; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "leads", label: "Leads & Exec" },
  { value: "exec", label: "Exec" },
  { value: "vpp", label: "VP / President" },
  { value: "groups", label: "Chosen project groups" },
  { value: "group_leads", label: "Leads of chosen groups only" },
  { value: "nmt", label: "NMT leaders only" },
];

const GROUPS: { code: string; label: string }[] = [
  { code: "E", label: "Education" },
  { code: "R", label: "Water & Sanitation" },
  { code: "W", label: "Women's Empowerment" },
  { code: "H", label: "Health" },
];

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/**
 * Webmaster-only. Runs the Drive re-index and sets who can see which folder.
 * Renders nothing at all for anyone else (the API returns 403 and we bail).
 */
export default function FilesSettingsPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [defaultAudience, setDefaultAudience] = useState<Folder["audience"]>("all");
  const [syncing, setSyncing] = useState(false);
  const [stage, setStage] = useState<string | null>(null); // what the sync is doing right now
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const loadStatus = () =>
    fetch("/api/lms/files/sync")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStatus(d))
      .catch(() => {});

  const loadFolders = () =>
    fetch("/api/lms/files/visibility")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setFolders(d.folders ?? []);
        setDefaultAudience(d.defaultAudience ?? "all");
      })
      .catch(() => {});

  useEffect(() => { void loadStatus(); }, []);
  useEffect(() => { if (open && !folders) void loadFolders(); }, [open, folders]);

  if (!status) return null;

  /**
   * One click, all three stages — the same work the nightly cron does:
   *   1. walk Drive            (file names, folders, what was removed)
   *   2. extract text          (makes file CONTENTS searchable)
   *   3. build RISHI AI passages
   *
   * Stage 2 is bounded per request, so it's called repeatedly until nothing is
   * left. Stages 2 and 3 are best-effort: if either fails, the Drive walk still
   * counts and the message says exactly how far it got.
   */
  async function sync() {
    setSyncing(true);
    setMsg(null);
    setStage("Walking Drive…");
    const parts: string[] = [];
    try {
      // ---- 1. Drive walk -------------------------------------------------
      const r = await fetch("/api/lms/files/sync", { method: "POST" });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || "Sync failed.");
      parts.push(
        `Indexed ${d.indexed} changed item${d.indexed === 1 ? "" : "s"} (${d.folders} folders)` +
          (d.removed ? `, hid ${d.removed} no longer in Drive` : ""),
      );
      await loadStatus();
      setFolders(null); // folder list may have changed
      if (open) await loadFolders();

      // ---- 2. text extraction, until nothing is left ----------------------
      // Each call works for a bounded time and reports what's left; the cap is
      // a guard so a bad `remaining` can never spin here forever.
      let extracted = 0;
      let left: number | undefined;
      try {
        for (let round = 0; round < 40; round++) {
          setStage(left === undefined ? "Extracting text…" : `Extracting text (${left} left)…`);
          const tr = await fetch("/api/lms/files/index", { method: "POST" });
          const td = await tr.json().catch(() => null);
          if (!tr.ok) throw new Error(td?.error || "Text extraction failed.");
          extracted += td?.indexed ?? 0;
          left = td?.remaining ?? 0;
          if (!left) break;
        }
        parts.push(
          extracted ? `pulled text from ${extracted} file${extracted === 1 ? "" : "s"}` : "no new text to pull",
        );
        if (left) parts.push(`${left} still to do — run it again`);
      } catch (e) {
        parts.push(`text extraction stopped: ${e instanceof Error ? e.message : "failed"}`);
      }

      // ---- 3. RISHI AI passages (best-effort) -----------------------------
      setStage("Updating RISHI AI…");
      try {
        const ar = await fetch("/api/lms/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "build" }),
        });
        if (ar.ok) {
          const ad = await ar.json().catch(() => null);
          const made = ad?.chunk?.chunks ?? 0;
          if (made) parts.push(`added ${made} AI passage${made === 1 ? "" : "s"}`);
        }
      } catch { /* RISHI AI may not be configured — the file sync still counts */ }

      await loadStatus();
      setMsg(parts.join(", ") + ".");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Sync failed.");
    } finally {
      setStage(null);
      setSyncing(false);
    }
  }

  async function save(body: Record<string, unknown>) {
    const r = await fetch("/api/lms/files/visibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => null);
      setMsg(d?.error || "Couldn't save that.");
      return false;
    }
    await loadFolders();
    return true;
  }

  const shown = (folders ?? []).filter((f) => {
    if (!filter.trim()) return true;
    const hay = `${f.year} ${f.path} ${f.name}`.toLowerCase();
    return hay.includes(filter.trim().toLowerCase());
  });

  return (
    <div className="mx-auto mt-6 max-w-xl rounded-3xl border border-pine/15 bg-pine/[0.03] p-8">
      <h2 className="font-display text-lg font-semibold text-pine-deep">Files</h2>
      <p className="mt-1 text-sm text-ink/60">
        The Files section mirrors the club&apos;s Drive folders. Only names and links are copied —
        the documents themselves stay in Drive, so nothing here goes out of date.
      </p>

      <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-ink/10 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Re-index Drive</p>
          <p className="mt-0.5 text-xs text-ink/50">
            {status.lastSync
              ? `Last run ${new Date(status.lastSync).toLocaleString()}.`
              : "Hasn't run yet."}{" "}
            {status.excludedCount > 0 && `${status.excludedCount} items are excluded by design.`}
          </p>
        </div>
        <button
          onClick={() => void sync()}
          disabled={syncing}
          className="shrink-0 rounded-full bg-pine px-5 py-2 text-sm font-semibold text-paper hover:bg-pine-deep disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {status.serviceAccount && (
        <p className="mt-2 text-xs text-ink/45">
          Reading Drive as <code className="break-all">{status.serviceAccount}</code>. If a sync finds
          nothing, that address hasn&apos;t been shared on the folders yet.
        </p>
      )}

      {/* Progress sits directly under the button, so a sync that takes a while
          is visible without scrolling down past the other boxes. */}
      {(stage || msg) && <p className="mt-3 text-sm text-ink/70">{stage ?? msg}</p>}

      <div className="mt-4 rounded-xl border border-ink/10 p-4">
        <p className="text-sm font-semibold text-ink">Storage used by uploads</p>
        <p className="mt-0.5 text-xs text-ink/55">
          {mb(status.usedBytes)} of the 1 GB Supabase allowance. Files added through the site are
          capped at {mb(status.maxUploadBytes)} each; anything bigger belongs in Drive.
        </p>
      </div>

      {status.index && (
        <div className="mt-4 rounded-xl border border-ink/10 p-4">
          <p className="text-sm font-semibold text-ink">Searchable file contents</p>
          <p className="mt-0.5 text-xs text-ink/55">
            {status.index.withText} of {status.index.total} files have their text indexed
            {status.index.pending > 0
              ? `, ${status.index.pending} still queued — the nightly job works through them, or press Sync now.`
              : "."}{" "}
            Docs, Sheets, Slides, PDFs and text files are indexed. Images, video, Forms and
            shortcuts have no text to read, and a few folders are excluded on purpose.
          </p>
        </div>
      )}

      <div className="mt-6 border-t border-pine/10 pt-4">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span>
            <span className="block text-sm font-semibold text-ink">Who can see which folder</span>
            <span className="mt-0.5 block text-xs text-ink/55">
              Sub-folders follow their parent unless you set them yourself.
            </span>
          </span>
          <svg
            className={`h-4 w-4 shrink-0 text-ink/40 transition-transform ${open ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {open && (
          <div className="mt-4">
            <label className="block rounded-xl border border-ink/10 p-4">
              <span className="text-sm font-semibold text-ink">Default for anything not set</span>
              <select
                value={defaultAudience}
                onChange={(e) => {
                  const v = e.target.value as Folder["audience"];
                  setDefaultAudience(v);
                  void save({ defaultAudience: v });
                }}
                className="mt-2 w-full rounded-lg border border-pine/20 bg-paper px-3 py-2 text-sm outline-none focus:border-pine"
              >
                {AUDIENCES.filter((a) => a.value !== "groups").map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </label>

            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a folder"
              className="mt-3 w-full rounded-lg border border-pine/20 bg-paper px-3 py-2 text-sm outline-none focus:border-pine"
            />

            {!folders ? (
              <p className="mt-3 text-xs text-ink/50">Loading folders…</p>
            ) : shown.length === 0 ? (
              <p className="mt-3 text-xs text-ink/50">
                No folders indexed yet — run a sync first.
              </p>
            ) : (
              <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
                {shown.map((f) => {
                  const fid = f.driveId ?? f.id;
                  return (
                    <li key={fid} className="rounded-xl border border-ink/10 p-3">
                      <p className="truncate text-sm font-semibold text-ink">{f.name}</p>
                      <p className="truncate text-[11px] text-ink/45">
                        {[f.year, f.path].filter(Boolean).join(" / ") || "Top level"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                          value={f.audience}
                          onChange={(e) =>
                            void save({
                              folderId: fid,
                              audience: e.target.value,
                              groups: e.target.value === "groups" || e.target.value === "group_leads"
                                ? (f.audienceGroups ?? ["E"])
                                : [],
                            })
                          }
                          className="rounded-lg border border-pine/20 bg-paper px-2.5 py-1.5 text-xs outline-none focus:border-pine"
                        >
                          {AUDIENCES.map((a) => (
                            <option key={a.value} value={a.value}>{a.label}</option>
                          ))}
                        </select>

                        {f.audienceExplicit ? (
                          <button
                            onClick={() => void save({ folderId: fid, inherit: true })}
                            className="text-[11px] font-semibold text-ink/45 hover:text-ink/70"
                          >
                            Follow parent instead
                          </button>
                        ) : (
                          <span className="text-[11px] text-ink/40">Following its parent</span>
                        )}
                      </div>

                      {(f.audience === "groups" || f.audience === "group_leads") && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {GROUPS.map((g) => {
                            const on = (f.audienceGroups ?? []).includes(g.code);
                            return (
                              <button
                                key={g.code}
                                onClick={() => {
                                  const next = on
                                    ? (f.audienceGroups ?? []).filter((x) => x !== g.code)
                                    : [...(f.audienceGroups ?? []), g.code];
                                  if (next.length === 0) {
                                    setMsg("Pick at least one project group.");
                                    return;
                                  }
                                  void save({ folderId: fid, audience: f.audience, groups: next });
                                }}
                                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                  on ? "bg-pine text-paper" : "border border-pine/20 text-pine hover:bg-pine/5"
                                }`}
                              >
                                {g.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
