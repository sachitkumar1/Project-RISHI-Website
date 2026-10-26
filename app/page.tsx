"use client";

import Link from "next/link";
import Image from "next/image";
import { placeholderFor } from "@/lib/imagePlaceholders";
import type { CSSProperties } from "react";
import Media from "@/components/Media";
import Reveal from "@/components/Reveal";
import Contours from "@/components/Contours";
import SectionHeading from "@/components/SectionHeading";
import CountUp from "@/components/CountUp";
import ChapterRail from "@/components/ChapterRail";
import { HOME, PROJECTS, ABOUT, LINKS } from "@/lib/content";

// The home page reads as chapters; the rail on the left (desktop) tracks them.
const CHAPTERS = [
  { id: "mission", n: "01", label: "Mission" },
  { id: "teams", n: "02", label: "Four teams" },
  { id: "method", n: "03", label: "Method" },
  { id: "join", n: "04", label: "Get involved" },
];

export default function Home() {
  // Hero lines rise in on load (.hero-rise in globals.css): pure CSS, so it
  // starts at first paint instead of waiting for JavaScript.
  const rise = (i: number) => ({ style: { "--i": i } as CSSProperties });

  return (
    <>
      {/* ---------------------------------------------------------------- HERO
          A short opening film. On browsers with scroll-driven animations the
          section is taller than the screen and its stage stays pinned while
          you scroll: the camera pushes into the foothills, mist rises, the
          contour lines drift at two depths, the title lifts away and a second
          line takes over. Everywhere else (and with reduced motion) it's the
          normal one-screen hero. CSS: "home hero film" in globals.css. */}
      <section className="hero-scope relative bg-pine-deep text-paper">
        <div className="hero-stage relative flex h-[100svh] min-h-[560px] items-center overflow-hidden">
          {HOME.heroImage && (
            <div className="hero-cam absolute inset-0">
              <Image
                src={HOME.heroImage}
                alt="Himalayan foothills near Bharog Baneri"
                fill
                priority
                sizes="100vw"
                placeholder={placeholderFor(HOME.heroImage) ? "blur" : "empty"}
                blurDataURL={placeholderFor(HOME.heroImage)?.blur}
                className="scale-110 object-cover blur-[3px]"
              />
            </div>
          )}
          {/* Green overlay for legibility (kept light so the photo shows) */}
          <div className="absolute inset-0 bg-pine-deep/45" />
          <div className="absolute inset-0 bg-gradient-to-b from-pine-deep/30 via-pine-deep/35 to-pine-deep/75" />
          {/* depth: two contour layers that drift apart, rising mist, grain, vignette */}
          <Contours className="hero-depth-far absolute inset-0 h-full w-full text-paper" opacity={0.08} />
          <Contours className="hero-depth-near absolute inset-x-0 bottom-0 h-2/3 w-full text-marigold" opacity={0.1} />
          <div aria-hidden className="hero-mist pointer-events-none absolute inset-x-0 bottom-0 h-2/3" />
          <div aria-hidden className="film-grain pointer-events-none absolute inset-0" />
          <div aria-hidden className="pointer-events-none absolute inset-0 [background:radial-gradient(120%_90%_at_50%_45%,transparent_55%,rgb(8_20_14/0.55))]" />

          {/* Beat 1: the title (rises in on load, lifts away on scroll) */}
          <div className="hero-beat-1 container-rishi relative z-10 flex flex-col items-center pt-[var(--header-h)] text-center [text-shadow:_0_2px_16px_rgba(12,22,16,0.45)]">
            <span style={rise(0).style} className="hero-rise eyebrow text-marigold-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-marigold" />
              {HOME.heroEyebrow}
            </span>

            <h1 className="mt-5 font-display font-semibold leading-[0.92]">
              <span style={rise(1).style} className="hero-rise block text-6xl sm:text-7xl lg:text-8xl">
                {HOME.heroLine1}
              </span>
              <span style={rise(2).style} className="hero-rise block text-7xl text-marigold sm:text-8xl lg:text-9xl">
                {HOME.heroLine2}
              </span>
            </h1>

            <p style={rise(3).style} className="hero-rise mt-6 max-w-xl text-lg text-paper/90 sm:text-xl">
              {HOME.heroSub}
            </p>

            <div style={rise(4).style} className="hero-rise mt-9 flex flex-wrap justify-center gap-3">
              <a href={LINKS.interestForm} target="_blank" rel="noopener noreferrer" className="btn-accent">
                Register your interest
              </a>
              <Link href="/about" className="btn border border-paper/40 text-paper hover:bg-paper hover:text-pine-deep">
                Learn about us
              </Link>
            </div>
          </div>

          {/* Beat 2: takes over mid-scroll (only exists where the film plays) */}
          <div aria-hidden className="hero-beat-2 pointer-events-none absolute inset-0 z-10 flex items-center">
            <div className="container-rishi">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-marigold-soft">Bharog Baneri · Himachal Pradesh</p>
              <p className="mt-5 max-w-4xl font-display text-4xl font-semibold leading-[1.05] text-paper sm:text-6xl lg:text-7xl">
                Since 2012, side by side with one village of 1,400 people in the Himalayan foothills.
              </p>
              <span className="mt-8 block h-px w-40 bg-marigold/70" />
            </div>
          </div>

          {/* scroll cue */}
          <div
            style={rise(5).style}
            className="hero-rise hero-cue absolute bottom-7 left-1/2 z-10 -translate-x-1/2 text-paper/60"
            aria-hidden
          >
            <div className="flex h-9 w-5 items-start justify-center rounded-full border border-paper/40 p-1">
              <span className="hero-cue-dot h-1.5 w-1 rounded-full bg-paper/80" />
            </div>
          </div>
        </div>
      </section>

      <ChapterRail chapters={CHAPTERS} />

      {/* ------------------------------------------------------------- MISSION */}
      <section id="mission" data-chapter="01" className="chapter relative container-rishi py-24">
        <span aria-hidden className="chapter-num right-0 top-10">01</span>
        <div className="handoff grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHeading eyebrow="Why we exist" title={HOME.missionTitle} />
            <Reveal delay={0.1}>
              <p className="mt-6 text-lg leading-relaxed text-ink/75">
                {HOME.missionBody}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/about" className="btn-primary">
                  Our story
                </Link>
                <Link href="/projects" className="btn-ghost">
                  Explore projects
                </Link>
              </div>
            </Reveal>
          </div>
          <Reveal delay={0.15}>
            <Media
              src={HOME.missionImage}
              alt="Project RISHI members in the field"
              label="Mission / field photo"
              className="aspect-[4/3] w-full"
              rounded="rounded-3xl"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </Reveal>
        </div>

        {/* stats */}
        <div className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-pine/10 bg-pine/10 sm:grid-cols-3">
          {HOME.stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.1} className="bg-paper p-8 text-center">
              <p className="font-display text-4xl font-semibold text-pine sm:text-5xl">
                <CountUp value={s.value} />
              </p>
              <p className="mt-2 text-sm text-ink/75">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ PROJECTS */}
      <section id="teams" data-chapter="02" data-tone="dark" className="chapter relative overflow-hidden bg-pine-deep py-24 text-paper">
        <Contours className="drift-slow absolute inset-x-0 top-0 h-80 w-full text-marigold" opacity={0.1} />
        <span aria-hidden className="chapter-num chapter-num-dark right-6 top-16">02</span>
        <div className="handoff container-rishi relative z-10">
          <SectionHeading eyebrow="What we do" title="Four teams, One village" accent="pine" tone="dark" />
          <Reveal delay={0.1}>
            <p className="mt-4 max-w-2xl text-paper/70">
              Our work in Bharog Baneri is carried out by four project teams, each
              tackling a different pillar of sustainable development.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {PROJECTS.map((p, i) => (
              <Reveal as="article" key={p.slug} delay={(i % 2) * 0.12} variant="scale">
                <Link
                  href={`/projects/${p.slug}`}
                  className="group block overflow-hidden rounded-3xl border border-paper/10 bg-paper/[0.03] transition-[border-color,translate,box-shadow] duration-500 ease-out hover:-translate-y-1 hover:border-marigold/50 hover:shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)]"
                >
                  <Media
                    src={p.image}
                    alt={p.name}
                    label={`${p.name} cover`}
                    className="parallax-img card-zoom aspect-[16/9] w-full"
                    rounded="rounded-none"
                    sizes="(max-width: 640px) 100vw, 50vw"
                  />
                  <div className="flex items-center justify-between p-6">
                    <div>
                      <h3 className="font-display text-2xl font-semibold">{p.name}</h3>
                      <p className="mt-1 line-clamp-2 max-w-md text-sm text-paper/60">
                        {p.intro}
                      </p>
                    </div>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-marigold text-pine-deep transition-transform group-hover:translate-x-1">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- METHODOLOGY */}
      <section id="method" data-chapter="03" className="chapter steps-scope relative container-rishi py-24">
        <span aria-hidden className="chapter-num left-0 top-12">03</span>
        <SectionHeading eyebrow="How we work" title={ABOUT.methodology.title} align="center" />
        <div className="relative mt-14 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {/* a line that draws across the steps as you scroll (desktop) */}
          <span aria-hidden className="steps-line pointer-events-none absolute inset-x-6 top-1/2 hidden h-px bg-marigold/60 lg:block" />
          {ABOUT.methodology.steps.map((step, i) => (
            <Reveal key={step} delay={i * 0.08} className="relative">
              <div style={{ "--i": i } as CSSProperties} className="step-card relative flex h-full flex-col rounded-2xl border border-pine/12 bg-paper p-6 transition-colors hover:border-pine/40">
                <span className="font-display text-3xl font-semibold text-marigold-ink">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="mt-3 font-display text-lg font-semibold text-pine-deep">
                  {step}
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- GET INVOLVED */}
      <section id="join" data-chapter="04" className="chapter container-rishi pb-24">
        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal className="relative overflow-hidden rounded-3xl bg-pine p-10 text-paper">
            <Contours className="absolute inset-0 h-full w-full text-paper" opacity={0.12} />
            <div className="relative z-10">
              <h3 className="font-display text-3xl font-semibold">Join us</h3>
              <p className="mt-3 max-w-md text-paper/75">
                Applications are open now!
              </p>
              <Link href="/apply" className="btn-accent mt-7">
                See recruitment dates
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.1} className="relative overflow-hidden rounded-3xl bg-marigold p-10 text-pine-deep">
            <div className="relative z-10">
              <h3 className="font-display text-3xl font-semibold">Become a donor</h3>
              <p className="mt-3 max-w-md text-pine-deep/90">
                We appreciate donations of all sizes — they keep us running and
                directly support our work in Bharog Baneri.
              </p>
              <a href={LINKS.donate} className="btn mt-7 bg-pine-deep text-paper hover:-translate-y-0.5">
                Donate now
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
