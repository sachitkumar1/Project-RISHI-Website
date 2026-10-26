import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import { ORG, LINKS } from "@/lib/content";
import HeaderScenery from "@/components/landscape/HeaderScenery";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Project RISHI at UC Berkeley.",
};

export default function ContactPage() {
  return (
    <section className="dawn-header relative overflow-hidden pt-[var(--header-h)] text-paper">
      <HeaderScenery photo="dhauladhar" />
      <div className="container-rishi relative z-10 grid gap-10 py-10 lg:grid-cols-2 lg:items-center lg:py-14">
        <Reveal>
          <span className="eyebrow text-marigold-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-marigold" />
            Contact
          </span>
          <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.02] sm:text-6xl">
            Let&rsquo;s talk.
          </h1>
          <p className="mt-6 max-w-md text-lg text-paper/90">
            Questions about our work or partnerships? Reach out
            — we&rsquo;d love to hear from you.
          </p>
          <a href={`mailto:${ORG.email}`} className="btn-accent mt-8">
            Email us
          </a>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="space-y-6 rounded-3xl border border-pine/15 bg-paper/90 shadow-[0_30px_60px_-35px_rgb(20_54_40/0.35)] p-8">
            <div>
              <p className="eyebrow text-marigold-ink">General inquiries</p>
              <a href={`mailto:${ORG.email}`} className="mt-2 block text-lg text-pine-deep underline-offset-2 hover:underline">
                {ORG.email}
              </a>
            </div>
            <div className="h-px bg-pine/10" />
            <div>
              <p className="eyebrow text-marigold-ink">Find us</p>
              <p className="mt-2 text-lg text-ink/80">{ORG.address}</p>
            </div>
            <div className="h-px bg-pine/10" />
            <div>
              <p className="eyebrow text-marigold-ink">Socials</p>
              <div className="mt-3 flex gap-4">
                <a href={LINKS.instagram} target="_blank" rel="noopener noreferrer" className="text-ink/75 underline-offset-2 hover:text-pine-deep hover:underline">
                  Instagram
                </a>
                <a href={LINKS.facebook} target="_blank" rel="noopener noreferrer" className="text-ink/75 underline-offset-2 hover:text-pine-deep hover:underline">
                  Facebook
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
