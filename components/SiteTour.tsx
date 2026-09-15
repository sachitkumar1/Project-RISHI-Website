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
  /**
   * The person must click this themselves before the tour moves on. The tour
   * highlights it, replaces Next with a prompt, and advances once they do —
   * so they leave having actually used the thing, not just read about it.
   */
  clickTarget?: string;
  /** Hovered on entering, for menus that open on hover. */
  hover?: string;
  /**
   * Treat `path` as a prefix and never navigate there. Used for pages whose
   * URL contains an id — the person has already arrived by clicking a link,
   * and there's no address the tour could push on its own.
   */
  prefix?: boolean;
};

const STEPS: Step[] = [
  {
    id: "welcome",
    path: "/dashboard",
    title: "Welcome to your member dashboard",
    body: "This is where everything the club runs on lives. It takes a few minutes, and you can leave any time.",
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
    body: "Anything assigned to you shows up here with its due date. Open one to read the details, leave a comment, attach a file, or mark it done.",
  },
  {
    id: "period",
    path: "/dashboard",
    target: "[data-tour='period']",
    title: "Narrow it down",
    body: "Switch between today, this week, this month, or everything. Handy when a long list is hiding the thing that's actually due tomorrow.",
  },
  {
    id: "reminders",
    path: "/dashboard",
    target: "[data-tour='my-tasks']",
    title: "Reminders and nudges",
    body: "Nobody has to police deadlines by hand. You get an email when a task is assigned to you, reminders as the due date approaches, and a note when your work is approved or sent back. Whoever assigned it can also send you a nudge from inside the task.",
  },

  /* ---- assigning work: they open it, walk it, and close it ---- */
  {
    id: "assign-open",
    path: "/dashboard",
    target: "[data-tour='assign-task']",
    title: "Try assigning a task",
    body: "This is how work gets handed out. Go ahead and open it — we'll look at what you can set.",
    action: "Click “+ Assign task” to continue",
    clickTarget: "[data-tour='assign-task']",
    when: (f) => f.assignTasks,
  },
  {
    id: "assign-who",
    path: "/dashboard",
    target: "[data-tour='tf-assignees']",
    title: "Who it goes to",
    body: "Pick one person or several. Assigning to a group creates the task once and tracks each person's progress separately, so you always see who's done and who hasn't.",
    when: (f) => f.assignTasks,
  },
  {
    id: "assign-submission",
    path: "/dashboard",
    target: "[data-tour='tf-submission']",
    title: "Asking for proof of work",
    body: "Tick this and the person can't mark the task done until they've written a note or added a link explaining what they did.",
    when: (f) => f.assignTasks,
  },
  {
    id: "assign-file",
    path: "/dashboard",
    target: "[data-tour='tf-file']",
    title: "Requiring a file",
    body: "This one requires an actual file before the task can be closed. Submissions are kept and organised for you, so you can find them again later without digging through email.",
    when: (f) => f.assignTasks,
  },
  {
    id: "assign-flow",
    path: "/dashboard",
    target: "[data-tour='tf-submission']",
    title: "What happens after they submit",
    body: "When a member marks a task done it comes to you for approval rather than closing straight away, and you get an email. Approve it and it's complete; send it back with a note and they'll try again. Leads finishing their own work skip the approval step.",
    when: (f) => f.assignTasks,
  },
  {
    id: "assign-close",
    path: "/dashboard",
    target: "[data-tour='tf-close']",
    title: "Close it back down",
    body: "We won't actually assign anything right now. Close the form and we'll carry on.",
    action: "Click ✕ to continue",
    clickTarget: "[data-tour='tf-close']",
    when: (f) => f.assignTasks,
  },

  /* ---- events ---- */
  {
    id: "event-open",
    path: "/dashboard",
    target: "[data-tour='create-event']",
    title: "Creating an event",
    body: "Events work much the same way. Open it and take a look.",
    action: "Click “+ Create event” to continue",
    clickTarget: "[data-tour='create-event']",
    when: (f) => f.createEvents,
  },
  {
    id: "event-form",
    path: "/dashboard",
    target: "[data-tour='ef-form']",
    title: "When and who for",
    body: "A title, a time, and who it's for. Events land on everyone's calendar here, and on their own Google Calendar if they've connected it. Close this one when you're ready.",
    action: "Click ✕ to continue",
    clickTarget: "[data-tour='tf-close']",
    when: (f) => f.createEvents,
  },

  /* ---- email, announcements, newsletters ---- */
  {
    id: "create-menu",
    path: "/dashboard",
    hover: "[data-tour='create'] button",
    target: "[data-tour='create-menu']",
    title: "Reaching the club",
    body: "Announcements appear on everyone's dashboard. Newsletters go to subscribers. Emails go to whoever you choose. Open the email composer.",
    action: "Click “Email” to continue",
    clickTarget: "[data-tour='create-email']",
    when: (f) => f.exec || f.outreach || f.lead,
  },
  {
    id: "merge",
    path: "/dashboard",
    target: "[data-tour='merge-block']",
    title: "Mail merge",
    body: "Write one email and send it personalised to everyone. Turn this on and each recipient gets their own version — their name, their group, whatever you choose — filled in automatically. Members are populated for you, and you can add rows by hand or paste in a spreadsheet for anyone outside the club.",
    when: (f) => f.exec || f.outreach || f.lead,
  },
  {
    id: "merge-close",
    path: "/dashboard",
    target: "[data-tour='composer-cancel']",
    title: "All done here",
    body: "We won't send anything right now. Cancel out and we'll move on.",
    action: "Click “Cancel” to continue",
    clickTarget: "[data-tour='composer-cancel']",
    when: (f) => f.exec || f.outreach || f.lead,
  },

  /* ---- overview + history ---- */
  {
    id: "overview-on",
    path: "/dashboard",
    target: "[data-tour='overview']",
    title: "The whole club at once",
    body: "This swaps your personal view for every project group's work side by side, with a shared calendar. Try it.",
    action: "Click “Full Club Overview” to continue",
    clickTarget: "[data-tour='overview']",
    when: (f) => f.lead || f.exec,
  },
  {
    id: "overview-off",
    path: "/dashboard",
    target: "[data-tour='overview']",
    title: "Switch it back",
    body: "Every group's active tasks and events together — the quickest way to see what the club is working on right now. Click it again to return to your own view.",
action: "Click “Full Club Overview” again to continue",
    clickTarget: "[data-tour='overview']",
    when: (f) => f.lead || f.exec,
  },
  {
    id: "history-open",
    path: "/dashboard",
    target: "[data-tour='history']",
    title: "Finished work lives here",
    body: "Your dashboard stays clean by showing only what's still active. Everything completed or archived moves into History. Open it.",
    action: "Click “History” to continue",
    clickTarget: "[data-tour='history']",
  },
  {
    id: "history-panel",
    path: "/dashboard",
    target: "[data-tour='history-panel']",
    title: "What's in here",
    body: "Your finished tasks, anything you assigned that's now done, and past events — with a calendar you can hide if you'd rather just read the lists.",
  },
  {
    id: "history-overview",
    path: "/dashboard",
    target: "[data-tour='history-overview']",
    title: "Club history too",
    body: "The same club-wide view is in here, reaching further back — every finished task and past event across all groups. Try it, then close History with the ✕ when you're done looking.",
    action: "Click “Full Club Overview”, then close History",
    clickTarget: "[data-tour='fs-close']",
    when: (f) => f.lead || f.exec,
  },
  {
    id: "history-close",
    path: "/dashboard",
    target: "[data-tour='fs-close']",
    title: "Close History",
    body: "Close it and we'll head over to Files.",
    action: "Click ✕ to continue",
    clickTarget: "[data-tour='fs-close']",
    when: (f) => !(f.lead || f.exec),
  },

  /* ---- files ---- */
  {
    id: "files-open",
    path: "/dashboard",
    target: "[data-tour='files-tile']",
    title: "Files",
    body: "Every document the club keeps in Drive is here, going back several years. Let's go in.",
    action: "Click “Files” to continue",
    clickTarget: "[data-tour='files-tile']",
  },
  {
    id: "files-years",
    path: "/dashboard/files",
    target: "[data-tour='file-list']",
    title: "Organised by school year",
    body: "The current year sits up top with everything older grouped underneath. Open a folder and browse it just as you would in Drive — click any document to read it right here without leaving the site.",
  },
  {
    id: "files-search",
    path: "/dashboard/files",
    target: "[data-tour='file-search']",
    title: "Search that reads inside documents",
    body: "Search covers every year at once and groups results by year. Switch to “Include In-File Text” and it searches the words inside documents too — useful when you remember something was written down but not where.",
  },
  {
    id: "files-tasks",
    path: "/dashboard/files",
    target: "[data-tour='file-list']",
    title: "Task submissions",
    body: "The Tasks folder holds every file submitted to finish a task, sorted by project group and task name. You'll see your own group's submissions here and nobody else's.",
    when: (f) => f.lead || f.exec,
  },

  /* ---- meetings, walked properly ---- */
  {
    id: "meetings-open",
    path: "/dashboard/files",
    target: "[data-tour='meetings-card']",
    title: "Meeting notes",
    body: "Each project group keeps its meetings here. Open Health to see what one looks like.",
    action: "Click “Health” to continue",
    clickTarget: "[data-tour='meetings-group-H']",
  },
  {
    id: "meeting-pick",
    path: "/dashboard/files/meetings/g/H",
    target: "[data-tour='meeting-link']",
    title: "Every meeting, kept",
    body: "Every Health meeting, newest first. Open one.",
    action: "Click a meeting to continue",
    clickTarget: "[data-tour='meeting-link']",
  },
  {
    id: "meeting-notes",
    path: "/dashboard/files/meetings/m",
    prefix: true,
    target: "[data-tour='meeting-notetaker']",
    title: "Who was there, who wrote it down",
    body: "Date, location, attendance, the snack pledge, and who took notes — filled in during the meeting by whoever's running it. The agenda itself sits just below, straight from the group's working document.",
  },
  {
    id: "meeting-tasks",
    path: "/dashboard/files/meetings/m",
    prefix: true,
    target: "[data-tour='meeting-tasks-head']",
    title: "Tasks assigned in the meeting",
    body: "Work handed out in a meeting is recorded right here, showing each person and whether they've finished. These are ordinary tasks — the same due dates, reminders and approval step — so they appear on the assignee's dashboard like anything else. Nothing gets said in a meeting and then quietly forgotten.",
  },

  /* ---- directory, lineage, settings ---- */
  {
    id: "directory",
    path: "/dashboard/directory",
    target: "[data-tour='directory-list']",
    title: "Member directory",
    body: "Everyone in the club with their role and project group. Sort and filter by group, year, or position when you're trying to find the right person to ask.",
  },
  {
    id: "lineage",
    path: "/dashboard/lineage",
    target: "[data-tour='lineage']",
    title: "RISHI lineage",
    body: "A look back at who has led the club over the years — the people behind the projects we've inherited.",
  },
  {
    id: "settings",
    path: "/dashboard/settings",
    target: "[data-tour='settings-main']",
    title: "Your settings",
    body: "Update your photo and contact details, choose how you'd like to be notified, and connect your calendar so tasks and events sit alongside the rest of your schedule.",
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
    path: "/dashboard/settings",
    target: "[data-tour='tour-replay']",
    title: "That's everything",
    body: "You can take this tour again from right here whenever you like. If something doesn't look right, tell Sachit.",
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
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardH, setCardH] = useState(250);

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

  const onStepPage = useCallback(
    (st: Step) => (st.prefix ? (pathname ?? "").startsWith(st.path) : pathname === st.path),
    [pathname],
  );

  // Navigate to the step's page if we're not already on it. Prefix steps are
  // reached by the person clicking a link, so the tour never pushes those.
  useEffect(() => {
    if (!active || !step || step.prefix) return;
    if (pathname !== step.path) router.push(step.path);
  }, [active, step, pathname, router]);

  // Hover-opened menus still need a nudge to appear, but nothing else is
  // clicked for the person: steps with `clickTarget` wait for them to do it.
  useEffect(() => {
    if (!active || !step || !step.hover) return;
    if (!onStepPage(step)) return;
    const el = document.querySelector(step.hover) as HTMLElement | null;
    el?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    el?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    // React's onMouseEnter is delegated, so a synthesised event doesn't always
    // reach it. If the menu still isn't open, click to toggle it — but only
    // then, since clicking an already-open menu would close it.
    const t = setTimeout(() => {
      if (step.target && !document.querySelector(step.target)) el?.click();
    }, 300);
    return () => clearTimeout(t);
  }, [active, step, pathname, onStepPage]);

  // Advance when they click the element the step asked them to click.
  useEffect(() => {
    if (!active || !step?.clickTarget) return;
    if (!onStepPage(step)) return;

    let done = false;
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (done || !el?.closest(step.clickTarget as string)) return;
      done = true;
      // Let the click do its work — open a form, follow a link — before the
      // next step starts looking for whatever it lives inside.
      setTimeout(() => setI((v) => v + 1), 700);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [active, step, pathname, onStepPage]);

  // Find and follow the target. Polls briefly because the page may still be
  // loading its data when the step begins.
  useEffect(() => {
    if (!active || !step) return;
    if (!step.target) { setRect(null); setMissing(false); return; }
    // Don't start the countdown until we're actually on the step's page —
    // otherwise a step that follows a link gives up while the page is still
    // fetching and reports its target as missing.
    if (!onStepPage(step)) { setRect(null); setMissing(false); return; }

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
      if (++tries > 300) { setMissing(true); setRect(null); return; } // ~5s
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, step, pathname, onStepPage]);

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
    // Measured, not estimated: a guessed height let a long step overlap the very
    // thing it was pointing at.
    const CARD_H = cardH;
    const below = rect.bottom + 16;
    const above = rect.top - 16;
    const goBelow = below + CARD_H < H || above < CARD_H;
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - card.w / 2), W - card.w - 16);
    // Clamp to the viewport on both axes. Without this the card tracked a
    // target that was still smooth-scrolling into place and ended up off the
    // bottom of the screen, leaving Next unreachable.
    const raw = goBelow ? below : above - CARD_H;
    const top = Math.min(Math.max(16, raw), Math.max(16, H - CARD_H - 16));
    cardStyle = { left, top };
  }

  const pct = Math.round(((i + 1) / steps.length) * 100);

  return (
    <div
      /* The overlay must not swallow clicks — the whole point is that the
         person uses the real controls underneath it. Only the card itself
         takes pointer events. */
      className="pointer-events-none fixed inset-0 z-[60]"
      role="dialog"
      aria-label="Site tour"
    >
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
        ref={(el) => {
          cardRef.current = el;
          const h = el?.offsetHeight;
          if (h && Math.abs(h - cardH) > 4) setCardH(h);
        }}
        className="pointer-events-auto absolute w-[min(400px,calc(100vw-2rem))] rounded-2xl bg-paper p-5 shadow-2xl transition-all duration-300"
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
            {step.clickTarget && !missing ? (
              // Deliberately no Next here: the step is finished by doing the
              // thing, which is the whole point of walking it this way.
              <span className="rounded-full bg-marigold/25 px-4 py-2 text-xs font-semibold text-pine-deep">
                Your turn ↑
              </span>
            ) : (
              <button
                onClick={next}
                className="rounded-full bg-pine px-5 py-2 text-sm font-semibold text-paper hover:bg-pine-deep"
              >
                {i === steps.length - 1 ? "Finish" : "Next"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
