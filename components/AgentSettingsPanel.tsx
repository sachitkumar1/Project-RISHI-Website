"use client";

import { useEffect, useState } from "react";

type Status = {
  keys: { gemini: boolean; anthropic: boolean };
  models: { primary: string[]; fallback: string; haiku: string; embed: string };
  index: { filesPending: number; chunks: number; embedded: number };
  haiku: { spentThisMonth: number; cap: number };
  today: { questions: number; byModel: Record<string, number> };
  exhausted: Record<string, string>;
  lastErrors: Record<string, { at: string; kind: string; message: string; quota: { id: string; value: string } | null }>;
  dailyLimit: number;
  depthCosts?: { label: string; weight: number }[];
};
type Check = { name: string; model: string; ok: boolean; detail: string };

/**
 * Webmaster-only. The Ask agent's search index, model health and Haiku budget.
 * Renders nothing for anyone else (the API returns 403 and we bail).
 */
export default function AgentSettingsPanel() {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"build" | "test" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [checks, setChecks] = useState<{ checks: Check[]; availableGemini: string[] } | null>(null);

  const load = () => fetch("/api/lms/agent").then((r) => (r.ok ? r.json() : null)).then((d) => d && setS(d)).catch(() => {});
  useEffect(() => { void load(); }, []);
  if (!s) return null;

  async function build() {
    setBusy("build"); setMsg(null);
    try {
      // Each call works for ~50s (about 80 embeddings, Google's free pace);
      // keep going while there's work left, up to ~5 minutes per click.
      for (let i = 0; i < 6; i++) {
        const r = await fetch("/api/lms/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "build" }) });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d) throw new Error(d?.chunk?.error || d?.embed?.error || d?.error || "Build failed.");
        setMsg(`Passages: ${d.chunk.chunks ?? 0} new. Embedded ${d.embed.embedded ?? 0}` +
          (d.embed.stoppedBy ? ` — paused: ${d.embed.stoppedBy}` : "") + ".");
        await load();
        // Keep going through pacing pauses (Google's per-minute limit); stop when
        // everything is done or embedding is parked for the day.
        const pacing = /pacing|another build step/.test(d.embed.stoppedBy ?? "");
        if ((d.chunk.remaining ?? 0) === 0 && ((d.embed.remaining ?? 0) === 0 || (d.embed.stoppedBy && !pacing))) break;
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : "Build failed."); }
    finally { setBusy(null); }
  }

  async function test() {
    setBusy("test"); setChecks(null);
    try {
      const r = await fetch("/api/lms/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test" }) });
      setChecks(await r.json());
    } finally { setBusy(null); }
  }

  const pct = s.index.chunks ? Math.round((100 * s.index.embedded) / s.index.chunks) : 0;
  const parked = Object.entries(s.exhausted);

  return (
    <div className="mx-auto mt-6 max-w-xl rounded-3xl border border-pine/15 bg-pine/[0.03] p-8" data-agent-settings>
      <h2 className="font-display text-lg font-semibold text-pine-deep">RISHI AI</h2>
      <p className="mt-1 text-sm text-ink/60">
        Members ask questions and get answers built only from files they can open, with links to each file.
      </p>

      <div className="mt-5 rounded-xl border border-ink/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Search index</p>
            <p className="mt-0.5 text-xs text-ink/55">
              {s.index.chunks.toLocaleString()} passages, {pct}% with meaning-search embeddings
              {s.index.filesPending > 0 ? `; ${s.index.filesPending} files queued` : ""}. The hourly
              files job keeps this up to date; keyword search works even before embedding finishes.
            </p>
          </div>
          <button onClick={() => void build()} disabled={!!busy}
            className="shrink-0 rounded-full bg-pine px-5 py-2 text-sm font-semibold text-paper hover:bg-pine-deep disabled:opacity-50">
            {busy === "build" ? "Building…" : "Build now"}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-ink/10 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Models</p>
            <p className="mt-0.5 text-xs text-ink/55">
              Tried in order: {s.models.primary.join(", ")} (free), then {s.keys.anthropic ? s.models.haiku : "Haiku — no key"} (paid,
              capped), then {s.models.fallback} (free).
            </p>
          </div>
          <button onClick={() => void test()} disabled={!!busy}
            className="shrink-0 rounded-full border border-pine/25 px-5 py-2 text-sm font-semibold text-pine-deep hover:bg-pine/5 disabled:opacity-50">
            {busy === "test" ? "Testing…" : "Test models"}
          </button>
        </div>
        {!s.keys.gemini && <p className="mt-2 text-xs font-semibold text-red-700">GEMINI_API_KEY isn&apos;t set, so Ask is off.</p>}
        {parked.length > 0 && (
          <p className="mt-2 text-xs text-ink/55">
            Skipping for now: {parked.map(([m, until]) => `${m} until ${new Date(until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`).join("; ")}.
          </p>
        )}
        {Object.keys(s.lastErrors ?? {}).length > 0 && (
          <div className="mt-2 space-y-0.5 text-xs text-ink/55">
            <p className="font-semibold text-ink/60">Last time each model was skipped</p>
            {Object.entries(s.lastErrors).map(([m, e]) => (
              <p key={m}>
                <code>{m}</code>, {new Date(e.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}:{" "}
                {e.kind === "overloaded" ? `${m.startsWith("claude") ? "Anthropic" : "Google"} said it was busy`
                  : e.kind === "timeout" ? "it didn't answer within the time this question had left"
                  : e.kind === "quota_day" ? "used up its free daily quota"
                  : e.kind === "quota_minute" ? "hit its per-minute limit"
                  : e.kind === "no_credit" ? "the Anthropic balance ran out"
                  : e.kind}
                {e.quota ? ` (Google's limit: ${e.quota.value}, ${e.quota.id})` : ""}
              </p>
            ))}
          </div>
        )}
        {checks && (
          <ul className="mt-3 space-y-1 text-xs">
            {checks.checks.map((c) => (
              <li key={c.name + c.model} className={c.ok ? "text-pine-deep" : "text-red-700"}>
                {c.ok ? "✓" : "✗"} {c.name} <code>{c.model}</code>: {c.detail}
              </li>
            ))}
            {checks.availableGemini.length > 0 && (
              <li className="text-ink/55">Models this key can use: {checks.availableGemini.join(", ")}</li>
            )}
          </ul>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-ink/10 p-4">
        <p className="text-sm font-semibold text-ink">Usage</p>
        <p className="mt-0.5 text-xs text-ink/55">
          Haiku this month: ${s.haiku.spentThisMonth.toFixed(2)} of ${s.haiku.cap.toFixed(2)}.{" "}
          {s.today.questions} {s.today.questions === 1 ? "answer" : "answers"} today
          {Object.keys(s.today.byModel).length ? ` (${Object.entries(s.today.byModel).map(([m, n]) => `${m}: ${n}`).join(", ")})` : ""}.
          Members get {s.dailyLimit} credits a day: {(s.depthCosts ?? []).map((d) => `${d.label} ${d.weight}`).join(", ")}.
        </p>
      </div>

      {msg && <p className="mt-3 text-sm text-ink/70">{msg}</p>}
    </div>
  );
}
