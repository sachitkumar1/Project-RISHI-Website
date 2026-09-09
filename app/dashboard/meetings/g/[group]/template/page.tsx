"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Contours from "@/components/Contours";
import MeetingOutline, { type Block } from "@/components/MeetingOutline";

const GROUP_LABEL: Record<string, string> = {
  E: "Education", R: "Water & Sanitation", W: "Women's Empowerment", H: "Health",
};

export default function TemplateEditor({ params }: { params: { group: string } }) {
  const { group } = params;
  const router = useRouter();
  const label = GROUP_LABEL[group] ?? group;

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/lms/meetings/template?group=${group}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setBlocks(d.template.blocks); setCanEdit(d.canEdit); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [group]);

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/lms/meetings/template", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group, blocks }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Couldn't save.");
      setMsg("Template saved — new meetings will start from this.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Couldn't save."); }
    setSaving(false);
  }

  return (
    <>
      <section className="relative overflow-hidden bg-pine pt-[var(--header-h)] text-paper">
        <Contours className="absolute inset-0 h-full w-full text-paper" opacity={0.12} />
        <div className="container-rishi relative z-10 py-10">
          <Link href={`/dashboard/meetings/g/${group}`} className="inline-flex items-center gap-2 text-sm font-semibold text-paper/80 hover:text-paper">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
            {label} meetings
          </Link>
          <h1 className="mt-4 font-display text-4xl font-semibold sm:text-5xl">{label} Template</h1>
          <p className="mt-2 max-w-2xl text-paper/70">The starting outline for every new {label} meeting — standing sections, the icebreaker, recurring topics. Editing it doesn't change past meetings.</p>
        </div>
      </section>

      <section className="container-rishi max-w-4xl py-8">
        {loading && <p className="text-ink/50">Loading…</p>}
        {!loading && !canEdit && <p className="rounded-2xl border border-pine/12 bg-pine/[0.02] p-6 text-sm text-ink/55">Only {label} leads can edit this template.</p>}
        {!loading && canEdit && (
          <>
            <div className="rounded-3xl border border-pine/12 bg-paper p-6">
              <MeetingOutline blocks={blocks} editable onChange={setBlocks} />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button onClick={save} disabled={saving} className="rounded-full bg-pine px-5 py-2.5 text-sm font-semibold text-paper hover:bg-pine-deep disabled:opacity-60">{saving ? "Saving…" : "Save template"}</button>
              <button onClick={() => router.push(`/dashboard/meetings/g/${group}`)} className="rounded-full border border-pine/20 px-5 py-2.5 text-sm font-semibold text-pine-deep hover:bg-pine/5">Done</button>
              {msg && <span className="text-sm text-ink/70">{msg}</span>}
            </div>
          </>
        )}
      </section>
    </>
  );
}
