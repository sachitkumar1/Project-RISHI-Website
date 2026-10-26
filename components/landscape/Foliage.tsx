import type { CSSProperties } from "react";

export type Plant = "deodar" | "fern" | "rhodo" | "grass" | "toran";

// natural size of each painting (public/images/foliage, scripts/landscape/foliage-painter.html)
const SIZE: Record<Plant, [number, number]> = {
  deodar: [1100, 478], fern: [640, 892], rhodo: [900, 533], grass: [1100, 356], toran: [2000, 399],
};

/**
 * An illustrated plant that frames the home page's sections, Kage-style.
 *
 * - drifts with the scroll at its own depth (nearer plants move more);
 * - pulls focus: soft as it comes into view, sharp while it's in view, soft again
 *   as it leaves (or, for plants already on screen at load, sharp then soft);
 * - sways gently from the point where it's attached.
 *
 * The blur is a pre-blurred copy cross-faded in (blurring live would cost a lot).
 * Decorative only: hidden from assistive tech and never takes clicks. With
 * reduced motion it's simply a still, sharp picture.
 */
export default function Foliage({
  plant, className = "", depth = 0.6, origin = "50% 0%", focus = "cover", flip = false, eager = false, sway = true,
}: {
  plant: Plant;
  className?: string;
  /** 0 = moves with the page, 1 = drifts the most */
  depth?: number;
  /** the attachment point it sways from, as seen on screen (after any flip) */
  origin?: string;
  /** "cover": soft → sharp → soft; "exit": sharp, softening as it leaves (for plants visible at load) */
  focus?: "cover" | "exit";
  flip?: boolean;
  eager?: boolean;
  sway?: boolean;
}) {
  const [w, h] = SIZE[plant];
  return (
    <div aria-hidden className={`foliage foliage-${focus} pointer-events-none absolute select-none ${className}`} style={{ "--depth": depth } as CSSProperties}>
      <div className="foliage-drift">
        <div className={sway ? "foliage-sway" : undefined} style={{ transformOrigin: origin }}>
          {/* mirrored about its own centre (the sway pivot is given in on-screen terms) */}
          <div className="relative" style={{ aspectRatio: `${w} / ${h}`, transform: flip ? "scaleX(-1)" : undefined }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/images/foliage/${plant}.webp`} alt="" width={w} height={h} loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} className="f-sharp absolute inset-0 h-full w-full" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/images/foliage/${plant}-blur.webp`} alt="" width={w} height={h} loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} className="f-blur absolute inset-0 h-full w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
