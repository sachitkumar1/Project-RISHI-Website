import { PHOTO_CREDITS, type PhotoCredit } from "@/lib/photoCredits";

/** One photo's credit: place, photographer, licence, and a link to the original. */
export function PhotoCreditLink({ name, className = "" }: { name: string; className?: string }) {
  const c: PhotoCredit | undefined = PHOTO_CREDITS[name];
  if (!c) return null;
  if (!c.license) return <span className={className}>{c.place}</span>;
  return (
    <span className={className}>
      <a href={c.source} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{c.place}</a>
      {" · "}photo {c.author},{" "}
      <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer license" className="underline-offset-2 hover:underline">{c.license}</a>
      , colour-graded and cropped
    </span>
  );
}
