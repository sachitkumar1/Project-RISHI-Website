import Link from "next/link";
import Contours from "@/components/Contours";
import AskPanel from "@/components/AskPanel";

export const metadata = { title: "Ask" };

export default function AskPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-pine pt-[var(--header-h)] text-paper">
        <Contours className="absolute inset-0 h-full w-full text-paper" opacity={0.12} />
        <div className="container-rishi relative z-10 py-12">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-paper/80 hover:text-paper">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
            Back to dashboard
          </Link>
          <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">Ask the archive</h1>
        </div>
      </section>
      <section className="container-rishi py-10">
        <div className="mx-auto max-w-3xl">
          <AskPanel />
        </div>
      </section>
    </>
  );
}
