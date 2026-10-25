import Image from "next/image";
import { placeholderFor } from "@/lib/imagePlaceholders";

/**
 * Media — a drop-in image slot.
 *
 *  • If `src` is null/empty, it renders a labelled placeholder box telling you
 *    exactly what image belongs there. (Search the codebase for these labels.)
 *  • Once you set `src` (e.g. "/images/hero.jpg" after adding the file to
 *    public/images/), it renders the real photo, cropped to fill its frame.
 *
 *  Set the frame size with `className` (height/aspect) on the parent usage.
 */
export default function Media({
  src,
  alt,
  label,
  className = "",
  rounded = "rounded-2xl",
  priority = false,
  sizes = "100vw",
}: {
  src?: string | null;
  alt: string;
  label?: string;
  className?: string;
  rounded?: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (src) {
    // Site photos have a precomputed blurred preview, shown at the frame's
    // exact size until the photo arrives (lib/imagePlaceholders.ts).
    const ph = placeholderFor(src);
    return (
      <div className={`relative overflow-hidden ${rounded} ${className}`}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          placeholder={ph ? "blur" : "empty"}
          blurDataURL={ph?.blur}
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden border border-dashed border-neutral-400/45 bg-neutral-400/15 ${rounded} ${className}`}
      role="img"
      aria-label={`Image placeholder: ${label ?? alt}`}
    >
      {/* subtle diagonal texture, visible on light and dark */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(128,128,128,0.10) 0 10px, transparent 10px 20px)",
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-2 px-4 text-center">
        <svg
          className="h-7 w-7 text-neutral-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
        <span className="rounded-full bg-ink/65 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-paper">
          {label ?? "Add image"}
        </span>
      </div>
    </div>
  );
}
