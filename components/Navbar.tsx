"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { NAV } from "@/lib/content";

function Wordmark() {
  return (
    <Link href="/" className="flex items-center" aria-label="Project RISHI home">
      <Image
        src="/images/project-rishi-logo.png"
        alt="Project RISHI"
        width={260}
        height={130}
        priority
        data-logo="light"
        className="h-12 w-auto"
      />
      {/* Same logo with light lettering, shown only in dashboard dark mode. */}
      <Image
        src="/images/project-rishi-logo-dark.png"
        alt="Project RISHI"
        width={260}
        height={130}
        data-logo="dark"
        className="h-12 w-auto"
      />
    </Link>
  );
}

export default function Navbar() {
  const pathname = usePathname();
  const { status } = useSession();
  const isMember = status === "authenticated";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    setProjOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 border-b border-pine/10 bg-paper/90 backdrop-blur-md"
      style={{ height: "var(--header-h)" }}
    >
      <nav className="container-rishi flex h-full items-center justify-between">
        <Wordmark />

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) =>
            item.children ? (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => setProjOpen(true)}
                onMouseLeave={() => setProjOpen(false)}
              >
                <Link
                  href={item.href}
                  className={`flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? "text-pine"
                      : "text-ink/70 hover:text-pine"
                  }`}
                >
                  {item.label}
                  <svg
                    className={`h-3.5 w-3.5 transition-transform ${projOpen ? "rotate-180" : ""}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </Link>
                <AnimatePresence>
                  {projOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.18 }}
                      className="absolute left-0 top-full w-60 pt-2"
                    >
                      <div className="overflow-hidden rounded-2xl border border-pine/10 bg-paper p-2 shadow-xl shadow-pine/10">
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={`block rounded-xl px-4 py-2.5 text-sm transition-colors ${
                              pathname === child.href
                                ? "bg-pine/5 text-pine"
                                : "text-ink/75 hover:bg-pine/5 hover:text-pine"
                            }`}
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? "text-pine"
                    : "text-ink/70 hover:text-pine"
                }`}
              >
                {item.label}
              </Link>
            )
          )}
          {isMember && (
            <Link
              href="/dashboard"
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                isActive("/dashboard")
                  ? "text-pine"
                  : "text-pine/90 hover:text-pine"
              }`}
            >
              Dashboard
            </Link>
          )}
          <Link href="/apply" className="btn-accent ml-2 px-5 py-2.5 text-sm">
            Join Us
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="grid h-10 w-10 place-items-center rounded-full text-pine lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          <div className="relative h-4 w-6">
            <span
              className={`absolute left-0 h-0.5 w-6 bg-current transition-all duration-300 ${
                mobileOpen ? "top-1.5 rotate-45" : "top-0"
              }`}
            />
            <span
              className={`absolute left-0 top-1.5 h-0.5 w-6 bg-current transition-all duration-300 ${
                mobileOpen ? "opacity-0" : "opacity-100"
              }`}
            />
            <span
              className={`absolute left-0 h-0.5 w-6 bg-current transition-all duration-300 ${
                mobileOpen ? "top-1.5 -rotate-45" : "top-3"
              }`}
            />
          </div>
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            className="overflow-hidden border-t border-pine/10 bg-paper lg:hidden"
          >
            <div className="container-rishi flex flex-col gap-1 py-4">
              {NAV.map((item) => (
                <div key={item.label}>
                  <Link
                    href={item.href}
                    className="block rounded-xl px-3 py-2.5 text-base font-medium text-ink/80"
                  >
                    {item.label}
                  </Link>
                  {item.children && (
                    <div className="ml-3 border-l border-pine/15 pl-3">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className="block rounded-xl px-3 py-2 text-sm text-ink/65"
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {isMember && (
                <Link
                  href="/dashboard"
                  className="block rounded-xl px-3 py-2.5 text-base font-semibold text-pine"
                >
                  Dashboard
                </Link>
              )}
              <Link href="/apply" className="btn-accent mt-3 w-full">
                Join Us
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
