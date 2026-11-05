import { Suspense } from "react";
import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import { BRAND } from "@/components/brand";
import { isDemoMode } from "@/lib/data";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--f-archivo",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--f-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: BRAND, template: `%s · ${BRAND}` },
  description:
    "A personal home for trips, next steps, points, and the places worth going.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Suspense
          fallback={
            <header className="site-header">
              <div className="nav-wrap brand">{BRAND}</div>
            </header>
          }
        >
          <Nav demo={isDemoMode()} />
        </Suspense>
        <main id="main" className="main-shell">
          {children}
        </main>
        <footer className="site-footer">
          <span>{BRAND} · Times in Chicago unless noted</span>
          <span>A little more life, a little less admin.</span>
        </footer>
      </body>
    </html>
  );
}
