"use client";
import Link from "next/link";
import type { Trip } from "@/lib/types";
import { usePortal } from "./PortalProvider";
import { getReadiness, tripWhen, fmtDate } from "@/lib/model";
import { Icon } from "./Kit";
export const cover = (slug: string) =>
  `/images/${slug === "seattle" ? "seattle" : slug === "cancun" ? "cancun" : "family"}.jpg`;
export function TripCard({ trip }: { trip: Trip }) {
  const p = usePortal();
  const tasks = p.tasks.filter(
    (t) => t.tripSlug === trip.slug && t.status !== "done",
  );
  const openNotes = p.notes.filter(
      (n) => n.tripSlug === trip.slug && n.status === "open",
    ).length,
    shortlisted = p.suggestions.filter(
      (s) => s.tripSlug === trip.slug && s.status === "saved",
    ).length;
  return (
    <Link href={`/trips/${trip.slug}`} className="trip-card">
      <div className="trip-image">
        <img src={cover(trip.slug)} alt="" />
        <span className="badge">{tripWhen(trip)}</span>
      </div>
      <div className="trip-card-body">
        <h3>{trip.name}</h3>
        <p>
          {trip.startDate
            ? `${fmtDate(trip.startDate)} – ${fmtDate(trip.endDate)}`
            : trip.dateLabel}{" "}
          · {trip.travelers ?? "?"} travelers
        </p>
        <div className="readiness">
          {getReadiness(p.bookings.filter((b) => b.tripSlug === trip.slug))
            .slice(0, 2)
            .map((r) => (
              <span
                className={`badge ${r.status === "Confirmed" ? "success" : "warning"}`}
                key={r.kind}
              >
                {r.label} · {r.status}
              </span>
            ))}
        </div>
        <div className="trip-card-footer">
          <span>
            {[
              tasks.length &&
                `${tasks.length} next ${tasks.length === 1 ? "step" : "steps"}`,
              shortlisted && `${shortlisted} shortlisted`,
              openNotes &&
                `${openNotes} AI ${openNotes === 1 ? "note" : "notes"}`,
            ]
              .filter(Boolean)
              .join(" · ") || "Open your plans"}
          </span>
          <Icon name="arrow" size={17} />
        </div>
      </div>
    </Link>
  );
}
