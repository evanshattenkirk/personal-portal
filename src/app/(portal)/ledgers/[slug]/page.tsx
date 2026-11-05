import { Suspense } from "react";
import Ledgers from "@/components/Ledgers";
async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Ledgers slug={slug} />;
}
export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={<p>Opening ledger…</p>}>
      <Content params={params} />
    </Suspense>
  );
}
