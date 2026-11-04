import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { getBookings, getTrips, fmtMoney } from "@/lib/data";


export default async function TripsPage() {
  const trips = await getTrips();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trips</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Booked, researching, and planning, all in one list.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {trips.map(async (trip) => {
          const bookings = await getBookings(trip.slug);
          const net = bookings.reduce((s, b) => s + (b.costNet ?? 0), 0);
          return (
            <Link key={trip.id} href={`/trips/${trip.slug}`} className="block">
              <Card className="h-full transition-colors hover:border-zinc-600">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold">{trip.name}</h3>
                  <Chip label={trip.status} />
                </div>
                <p className="mt-1 text-sm text-zinc-400">
                  {trip.destination} · {trip.dateLabel}
                </p>
                {trip.notes ? (
                  <p className="mt-3 line-clamp-3 text-sm text-zinc-400">
                    {trip.notes}
                  </p>
                ) : null}
                <div className="mt-4 flex gap-6 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
                  <span>
                    {bookings.length} booking{bookings.length === 1 ? "" : "s"}
                  </span>
                  {net > 0 ? <span>Net {fmtMoney(net)}</span> : null}
                  {trip.travelers ? <span>{trip.travelers} travelers</span> : null}
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
