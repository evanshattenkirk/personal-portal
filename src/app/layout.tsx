import { Suspense } from "react";
import type { Metadata } from "next";
import Nav from "@/components/Nav";
import { BRAND } from "@/components/brand";
import { isDemoMode } from "@/lib/data";
import "./globals.css";
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
    <html lang="en">
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
          <span>
            <b>{BRAND.toUpperCase()}</b> · A little more life, a little less admin.
          </span>
          <span>Private by design · Times in Chicago unless noted</span>
        </footer>
      </body>
    </html>
  );
}
