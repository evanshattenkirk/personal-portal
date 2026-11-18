import { Suspense } from "react";
import { connection } from "next/server";
import type { Metadata } from "next";
import ClipFarm from "@/components/ClipFarm";
import { getClipFarmData } from "@/lib/clipfarm-data";

export const metadata: Metadata = { title: "Clip Farm" };

async function Loader() {
  await connection();
  let data = null;
  try {
    data = await getClipFarmData();
  } catch (error) {
    console.error("Clip Farm load failed", error);
  }
  if (!data)
    return (
      <section className="empty-state card">
        <span className="eyebrow">Connection needs attention</span>
        <h1>The Clip Farm didn&apos;t load.</h1>
        <p>Sign in again or try a reload. No sample data is shown in place of yours.</p>
      </section>
    );
  return <ClipFarm initial={data} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="empty-state" aria-live="polite">Opening the Clip Farm…</div>}>
      <Loader />
    </Suspense>
  );
}
