import { redirect } from "next/navigation";

/** Meetings now live inside the Files section. Old links keep working. */
export default function MeetingsMoved() {
  redirect("/dashboard/files/meetings");
}
