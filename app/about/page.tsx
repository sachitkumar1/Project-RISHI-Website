import type { Metadata } from "next";
import Link from "next/link";
import Media from "@/components/Media";
import Reveal from "@/components/Reveal";
import Contours from "@/components/Contours";
import SectionHeading from "@/components/SectionHeading";
import PhotoWall from "@/components/PhotoWall";
import { ABOUT, LINKS } from "@/lib/content";

export const metadata: Metadata = {
  title: "About",
  description:
    "Project RISHI is a student-run non-profit working with the village of Bharog Baneri, Himachal Pradesh.",
};

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-pine pt-[var(--header-h)] text-paper">
        <Contours className="absolute inset-0 h-full w-full text-paper" opacity={0.12} />
        <div className="container-rishi relative z-10 py-20 lg:py-28">
          <Reveal className="hero-seq">
            <span className="eyebrow text-marigold-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-marigold" />
              About Us
            </span>
            <h1 className="mt-4 max-w-3xl font-display text-5xl font-semibold leading-[1.02] sm:text-6xl">
              {ABOUT.heading}
            </h1>
          </Reveal>
        </div>
      </section>

      {/* Mission + Methodology */}
      <section className="container-rishi py-20">
        <div className="grid gap-14 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <SectionHeading eyebrow="What drives us" title={ABOUT.mission.title} />
            <Reveal delay={0.1}>
              <p className="mt-6 text-lg leading-relaxed text-ink/75">
                {ABOUT.mission.body}
              </p>
              <Link href="/projects" className="btn-primary mt-7">
                Explore our teams
              </Link>
            </Reveal>
          </div>

          <Reveal delay={0.15}>
            <div className="rounded-3xl border border-pine/12 bg-pine/[0.03] p-8">
              <p className="eyebrow text-sage-deep">{ABOUT.methodology.title}</p>
              <ol className="mt-5 space-y-3">
                {ABOUT.methodology.steps.map((step, i) => (
                  <li key={step} className="flex items-center gap-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-marigold font-display text-sm font-semibold text-pine-deep">
                      {i + 1}
                    </span>
                    <span className="font-display text-lg font-semibold text-pine-deep">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </Reveal>
        </div>
      </section>

      {/* History + Location */}
      <section className="bg-pine-deep py-20 text-paper">
        <div className="container-rishi grid gap-12 lg:grid-cols-2">
          <Reveal>
            <span className="eyebrow text-marigold-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-marigold" />
              {ABOUT.history.title}
            </span>
            <p className="mt-5 text-lg leading-relaxed text-paper/80">
              {ABOUT.history.body}
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <span className="eyebrow text-marigold-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-marigold" />
              {ABOUT.location.title}
            </span>
            <p className="mt-5 text-lg leading-relaxed text-paper/80">
              {ABOUT.location.body}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Our Team */}
      <section className="container-rishi py-20">
        <SectionHeading eyebrow="The people" title="Our Team" />
        <Reveal delay={0.1}>
          <Media
            src={ABOUT.teamImage}
            alt="The Project RISHI Berkeley team"
            label="Team group photo"
            className="mt-8 aspect-[3/2] w-full"
            rounded="rounded-3xl"
            sizes="100vw"
          />
        </Reveal>
      </section>

      {/* Life at Project RISHI — gallery */}
      <section className="container-rishi pb-20">
        <SectionHeading eyebrow="In Action" title="Life at Project RISHI" />
        <Reveal delay={0.1}>
          <PhotoWall images={ABOUT.gallery.filter(Boolean) as string[]} />
        </Reveal>
      </section>

      {/* Chapters around the country */}
      <section className="bg-marigold/10 py-20">
        <div className="container-rishi">
          <SectionHeading eyebrow="A national network" title="Chapters around the country" />
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {ABOUT.chapters.map((c, i) => (
              <Reveal key={c.name} delay={(i % 4) * 0.05}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center justify-between rounded-xl border border-pine/12 bg-paper px-4 py-3.5 transition-colors hover:border-pine hover:bg-pine hover:text-paper"
                >
                  <span className="text-sm font-medium">{c.name}</span>
                  <svg
                    className="h-4 w-4 opacity-40 transition-opacity group-hover:opacity-100"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M7 17 17 7M9 7h8v8" />
                  </svg>
                </a>
              </Reveal>
            ))}
          </div>

          {/* Standout link to the national organization */}
          <Reveal delay={0.1}>
            <a
              href={LINKS.nationalSite}
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-6 flex items-center justify-center gap-3 rounded-2xl bg-pine px-8 py-5 text-paper shadow-lg shadow-pine/20 transition-all hover:-translate-y-0.5 hover:bg-pine-deep"
            >
              <span className="font-display text-lg font-semibold">
                Visit the National Project RISHI Webpage
              </span>
              <svg
                className="h-5 w-5 transition-transform group-hover:translate-x-1"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </a>
          </Reveal>
        </div>
      </section>
    </>
  );
}
