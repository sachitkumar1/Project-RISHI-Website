"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Contours from "@/components/Contours";

const GROUP_LABEL: Record<string, string> = {
  E: "Education", R: "Water & Sanitation", W: "Women's Empowerment", H: "Health",
};

type MeetingRow = {
  id: string; title: string; date: string | null; location: string;
  notetaker: string; blockCount: number; createdAt: string;
};

export default function GroupMeetings({ params }: { params: { group: string } }) {
  const { group } = params;
  const router = useRouter();
  const label = GROUP_LABEL[group] ?? group;

  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch(`/api/lms/meetings?group=${group}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setMeetings(d.meetings); setCanCreate(d.canCreate); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [group]);

  async function newMeeting() {
    setCreating(true);
    try {
      const r = await fetch("/api/lms/meetings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group, title: "", date: new Date().toISOString().slice(0, 10) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || "Couldn't create the meeting.");
      router.push(`/dashboard/meetings/m/${d.meeting.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't create the meeting.");
      setCreating(false);
    }
  }

  const fmt = (d: string | null, created: string) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric", year: "numeric" })
      : new Date(created).toLocaleDateString();

  return (
    <>
      <section className="relative overflow-hidden bg-pine pt-[var(--header-h)] text-paper">
        <Contours className="absolute inset-0 h-full w-full text-paper" opacity={0.12} />
        <div className="container-rishi relative z-10 py-12">
          <Link href="/dashboard/meetings" className="inline-flex items-center gap-2 text-sm font-semibold text-paper/80 hover:text-paper">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
            All groups
          </Link>
          <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">{label} Meetings</h1>
        </div>
      </section>

      <section className="container-rishi py-10">
        {canCreate && (
          <div className="mb-6 flex flex-wrap gap-3">
            <button onClick={newMeeting} disabled={creating}
              className="rounded-full bg-pine px-5 py-2.5 text-sm font-semibold text-paper hover:bg-pine-deep disabled:opacity-60">
              {creating ? "Creating…" : "+ New meeting"}
            </button>
            <Link href={`/dashboard/meetings/g/${group}/template`}
              className="rounded-full border border-pine/25 px-5 py-2.5 text-sm font-semibold text-pine-deep hover:bg-pine/5">
              Edit template
            </Link>
          </div>
        )}

        {loading && <p className="text-ink/50">Loading…</p>}
        {!loading && meetings.length === 0 && (
          <div className="rounded-2xl border border-dashed border-pine/20 bg-pine/[0.02] p-10 text-center">
            <p className="text-ink/55">No meetings yet.</p>
            {canCreate && <p className="mt-1 text-sm text-ink/40">Create the first one — it'll start from this group's template.</p>}
          </div>
        )}

        <div className="space-y-3">
          {meetings.map((m) => (
            <Link key={m.id} href={`/dashboard/meetings/m/${m.id}`}
              className="flex items-center gap-4 rounded-2xl border border-pine/12 bg-paper p-5 transition-colors hover:border-pine/40">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pine/[0.06] text-pine-deep">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg font-semibold text-pine-deep">{m.title || "Untitled meeting"}</p>
                <p className="mt-0.5 text-sm text-ink/55">
                  {fmt(m.date, m.createdAt)}{m.location ? ` · ${m.location}` : ""}
                </p>
              </div>
              <svg className="h-5 w-5 shrink-0 text-ink/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6" /></svg>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
