import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import { ORG } from "@/lib/content";
import HeaderScenery from "@/components/landscape/HeaderScenery";

export const metadata: Metadata = {
  title: "Donate",
  description: "Support Project RISHI's work in Bharog Baneri.",
};

const STRIPE_URL = "https://donate.stripe.com/6oEeYJ5CX6Ay5a03cl";

export default function DonatePage() {
  return (
    <section className="dawn-header relative overflow-hidden pt-[var(--header-h)] text-paper">
      <HeaderScenery photo="slopes" shade="even" />
      <div className="container-rishi relative z-10 grid place-items-center py-10 text-center lg:py-14">
        <Reveal className="max-w-2xl">
          <span className="eyebrow text-marigold-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-marigold" />
            Support our work
          </span>
          <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.02] sm:text-6xl">
            Every gift reaches the village.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-paper/90">
            We appreciate donations of all sizes — they keep us running as an
            organization and directly support our projects in Bharog Baneri.
          </p>
        </Reveal>

        {/* Stripe donation block */}
        <Reveal delay={0.12} className="mt-12 w-full max-w-xl">
          <div className="rounded-3xl border border-pine/15 bg-paper/90 shadow-[0_30px_60px_-35px_rgb(20_54_40/0.35)] p-8 text-left">
            <p className="font-display text-2xl font-semibold text-pine-deep">Donate online</p>
            <p className="mt-2 text-sm leading-relaxed text-ink/70">
              Give securely by card in a few taps. Donations are processed through
              the ASUC (Associated Students of the University of California), which
              sponsors us as a UC Berkeley student organization.
            </p>

            {/* The one instruction people must follow */}
            <div className="mt-5 rounded-2xl border border-marigold/40 bg-marigold-soft/10 p-4">
              <p className="text-sm text-ink/80">
                On the payment page, under{" "}
                <span className="font-semibold">“Student Organization”</span>, be sure to
                type{" "}
                <span className="font-display text-base font-semibold text-marigold-ink">
                  Project RISHI
                </span>{" "}
                so your gift reaches us.
              </p>
            </div>

            <a
              href={STRIPE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-marigold px-6 py-3.5 font-semibold text-pine-deep shadow-sm transition-transform duration-200 hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Donate now
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 17L17 7M9 7h8v8" />
              </svg>
            </a>
          </div>

          {/* Secondary option */}
          <p className="mt-8 text-center text-sm text-paper/90">
            Prefer another way to give, or giving on behalf of an organization?{" "}
            <a
              href={`mailto:${ORG.email}`}
              className="font-medium text-paper underline decoration-marigold/70 underline-offset-4 hover:text-marigold-soft"
            >
              Reach out about other options
            </a>
            .
          </p>
        </Reveal>
      </div>
    </section>
  );
}
