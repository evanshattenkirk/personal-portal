import Link from "next/link";
import { Card } from "@/components/ui";
import { fmtMoney, getLedgers } from "@/lib/data";

export const instant = false; // single-user portal: render at request time

export default async function LedgersPage() {
  const ledgers = await getLedgers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">💰 Ledgers</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Money in vs money out, kept current from the confirmation emails and
          statements Muse reconciles.
        </p>
      </div>

      {ledgers.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500">
            No ledgers loaded yet — ask Muse to sync them.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ledgers.map((l) => (
            <Link key={l.id} href={`/ledgers/${l.slug}`} className="block">
              <Card className="h-full transition-colors hover:border-zinc-600">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-semibold">
                    <span className="mr-1.5" aria-hidden>
                      {l.icon ?? "💰"}
                    </span>
                    {l.name}
                  </h3>
                  {l.asOf ? (
                    <span className="text-xs text-zinc-500">
                      as of {l.asOf}
                    </span>
                  ) : null}
                </div>
                <div
                  className={`mt-3 text-3xl font-bold tracking-tight ${
                    (l.net ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {(l.net ?? 0) >= 0 ? "+" : "−"}
                  {fmtMoney(Math.abs(l.net ?? 0)).replace("-", "")}
                </div>
                <div className="text-xs tracking-wide text-zinc-500 uppercase">
                  {l.netLabel ?? "Net"}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-800 pt-3 text-sm">
                  <div>
                    <div className="text-[11px] tracking-wider text-zinc-500 uppercase">
                      In
                    </div>
                    <div className="font-medium">{fmtMoney(l.totalIn)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] tracking-wider text-zinc-500 uppercase">
                      Out
                    </div>
                    <div className="font-medium">{fmtMoney(l.totalOut)}</div>
                  </div>
                </div>
                {l.balanceValue != null ? (
                  <p className="mt-3 text-sm text-zinc-400">
                    {l.balanceLabel}:{" "}
                    <span className="font-medium text-zinc-200">
                      {fmtMoney(l.balanceValue)}
                    </span>
                  </p>
                ) : null}
                {l.entriesCount != null ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    {l.entriesCount} entries on record — view the full
                    ledger →
                  </p>
                ) : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
