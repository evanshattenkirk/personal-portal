import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import { isMisconfiguredProduction } from "@/lib/data";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Evan's Portal",
  description: "Private home base: trips, points, deadlines, and project links.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-950 text-zinc-100">
        <Nav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          {isMisconfiguredProduction() ? (
            <div className="mx-auto max-w-xl rounded-xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-200">
              <p className="mb-2 font-semibold">Supabase is not configured.</p>
              <p>
                This production build has no NEXT_PUBLIC_SUPABASE_URL or
                NEXT_PUBLIC_SUPABASE_ANON_KEY, and demo mode is off. Follow the
                provisioning checklist in the README to connect the database,
                or set NEXT_PUBLIC_PORTAL_DEMO=1 to run on bundled seed data.
              </p>
            </div>
          ) : (
            children
          )}
        </main>
        <footer className="border-t border-zinc-900 py-4 text-center text-xs text-zinc-600">
          Personal portal. Single user, private by design.
        </footer>
      </body>
    </html>
  );
}
