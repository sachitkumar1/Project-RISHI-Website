import Link from "next/link";
import type { CSSProperties } from "react";
import Media from "@/components/Media";
import PhotoJourney from "@/components/landscape/PhotoJourney";
import MethodGraph from "@/components/MethodGraph";
import { HOME, PROJECTS, ABOUT, LINKS } from "@/lib/content";

/**
 * Home: a descent through real photographs of the Himalayan foothills, from
 * a 3D dawn flight over the real hills of Sirmaur (Bharog Baneri's district),
 * built from satellite data, down to a terraced hillside village.
 *
 * The photos sit fixed behind the page (PhotoJourney); each one is composed
 * when its `data-shot` section (hero, teams, method, join) is centred, and
 * between them the camera pushes on and the next photo rises out of the mist.
 * Content lives on solid panels so it's always readable.
 *
 * Motion rules for this page (see globals.css, "Dawn home"):
 *  • Nothing ever fades OUT. Things arrive quickly as you reach them and stay.
 *  • Arrivals are tied to scroll position, never to a timer, so a fast scroll
 *    is never made to wait, and a jump lands on finished content.
 *  • Native scrolling. No smooth-scroll, no pinned sections.
 */

// Hindi names for the four teams — the language of the village.
const HINDI: Record<string, string> = {
  education: "शिक्षा",
  "water-sanitation": "जल एवं स्वच्छता",
  "womens-empowerment": "महिला सशक्तिकरण",
  health: "स्वास्थ्य",
};

const i = (n: number) => ({ "--i": n }) as CSSProperties;

