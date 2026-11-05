import PortalProvider from "@/components/PortalProvider";
import { getPortalData } from "@/lib/data";
import { Suspense } from "react";
import { connection } from "next/server";
async function DataPortal({ children }: { children: React.ReactNode }) {
  await connection();
  try {
    const data = await getPortalData();
    return <PortalProvider initialData={data}>{children}</PortalProvider>;
  } catch {
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
        <a className="button" href="/">
          Try again
        </a>
        <a className="button secondary" href="/login">
          Sign in
        </a>
      </section>
    );
  }
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
          Loading…
        </div>
      }
    >
      <DataPortal>{children}</DataPortal>
    </Suspense>
  );
}
