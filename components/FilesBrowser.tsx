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

export default function FilesBrowser() {
  const [folderKey, setFolderKey] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Node[] | null>(null);
  const [preview, setPreview] = useState<Node | null>(null);
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

  // Debounced search across everything the member can see.
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/lms/files?q=${encodeURIComponent(q.trim())}`);
        const d = await r.json();
        setResults(r.ok ? (d.results ?? []) : []);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function open(n: Node) {
    if (n.kind === "folder") {
      setQ("");
      setResults(null);
      setFolderKey(key(n));
      return;
    }
    if (previewUrl(n)) {
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
      <div className="flex flex-wrap items-center justify-between gap-4">
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
        <p className="mt-4 text-sm text-ink/60">
          {results.length} result{results.length === 1 ? "" : "s"} for “{q.trim()}”
        </p>
      )}

      {/* Listing */}
      <div className="mt-5">
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
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => void open(n)}
                  className="group flex w-full items-start gap-3 rounded-2xl border border-pine/15 bg-pine/[0.03] p-4 text-left transition-colors hover:border-pine hover:bg-pine hover:text-paper"
                >
                  <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                    n.kind === "folder" ? "bg-marigold text-pine-deep" : "bg-pine/10 text-pine group-hover:bg-paper/15 group-hover:text-paper"
                  }`}>
                    <Icon n={n} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold leading-snug">{n.name}</span>
                    <span className="mt-0.5 block truncate text-xs opacity-60">
                      {[
                        fileLabel(n),
                        results ? [n.year, n.path].filter(Boolean).join("/") : dateLabel(n.modifiedAt),
                        sizeLabel(n.sizeBytes),
                      ].filter(Boolean).join(" · ")}
                    </span>
                    {n.kind === "folder" && n.audience && n.audience !== "all" && (
                      <span className="mt-1.5 inline-block rounded-full bg-pine/10 px-2 py-0.5 text-[11px] font-semibold text-pine group-hover:bg-paper/20 group-hover:text-paper">
                        {n.audience === "groups"
                          ? `${(n.audienceGroups ?? []).join(", ")} only`
                          : AUDIENCE_LABEL[n.audience]}
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
            ))}
          </ul>
        )}
      </div>

      {/* Preview */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-ink/70 p-4 sm:p-8"
          onClick={() => setPreview(null)}
        >
          <div
            className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-paper shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-pine/10 px-5 py-3.5">
              <h3 className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-pine-deep">
                {preview.name}
              </h3>
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
                onClick={() => setPreview(null)}
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
