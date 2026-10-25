"use client";

/**
 * Circular avatar. Shows the member's cropped photo if they have one, otherwise
 * the default grey-person icon. Used big on the dashboard/settings and small
 * next to assignee names in the task board.
 */
export default function Avatar({
  src,
  name,
  size = 40,
  className = "",
}: {
  src?: string | null;
  name?: string;
  size?: number;
  className?: string;
}) {
  const dim = { width: size, height: size };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name ? `${name}'s profile photo` : "Profile photo"}
        width={size}
        height={size}
        style={dim}
        className={`shrink-0 rounded-full object-cover ring-1 ring-black/5 ${className}`}
      />
    );
  }
  return (
    <span
      style={dim}
      role="img"
      aria-label={name ? `${name} (no profile photo)` : "No profile photo"}
      className={`grid shrink-0 place-items-center rounded-full bg-ink/10 text-ink/65 ring-1 ring-black/5 ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: size * 0.62, height: size * 0.62 }}>
        <path d="M12 12.75a4.125 4.125 0 1 0 0-8.25 4.125 4.125 0 0 0 0 8.25Zm0 1.5c-3.32 0-7.5 1.67-7.5 4.5v.75c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-.75c0-2.83-4.18-4.5-7.5-4.5Z" />
      </svg>
    </span>
  );
}
