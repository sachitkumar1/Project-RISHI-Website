"use client";

import { useEffect, useState } from "react";
import MessageComposer from "@/components/MessageComposer";

type Mode = "announcement" | "email" | "newsletter";
const MODE_LABEL: Record<Mode, string> = { announcement: "Announcement", email: "Email", newsletter: "Newsletter" };
const MODE_DESC: Record<Mode, string> = {
  announcement: "Post to members + email them",
  email: "Send an email to anyone",
  newsletter: "Send to all members & subscribers",
};

function Icon({ mode }: { mode: Mode }) {
  if (mode === "announcement")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </svg>
    );
  if (mode === "email")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7.5 8.5 6 8.5-6" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 22h14a2 2 0 0 0 2-2V4a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-8a1 1 0 0 1 1-1h1" /><path d="M16 7h-6M16 11h-6M13 15h-3" />
    </svg>
  );
}

export default function CreateMenu() {
  const [modes, setModes] = useState<Mode[]>([]);
  const [hover, setHover] = useState(false);
  const [composeMode, setComposeMode] = useState<Mode | null>(null);

  useEffect(() => {
    fetch("/api/lms/compose")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setModes(d.modes ?? []))
      .catch(() => {});
  }, []);

  if (modes.length === 0) return null;

  return (
    <>
      <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <button
          onClick={() => setHover((h) => !h)}
          className="inline-flex items-center gap-2 rounded-full bg-pine px-5 py-2.5 text-sm font-semibold text-paper shadow-sm transition-colors hover:bg-pine-deep"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-4 w-4">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Create
        </button>

        {hover && (
          <div className="absolute right-0 top-full z-30 w-72 pt-2">
            <div className="overflow-hidden rounded-2xl border border-ink/10 bg-paper shadow-xl">
              {modes.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setComposeMode(m);
                    setHover(false);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-pine/[0.05]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-pine/10 text-pine">
                    <Icon mode={m} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-ink">{MODE_LABEL[m]}</span>
                    <span className="block text-xs text-ink/50">{MODE_DESC[m]}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {composeMode && (
        <MessageComposer
          initialMode={composeMode}
          onClose={() => setComposeMode(null)}
          onPosted={() => {
            setComposeMode(null);
            window.dispatchEvent(new Event("rishi:refresh"));
          }}
        />
      )}
    </>
  );
}
