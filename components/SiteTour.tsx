"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/* ============================================================================
   A guided walk through the site, once, for everyone.

   It dims the page, cuts a window out of the dimming around whatever it's
   talking about, and puts a card beside it. Steps can send the person to
   another page; the tour waits for the thing it wants to point at to appear.

   Steps are filtered by what the person can actually do, so a general member
   isn't walked through assigning work or the webmaster's settings.

   A step whose target never shows up is skipped rather than left pointing at
   nothing — the page it describes may simply not exist for that person.
   ========================================================================== */

type Flags = {
  assignTasks: boolean; createEvents: boolean; lead: boolean;
  exec: boolean; vpp: boolean; outreach: boolean; webmaster: boolean;
};

type Step = {
  id: string;
  /** Page this step lives on. The tour navigates there first. */
  path: string;
  /** What to spotlight. Omit for a centred card with no target. */
  target?: string;
  title: string;
  body: string;
  /** Only show when this returns true. */
  when?: (f: Flags) => boolean;
  /** Invites a click rather than describing. */
  action?: string;
};

const STEPS: Step[] = [
  {
    id: "welcome",
    path: "/dashboard",
    title: "Welcome to your member dashboard",
    body: "This is where everything the club runs on lives — your tasks, the calendar, the member directory, and every document we keep. It takes about a minute to walk through. You can leave any time and pick it up again from Settings.",
  },
  {
    id: "tiles",
    path: "/dashboard",
    target: "[data-tour='tiles']",
    title: "Your starting point",
    body: "These cards are the main areas of the site. Everything below them is your own work — what's been assigned to you, and what's coming up.",
  },
  {
    id: "mytasks",
    path: "/dashboard",
    target: "[data-tour='my-tasks']",
    title: "Your tasks and events",
    body: "Anything assigned to you shows up here with its due date. Open one to read the details, leave a comment, attach a file, or mark it done. Some tasks need a lead's approval before they count as complete.",
  },
  {
    id: "period",
    path: "/dashboard",
    target: "[data-tour='period']",
    title: "Narrow it down",
    body: "Switch between today, this week, this month, or everything. Handy when a long list is hiding the thing that's actually due tomorrow.",
  },
  {
    id: "assign",
    path: "/dashboard",
    target: "[data-tour='create']",
    title: "Assigning work",
    body: "You can create tasks and events from here. When you assign a task you choose who it goes to, when it's due, and whether they need to submit a note, a link, or a file before it can be marked done.",
    when: (f) => f.assignTasks || f.createEvents,
  },
  {
    id: "overview",
    path: "/dashboard",
    target: "[data-tour='overview']",
    title: "The whole club at once",
    body: "This opens a view of every project group's tasks and events together, with a shared calendar. It's the quickest way to see what the club as a whole is working on.",
    when: (f) => f.lead || f.exec,
  },
  {
    id: "history",
    path: "/dashboard",
    target: "[data-tour='history']",
    title: "Finished work lives here",
    body: "Your dashboard stays clean by showing only what's still active. Everything completed or archived moves into History, split into what was assigned to you, what you assigned, and past events.",
  },
  {
    id: "files-open",
    path: "/dashboard",
    target: "[data-tour='files-tile']",
    title: "Files",
    body: "Every document the club keeps in Drive is mirrored here, going back several years. Let's take a look.",
    action: "Click Files to continue",
  },
  {
    id: "files-years",
    path: "/dashboard/files",
    target: "[data-tour='file-list']",
    title: "Organised by school year",
    body: "The current year sits up top with everything older grouped underneath. Open a folder to browse it exactly as you would in Drive — click any document to read it right here, without leaving the site.",
  },
  {
    id: "files-search",
    path: "/dashboard/files",
    target: "[data-tour='file-search']",
    title: "Search that reads inside documents",
    body: "Search covers every year at once, and results are grouped by year so you always know what you're looking at. Switch to “Include In-File Text” and it searches the words inside documents too, not just their names.",
  },
  {
    id: "files-meetings",
    path: "/dashboard/files",
    target: "[data-tour='meetings-card']",
    title: "Meeting notes",
    body: "Each project group keeps its meetings here — who attended, who took notes, the agenda, and the tasks that came out of it. Tasks assigned in a meeting become real tasks on your dashboard automatically.",
  },
  {
    id: "files-tasks",
    path: "/dashboard/files",
    target: "[data-tour='file-list']",
    title: "Task submissions",
    body: "When someone attaches a file to finish a task, it's filed under Tasks by project group and task name, labelled with who submitted it. You'll see your own group's submissions here.",
    when: (f) => f.lead || f.exec,
  },
  {
    id: "directory",
    path: "/dashboard/directory",
    target: "[data-tour='directory-list']",
    title: "Member directory",
    body: "Everyone in the club, with their role and project group. You can sort and filter by group, year, or position when you're trying to find the right person to ask.",
  },
  {
    id: "settings",
    path: "/dashboard/settings",
    target: "[data-tour='settings-main']",
    title: "Your settings",
    body: "Update your photo and contact details, choose how you'd like to be notified, and connect your calendar so your tasks and events show up alongside the rest of your schedule.",
  },
  {
    id: "settings-admin",
    path: "/dashboard/settings",
    target: "[data-tour='settings-files']",
    title: "Keeping Files up to date",
    body: "As webmaster you can refresh the document library here and decide which folders each group can see.",
    when: (f) => f.webmaster,
  },
  {
    id: "done",
    path: "/dashboard",
    title: "That's everything",
    body: "You can take this tour again whenever you like — it's in Settings, under your profile. If something doesn't look right, tell Sachit.",
  },
];

