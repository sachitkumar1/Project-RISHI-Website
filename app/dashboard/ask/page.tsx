import AskPanel from "@/components/AskPanel";

export const metadata = { title: "RISHI AI" };

/** RISHI AI gets the whole page: its own workspace under the site header. */
export default function AskPage() {
  return (
    <div className="pt-[var(--header-h)]">
      <AskPanel />
    </div>
  );
}
