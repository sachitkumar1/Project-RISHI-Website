"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Node = {
  id: string;
  driveId: string | null;
  parentId: string | null;
  name: string;
  mimeType: string;
  kind: "folder" | "file" | "shortcut";
  source: "drive" | "upload";
  sizeBytes: number | null;
  webViewLink: string | null;
  year: string | null;
  path: string;
  modifiedAt: string | null;
  uploadedBy: string | null;
  snippet?: string;
  canDelete?: boolean;
  audience?: "all" | "leads" | "exec" | "vpp" | "groups";
  audienceGroups?: string[];
};

type View = {
  folder: Node | null;
  breadcrumbs: { key: string; name: string }[];
  children: Node[];
  canUpload: boolean;
};

const key = (n: Node) => n.driveId ?? n.id;

const AUDIENCE_LABEL: Record<string, string> = {
  leads: "Leads only",
  exec: "Exec only",
  vpp: "VP / President only",
  groups: "Limited groups",
};

function fileLabel(n: Node): string {
  if (n.kind === "folder") return "Folder";
  if (n.kind === "shortcut") return "Shortcut";
  const m = n.mimeType;
  if (m.includes("spreadsheet")) return "Sheet";
  if (m.includes("presentation")) return "Slides";
  if (m.includes("document")) return "Doc";
  if (m.includes("form")) return "Form";
  if (m === "application/pdf") return "PDF";
  if (m.startsWith("image/")) return "Image";
  if (m.startsWith("video/")) return "Video";
  return "File";
}

function sizeLabel(bytes: number | null): string {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function dateLabel(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Where an item can be shown inside an iframe, if anywhere. */
function previewUrl(n: Node): string | null {
  if (n.source === "upload") return null; // resolved through the signed-URL route
  if (!n.driveId || n.kind !== "file") return null;
  const m = n.mimeType;
  if (m.includes("vnd.google-apps.document")) return `https://docs.google.com/document/d/${n.driveId}/preview`;
  if (m.includes("vnd.google-apps.spreadsheet")) return `https://docs.google.com/spreadsheets/d/${n.driveId}/preview`;
  if (m.includes("vnd.google-apps.presentation")) return `https://docs.google.com/presentation/d/${n.driveId}/embed`;
  if (m.includes("vnd.google-apps.form")) return null; // forms can't be embedded read-only
  return `https://drive.google.com/file/d/${n.driveId}/preview`;
}

function Icon({ n }: { n: Node }) {
  const base = "h-5 w-5";
  if (n.kind === "folder")
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      </svg>
    );
  const m = n.mimeType;
  if (m.includes("spreadsheet"))
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M4 9h16M4 15h16M12 3v18" />
      </svg>
    );
  if (m.includes("presentation"))
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M12 16v4M8 20h8" />
      </svg>
    );
  if (m.startsWith("video/"))
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M10 9l5 3-5 3z" />
      </svg>
    );
  if (m === "application/pdf")
    return (
      // Drive-style PDF mark: a page with "PDF" ruled across it.
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M8 13h1.2a1 1 0 0 1 0 2H8v-2zm0 2v2" strokeWidth="1.4" />
        <path d="M12 13v4h1a1.4 1.4 0 0 0 1.4-1.4v-1.2A1.4 1.4 0 0 0 13 13h-1z" strokeWidth="1.4" />
        <path d="M16.6 17v-4h1.9m-1.9 2h1.5" strokeWidth="1.4" />
      </svg>
    );
  if (m.startsWith("image/"))
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="M21 16l-5-5-6 6" />
      </svg>
    );
  return (
    <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}


/** Results with no school year (task submissions, site uploads) sort last. */
const UNDATED = "__undated__";

/** Split search hits into school years, newest first, undated at the bottom. */
function groupByYear(nodes: Node[]): [string, Node[]][] {
  const by = new Map<string, Node[]>();
  for (const n of nodes) {
    const k = n.year || UNDATED;
    const arr = by.get(k);
    if (arr) arr.push(n);
    else by.set(k, [n]);
  }
  return Array.from(by.entries()).sort(([a], [b]) => {
    if (a === UNDATED) return 1;
    if (b === UNDATED) return -1;
    return b.localeCompare(a);
  });
}

