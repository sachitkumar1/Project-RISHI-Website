import type { Metadata } from "next";
import { PHOTO_CREDITS } from "@/lib/photoCredits";

export const metadata: Metadata = {
  title: "Photo credits",
  description: "Credits and licences for the landscape photographs on the Project RISHI website.",
};

// Where each photo appears, in page order.
const USES: { title: string; photos: { name: string; where: string }[] }[] = [
  {
    title: "Home page",
    photos: [
      { name: "ranges", where: "Opening view" },
      { name: "valley", where: "Our teams" },
      { name: "terraces", where: "Methodology" },
      { name: "village", where: "Join us" },
    ],
  },
  {
    title: "Page headers",
    photos: [
      { name: "hamlet", where: "About" },
      { name: "fields", where: "Projects, Health" },
      { name: "hillside", where: "Education" },
      { name: "snowline", where: "Water & Sanitation" },
      { name: "slopes", where: "Women's Empowerment, Donate" },
      { name: "deodars", where: "Apply" },
      { name: "dhauladhar", where: "Contact" },
    ],
  },
];

/**
 * Attribution for the landscape photography (required by the photos' Creative
 * Commons licences; linked discreetly from the footer). Photos and licences
 * are listed in lib/photoCredits.ts.
 */
export default function CreditsPage() {
  return (
    <section className="bg-paper pt-[var(--header-h)]">
      <div className="container-rishi max-w-3xl py-16">
        <h1 className="font-display text-4xl font-semibold text-pine-deep">Photo credits</h1>
        <p className="mt-4 text-ink/75">
          Apart from the opening view, the landscape photographs on this site were taken elsewhere in Himachal
          Pradesh and are shown for the landscape they share with Bharog Baneri. They are used under the licences
          below; we have colour-graded and cropped them. Our thanks to the photographers.
        </p>

        {USES.map((group) => (
          <div key={group.title} className="mt-12">
            <h2 className="font-display text-xl font-semibold text-pine-deep">{group.title}</h2>
            <ul className="mt-4 divide-y divide-pine/10 border-y border-pine/10">
              {group.photos.map(({ name, where }) => {
                const c = PHOTO_CREDITS[name];
                return (
                  <li key={name + where} className="flex items-center gap-4 py-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/images/landscape/${name}-1440.avif`} alt="" loading="lazy" decoding="async" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
                    <div className="min-w-0 text-sm text-ink/80">
                      <p className="font-medium text-pine-deep">{c.place}</p>
                      <p className="mt-0.5">
                        {c.license ? (
                          <>
                            Photo by {c.author} ·{" "}
                            <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer license" className="text-pine underline underline-offset-2">{c.license}</a>
                            {" · "}
                            <a href={c.source} target="_blank" rel="noopener noreferrer" className="text-pine underline underline-offset-2">original</a>
                            {" · colour-graded and cropped"}
                          </>
                        ) : (
                          <>Photo by {c.author}</>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-ink/70">Used on: {where}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