export default function Home() {
  return (
    <div className="dawn-home relative">
      <PhotoJourney />

      {/* ------------------------------------------------------------------ HERO */}
      <section data-shot="0" className="relative flex min-h-[100svh] flex-col items-center justify-center pt-[var(--header-h)] text-center">
        {/* shade behind the title, so it reads over sky and cloud alike */}
        <div aria-hidden className="hero-scrim pointer-events-none absolute inset-0" />
        <div className="container-rishi relative z-10 flex flex-col items-center">
          <p style={i(0)} className="dawn-rise rounded-full bg-[rgb(9_22_16/0.55)] px-4 py-1.5 font-mono text-xs uppercase tracking-[0.32em] text-paper backdrop-blur-md">
            {HOME.heroEyebrow} · Bharog Baneri, Himachal Pradesh
          </p>
          <h1 className="hero-shadow mt-6 font-display font-semibold leading-[0.86] tracking-tight text-paper">
            <span style={i(1)} className="dawn-rise block text-[clamp(4rem,11vw,10rem)]">{HOME.heroLine1}</span>
            <span style={i(2)} className="dawn-rise block text-[clamp(4.6rem,13vw,12rem)] text-[rgb(216_163_72)]">{HOME.heroLine2}</span>
          </h1>
          <p style={i(3)} className="dawn-rise hero-shadow mt-7 max-w-xl text-lg text-paper sm:text-xl">
            {HOME.heroSub}
          </p>
          <div style={i(4)} className="dawn-rise mt-10 flex flex-wrap justify-center gap-3">
            <a href={LINKS.interestForm} target="_blank" rel="noopener noreferrer" className="btn-accent">
              Register your interest
            </a>
            <Link href="/about" className="btn border border-paper/60 bg-black/10 text-paper backdrop-blur-sm hover:bg-paper hover:text-pine-deep">
              Learn about us
            </Link>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- MISSION */}
      <section id="mission" className="relative px-4 pb-10 pt-4 sm:px-6">
        <div className="dawn-panel relative mx-auto max-w-content overflow-hidden rounded-[2rem] px-6 py-14 sm:px-12 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[1.05fr_1fr] lg:items-center">
            <div>
              <h2 className="rise-in font-display text-4xl font-semibold text-pine-deep sm:text-5xl">{HOME.missionTitle}</h2>
              <p className="rise-in mt-6 text-lg leading-relaxed text-ink/75">{HOME.missionBody}</p>
              <div className="rise-in mt-8 flex flex-wrap gap-3">
                <Link href="/about" className="btn-primary">Our story</Link>
                <Link href="/projects" className="btn-ghost">Explore projects</Link>
              </div>
            </div>
            <div className="rise-in">
              <Media src={HOME.missionImage} alt="Project RISHI members in the field" label="Mission / field photo"
                className="drift-photo aspect-[4/3] w-full" rounded="rounded-[1.5rem]" sizes="(max-width: 1024px) 100vw, 50vw" />
            </div>
          </div>
          <dl className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-pine/10 bg-pine/10 sm:grid-cols-3">
            {HOME.stats.map((s) => (
              <div key={s.label} className="rise-in flex flex-col bg-paper p-8 text-center">
                <dt className="order-2 mt-2 text-sm text-ink/75">{s.label}</dt>
                <dd className="font-display text-5xl font-semibold text-pine tabular-nums">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ----------------------------------------------------------------- TEAMS */}
      <section id="teams" data-shot="1" className="relative px-4 pb-10 sm:px-6">
        <div className="relative mx-auto max-w-content overflow-hidden rounded-[2rem] bg-pine-deep px-6 py-14 text-paper shadow-[0_40px_80px_-40px_rgb(20_54_40/0.6)] sm:px-12 sm:py-20">
          <h2 className="rise-in font-display text-4xl font-semibold sm:text-5xl">Four teams, One village</h2>
          <p className="rise-in mt-5 max-w-2xl text-paper/75">
            Our work in Bharog Baneri is carried out by four project teams, each tackling a different pillar of sustainable development.
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {PROJECTS.map((p) => (
              <article key={p.slug} className="rise-in">
                <Link href={`/projects/${p.slug}`}
                  className="group block overflow-hidden rounded-[1.5rem] border border-paper/10 bg-paper/[0.04] transition-[border-color,box-shadow] duration-300 hover:border-marigold/60 hover:shadow-[0_30px_60px_-30px_rgb(0_0_0/0.7)]">
                  <Media src={p.image} alt={p.name} label={`${p.name} cover`} className="drift-photo card-zoom aspect-[16/9] w-full" rounded="rounded-none" sizes="(max-width: 640px) 100vw, 50vw" />
                  <div className="flex items-center justify-between gap-4 p-6">
                    <div>
                      <p lang="hi" className="text-sm text-marigold-soft">{HINDI[p.slug]}</p>
                      <h3 className="mt-1 font-display text-2xl font-semibold">{p.name}</h3>
                      <p className="mt-1 line-clamp-2 max-w-md text-sm text-paper/70">{p.intro}</p>
                    </div>
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-marigold text-pine-deep transition-transform duration-300 group-hover:translate-x-1">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                    </span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- METHOD
          The five steps are a real sequence: a graph that rises step by step,
          each step pinging as the line reaches it while you scroll. */}
      <section id="method" data-shot="2" className="relative px-4 pb-10 sm:px-6">
        <div className="dawn-panel relative mx-auto max-w-content overflow-hidden rounded-[2rem] px-6 py-14 sm:px-12 sm:py-20">
          <h2 className="rise-in text-center font-display text-4xl font-semibold text-pine-deep sm:text-5xl">{ABOUT.methodology.title}</h2>
          <p className="rise-in mx-auto mt-4 max-w-xl text-center text-ink/75">The path every project follows, from first conversation to looking back.</p>
          <div className="mt-10 lg:mt-20 lg:px-6">
            <MethodGraph steps={ABOUT.methodology.steps} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ JOIN */}
      <section id="join" data-shot="3" className="relative px-4 pb-24 sm:px-6">
        <div className="mx-auto grid max-w-content gap-6 lg:grid-cols-2">
          <div className="rise-in relative overflow-hidden rounded-[2rem] bg-pine p-10 text-paper sm:p-12">
            <h3 className="font-display text-4xl font-semibold">Join us</h3>
            <p className="mt-3 max-w-md text-paper/80">Applications are open now!</p>
            <Link href="/apply" className="btn-accent mt-8">See recruitment dates</Link>
          </div>
          <div className="rise-in relative overflow-hidden rounded-[2rem] bg-marigold p-10 text-pine-deep sm:p-12">
            <h3 className="font-display text-4xl font-semibold">Become a donor</h3>
            <p className="mt-3 max-w-md text-pine-deep/90">
              We appreciate donations of all sizes — they keep us running and directly support our work in Bharog Baneri.
            </p>
            <a href={LINKS.donate} className="btn mt-8 bg-pine-deep text-paper hover:bg-pine">Donate now</a>
          </div>
        </div>
      </section>
    </div>
  );
}
