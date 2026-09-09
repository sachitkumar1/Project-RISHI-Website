import Link from "next/link";
import Contours from "@/components/Contours";
import { PROJECT_GROUPS, PROJECT_GROUP_LABELS } from "@/lib/lms/types";

export const metadata = { title: "Meetings" };

const GROUP_BLURB: Record<string, string> = {
  E: "Education", R: "Water & Sanitation", W: "Women's Empowerment", H: "Health",
};

export default function MeetingsHome() {
  return (
    <>
      <section className="relative overflow-hidden bg-pine pt-[var(--header-h)] text-paper">
        <Contours className="absolute inset-0 h-full w-full text-paper" opacity={0.12} />
        <div className="container-rishi relative z-10 py-12">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-paper/80 hover:text-paper">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
            Back to dashboard
          </Link>
          <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">Meetings</h1>
          <p className="mt-2 max-w-2xl text-paper/70"></p>
        </div>
      </section>

      <section className="container-rishi py-10">
        <div className="grid gap-5 sm:grid-cols-2">
          {PROJECT_GROUPS.map((g) => (
            <Link key={g} href={`/dashboard/meetings/g/${g}`}
              className="group flex items-center justify-between rounded-3xl border border-pine/15 bg-pine/[0.03] p-7 transition-colors hover:border-pine hover:bg-pine hover:text-paper">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-marigold-deep group-hover:text-marigold-soft">Project group</p>
                <h2 className="mt-1 font-display text-2xl font-semibold">{PROJECT_GROUP_LABELS[g]}</h2>
                <p className="mt-1 text-sm opacity-70">{GROUP_BLURB[g]} meetings & notes</p>
              </div>
              <svg className="h-6 w-6 transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
