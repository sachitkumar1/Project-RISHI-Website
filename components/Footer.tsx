import Link from "next/link";
import { ORG, LINKS, NAV } from "@/lib/content";
import Newsletter from "@/components/Newsletter";
import Contours from "@/components/Contours";

function Social({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-full border border-paper/20 text-paper/80 transition-colors hover:border-marigold hover:bg-marigold hover:text-pine-deep"
    >
      {children}
    </a>
  );
}

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-pine-deep pb-[var(--safe-bottom)] text-paper">
      <Contours className="absolute inset-x-0 bottom-0 h-64 w-full text-marigold" opacity={0.12} />

      <div className="container-rishi relative z-10 py-16">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr_1.2fr]">
          {/* Brand + contact */}
          <div>
            <p className="font-display text-2xl font-semibold">{ORG.name}</p>
            <p className="mt-1 text-sm uppercase tracking-[0.2em] text-marigold-soft">
              {ORG.chapter}
            </p>
            <div className="mt-6 space-y-2 text-sm text-paper/70">
              <p>
                General inquiries —{" "}
                <a href={`mailto:${ORG.email}`} className="text-paper underline-offset-2 hover:underline">
                  {ORG.email}
                </a>
              </p>
              <p>{ORG.address}</p>
            </div>
            <div className="mt-6 flex gap-3">
              <Social href={LINKS.instagram} label="Instagram">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </Social>
              <Social href={LINKS.facebook} label="Facebook">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.5 21v-7h2.4l.4-2.8h-2.8V9.4c0-.8.2-1.4 1.4-1.4h1.5V5.5c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2H8.2V14h2.3v7h3z" />
                </svg>
              </Social>
            </div>
          </div>

          {/* Explore */}
          <div>
            <p className="eyebrow text-marigold-soft">Explore</p>
            <ul className="mt-4 space-y-2.5 text-sm [@media(pointer:coarse)]:space-y-0">
              {NAV.flatMap((item) =>
                item.children
                  ? item.children
                  : [{ label: item.label, href: item.href }]
              ).map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="no-hit-slop inline-flex items-center text-paper/70 transition-colors hover:text-paper [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11">
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/apply" className="no-hit-slop inline-flex items-center text-paper/70 transition-colors hover:text-paper [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11">
                  Apply
                </Link>
              </li>
              <li>
                <a
                  href={LINKS.nationalSite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="no-hit-slop inline-flex items-center text-paper/70 transition-colors hover:text-paper [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
                >
                  National Project RISHI
                </a>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <Newsletter />
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start gap-4 border-t border-paper/15 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-paper/50">{ORG.copyright}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href="/privacy" className="text-xs text-paper/50 transition-colors hover:text-paper">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-xs text-paper/50 transition-colors hover:text-paper">
              Terms of Service
            </Link>
            <span className="text-xs text-paper/50">
              Promoting sustainable development since 2008.
            </span>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border border-paper/30 bg-paper/5 px-4 py-2 text-sm font-semibold text-paper transition-colors hover:border-marigold hover:bg-marigold hover:text-pine-deep"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="11" width="16" height="9" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              Member Login
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
