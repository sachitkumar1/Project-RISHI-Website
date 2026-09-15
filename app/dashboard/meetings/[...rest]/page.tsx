import { redirect } from "next/navigation";

/**
 * Anything under the old /dashboard/meetings/… tree — a bookmarked meeting, a
 * link in an old email — lands on the same page in its new location.
 */
export default function MeetingSubpathMoved({ params }: { params: { rest: string[] } }) {
  redirect(`/dashboard/files/meetings/${(params.rest ?? []).join("/")}`);
}
