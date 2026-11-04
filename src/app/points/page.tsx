import { Card, Stat } from "@/components/ui";
import { fmtDate, fmtPoints, getPoints } from "@/lib/data";
import { creditTrackers } from "@/lib/seed";


export const instant = false; // single-user portal: render at request time

export default async function PointsPage() {
  const points = await getPoints();
  const total = points.reduce((s, p) => s + p.balance, 0);
  const asOf = points.reduce(
    (latest, p) => (p.asOf > latest ? p.asOf : latest),
    points[0]?.asOf ?? "",
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Points</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Balances by program, as of {fmtDate(asOf)}. Transfer bonuses get
          checked against these before any trip booking.
        </p>
      </div>

      <Card title="Balances">
        <div className="mb-5 flex gap-10">
          <Stat label="Total points" value={fmtPoints(total)} />
          <Stat label="Programs" value={String(points.length)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {points.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{p.program}</span>
                <span className="text-lg font-semibold">
                  {p.approximate ? "~" : ""}
                  {fmtPoints(p.balance)}
                </span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {p.owner}&apos;s account · as of {fmtDate(p.asOf)}
                {p.approximate ? " · approximate" : ""}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold tracking-widest text-zinc-400 uppercase">
          Amex credit trackers
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {creditTrackers.map((t) => (
            <Card key={t.id}>
              <div className="text-2xl font-bold text-emerald-300">
                {t.amountLabel}
              </div>
              <div className="mt-1 text-sm font-medium">{t.name}</div>
              <div className="text-xs text-zinc-500">{t.cadence}</div>
              <p className="mt-3 text-sm text-zinc-400">{t.detail}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
