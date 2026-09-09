// ============================================================================
//  Realtime broadcast (server side) — fire a "changed" ping to any browser
//  currently viewing a meeting, so they can refetch and show live updates.
//
//  Uses Supabase Realtime's Broadcast REST endpoint with the service key. This
//  is a lightweight pub/sub signal only — it carries no meeting content, so
//  nothing sensitive is exposed. Entirely best-effort: if Supabase/env isn't
//  configured (or the call fails), it no-ops and the meeting still saves fine.
// ============================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function meetingChannel(meetingId: string): string {
  return `meeting:${meetingId}`;
}

/**
 * Notify everyone viewing this meeting that it changed.
 * @param by  the originating client's id — receivers ignore their own echo.
 */
export async function broadcastMeetingChange(
  meetingId: string,
  updatedAt: string,
  by?: string,
): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        messages: [
          {
            topic: meetingChannel(meetingId),
            event: "updated",
            payload: { updatedAt, by: by ?? null },
          },
        ],
      }),
    });
  } catch (e) {
    console.error("realtime: broadcast failed", (e as Error).message);
  }
}
