import Link from "next/link";
import { connection } from "next/server";
import { Card, Chip, Stat } from "@/components/ui";
import {
  daysUntil,
  fmtDate,
  fmtMoney,
  fmtPoints,
  getBookings,
  getDeadlines,
  getLinks,
  getPoints,
  getTrips,
} from "@/lib/data";

export default async function DashboardPage() {
  await connection(); // render at request time: countdowns use the current date
  const [trips, points, deadlines, links] = await Promise.all([
    getTrips(),
    getPoints(),
    getDeadlines(),
    getLinks(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const nextTrip =
    trips
      .filter((t) => t.status === "booked" && (t.endDate ?? "") >= today)
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))[0] ??
    trips[0];
  const nextTripBookings = nextTrip ? await getBookings(nextTrip.slug) : [];
  const tripNet = nextTripBookings.reduce((s, b) => s + (b.costNet ?? 0), 0);
  const tripPaid = nextTripBookings.reduce((s, b) => s + (b.costPaid ?? 0), 0);

  const totalPoints = points.reduce((s, p) => s + p.balance, 0);
  const upcoming = [...deadlines]
    .filter((d) => d.status !== "done")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Trips, points, deadlines, and projects in one place.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {nextTrip ? (
          <Card
            title="Next trip"
            action={
              <Link
                href={`/trips/${nextTrip.slug}`}
                className="text-xs text-sky-400 hover:text-sky-300"
              >
                View trip
              </Link>
            }
          >
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-semibold">{nextTrip.name}</h3>
              <Chip label={nextTrip.status} />
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              {nextTrip.destination} · {nextTrip.dateLabel}
              {nextTrip.travelers ? ` · ${nextTrip.travelers} travelers` : ""}
            </p>
            <div className="mt-4 space-y-3">
              {nextTripBookings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-start justify-between gap-4 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5"
                >
                  <div>
                    <div className="text-sm font-medium">{b.name}</div>
                    <div className="text-xs text-zinc-500">
                      {fmtDate(b.startDate)} to {fmtDate(b.endDate)} · {b.details}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">
                      {fmtMoney(b.costNet ?? b.costPaid)}
                    </div>
                    <div className="text-xs text-zinc-500">net</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-8 border-t border-zinc-800 pt-4">
              <Stat label="Total paid" value={fmtMoney(tripPaid)} />
              <Stat label="Net after credits" value={fmtMoney(tripNet)} />
            </div>
          </Card>
        ) : null}

        <Card
          title="Points summary"
          action={
            <Link href="/points" className="text-xs text-sky-400 hover:text-sky-300">
              All balances
            </Link>
          }
        >
          <div className="mb-4">
            <div className="text-3xl font-bold">{fmtPoints(totalPoints)}</div>
            <div className="text-xs text-zinc-500">
              total points across {points.length} programs
            </div>
          </div>
          <ul className="divide-y divide-zinc-800">
            {points.map((p) => (
              <li
                key={p.id}
                className="flex items-baseline justify-between py-2 text-sm"
              >
                <span className="text-zinc-300">{p.program}</span>
                <span className="font-medium">
                  {p.approximate ? "~" : ""}
                  {fmtPoints(p.balance)}
                  <span className="ml-2 text-xs text-zinc-500">{p.owner}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Upcoming deadlines"
          action={
            <Link
              href="/deadlines"
              className="text-xs text-sky-400 hover:text-sky-300"
            >
              All deadlines
            </Link>
          }
        >
          <ul className="divide-y divide-zinc-800">
            {upcoming.map((d) => {
              const days = daysUntil(d.dueDate);
              return (
                <li key={d.id} className="flex items-center justify-between gap-4 py-2.5">
                  <div>
                    <div className="text-sm font-medium">{d.title}</div>
                    <div className="text-xs text-zinc-500">{fmtDate(d.dueDate)}</div>
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      days < 0
                        ? "text-red-400"
                        : days <= 14
                          ? "text-amber-300"
                          : "text-zinc-400"
                    }`}
                  >
                    {days < 0
                      ? `${Math.abs(days)}d overdue`
                      : days === 0
                        ? "today"
                        : `in ${days}d`}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Quick links">
          <div className="grid grid-cols-2 gap-3">
            {links.map((l) =>
              l.url ? (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3 transition-colors hover:border-zinc-600"
                >
                  <div className="text-sm font-medium">{l.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                    {l.description}
                  </div>
                </a>
              ) : (
                <Link
                  key={l.id}
                  href="/links"
                  className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3 transition-colors hover:border-zinc-600"
                >
                  <div className="text-sm font-medium">{l.name}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                    {l.description}
                  </div>
                </Link>
              ),
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
