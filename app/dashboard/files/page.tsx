import Link from "next/link";
import FilesBrowser from "@/components/FilesBrowser";
import { PROJECT_GROUPS, PROJECT_GROUP_LABELS } from "@/lib/lms/types";
import DashboardBanner from "@/components/DashboardBanner";

export const metadata = { title: "Files" };

export default function FilesHome() {
  return (
    <>
      <DashboardBanner>
        <div className="container-rishi relative z-10 py-12">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-semibold text-paper/80 hover:text-paper"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M11 6l-6 6 6 6" />
            </svg>
            Back to dashboard
          </Link>
          <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">Files</h1>
          
        </div>
      </DashboardBanner>

      {/* Meetings — pinned above the folders, since it's the thing people open most. */}
      <section className="container-rishi pt-10">
        <div className="rounded-3xl border border-pine/15 bg-pine/[0.03] p-6 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold text-pine-deep">Meeting notes</h2>
            <Link href="/dashboard/files/meetings" className="text-sm font-semibold text-pine hover:underline">
              All meetings
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PROJECT_GROUPS.map((g) => (
              <Link
                key={g}
                href={`/dashboard/files/meetings/g/${g}`}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-pine/15 bg-paper p-4 transition-colors hover:border-pine hover:bg-pine hover:text-paper"
              >
                <span className="font-display text-base font-semibold leading-tight">
                  {PROJECT_GROUP_LABELS[g]}
                </span>
                <svg
                  className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="container-rishi py-10">
        <FilesBrowser />
      </section>
    </>
  );
}
