import { Suspense } from "react";
import TripPlanner from "@/components/TripPlanner";
async function TripContent({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TripPlanner slug={slug} />;
}
export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense
      fallback={<div className="empty-state">Opening this chapter…</div>}
    >
      <TripContent params={params} />
    </Suspense>
  );
}
