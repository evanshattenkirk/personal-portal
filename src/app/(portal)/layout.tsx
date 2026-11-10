import PortalProvider from "@/components/PortalProvider";
import { getPortalData } from "@/lib/data";
import { Suspense } from "react";
import { connection } from "next/server";
import type { PortalData } from "@/lib/types";
async function DataPortal({ children }: { children: React.ReactNode }) {
  await connection();
  // Only the data load is guarded; the JSX is built outside the try so a
  // rendering error isn't mistaken for a connection problem.
  let data: PortalData | null = null;
  try {
    data = await getPortalData();
  } catch {
    data = null;
  }
  if (!data)
    return (
      <section className="empty-state card">
        <span className="eyebrow">Connection needs attention</span>
        <h1>Your plans are safe.</h1>
        <p>
          We couldn’t load your portal. Check your connection and try again. If
          this follows an update, the database migration may still need to
          finish.
        </p>
        <p>No demo data is being shown in place of your records.</p>
        {/* A full page load on purpose: it re-runs the data load. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="button" href="/">
          Try again
        </a>
        <a className="button secondary" href="/login">
          Sign in
        </a>
      </section>
    );
  return <PortalProvider initialData={data}>{children}</PortalProvider>;
}

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="empty-state" aria-live="polite">
          Opening your portal…
        </div>
      }
    >
      <DataPortal>{children}</DataPortal>
    </Suspense>
  );
}
