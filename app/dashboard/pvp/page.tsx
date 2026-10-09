import { notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/lms/currentUser";
import { canUsePvp } from "@/lib/lms/pvp";
import PvpPortal from "@/components/PvpPortal";

export const dynamic = "force-dynamic";

/**
 * The PVP portal lives behind a server-side role check, so the page never even
 * renders for anyone else. Restricted means 404 here, the same as a restricted
 * Files folder — a 403 would confirm the space exists.
 */
export default async function PvpPage() {
  const me = await getCurrentMember();
  if (!canUsePvp(me)) notFound();
  return <PvpPortal />;
}
