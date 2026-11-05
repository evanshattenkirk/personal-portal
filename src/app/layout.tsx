import { Suspense } from "react";
import type { Metadata } from "next";
import {
  Archivo,
  IBM_Plex_Mono,
  Newsreader,
  Schibsted_Grotesk,
  Bricolage_Grotesque,
  Spline_Sans_Mono,
} from "next/font/google";
import Nav from "@/components/Nav";
import { isDemoMode } from "@/lib/data";
import "./globals.css";

// Direction preview: all three candidate pairings load; the chosen one stays.
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--f-archivo", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-plex-mono", display: "swap" });
const newsreader = Newsreader({ subsets: ["latin"], axes: ["opsz"], style: ["normal", "italic"], variable: "--f-newsreader", display: "swap" });
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], variable: "--f-schibsted", display: "swap" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], axes: ["opsz", "wdth"], variable: "--f-bricolage", display: "swap" });
const spline = Spline_Sans_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-spline-mono", display: "swap" });
const fontVars = [archivo, plexMono, newsreader, schibsted, bricolage, spline]
  .map((f) => f.variable)
  .join(" ");

export const metadata: Metadata = {
  title: { default: "Evan’s Fieldbook", template: "%s · Evan’s Fieldbook" },
  description:
    "A personal home for trips, next steps, points, and the places worth going.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={fontVars}
      data-direction={process.env.NEXT_PUBLIC_PORTAL_DIRECTION ?? "b"}
    >
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Suspense
          fallback={
            <header className="site-header">
              <div className="nav-wrap brand">Evan’s Fieldbook</div>
            </header>
          }
        >
          <Nav demo={isDemoMode()} />
        </Suspense>
        <main id="main" className="main-shell">
          {children}
        </main>
        <footer className="site-footer">
          <span>Evan’s Fieldbook · Times in Chicago unless noted</span>
          <span>A little more life, a little less admin.</span>
        </footer>
      </body>
    </html>
  );
}