/** One tile in the browser. `big` is used for the current school year. */
function FileCard({ n, onOpen, onDelete, showPath, big }: {
  n: Node; onOpen: (n: Node) => void; onDelete: (n: Node) => void;
  showPath?: boolean; big?: boolean;
}) {
  return (
    <li className="group/item relative">
      {n.canDelete && (
        <button
          onClick={() => void onDelete(n)}
          className="absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-paper/80 text-ink/40 opacity-0 transition-opacity hover:bg-marigold/30 hover:text-ink focus:opacity-100 group-hover/item:opacity-100"
          aria-label={`Delete ${n.name}`}
          title="Delete this file"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
          </svg>
        </button>
      )}
      <button
        onClick={() => onOpen(n)}
        className={`group flex w-full items-start gap-3 rounded-2xl border border-pine/15 bg-pine/[0.03] text-left transition-colors hover:border-pine hover:bg-pine hover:text-paper ${big ? "p-6" : "p-4"}`}
      >
        <span className={`mt-0.5 grid shrink-0 place-items-center rounded-xl ${big ? "h-12 w-12" : "h-9 w-9"} ${
          n.kind === "folder" ? "bg-marigold text-pine-deep" : "bg-pine/10 text-pine group-hover:bg-paper/15 group-hover:text-paper"
        }`}>
          <Icon n={n} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-semibold leading-snug ${big ? "text-xl" : ""}`}>{n.name}</span>
          <span className="mt-0.5 block truncate text-xs opacity-60">
            {[
              fileLabel(n),
              showPath ? [n.year, n.path].filter(Boolean).join("/") : dateLabel(n.modifiedAt),
              sizeLabel(n.sizeBytes),
            ].filter(Boolean).join(" · ")}
          </span>
          {n.snippet && (
            <span className="mt-1.5 block line-clamp-2 text-xs italic opacity-70">{n.snippet}</span>
          )}
          {n.kind === "folder" && n.audience && n.audience !== "all" && (
            <span className="mt-1.5 inline-block rounded-full bg-pine/10 px-2 py-0.5 text-[11px] font-semibold text-pine group-hover:bg-paper/20 group-hover:text-paper">
              {n.audience === "groups" ? `${(n.audienceGroups ?? []).join(", ")} only` : AUDIENCE_LABEL[n.audience]}
            </span>
          )}
          {n.source === "upload" && (
            <span className="mt-1.5 ml-1 inline-block rounded-full bg-marigold/25 px-2 py-0.5 text-[11px] font-semibold text-pine-deep">
              Added here
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export default function FilesBrowser() {
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Node[] | null>(null);
  const [deepSearch, setDeepSearch] = useState(true); // default: search inside files too
  const [wholeWord, setWholeWord] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [preview, setPreview] = useState<Node | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (fk: string | null) => {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/lms/files${fk ? `?folder=${encodeURIComponent(fk)}` : ""}`);
      if (r.status === 404) throw new Error("That folder isn't available to you.");
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || "Couldn't load files.");
      setView(await r.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load files.");
      setView(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(folderKey);
  }, [folderKey, load]);

  // Esc collapses a full-screen preview first, then closes it — so the key
  // never throws away more than one step at a time.
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (expanded) setExpanded(false);
      else setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, expanded]);

  // Debounced search across everything the member can see.
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const mode = deepSearch ? "&mode=contents" : "";
        const flags = `${wholeWord ? "&whole=1" : ""}${caseSensitive ? "&case=1" : ""}`;
        const r = await fetch(`/api/lms/files?q=${encodeURIComponent(q.trim())}${mode}${flags}`);
        const d = await r.json();
        setResults(r.ok ? (d.results ?? []) : []);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, deepSearch, wholeWord, caseSensitive]);

  async function open(n: Node) {
    if (n.kind === "folder") {
      setQ("");
      setResults(null);
      setFolderKey(key(n));
      return;
    }
    if (previewUrl(n)) {
      setExpanded(false);
      setPreview(n);
      return;
    }
    // Shortcuts, Forms, and uploaded files just open directly.
    try {
      const r = await fetch(`/api/lms/files/${n.id}/url`);
      const d = await r.json();
      if (d.url) window.open(d.url, "_blank", "noopener");
      else setErr("That file couldn't be opened.");
    } catch {
      setErr("That file couldn't be opened.");
    }
  }

  async function remove(n: Node) {
    if (!window.confirm(`Delete “${n.name}”? This removes the file and its contents for everyone.`)) return;
    setErr("");
    try {
      const r = await fetch(`/api/lms/files/upload?id=${encodeURIComponent(n.id)}`, { method: "DELETE" });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || "Couldn't delete that file.");
      await load(folderKey);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't delete that file.");
    }
  }

  async function upload(f: File) {
    if (!view?.folder) return;
    setUploading(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("folder", key(view.folder));
      const r = await fetch("/api/lms/files/upload", { method: "POST", body: fd });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || "Upload failed.");
      await load(folderKey);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const items = results ?? view?.children ?? [];
  const atRoot = !results && !!view && view.folder === null;
  // At the top level the newest school year leads; older years are grouped
  // under "Past years". Anything that isn't a year folder (Tasks) stays up top.
  const rootYears = atRoot ? items.filter((n) => /^\d{4}-\d{4}/.test(n.name)) : [];
  const newestYear = rootYears.map((n) => n.name.slice(0, 9)).sort().pop() ?? "";
  // The newest year and Tasks share the top row at the same size — they're the
  // two things people open constantly. Older years drop to a smaller tier.
  const currentRoots = atRoot
    ? items.filter((n) => !rootYears.includes(n) || n.name.startsWith(newestYear))
    : [];
  const pastRoots = atRoot ? rootYears.filter((n) => !n.name.startsWith(newestYear)) : [];
  const crumbs = view?.breadcrumbs ?? [];

  const empty = useMemo(() => {
    if (loading || err) return null;
    if (results) return results.length === 0 ? `Nothing matching “${q.trim()}”.` : null;
    if (items.length === 0) return "This folder is empty. Add a file to get started.";
    return null;
  }, [loading, err, results, items.length, q]);

  return (
    <div>
      {/* Breadcrumbs + search */}
      <div data-tour="file-search" className="flex flex-wrap items-center justify-between gap-4">
        <nav className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm" aria-label="Folder path">
          <button
            onClick={() => { setFolderKey(null); setQ(""); setResults(null); }}
            className="rounded-full px-2.5 py-1 font-semibold text-pine hover:bg-pine/10"
          >
            All files
          </button>
          {crumbs.map((c, i) => (
            <span key={c.key} className="flex min-w-0 items-center gap-1.5">
              <span className="text-ink/30">/</span>
              {i === crumbs.length - 1 ? (
                <span className="truncate px-1 font-semibold text-ink">{c.name}</span>
              ) : (
                <button
                  onClick={() => setFolderKey(c.key)}
                  className="truncate rounded-full px-2.5 py-1 text-pine hover:bg-pine/10"
                >
                  {c.name}
                </button>
              )}
            </span>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <label className="relative">
            <span className="sr-only">Search files</span>
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search files"
              className="w-56 rounded-full border border-pine/20 bg-paper py-2 pl-9 pr-3 text-sm outline-none focus:border-pine"
            />
          </label>

          <div className="flex overflow-hidden rounded-full border border-pine/20" role="group" aria-label="Search scope">
            <button
              onClick={() => setDeepSearch(false)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                !deepSearch ? "bg-pine text-paper" : "text-pine hover:bg-pine/5"
              }`}
              title="Match file and folder names only"
            >
              Names Only
            </button>
            <button
              onClick={() => setDeepSearch(true)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                deepSearch ? "bg-pine text-paper" : "text-pine hover:bg-pine/5"
              }`}
              title="Also search the text inside documents"
            >
              Include In-File Text
            </button>
          </div>

          {view?.canUpload && (
            <>
              <input
                ref={fileInput}
                type="file"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
              />
              <button
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="rounded-full bg-pine px-4 py-2 text-sm font-semibold text-paper transition-colors hover:bg-pine-deep disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Add a file"}
              </button>
            </>
          )}
        </div>
      </div>

      {err && (
        <p className="mt-4 rounded-2xl border border-marigold-deep/30 bg-marigold/10 px-4 py-3 text-sm text-ink">
          {err}
        </p>
      )}

      {results && (
        <div className="mt-4">
          <p className="text-sm text-ink/60">
            {results.length} result{results.length === 1 ? "" : "s"} for “{q.trim()}”
            {deepSearch ? " in names and file contents" : " in names"}
          </p>
          {deepSearch && (
            <>
              <p className="text-xs text-ink/45">Searches inside Docs, Sheets, Slides, PDFs and text files.</p>
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-ink/60">
                  <input type="checkbox" checked={wholeWord} onChange={(e) => setWholeWord(e.target.checked)} />
                  Whole words only
                </label>
                <label className="flex items-center gap-2 text-xs text-ink/60">
                  <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
                  Case sensitive
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {/* Listing */}
      <div data-tour="file-list" className="mt-5">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-pine/[0.06]" />
            ))}
          </div>
        ) : empty ? (
          <p className="rounded-3xl border border-dashed border-pine/20 px-6 py-12 text-center text-sm text-ink/55">
            {empty}
          </p>
        ) : results ? (
          /* Search spans every year at once; the results are split by year so a
             hit from 2017 is never mistaken for this year's. Newest first. */
          <div className="space-y-8">
            {groupByYear(results).map(([year, hits]) => (
              <section key={year}>
                <h3 className="text-lg font-semibold text-pine-deep">
                  {year === UNDATED ? "Other results" : `${year} Results`}
                  <span className="ml-2 text-xs font-normal text-ink/40">{hits.length}</span>
                </h3>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {hits.map((n) => (
                    <FileCard key={n.id} n={n} onOpen={(x) => void open(x)} onDelete={(x) => void remove(x)} showPath />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : atRoot ? (
          /* The current year is what people want almost every time, so it gets
             the space. Everything older is still one click away, just quieter. */
          <div className="space-y-8">
            {currentRoots.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2">
                {currentRoots.map((n) => (
                  <FileCard key={n.id} n={n} onOpen={(x) => void open(x)} onDelete={(x) => void remove(x)} big />
                ))}
              </ul>
            )}
            {pastRoots.length > 0 && (
              <section>
                <h3 className="text-base font-semibold text-ink/55">Past years</h3>
                <ul className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {pastRoots.map((n) => (
                    <FileCard key={n.id} n={n} onOpen={(x) => void open(x)} onDelete={(x) => void remove(x)} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((n) => (
              <FileCard key={n.id} n={n} onOpen={(x) => void open(x)} onDelete={(x) => void remove(x)} />
            ))}
          </ul>
        )}
      </div>

      {/* Preview — opens as a panel, expands to fill the whole tab. */}
      {preview && (
        <div
          className={`fixed inset-0 z-50 flex flex-col bg-ink/70 ${expanded ? "p-0" : "p-4 sm:p-8"}`}
          onClick={() => { setExpanded(false); setPreview(null); }}
          role="dialog"
          aria-modal="true"
          aria-label={preview.name}
        >
          <div
            className={`flex w-full flex-col overflow-hidden bg-paper shadow-2xl ${
              expanded ? "h-full max-w-none rounded-none" : "mx-auto h-full max-w-5xl rounded-3xl"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 border-b border-pine/10 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-lg font-semibold text-pine-deep">
                  {preview.name}
                </h3>
                <p className="mt-0.5 truncate text-xs text-ink/55">
                  {[
                    fileLabel(preview),
                    sizeLabel(preview.sizeBytes),
                    preview.modifiedAt ? `Edited ${dateLabel(preview.modifiedAt)}` : "",
                    [preview.year, preview.path].filter(Boolean).join(" / "),
                    preview.uploadedBy ? `Added by ${preview.uploadedBy}` : "",
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>

              <button
                onClick={() => setExpanded((v) => !v)}
                className="shrink-0 rounded-full border border-pine/20 p-2 text-pine hover:bg-pine/5"
                aria-label={expanded ? "Exit full screen" : "Expand to full screen"}
                title={expanded ? "Exit full screen" : "Expand to full screen"}
              >
                {expanded ? (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
                  </svg>
                )}
              </button>

              {preview.webViewLink && (
                <a
                  href={preview.webViewLink}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-full border border-pine/20 px-3.5 py-1.5 text-sm font-semibold text-pine hover:bg-pine/5"
                >
                  Open in Drive
                </a>
              )}

              <button
                onClick={() => { setExpanded(false); setPreview(null); }}
                className="shrink-0 rounded-full p-1.5 text-ink/50 hover:bg-pine/10 hover:text-ink"
                aria-label="Close preview"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <iframe
              src={previewUrl(preview) ?? ""}
              title={preview.name}
              className="min-h-0 flex-1 bg-white"
              allow="autoplay"
            />
          </div>
        </div>
      )}
    </div>
  );
}
