import Link from "next/link";
import type { CSSProperties } from "react";
import Media from "@/components/Media";
import FoothillsBackdrop from "@/components/landscape/FoothillsBackdrop";
import Foliage from "@/components/landscape/Foliage";
import { HOME, PROJECTS, ABOUT, LINKS } from "@/lib/content";

/**
 * Home: a walk from dawn over the Himalayan foothills down to the village.
 *
 * A live 3D landscape sits fixed behind the page (FoothillsBackdrop); scrolling
 * moves its camera from the far ranges at sunrise down to the terraces of
 * Bharog Baneri. Content lives on solid panels so it's always readable;
 * between them, open "windows" onto the landscape carry one fact each.
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
      <FoothillsBackdrop />

      {/* ------------------------------------------------------------------ HERO */}
      <section className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden pt-[var(--header-h)]">
        {/* a soft pool of morning light behind the title, for legibility over the scene */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_55%_at_22%_42%,rgb(251_248_241/0.82),rgb(251_248_241/0.35)_55%,transparent_80%)]" />
        <div className="container-rishi relative z-10">
          <p style={i(0)} className="dawn-rise font-mono text-xs uppercase tracking-[0.32em] text-pine-deep/80">
            {HOME.heroEyebrow} · Bharog Baneri, Himachal Pradesh
          </p>
          <h1 className="mt-6 font-display font-semibold leading-[0.86] tracking-tight text-pine-deep">
            <span style={i(1)} className="dawn-rise block text-[clamp(4rem,11vw,10rem)]">{HOME.heroLine1}</span>
            <span style={i(2)} className="dawn-rise block text-[clamp(4.6rem,13vw,12rem)] text-marigold-ink">{HOME.heroLine2}</span>
          </h1>
          <p style={i(3)} className="dawn-rise mt-7 max-w-xl text-lg text-ink/80 sm:text-xl">
            {HOME.heroSub}
          </p>
          <div style={i(4)} className="dawn-rise mt-10 flex flex-wrap gap-3">
            <a href={LINKS.interestForm} target="_blank" rel="noopener noreferrer" className="btn-accent">
              Register your interest
            </a>
            <Link href="/about" className="btn border border-pine-deep/30 bg-paper/60 text-pine-deep backdrop-blur-sm hover:bg-pine-deep hover:text-paper">
              Learn about us
            </Link>
          </div>
        </div>

        {/* scroll cue: a line that keeps trickling down */}
        <div aria-hidden style={i(6)} className="dawn-rise absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-3 text-pine-deep/75">
          <span className="font-mono text-[10px] uppercase tracking-[0.35em]">Scroll</span>
          <span className="scroll-trickle block h-12 w-px overflow-hidden bg-pine-deep/20" />
        </div>

        <Foliage kind="grass" seed={21} className="-bottom-6 -left-10 h-[34vh] w-[46vw] max-w-[620px]" />
        <Foliage kind="deodar" seed={5} flip className="-right-10 top-[12vh] h-[30vh] w-[42vw] max-w-[560px]" />
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
        <Foliage kind="deodar" seed={11} className="-left-16 -top-16 h-[26vh] w-[40vw] max-w-[520px]" />
      </section>

      {/* -------------------------------------------------------------- WINDOW 1 */}
      <section aria-label="The village" className="landscape-window relative flex min-h-[85svh] items-center">
        <div className="container-rishi relative z-10">
          <div className="window-card max-w-3xl">
            <p className="rise-in font-mono text-xs uppercase tracking-[0.3em] text-pine-deep/80">Sirmaur District · Himachal Pradesh</p>
            <p className="rise-in mt-5 font-display text-[clamp(2.4rem,5.4vw,4.6rem)] font-semibold leading-[1.02] text-pine-deep">
              A village of 1,400 people, a mile above sea level.
            </p>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- TEAMS */}
      <section id="teams" className="relative px-4 pb-10 sm:px-6">
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

      {/* -------------------------------------------------------------- WINDOW 2 */}
      <section aria-label="Bharog Baneri" className="landscape-window relative flex min-h-[85svh] items-center">
        <div className="container-rishi relative z-10 flex justify-end">
          <div className="window-card max-w-2xl text-right">
            <p className="rise-in font-mono text-xs uppercase tracking-[0.3em] text-pine-deep/80">Where the four teams work</p>
            <p className="rise-in mt-5 font-display text-[clamp(2.4rem,5.4vw,4.6rem)] font-semibold leading-[1.02] text-pine-deep">
              Five wards. One school. One primary health center.
            </p>
          </div>
        </div>
        <Foliage kind="grass" seed={33} flip className="-bottom-4 -right-8 h-[30vh] w-[40vw] max-w-[560px]" />
      </section>

      {/* ---------------------------------------------------------------- METHOD
          The five steps are a real sequence, so they sit on a trail that climbs
          like a hill path and draws itself as you scroll. */}
      <section id="method" className="relative px-4 pb-10 sm:px-6">
        <div className="dawn-panel trail-scope relative mx-auto max-w-content overflow-hidden rounded-[2rem] px-6 py-14 sm:px-12 sm:py-20">
          <h2 className="rise-in text-center font-display text-4xl font-semibold text-pine-deep sm:text-5xl">{ABOUT.methodology.title}</h2>
          <p className="rise-in mx-auto mt-4 max-w-xl text-center text-ink/75">The path every project follows, from first conversation to looking back.</p>
          <div className="relative mt-14">
            <svg aria-hidden viewBox="0 0 1000 200" preserveAspectRatio="none" className="absolute inset-x-0 top-[38px] hidden h-[120px] w-full lg:block" fill="none">
              <path d="M40 170 C 160 170, 170 120, 240 110 S 380 80, 460 95 S 600 60, 680 55 S 830 20, 960 30" className="trail-base" stroke="rgb(30 77 58 / 0.15)" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />
              <path d="M40 170 C 160 170, 170 120, 240 110 S 380 80, 460 95 S 600 60, 680 55 S 830 20, 960 30" className="trail-draw" pathLength={1} stroke="#e2a02f" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <ol className="relative grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {ABOUT.methodology.steps.map((step, n) => (
                <li key={step} className="rise-in flex flex-col items-center text-center lg:[&:nth-child(1)]:mt-24 lg:[&:nth-child(2)]:mt-[4.5rem] lg:[&:nth-child(3)]:mt-14 lg:[&:nth-child(4)]:mt-8 lg:[&:nth-child(5)]:mt-0">
                  <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-marigold bg-paper font-display text-xl font-semibold text-marigold-ink shadow-[0_8px_20px_-10px_rgb(194_126_24/0.6)]">
                    {n + 1}
                  </span>
                  <span className="mt-4 font-display text-xl font-semibold text-pine-deep">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- WINDOW 3 */}
      <section aria-label="Since 2012" className="landscape-window relative flex min-h-[90svh] items-center py-16">
        <div className="container-rishi relative z-10 grid items-center gap-10 lg:grid-cols-[1fr_0.9fr]">
          <div className="window-card">
            <p className="rise-in font-mono text-xs uppercase tracking-[0.3em] text-pine-deep/80">Project RISHI Berkeley</p>
            <p className="rise-in mt-5 font-display text-[clamp(2.4rem,5.4vw,4.6rem)] font-semibold leading-[1.02] text-pine-deep">
              Since 2012, side by side with Bharog Baneri.
            </p>
          </div>
          {HOME.heroImage && (
            <figure className="rise-in rotate-[1.5deg] rounded-[1.5rem] bg-paper p-3 shadow-[0_40px_80px_-30px_rgb(20_54_40/0.55)]">
              <Media src={HOME.heroImage} alt="The Himalayan foothills near Bharog Baneri" label="Foothills" className="aspect-[4/3] w-full" rounded="rounded-[1.1rem]" sizes="(max-width: 1024px) 100vw, 45vw" />
              <figcaption className="px-2 pb-1 pt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-ink/70">The foothills near Bharog Baneri</figcaption>
            </figure>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------------ JOIN */}
      <section id="join" className="relative px-4 pb-24 sm:px-6">
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
        <Foliage kind="grass" seed={47} className="-bottom-2 -left-6 h-[22vh] w-[36vw] max-w-[480px]" />
      </section>
    </div>
  );
}
