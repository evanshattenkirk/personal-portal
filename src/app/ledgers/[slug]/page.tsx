import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Stat } from "@/components/ui";
import {
  fmtDate,
  fmtMoney,
  getLedger,
  getLedgerEntries,
} from "@/lib/data";

export const instant = false; // single-user portal: render at request time

export default async function LedgerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ledger = await getLedger(slug);
  if (!ledger) notFound();
  const entries = await getLedgerEntries(slug);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/ledgers"
          className="text-xs text-sky-400 hover:text-sky-300"
        >
          Back to ledgers
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="mr-2" aria-hidden>
              {ledger.icon ?? "💰"}
            </span>
            {ledger.name}
          </h1>
          {ledger.asOf ? (
            <span className="text-sm text-zinc-500">as of {ledger.asOf}</span>
          ) : null}
        </div>
        <div
          className={`mt-2 text-4xl font-bold tracking-tight ${
            (ledger.net ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          {(ledger.net ?? 0) >= 0 ? "+" : "−"}
          {fmtMoney(Math.abs(ledger.net ?? 0)).replace("-", "")}
          <span className="ml-2 align-middle text-sm font-medium text-zinc-500">
            {ledger.netLabel ?? "Net"}
          </span>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Stat label="Total in" value={fmtMoney(ledger.totalIn)} />
          <Stat label="Total out" value={fmtMoney(ledger.totalOut)} />
          {ledger.balanceValue != null ? (
            <Stat
              label={ledger.balanceLabel ?? "Balance"}
              value={fmtMoney(ledger.balanceValue)}
            />
          ) : null}
          {ledger.entriesCount != null ? (
            <Stat label="Entries on record" value={String(ledger.entriesCount)} />
          ) : null}
        </div>
        {ledger.summary ? (
          <p className="mt-5 border-t border-zinc-800 pt-4 text-sm leading-relaxed text-zinc-400">
            {ledger.summary}
          </p>
        ) : null}
      </Card>

      <Card title={`Entries (${entries.length} itemized)`}>
        {entries.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No itemized entries for this ledger — totals above are the
            reconciled figures.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs tracking-wider text-zinc-500 uppercase">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">In</th>
                  <th className="py-2 pr-4 font-medium">Out</th>
                  <th className="py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {entries.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="py-2.5 pr-4 whitespace-nowrap text-zinc-300">
                      {fmtDate(e.entryDate)}
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      {e.direction === "in" ? (
                        <span className="font-medium text-zinc-100">
                          {fmtMoney(e.amount)}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 whitespace-nowrap">
                      {e.direction === "out" ? (
                        <span className="font-medium text-emerald-300">
                          {fmtMoney(e.amount)}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 text-zinc-400">
                      {e.note ?? ""}
                      {e.fee != null ? (
                        <span className="text-zinc-500">
                          {" "}
                          (fee {fmtMoney(e.fee)})
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
