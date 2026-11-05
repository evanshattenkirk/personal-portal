"use client";
import { useState } from "react";
import { usePortal } from "./PortalProvider";
import { TripCard } from "./TripCard";
import { EntityEditor, newRecord } from "./Editors";
import { Icon, Empty } from "./Kit";
import { upcomingTrips } from "@/lib/model";
export default function Trips() {
  const p = usePortal();
  const [q, setQ] = useState(""),
    [view, setView] = useState("upcoming"),
    [adding, setAdding] = useState(false);
  const upcoming = upcomingTrips(p.trips);
  const trips = (
    view === "upcoming"
      ? upcoming
      : p.trips.filter((t) => !upcoming.some((u) => u.id === t.id))
  ).filter((t) =>
    `${t.name} ${t.destination}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Trips</h1>
        </div>
        <button className="button" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} />
          New trip
        </button>
      </div>
      {p.trekUrl && (
        <div className="notice" style={{ marginBottom: 20 }}>
          Your external trip planner is also available.{" "}
          <a
            className="button ghost small"
            href={p.trekUrl}
            target="_blank"
            rel="noreferrer"
            title="Opens on devices signed into your tailnet"
          >
            Open TREK ↗
          </a>
        </div>
      )}
      <div className="toolbar">
        <button
          className={`pill ${view === "upcoming" ? "active" : ""}`}
          onClick={() => setView("upcoming")}
        >
          Upcoming & dreaming
        </button>
        <button
          className={`pill ${view === "past" ? "active" : ""}`}
          onClick={() => setView("past")}
        >
          Past adventures
        </button>
        <input
          aria-label="Search trips"
          placeholder="Find a trip or destination…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="grid-three">
        {trips.map((t) => (
          <TripCard key={t.id} trip={t} />
        ))}
      </div>
      {!trips.length && (
        <Empty title={q ? "No matching trips" : "The next chapter is yours"}>
          Create a trip to start gathering ideas.
        </Empty>
      )}
      {adding && (
        <EntityEditor
          entity="trips"
          record={newRecord("trips")}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}
