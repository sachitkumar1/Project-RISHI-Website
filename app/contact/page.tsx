import type { Metadata } from "next";
import Reveal from "@/components/Reveal";
import Contours from "@/components/Contours";
import { ORG, LINKS } from "@/lib/content";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with Project RISHI at UC Berkeley.",
};

export default function ContactPage() {
  return (
    <section className="relative overflow-hidden bg-pine pt-[var(--header-h)] text-paper">
      <Contours className="absolute inset-0 h-full w-full text-paper" opacity={0.1} />
      <div className="container-rishi relative z-10 grid min-h-[70vh] gap-12 py-20 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <span className="eyebrow text-marigold-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-marigold" />
            Contact
          </span>
          <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.02] sm:text-6xl">
            Let&rsquo;s talk.
          </h1>
          <p className="mt-6 max-w-md text-lg text-paper/80">
            Questions about our work or partnerships? Reach out
            — we&rsquo;d love to hear from you.
          </p>
          <a href={`mailto:${ORG.email}`} className="btn-accent mt-8">
            Email us
          </a>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="space-y-6 rounded-3xl border border-paper/15 bg-paper/[0.04] p-8">
            <div>
              <p className="eyebrow text-marigold-soft">General inquiries</p>
              <a href={`mailto:${ORG.email}`} className="mt-2 block text-lg text-paper underline-offset-2 hover:underline">
                {ORG.email}
              </a>
            </div>
            <div className="h-px bg-paper/10" />
            <div>
              <p className="eyebrow text-marigold-soft">Find us</p>
              <p className="mt-2 text-lg text-paper/85">{ORG.address}</p>
            </div>
            <div className="h-px bg-paper/10" />
            <div>
              <p className="eyebrow text-marigold-soft">Socials</p>
              <div className="mt-3 flex gap-4">
                <a href={LINKS.instagram} target="_blank" rel="noopener noreferrer" className="text-paper/80 underline-offset-2 hover:text-paper hover:underline">
                  Instagram
                </a>
                <a href={LINKS.facebook} target="_blank" rel="noopener noreferrer" className="text-paper/80 underline-offset-2 hover:text-paper hover:underline">
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