const PAD = 10;

export default function SiteTour() {
  const router = useRouter();
  const pathname = usePathname();

  const [flags, setFlags] = useState<Flags | null>(null);
  const [firstName, setFirstName] = useState("");
  const [active, setActive] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [missing, setMissing] = useState(false);
  const startedRef = useRef(false);

  const steps = useMemo(
    () => (flags ? STEPS.filter((s) => !s.when || s.when(flags)) : []),
    [flags],
  );
  const step = steps[i];

  // Load state once. The tour only auto-starts for someone who hasn't done it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/lms/tour");
        if (!r.ok) return;
        const d = await r.json();
        if (cancelled) return;
        setFlags(d.flags);
        setFirstName(d.firstName ?? "");
        if (!d.completed && !startedRef.current) {
          startedRef.current = true;
          setActive(true);
        }
      } catch { /* the tour is never worth breaking a page over */ }
    })();
    const onReplay = () => { setI(0); setActive(true); };
    window.addEventListener("rishi:start-tour", onReplay);
    return () => { cancelled = true; window.removeEventListener("rishi:start-tour", onReplay); };
  }, []);

  const finish = useCallback(async (done: boolean) => {
    setActive(false);
    setRect(null);
    try {
      await fetch("/api/lms/tour", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
    } catch { /* ignore */ }
  }, []);

  // Navigate to the step's page if we're not already on it.
  useEffect(() => {
    if (!active || !step) return;
    if (pathname !== step.path) router.push(step.path);
  }, [active, step, pathname, router]);

  // Find and follow the target. Polls briefly because the page may still be
  // loading its data when the step begins.
  useEffect(() => {
    if (!active || !step) return;
    if (!step.target) { setRect(null); setMissing(false); return; }

    let tries = 0;
    let raf = 0;
    const tick = () => {
      const el = document.querySelector(step.target as string);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setMissing(false);
          setRect(r);
          if (r.top < 80 || r.bottom > window.innerHeight - 80)
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          raf = requestAnimationFrame(tick); // keep up with scrolling
          return;
        }
      }
      if (++tries > 90) { setMissing(true); setRect(null); return; } // ~3s
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, step, pathname]);

  const next = useCallback(() => {
    if (i >= steps.length - 1) void finish(true);
    else setI((v) => v + 1);
  }, [i, steps.length, finish]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish(true);
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next, finish]);

  if (!active || !step) return null;

  // Card placement: beside the spotlight when there's room, centred otherwise.
  const W = typeof window !== "undefined" ? window.innerWidth : 1200;
  const H = typeof window !== "undefined" ? window.innerHeight : 800;
  const card = { w: Math.min(400, W - 32) };
  let cardStyle: React.CSSProperties = {
    left: "50%", top: "50%", transform: "translate(-50%, -50%)",
  };
  if (rect) {
    const below = rect.bottom + 16;
    const above = rect.top - 16;
    const goBelow = below + 220 < H || above < 220;
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - card.w / 2), W - card.w - 16);
    cardStyle = goBelow
      ? { left, top: Math.min(below, H - 240) }
      : { left, top: Math.max(16, above - 200) };
  }

  const pct = Math.round(((i + 1) / steps.length) * 100);

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Site tour">
      {/* Dimming with a window cut out of it. An SVG mask keeps the highlighted
          element perfectly sharp instead of washing it out. */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - PAD} y={rect.top - PAD}
                width={rect.width + PAD * 2} height={rect.height + PAD * 2}
                rx="18" fill="black"
              />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(18,28,22,0.72)" mask="url(#tour-mask)" />
      </svg>

      {rect && (
        <div
          className="pointer-events-none absolute rounded-[18px] ring-2 ring-marigold transition-all duration-300"
          style={{
            left: rect.left - PAD, top: rect.top - PAD,
            width: rect.width + PAD * 2, height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0)",
          }}
        />
      )}

      <div
        className="absolute w-[min(400px,calc(100vw-2rem))] rounded-2xl bg-paper p-5 shadow-2xl transition-all duration-300"
        style={cardStyle}
      >
        <div className="mb-3 flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-pine/10">
            <div className="h-full rounded-full bg-marigold transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-[11px] font-semibold text-ink/40">
            {i + 1} / {steps.length}
          </span>
        </div>

        <h3 className="font-display text-xl font-semibold text-pine-deep">
          {step.id === "welcome" && firstName ? `Welcome, ${firstName}` : step.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-ink/70">{step.body}</p>

        {missing && (
          <p className="mt-2 text-xs text-ink/40">
            This part isn&apos;t on your screen right now — carry on.
          </p>
        )}
        {step.action && !missing && (
          <p className="mt-2 text-xs font-semibold text-marigold-deep">{step.action}</p>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={() => void finish(true)}
            className="text-xs font-semibold text-ink/40 hover:text-ink/70"
          >
            Skip the tour
          </button>
          <div className="flex items-center gap-2">
            {i > 0 && (
              <button
                onClick={() => setI((v) => Math.max(0, v - 1))}
                className="rounded-full border border-pine/20 px-4 py-2 text-sm font-semibold text-pine-deep hover:bg-pine/5"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="rounded-full bg-pine px-5 py-2 text-sm font-semibold text-paper hover:bg-pine-deep"
            >
              {i === steps.length - 1 ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
