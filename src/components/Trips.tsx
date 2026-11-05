"use client";
import { useState } from "react";
import { usePortal } from "./PortalProvider";
import { TripCard } from "./TripCard";
import { EntityEditor, newRecord } from "./Editors";
import { Action, Icon, Empty } from "./Kit";
import { upcomingTrips } from "@/lib/model";
import { buildAIBrief } from "@/lib/brainstorm";
export default function Trips() {
  const p = usePortal();
  const [q, setQ] = useState(""),
    [view, setView] = useState("upcoming"),
    [adding, setAdding] = useState(false),
    [copied, setCopied] = useState(false);
  const withNotes = p.trips.filter((t) =>
    p.notes.some((n) => n.tripSlug === t.slug && n.status === "open"),
  );
  const copyAll = async () => {
    const text = [
      'Here are my open trip notes from Evan\'s Portal. Work through the "Ask AI" notes for each trip and label every answer with the trip and note number.',
      ...withNotes.map((t) =>
        buildAIBrief({
          trip: t,
          brief: p.briefs.find((b) => b.tripSlug === t.slug),
          notes: p.notes
            .filter((n) => n.tripSlug === t.slug)
            .sort((a, b) =>
              (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
            ),
          scenarios: p.scenarios.filter((s) => s.tripSlug === t.slug),
          suggestions: p.suggestions.filter((s) => s.tripSlug === t.slug),
        }),
      ),
    ].join("\n\n---\n\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };
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
          <span className="eyebrow">Collect moments, make plans</span>
          <h1>Your travel chapters.</h1>
          <p className="page-intro">
            From “what if” to wheels up. Give every adventure a place to begin.
          </p>
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
      {withNotes.length > 0 && (
        <div className="notice" style={{ marginBottom: 20 }}>
          {p.notes.filter((n) => n.status === "open").length} open notes for
          your AI across {withNotes.length}{" "}
          {withNotes.length === 1 ? "trip" : "trips"}.{" "}
          <Action className="button ghost small" onClick={copyAll}>
            {copied ? "✓ Copied" : "Copy all for your AI"}
          </Action>
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
