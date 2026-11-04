import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Chip } from "@/components/ui";
import {
  fmtDate,
  fmtMoney,
  fmtPoints,
  getBookings,
  getSuggestions,
  getTrip,
} from "@/lib/data";
import type { Suggestion, SuggestionCategory } from "@/lib/types";


export const instant = false; // single-user portal: render at request time

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trip = await getTrip(slug);
  if (!trip) notFound();
  const bookings = await getBookings(slug);
  const suggestions = await getSuggestions(slug);

  const totalPaid = bookings.reduce((s, b) => s + (b.costPaid ?? 0), 0);
  const totalNet = bookings.reduce((s, b) => s + (b.costNet ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/trips" className="text-xs text-sky-400 hover:text-sky-300">
          Back to trips
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{trip.name}</h1>
          <Chip label={trip.status} />
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          {trip.destination} · {trip.dateLabel}
          {trip.travelers ? ` · ${trip.travelers} travelers` : ""}
        </p>
        {trip.notes ? (
          <p className="mt-3 max-w-3xl rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-300">
            {trip.notes}
          </p>
        ) : null}
      </div>

      <Card title={`Bookings (${bookings.length})`}>
        {bookings.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Nothing booked yet for this trip.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs tracking-wider text-zinc-500 uppercase">
                  <th className="py-2 pr-4 font-medium">Booking</th>
                  <th className="py-2 pr-4 font-medium">Dates</th>
                  <th className="py-2 pr-4 font-medium">Confirmation</th>
                  <th className="py-2 pr-4 font-medium">Cost</th>
                  <th className="py-2 pr-4 font-medium">Free cancel until</th>
                  <th className="py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {bookings.map((b) => (
                  <tr key={b.id} className="align-top">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2 font-medium">
                        {b.name}
                        <Chip label={b.kind} />
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        via {b.provider}
                      </div>
                      <div className="text-xs text-zinc-500">{b.details}</div>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-zinc-300">
                      {fmtDate(b.startDate)}
                      <br />
                      <span className="text-zinc-500">to {fmtDate(b.endDate)}</span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      {b.confirmation ?? "n/a"}
                      {b.secondaryRef ? (
                        <div className="text-xs text-zinc-500">{b.secondaryRef}</div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {b.pointsCost ? (
                        <span>
                          {fmtPoints(b.pointsCost)} pts
                          <div className="text-xs text-zinc-500">
                            {b.pointsProgram}
                          </div>
                        </span>
                      ) : (
                        <span>
                          {fmtMoney(b.costPaid)}
                          {b.costNet != null && b.costNet !== b.costPaid ? (
                            <div className="text-xs text-emerald-300">
                              net {fmtMoney(b.costNet)}
                            </div>
                          ) : null}
                          {b.costNote ? (
                            <div className="text-xs text-zinc-500">{b.costNote}</div>
                          ) : null}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-zinc-300">
                      {b.cancelBy ?? "n/a"}
                    </td>
                    <td className="py-3 text-zinc-400">{b.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
              {totalPaid > 0 ? (
                <tfoot>
                  <tr className="border-t border-zinc-700 text-sm font-medium">
                    <td className="py-3 pr-4" colSpan={3}>
                      Totals
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {fmtMoney(totalPaid)}
                      <div className="text-xs font-normal text-emerald-300">
                        net {fmtMoney(totalNet)}
                      </div>
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
      </Card>

      {SUGGESTION_SECTIONS.map(({ key, title }) => {
        const items = suggestions.filter((s) => s.category === key);
        if (items.length === 0) return null;
        return (
          <Card key={key} title={`${title} (${items.length})`}>
            <ul className="divide-y divide-zinc-800">
              {items.map((s) => (
                <SuggestionRow key={s.id} s={s} />
              ))}
            </ul>
          </Card>
        );
      })}

      <Card title="Day-by-day itinerary — TREK">
        <p className="text-sm text-zinc-400">
          {slug === "seattle" ? (
            <>
              This trip is loaded in TREK (the trial instance Muse runs):
              both hotels, confirmation numbers, and cancellation terms are
              in its itinerary view. TREK is the day-by-day planner; this
              page is the summary. The trial is hosted on Muse&apos;s
              machine for now — a permanent home (VPS or Tailscale) makes it
              reachable from anywhere.
            </>
          ) : (
            <>
              This trip isn&apos;t in TREK yet. Ask Muse to load it — TREK
              holds the day-by-day itinerary while this page keeps the
              bookings, totals, and picks.
            </>
          )}
        </p>
      </Card>
    </div>
  );
}

const SUGGESTION_SECTIONS: { key: SuggestionCategory; title: string }[] = [
  { key: "flight", title: "Flights" },
  { key: "food", title: "Eat & Drink" },
  { key: "activity", title: "Things to Do" },
  { key: "stay", title: "Stays" },
];

function SuggestionRow({ s }: { s: Suggestion }) {
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-medium">
          {s.url ? (
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:text-sky-300"
            >
              {s.title}
            </a>
          ) : (
            s.title
          )}
          {s.status === "saved" ? (
            <span className="ml-2">
              <Chip label="saved" />
            </span>
          ) : null}
        </div>
        {s.priceLabel ? (
          <div className="text-sm whitespace-nowrap text-emerald-300">
            {s.priceLabel}
          </div>
        ) : null}
      </div>
      {s.subtitle ? (
        <div className="mt-0.5 text-xs text-zinc-500">{s.subtitle}</div>
      ) : null}
      {s.detail ? (
        <p className="mt-1 text-sm text-zinc-400">{s.detail}</p>
      ) : null}
      {s.source ? (
        <div className="mt-1 text-[11px] tracking-wide text-zinc-600 uppercase">
          via {s.source}
        </div>
      ) : null}
    </li>
  );
}
