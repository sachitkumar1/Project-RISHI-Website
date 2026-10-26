import Link from "next/link";
import Media from "@/components/Media";
import Reveal from "@/components/Reveal";
import SectionHeading from "@/components/SectionHeading";
import { PROJECTS, LINKS } from "@/lib/content";
import HeaderScenery, { type HeaderPhoto } from "@/components/landscape/HeaderScenery";

// each project page opens on a different hillside
const HEADER_PHOTO: Record<string, HeaderPhoto> = {
  education: "hillside",
  "water-sanitation": "snowline",
  "womens-empowerment": "slopes",
  health: "fields",
};

type Project = (typeof PROJECTS)[number];

export default function ProjectPage({ project }: { project: Project }) {
  const others = PROJECTS.filter((p) => p.slug !== project.slug);

  return (
    <article>
      {/* Hero */}
      <section className="dawn-header relative overflow-hidden pt-[var(--header-h)] text-paper">
        <HeaderScenery photo={HEADER_PHOTO[project.slug] ?? "hillside"} />
        <div className="container-rishi relative z-10 grid gap-8 py-10 lg:grid-cols-2 lg:items-center lg:py-12">
          <Reveal>
            <span className="eyebrow text-marigold-soft">
              <span className="h-1.5 w-1.5 rounded-full bg-marigold" />
              Project Team
            </span>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.05] sm:text-6xl">
              {project.name}
            </h1>
            <p className="mt-6 max-w-xl text-paper/90">{project.intro}</p>
          </Reveal>
          <Reveal delay={0.12}>
            <Media
              src={(project as { heroImage?: string | null }).heroImage ?? null}
              alt={`${project.name} team in Bharog Baneri`}
              label={`${project.name} hero photo`}
              className="aspect-[4/3] w-full"
              rounded="rounded-3xl"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </Reveal>
        </div>
      </section>

      {/* Quote */}
      {project.quote && (
        <section className="bg-marigold/10">
          <div className="container-rishi py-14">
            <Reveal className="mx-auto max-w-3xl text-center">
              <p className="font-display text-2xl italic leading-snug text-pine-deep sm:text-3xl">
                &ldquo;{project.quote}&rdquo;
              </p>
              {project.quoteAuthor && (
                <p className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-sage-deep">
                  — {project.quoteAuthor}
                </p>
              )}
            </Reveal>
          </div>
        </section>
      )}

      {/* Highlights */}
      <section className="container-rishi py-20">
        <SectionHeading eyebrow="This term" title="Project Highlights" />
        <div
          className={`mt-10 grid gap-8 ${
            project.highlights.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"
          }`}
        >
          {project.highlights.map((h, i) => (
            <Reveal as="article" key={h.title} delay={i * 0.08} className="group">
              <Media
                src={h.image}
                alt={h.title}
                label={`${h.title} photo`}
                className="aspect-[16/10] w-full"
              />
              <h3 className="mt-5 font-display text-xl font-semibold text-pine-deep">
                {h.title}
              </h3>
              <p className="mt-2 text-ink/70">{h.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Past projects */}
      <section className="bg-pine-deep py-20 text-paper">
        <div className="container-rishi">
          <SectionHeading eyebrow="Our track record" title="Past Projects" accent="pine" tone="dark" />
          <div className="mt-10 grid gap-px overflow-hidden rounded-3xl border border-paper/10 bg-paper/10 sm:grid-cols-2">
            {project.past.map((p, i) => (
              <Reveal
                as="div"
                key={p.title}
                delay={i * 0.06}
                className="bg-pine-deep p-7"
              >
                <span className="font-display text-sm text-marigold">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 font-display text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm text-paper/70">{p.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA + other projects */}
      <section className="container-rishi py-20">
        <div className="rounded-3xl bg-marigold/15 p-8 text-center sm:p-12">
          <Reveal>
            <h2 className="font-display text-3xl font-semibold text-pine-deep">
              Want to work on {project.name}?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-ink/70">
              We recruit at the start of every Fall and Spring semester. Come find
              your team.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/apply" className="btn-primary">
                Apply to join
              </Link>
              <a href={LINKS.donate} className="btn-ghost">
                Support our work
              </a>
            </div>
          </Reveal>
        </div>

        <div className="mt-14">
          <p className="eyebrow text-sage-deep">Other teams</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {others.map((o) => (
              <Link
                key={o.slug}
                href={`/projects/${o.slug}`}
                className="group flex items-center justify-between rounded-2xl border border-pine/15 p-5 transition-colors hover:border-pine hover:bg-pine hover:text-paper"
              >
                <span className="font-display text-lg font-semibold">{o.name}</span>
                <svg
                  className="h-5 w-5 transition-transform group-hover:translate-x-1"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </article>
  );
}
