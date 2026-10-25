
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
  // Section headings stand on their own: the small all-caps label above them
  // now appears only once per page, in the page's hero. `eyebrow` and
  // `accent` are accepted but no longer drawn, so call sites stay unchanged.
  void eyebrow; void accent;
  const titleColor = tone === "dark" ? "text-paper" : "text-pine-deep";

  return (
    <div className={align === "center" ? "text-center" : ""}>
      <h2 className={`font-display text-3xl font-semibold sm:text-4xl ${titleColor}`}>
        {title}
      </h2>
    </div>
  );
}
