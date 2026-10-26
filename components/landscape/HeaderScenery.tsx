/** Landscape photos prepared for page headers (scripts/landscape/prepare_photos.py). */
export type HeaderPhoto = "hamlet" | "fields" | "hillside" | "slopes" | "deodars" | "dhauladhar" | "snowline";

const FOCUS: Record<HeaderPhoto, string> = {
  hamlet: "50% 45%", fields: "50% 50%", hillside: "60% 50%", slopes: "50% 55%",
  deodars: "40% 50%", dhauladhar: "50% 60%", snowline: "50% 40%",
};

/**
 * The backdrop for the public pages' headers (About, Projects, the four
 * project pages, Apply, Contact, Donate): a real photograph of the Himachal
 * hills under a shade dark enough for light text, settling slowly as you scroll
 * away (credits: /credits, linked from the footer). Pair with a section carrying the
 * `dawn-header` class (globals.css).
 *
 * `shade`: "side" darkens the left (text on the left), "even" darkens evenly
 * (centred text).
 */
export default function HeaderScenery({ photo, shade = "side" }: { photo: HeaderPhoto; shade?: "side" | "even" }) {
  return (
    <>
      <div aria-hidden className="header-photo pointer-events-none absolute inset-0 overflow-clip">
        <picture>
          <source type="image/avif" srcSet={`/images/landscape/${photo}-1440.avif 1440w, /images/landscape/${photo}-1920.avif 1920w`} sizes="100vw" />
          <img
            src={`/images/landscape/${photo}-1600.webp`}
            alt=""
            fetchPriority="high"
            decoding="async"
            className="h-full w-full object-cover"
            style={{ objectPosition: FOCUS[photo] }}
          />
        </picture>
        <div className={`absolute inset-0 ${shade === "side" ? "header-shade-side" : "header-shade-even"}`} />
      </div>
    </>
  );
}
