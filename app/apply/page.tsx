import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import Contours from "@/components/Contours";
import { APPLY, LINKS } from "@/lib/content";

export const metadata: Metadata = {
  title: "Apply",
  description: "Join Project RISHI at UC Berkeley. Recruitment dates and application.",
};

export default function ApplyPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-pine pt-[var(--header-h)] text-paper">
        <Contours className="absolute inset-0 h-full w-full text-paper" opacity={0.12} />
        <div className="absolute -bottom-10 left-0 right-0">
          <Contours className="h-48 w-full text-marigold" opacity={0.16} />
        </div>
        <div className="container-rishi relative z-10 py-20 lg:py-28">
          <Reveal>
            <span className="eyebrow text-marigold-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-marigold" />
              {APPLY.termLabel}
            </span>
            <h1 className="mt-4 max-w-4xl font-display text-5xl font-semibold leading-[1.02] sm:text-6xl">
              {APPLY.heading}
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-paper/80">{APPLY.blurb}</p>
            {LINKS.application ? (
              <a
                href={LINKS.application}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-marigold px-8 py-3.5 text-base font-semibold text-pine-deep transition-transform hover:-translate-y-0.5"
              >
                Apply
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </a>
            ) : null}
          </Reveal>
        </div>
      </section>

      {/* Timeline */}
      <section className="container-rishi py-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {APPLY.timeline.map((t, i) => (
            <Reveal key={t.label} delay={i * 0.08}>
              <div className="relative h-full rounded-2xl border border-pine/12 p-6">
                <span className="font-display text-3xl font-semibold text-marigold">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="mt-3 text-sm font-semibold uppercase tracking-wider text-sage">
                  {t.label}
                </p>
                <p className="mt-1 font-display text-xl font-semibold text-pine-deep">
                  {t.value}
                </p>
                {"time" in t && t.time ? (
                  <p className="mt-1 text-sm font-medium uppercase tracking-widest text-marigold-deep/80">
                    {t.time}
                  </p>
                ) : null}
              </div>
            </Reveal>
          ))}
        </div>

        {/* Actions */}
        <Reveal delay={0.1}>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <a href={LINKS.interestForm} target="_blank" rel="noopener noreferrer" className="group rounded-2xl bg-pine p-6 text-paper transition-transform hover:-translate-y-1">
              <p className="font-display text-xl font-semibold">Interest Form</p>
              <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-marigold-soft">
                Open form →
              </span>
            </a>
            {LINKS.coffeeChats ? (
              <a href={LINKS.coffeeChats} target="_blank" rel="noopener noreferrer" className="group rounded-2xl bg-marigold p-6 text-pine-deep transition-transform hover:-translate-y-1">
                <p className="font-display text-xl font-semibold">Coffee Chats</p>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold">
                  Book a slot →
                </span>
              </a>
            ) : (
              <div aria-disabled className="rounded-2xl border border-pine/15 bg-pine/[0.04] p-6 text-pine-deep/60">
                <p className="font-display text-xl font-semibold text-pine-deep/70">Coffee Chats</p>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-pine-deep/45">
                  Released soon
                </span>
              </div>
            )}
            {LINKS.application ? (
              <a href={LINKS.application} target="_blank" rel="noopener noreferrer" className="group rounded-2xl bg-pine-deep p-6 text-paper transition-transform hover:-translate-y-1">
                <p className="font-display text-xl font-semibold">Application</p>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-marigold-soft">
                  Apply now →
                </span>
              </a>
            ) : (
              <div aria-disabled className="rounded-2xl border border-pine/15 bg-pine/[0.04] p-6 text-pine-deep/60">
                <p className="font-display text-xl font-semibold text-pine-deep/70">Application</p>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-pine-deep/45">
                  Released soon
                </span>
              </div>
            )}
          </div>
        </Reveal>
      </section>
    </>
  );
}
