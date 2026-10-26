import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PHOTO_CREDITS } from "@/lib/photoCredits";

export const metadata: Metadata = {
  title: "Photo credits",
  description: "Credits and licences for the landscape photographs on the Project RISHI website.",
};

// The opening 3D view of the home page is built from open geographic data.
const AERIAL_SOURCES: { what: string; credit: ReactNode }[] = [
  {
    what: "Terrain (Sirmaur and Churdhar)",
    credit: (
      <>
        Copernicus DEM GLO-30 · © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under
        COPERNICUS by the European Union and ESA; all rights reserved ·{" "}
        <a href="https://registry.opendata.aws/copernicus-dem/" target="_blank" rel="noopener noreferrer" className="text-pine underline underline-offset-2">source</a>
      </>
    ),
  },
  {
    what: "Terrain (the Himalaya beyond)",
    credit: (
      <>
        Terrain Tiles (SRTM, GMTED2010 and others) via Amazon Web Services Open Data ·{" "}
        <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener noreferrer" className="text-pine underline underline-offset-2">attribution</a>
      </>
    ),
  },
  {
    what: "Satellite imagery",
    credit: (
      <>
        <a href="https://s2maps.eu" target="_blank" rel="noopener noreferrer" className="text-pine underline underline-offset-2">Sentinel-2 cloudless</a> by EOX IT Services GmbH
        (contains modified Copernicus Sentinel data 2022) ·{" "}
        <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer license" className="text-pine underline underline-offset-2">CC BY-NC-SA 4.0</a>
        {" · re-lit for dawn"}
      </>
    ),
  },
  { what: "Clouds", credit: <>Cut from Project RISHI&rsquo;s own photo of the foothills near Bharog Baneri</> },
];

// Where each photo appears, in page order.
const USES: { title: string; photos: { name: string; where: string }[] }[] = [
  {
    title: "Home page: photographs",
    photos: [
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
          The home page opens on a 3D view of the real hills of Sirmaur, Bharog Baneri&rsquo;s district, built from the
          open data below. The landscape photographs after it were taken elsewhere in Himachal Pradesh and are shown
          for the landscape they share with Bharog Baneri; we have colour-graded and cropped them. Our thanks to the
          photographers and to the data providers.
        </p>

        <div className="mt-12">
          <h2 className="font-display text-xl font-semibold text-pine-deep">Home page: opening view</h2>
          <ul className="mt-4 divide-y divide-pine/10 border-y border-pine/10">
            {AERIAL_SOURCES.map((x) => (
              <li key={x.what} className="py-4 text-sm text-ink/80">
                <p className="font-medium text-pine-deep">{x.what}</p>
                <p className="mt-0.5">{x.credit}</p>
              </li>
            ))}
          </ul>
        </div>

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
