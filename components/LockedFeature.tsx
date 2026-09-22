import Link from "next/link";

/** Shown in place of a feature new members can't use until they're placed in a
 *  project group (server-rendered, so the feature itself never loads). */
export default function LockedFeature({ name }: { name: string }) {
  return (
    <section className="pt-[var(--header-h)]">
      <div className="container-rishi grid min-h-[60vh] place-items-center py-16">
        <div data-locked-feature className="max-w-md rounded-3xl border border-pine/15 bg-pine/[0.03] p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ink/10 text-ink/70">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <h1 className="mt-5 font-display text-2xl font-semibold text-pine-deep">{name} is locked for now</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink/65">
            It unlocks as soon as you&apos;re placed in a project group. Until then, you can use the rest of the dashboard as usual.
          </p>
          <Link href="/dashboard" className="btn-primary mt-6 inline-flex text-sm">Back to dashboard</Link>
        </div>
      </div>
    </section>
  );
}
