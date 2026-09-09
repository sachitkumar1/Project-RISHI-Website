"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Reveal from "@/components/Reveal";
import Contours from "@/components/Contours";
import LmsBoard from "@/components/LmsBoard";
import Avatar from "@/components/Avatar";
import SettingsGear from "@/components/SettingsGear";
import NotificationBell from "@/components/NotificationBell";
import AnnouncementsPanel from "@/components/AnnouncementsPanel";
import NewsletterPanel from "@/components/NewsletterPanel";
import CreateMenu from "@/components/CreateMenu";

export default function DashboardPage() {
  const { data: session } = useSession();
  const firstName = session?.user?.firstName || "Member";
  const [avatar, setAvatar] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string>("");

  useEffect(() => {
    fetch("/api/lms/profile")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setAvatar(d.avatar ?? null);
        setFullName(`${d.firstName} ${d.lastName}`);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      {/* Welcome hero */}
      <section className="relative overflow-hidden bg-pine pt-[var(--header-h)] text-paper">
        <Contours className="absolute inset-0 h-full w-full text-paper" opacity={0.12} />
        <div className="container-rishi relative z-10 py-16 lg:py-20">
          <Reveal>
            <div className="flex items-start justify-between gap-4">
              <span className="eyebrow text-marigold-soft">
                <span className="h-1.5 w-1.5 rounded-full bg-marigold" />
                Member Dashboard
              </span>
              <div className="flex items-center gap-2">
                <NotificationBell />
                <SettingsGear />
              </div>
            </div>
            <div className="mt-5 flex items-center gap-5">
              <Avatar src={avatar} name={fullName || firstName} size={72} className="ring-2 ring-paper/30" />
              <h1 className="font-display text-5xl font-semibold leading-[1.02] sm:text-6xl">
                Welcome, {firstName}
              </h1>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="mt-7 rounded-full border border-paper/30 px-5 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-paper hover:text-pine-deep"
            >
              Sign out
            </button>
          </Reveal>
        </div>
      </section>

      {/* Dashboard tiles */}
      <section className="container-rishi py-16">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="font-display text-2xl font-semibold text-pine-deep">Your dashboard</h2>
          <CreateMenu />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Member Directory (2/3 height) + RISHI Lineage (1/3 height) */}
          <Reveal>
            <div className="grid h-full grid-rows-[2fr_1fr] gap-4">
              <Link
                href="/dashboard/directory"
                className="group flex min-h-0 flex-col justify-between rounded-3xl border border-pine/15 bg-pine/[0.03] p-6 transition-colors hover:border-pine hover:bg-pine hover:text-paper"
              >
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-marigold text-pine-deep">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
                <span className="mt-5 inline-flex items-center gap-2 font-display text-xl font-semibold">
                  Member Directory
                  <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </Link>

              <Link
                href="/dashboard/lineage"
                className="group flex min-h-0 items-center gap-4 rounded-3xl border border-pine/15 bg-pine/[0.03] p-5 transition-colors hover:border-pine hover:bg-pine hover:text-paper"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-marigold text-pine-deep">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="5" r="2.5" />
                    <circle cx="5" cy="19" r="2.5" />
                    <circle cx="19" cy="19" r="2.5" />
                    <path d="M12 7.5v4m0 0H5.5a1 1 0 0 0-1 1v3.5m7.5-4.5H18.5a1 1 0 0 1 1 1v3.5" />
                  </svg>
                </span>
                <span className="font-display text-lg font-semibold leading-tight">
                  RISHI Lineage
                </span>
              </Link>
            </div>
          </Reveal>

          {/* Meetings card */}
          <Reveal delay={0.05}>
            <Link
              href="/dashboard/meetings"
              className="group flex h-full flex-col justify-between rounded-3xl border border-pine/15 bg-pine/[0.03] p-6 transition-colors hover:border-pine hover:bg-pine hover:text-paper"
            >
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-marigold text-pine-deep">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </span>
              <span className="mt-5 inline-flex items-center gap-2 font-display text-xl font-semibold">
                Meetings
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
              <p className="mt-1 text-sm opacity-70">Agendas, notes & tasks by project group</p>
            </Link>
          </Reveal>

          {/* Announcements (top) + Newsletters (bottom) — one tile, equal halves */}
          <Reveal delay={0.1}>
            <div className="grid h-full grid-rows-2 gap-4">
              <div className="min-h-0">
                <AnnouncementsPanel />
              </div>
              <div className="min-h-0">
                <NewsletterPanel />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* LMS board */}
      <section className="container-rishi pb-20">
        <Reveal>
          <h2 className="font-display text-3xl font-semibold text-pine-deep">
            Tasks &amp; Events
          </h2>
          <div className="mt-8">
            <LmsBoard />
          </div>
        </Reveal>
      </section>
    </>
  );
}
