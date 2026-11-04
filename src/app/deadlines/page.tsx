import { connection } from "next/server";
import { Card, Chip } from "@/components/ui";
import { daysUntil, fmtDate, getDeadlines } from "@/lib/data";


export const instant = false; // single-user portal: render at request time

export default async function DeadlinesPage() {
  await connection(); // render at request time: countdowns use the current date
  const deadlines = [...(await getDeadlines())].sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deadlines</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Renewals, expiring offers, and follow-ups worth watching.
        </p>
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs tracking-wider text-zinc-500 uppercase">
                <th className="py-2 pr-4 font-medium">Deadline</th>
                <th className="py-2 pr-4 font-medium">Due</th>
                <th className="py-2 pr-4 font-medium">Countdown</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {deadlines.map((d) => {
                const days = daysUntil(d.dueDate);
                return (
                  <tr key={d.id} className="align-top">
                    <td className="py-3 pr-4 font-medium">{d.title}</td>
                    <td className="py-3 pr-4 whitespace-nowrap text-zinc-300">
                      {fmtDate(d.dueDate)}
                    </td>
                    <td
                      className={`py-3 pr-4 whitespace-nowrap ${
                        d.status === "done"
                          ? "text-zinc-500"
                          : days < 0
                            ? "text-red-400"
                            : days <= 14
                              ? "text-amber-300"
                              : "text-zinc-400"
                      }`}
                    >
                      {d.status === "done"
                        ? "done"
                        : days < 0
                          ? `${Math.abs(days)}d overdue`
                          : days === 0
                            ? "today"
                            : `in ${days} days`}
                    </td>
                    <td className="py-3 pr-4">
                      <Chip label={d.status} />
                    </td>
                    <td className="py-3 text-zinc-400">{d.notes ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
