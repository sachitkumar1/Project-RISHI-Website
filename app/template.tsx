/**
 * Re-mounts on every navigation, so each new page fades in softly
 * (.page-enter in globals.css: opacity only, reduced-motion aware).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
