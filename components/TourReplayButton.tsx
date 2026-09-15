"use client";

/**
 * Restarts the guided tour. Clearing the stored completion first means the
 * tour also reappears on their next sign-in elsewhere, which matches what
 * someone asking to "go through it again" expects.
 */
export default function TourReplayButton() {
  return (
    <div className="mx-auto mt-6 max-w-xl rounded-3xl border border-pine/15 bg-pine/[0.03] p-8">
      <h2 className="font-display text-lg font-semibold text-pine-deep">Site tour</h2>
      <p className="mt-1 text-sm text-ink/60">
        A short walkthrough of everything on the dashboard, tailored to your role in the club.
      </p>
      <button
        onClick={async () => {
          try {
            await fetch("/api/lms/tour", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ done: false }),
            });
          } catch { /* the tour still runs even if this didn't save */ }
          window.dispatchEvent(new Event("rishi:start-tour"));
        }}
        className="mt-4 rounded-full bg-pine px-5 py-2 text-sm font-semibold text-paper hover:bg-pine-deep"
      >
        Take the tour again
      </button>
    </div>
  );
}
