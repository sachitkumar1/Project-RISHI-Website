"use client";

import { useState } from "react";

/**
 * The group's 2026-2027 agenda doc, embedded in place of the old rich-text
 * "Agenda & notes" editor.
 *
 * The editor itself is kept in the codebase but dormant (see the meeting page)
 * — the club keeps agendas in these Drive docs, so a second place to write them
 * only creates drift about which one is real.
 *
 * TAB DEEP-LINKING: each meeting is its own tab inside the doc. Google supports
 * ?tab=t.<tabId> to open a specific one, but resolving a meeting date to its
 * tab id needs the Google Docs API, which isn't enabled on the Cloud project
 * yet. Until it is, `tabId` is null and this opens the doc at its first tab.
 * Once it's enabled, passing tabId here is all that's needed.
 */
export default function AgendaDocPanel({
  docId,
  docName,
  tabId,
  groupLabel,
}: {
  docId: string | null;
  docName?: string | null;
  tabId?: string | null;
  groupLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!docId)
    return (
      <div className="rounded-2xl border border-dashed border-pine/20 px-6 py-10 text-center">
        <p className="text-sm text-ink/55">
          No 2026-2027 agenda doc is linked for {groupLabel} yet.
        </p>
        <p className="mt-1 text-xs text-ink/40">
          Add one in Drive under Project Groups and re-sync Files.
        </p>
      </div>
    );

  const q = tabId ? `?tab=${encodeURIComponent(tabId)}` : "";
  const preview = `https://docs.google.com/document/d/${docId}/preview${q}`;
  const edit = `https://docs.google.com/document/d/${docId}/edit${q}`;

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-pine/15">
        <div className="flex items-center gap-3 border-b border-pine/10 bg-pine/[0.03] px-4 py-2.5">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-pine-deep">
            {docName || `${groupLabel} agenda`}
            {tabId && <span className="ml-2 text-xs font-normal text-ink/45">this meeting&apos;s tab</span>}
          </p>
          <button
            onClick={() => setExpanded(true)}
            className="shrink-0 rounded-full border border-pine/20 px-3 py-1.5 text-xs font-semibold text-pine hover:bg-pine/5"
          >
            Full screen
          </button>
          <a
            href={edit}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-full border border-pine/20 px-3 py-1.5 text-xs font-semibold text-pine hover:bg-pine/5"
          >
            Open in Docs
          </a>
        </div>
        <iframe src={preview} title={docName || "Agenda"} className="h-[600px] w-full bg-white" />
      </div>
      <p className="mt-2 text-xs text-ink/40">
        Editing happens in Google Docs — the preview is read-only and refreshes when you reopen it.
      </p>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-ink/70"
          onClick={() => setExpanded(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-full w-full flex-col bg-paper" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-pine/10 px-5 py-3">
              <h3 className="min-w-0 flex-1 truncate font-display text-lg font-semibold text-pine-deep">
                {docName || `${groupLabel} agenda`}
              </h3>
              <a
                href={edit}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-full border border-pine/20 px-3.5 py-1.5 text-sm font-semibold text-pine hover:bg-pine/5"
              >
                Open in Docs
              </a>
              <button
                onClick={() => setExpanded(false)}
                className="shrink-0 rounded-full p-1.5 text-ink/50 hover:bg-pine/10 hover:text-ink"
                aria-label="Close"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <iframe src={preview} title={docName || "Agenda"} className="min-h-0 flex-1 bg-white" />
          </div>
        </div>
      )}
    </>
  );
}
