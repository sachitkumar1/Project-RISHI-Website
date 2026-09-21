import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./dark-theme.css"; // dashboard dark mode (generated: scripts/gen-dark-theme.mjs)
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BackButton from "@/components/BackButton";
import AuthProvider from "@/components/AuthProvider";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

// Self-hosted variable fonts (no network needed at build time).
const fraunces = localFont({
  src: [
    { path: "./fonts/Fraunces.woff2", style: "normal" },
    { path: "./fonts/Fraunces-Italic.woff2", style: "italic" },
  ],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = localFont({
  src: [{ path: "./fonts/Inter.woff2", style: "normal" }],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Project RISHI @ UC Berkeley | Promoting Sustainable Development",
    template: "%s | Project RISHI @ UC Berkeley",
  },
  description:
    "Project RISHI is a student-run non-profit promoting the sustainable development and growth of rural Indian communities.",
  openGraph: {
    title: "Project RISHI @ UC Berkeley",
    description:
      "Promoting the sustainable development and growth of rural Indian communities.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply dashboard dark mode before first paint (no flash of light theme). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(location.pathname.indexOf("/dashboard")===0&&localStorage.getItem("rishi:theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <Navbar />
          <BackButton />
          <main>{children}</main>
          <Footer />
        </AuthProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
