import type { CSSProperties } from "react";

/**
 * A section title. As it scrolls into view its words rise up one after another
 * from behind a mask and a short marigold rule draws in under it — the site's
 * signature heading motion (CSS: "Scroll-in reveals" in globals.css; driven by
 * components/SiteMotion.tsx). Server-rendered fully visible; reduced motion
 * shows it as plain text.
 *
 * The small all-caps label above section headings now appears only once per
 * page, in the hero. `eyebrow` and `accent` are accepted but not drawn, so call
 * sites stay unchanged.
 */
export default function SectionHeading({
  eyebrow,
  title,
  align = "left",
  accent = "marigold",
  tone = "light",
}: {
  eyebrow?: string;
  title: string;
  align?: "left" | "center";
  accent?: "marigold" | "pine";
  /** "light" = for paper/light sections; "dark" = for pine/dark sections */
  tone?: "light" | "dark";
}) {
  void eyebrow; void accent;
  const titleColor = tone === "dark" ? "text-paper" : "text-pine-deep";
  const words = title.split(/\s+/).filter(Boolean);

  return (
    <div data-reveal="words" className={align === "center" ? "text-center" : ""}>
      <h2 className={`font-display text-3xl font-semibold sm:text-4xl ${titleColor}`}>
        {words.map((w, i) => (
          <span key={i}>
            <span className="reveal-mask">
              <span className="reveal-word" style={{ "--w": i } as CSSProperties}>{w}</span>
            </span>
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </h2>
      <span aria-hidden className={`reveal-rule mt-4 block h-[3px] w-12 rounded-full bg-marigold ${align === "center" ? "mx-auto" : ""}`} />
    </div>
  );
}
