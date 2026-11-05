"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePortal } from "./PortalProvider";
import { cover } from "./TripCard";
import { EntityEditor, newRecord } from "./Editors";
import { Action, Empty, Icon, SectionTitle } from "./Kit";
import Tasks from "./Tasks";
import {
  bookingStatus,
  creditTotals,
  fmtDate,
  fmtMoney,
  getReadiness,
  safeURL,
  todayISO,
  tripWhen,
} from "@/lib/model";
import { downloadCalendar } from "@/lib/calendar";
import type { EntityName, Suggestion } from "@/lib/types";
type Tab = "overview" | "options" | "itinerary" | "reservations" | "tasks";
const tabs: Tab[] = [
  "overview",
  "options",
  "itinerary",
  "reservations",
  "tasks",
];
const statusLabel: Record<string, string> = {
  needs_review: "Review needed",
  awaiting_confirmation: "Awaiting confirmation",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};
export default function TripPlanner({ slug }: { slug: string }) {
  const p = usePortal();
  const trip = p.trips.find((t) => t.slug === slug);
  const [tab, setTab] = useState<Tab>("overview"),
    [editor, setEditor] = useState<{
      entity: EntityName;
      record: Record<string, unknown>;
    } | null>(null),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [scope, setScope] = useState("all"),
    [showDismissed, setShowDismissed] = useState(false);
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.slice(1);
      const legacy: Record<string, Tab> = {
        "cat-planning": "options",
        booked: "reservations",
        trek: "itinerary",
        "cat-flight": "options",
        "cat-food": "options",
        "cat-activity": "options",
      };
      if (tabs.includes(hash as Tab)) setTab(hash as Tab);
      else if (legacy[hash]) setTab(legacy[hash]);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  if (!trip)
    return (
      <Empty title="Trip not found">
        <Link className="button" href="/trips">
          Back to trips
        </Link>
      </Empty>
    );
  const bookings = p.bookings.filter((b) => b.tripSlug === slug),
    suggestions = p.suggestions.filter((s) => s.tripSlug === slug),
    scenarios = p.scenarios.filter((s) => s.tripSlug === slug),
    tasks = p.tasks.filter((t) => t.tripSlug === slug && t.status !== "done");
  const totals = creditTotals(bookings),
    readiness = getReadiness(bookings);
  const selected = scenarios.find((s) => s.id === trip.selectedScenarioId);
  const itinerary = p.itinerary
    .filter((i) => i.tripSlug === slug && i.status !== "removed")
    .sort((a, b) =>
      `${a.date}${a.time ?? "00:00"}`.localeCompare(
        `${b.date}${b.time ?? "00:00"}`,
      ),
    );
  const go = (next: Tab) => {
    setTab(next);
    window.history.replaceState(null, "", `#${next}`);
  };
  const add = (entity: EntityName, overrides: Record<string, unknown> = {}) =>
    setEditor({ entity, record: { ...newRecord(entity, slug), ...overrides } });
  const edit = (entity: EntityName, record: object) =>
    setEditor({ entity, record: { ...record } });
  const recordIdea = (s: Suggestion) =>
    add("bookings", {
      name: s.title,
      kind:
        s.category === "stay"
          ? "hotel"
          : s.category === "flight"
            ? "flight"
            : "activity",
      startDate: trip.startDate ?? todayISO(),
      endDate: trip.endDate ?? trip.startDate ?? todayISO(),
      details: s.subtitle ?? "",
      notes: s.detail,
      sourceSuggestionId: s.id,
    });
  const ideaCards = (items: Suggestion[]) =>
    items.map((s) => {
      const linked = bookings.find(
        (b) =>
          b.sourceSuggestionId === s.id && bookingStatus(b) !== "cancelled",
      );
      return (
        <article className="card idea-card" key={s.id}>
          <div className="card-header">
            <span className="eyebrow">
              {s.category} · {s.itemType ?? "idea"}
            </span>
            <span
              className={`badge ${s.verification === "checked" ? "success" : "warning"}`}
            >
              {s.verification === "checked"
                ? "Previously checked"
                : s.verification === "modeled"
                  ? "Estimate"
                  : "Needs recheck"}
            </span>
          </div>
          <h3>{s.title}</h3>
          <p>{s.subtitle}</p>
          {s.priceLabel && <div className="price">{s.priceLabel}</div>}
          {s.status === "booked" && !linked && (
            <div className="notice warning">
              Previously marked booked. Record and verify the reservation before
              treating this as confirmed.
            </div>
          )}
          {linked && (
            <div className="notice">
              Reservation recorded · {statusLabel[bookingStatus(linked)]}
            </div>
          )}
          {s.detail && (
            <details>
              <summary>Research & details</summary>
              <p style={{ whiteSpace: "pre-wrap" }}>{s.detail}</p>
            </details>
          )}
          <span className="source">
            {s.source ?? "Source not recorded"}
            {s.checkedAt ? ` · Checked ${fmtDate(s.checkedAt)}` : ""}
          </span>
          <div className="card-actions">
            <Action
              className="button small secondary"
              onClick={() =>
                p.save("suggestions", {
                  ...s,
                  status: s.status === "saved" ? "suggested" : "saved",
                })
              }
            >
              {s.status === "saved" ? "★ Shortlisted" : "☆ Shortlist"}
            </Action>
            {s.itemType === "task" ? (
              <button
                className="button small"
                onClick={() =>
                  add("tasks", { title: s.title, notes: s.detail })
                }
              >
                Create action
              </button>
            ) : s.itemType !== "reference" &&
              s.category !== "planning" &&
              !linked ? (
              <button className="button small" onClick={() => recordIdea(s)}>
                Record reservation
              </button>
            ) : null}
            {s.itemType !== "reference" && (
              <button
                className="button ghost small"
                onClick={() =>
                  add("itinerary", {
                    title: s.title,
                    date: trip.startDate ?? todayISO(),
                    notes: s.detail,
                  })
                }
              >
                Add to day
              </button>
            )}
            <button
              className="button ghost small"
              onClick={() => edit("suggestions", s)}
            >
              Edit
            </button>
            {safeURL(s.url) && (
              <a
                className="button ghost small"
                href={safeURL(s.url)!}
                target="_blank"
                rel="noreferrer"
              >
                Open source ↗
              </a>
            )}
            <Action
              className="button ghost small"
              onClick={() =>
                p.save("suggestions", {
                  ...s,
                  status: s.status === "dismissed" ? "suggested" : "dismissed",
                })
              }
            >
              {s.status === "dismissed" ? "Restore" : "Dismiss"}
            </Action>
          </div>
        </article>
      );
    });
  const visible = suggestions.filter(
    (s) =>
      (showDismissed ? s.status === "dismissed" : s.status !== "dismissed") &&
      (category === "all" || s.category === category) &&
      (scope === "all" ||
        (scope === "shortlist" && s.status === "saved") ||
        s.scenarioId === scope) &&
      `${s.title} ${s.subtitle} ${s.detail}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="trip-top">
        <Link href="/trips" className="text-link">
          ← Your trips
        </Link>
        <button
          className="button secondary small"
          onClick={() => edit("trips", trip)}
        >
          Edit trip
        </button>
      </div>
      <section className="hero">
        <img className="hero-photo" src={cover(slug)} alt="" />
        <div className="hero-stamp">{tripWhen(trip)}</div>
        <div className="hero-content">
          <span className="eyebrow">
            {trip.destination} · {trip.travelers ?? "?"} travelers
          </span>
          <h1>{trip.name}</h1>
          <p>
            {trip.startDate
              ? `${fmtDate(trip.startDate)} – ${fmtDate(trip.endDate)}`
              : trip.dateLabel}
            {selected
              ? ` · ${selected.title}`
              : scenarios.length
                ? " · Dates & destination still open"
                : ""}
          </p>
          <div className="readiness">
            {readiness.map((r) => (
              <span
                className={`badge ${r.status === "Confirmed" ? "success" : r.status === "Not recorded" ? "neutral" : "warning"}`}
                key={r.kind}
              >
                {r.label}: {r.status}
              </span>
            ))}
          </div>
        </div>
      </section>
      <nav className="trip-tabs" aria-label="Trip sections">
        {tabs.map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => go(t)}
          >
            {t === "options"
              ? "Options & ideas"
              : t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "tasks" && tasks.length ? ` (${tasks.length})` : ""}
          </button>
        ))}
      </nav>
      {tab === "overview" && (
        <>
          <div className="grid-two">
            <section className="card">
              <span className="eyebrow">The shape of your trip</span>
              <h2>
                {selected ? "Your chosen direction" : "A plan taking shape"}
              </h2>
              <p className="page-intro" style={{ whiteSpace: "pre-wrap" }}>
                {selected?.summary ??
                  trip.notes ??
                  "Gather a few possibilities, choose your favorites, and make room for the good stuff."}
              </p>
              <div className="card-actions">
                <button className="button" onClick={() => go("options")}>
                  {scenarios.length ? "Compare your options" : "Explore ideas"}
                  <Icon name="arrow" size={15} />
                </button>
                <button
                  className="button secondary"
                  onClick={() => go("itinerary")}
                >
                  Build your days
                </button>
              </div>
            </section>
            <section className="card">
              <span className="eyebrow">Next little steps</span>
              {tasks.slice(0, 3).map((t) => (
                <div className="action-row" key={t.id}>
                  <Action
                    className="check-button"
                    title={`Complete ${t.title}`}
                    onClick={() => p.save("tasks", { ...t, status: "done" })}
                  >
                    <Icon name="check" size={16} />
                  </Action>
                  <div className="action-body">
                    <h3>{t.title}</h3>
                    <p>{t.dueDate ? fmtDate(t.dueDate) : "No due date"}</p>
                  </div>
                </div>
              ))}
              {!tasks.length && (
                <Empty title="What needs to happen next?">
                  Add a task for a decision, a booking, or a detail to confirm.
                </Empty>
              )}
              <button className="button ghost" onClick={() => add("tasks")}>
                + Add action
              </button>
            </section>
          </div>
          <SectionTitle title="The money picture" />
          <div className="metrics">
            {[
              ["Cash paid", fmtMoney(totals.paid)],
              ["Credits pending", fmtMoney(totals.pending)],
              ["Net after posted credits", fmtMoney(totals.net)],
              ["Projected net", fmtMoney(totals.projected)],
            ].map(([label, value]) => (
              <div key={label} className="metric">
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            Recorded reservations only. Expected credits are estimates until
            posted. Points and unbooked plans are separate.
          </p>
          {bookings.some(
            (b) => !["confirmed", "cancelled"].includes(bookingStatus(b)),
          ) && (
            <div className="notice warning" style={{ marginTop: 20 }}>
              Some reservations need review.{" "}
              <button
                className="button ghost small"
                onClick={() => go("reservations")}
              >
                Check confirmations →
              </button>
            </div>
          )}
          <SectionTitle
            title="A few things to look forward to"
            action={
              <button className="text-link" onClick={() => go("options")}>
                All ideas →
              </button>
            }
          />
          <div className="idea-grid">
            {ideaCards(
              suggestions.filter((s) => s.status === "saved").slice(0, 2),
            )}
          </div>
          {!suggestions.some((s) => s.status === "saved") && (
            <Empty title="Your favorites will live here">
              <button
                className="button secondary"
                onClick={() => go("options")}
              >
                Start a shortlist
              </button>
            </Empty>
          )}
        </>
      )}
      {tab === "options" && (
        <>
          <SectionTitle
            eyebrow="One getaway, a few possibilities"
            title="Choose your direction"
            action={
              <button
                className="button secondary"
                onClick={() => add("scenarios")}
              >
                + Add scenario
              </button>
            }
          />
          <div className="grid-two">
            {scenarios
              .filter((s) => s.status !== "ruled_out")
              .map((s) => (
                <article
                  key={s.id}
                  className={`card scenario-card ${selected?.id === s.id ? "selected" : ""}`}
                >
                  <div className="card-header">
                    <span className="badge">
                      {selected?.id === s.id
                        ? "✓ Chosen direction"
                        : "Considering"}
                    </span>
                    <button
                      className="button ghost small"
                      onClick={() => edit("scenarios", s)}
                    >
                      Edit
                    </button>
                  </div>
                  <h3>{s.title}</h3>
                  <p className="description">
                    {s.destination} · {fmtDate(s.startDate)} –{" "}
                    {fmtDate(s.endDate)}
                  </p>
                  <p style={{ fontSize: 13 }}>{s.summary}</p>
                  <dl className="scenario-facts">
                    <div>
                      <dt>Points</dt>
                      <dd>{s.pointsEstimate ?? "Not researched yet"}</dd>
                    </div>
                    <div>
                      <dt>Cash & flights</dt>
                      <dd>{s.cashEstimate ?? "Not researched yet"}</dd>
                    </div>
                    <div>
                      <dt>Evidence</dt>
                      <dd>
                        <span
                          className={`badge ${s.availability === "checked" ? "success" : "warning"}`}
                        >
                          {s.availability === "checked"
                            ? "Previously checked"
                            : s.availability === "modeled"
                              ? "Modeled estimate"
                              : "Needs recheck"}
                        </span>
                        {s.checkedAt ? ` · ${fmtDate(s.checkedAt)}` : ""}
                      </dd>
                    </div>
                  </dl>
                  {s.notes && <p className="notice">{s.notes}</p>}
                  <div className="card-actions">
                    <Action
                      onClick={() =>
                        p.save("trips", {
                          ...trip,
                          selectedScenarioId:
                            selected?.id === s.id ? null : s.id,
                          ...(selected?.id !== s.id
                            ? {
                                destination: s.destination,
                                startDate: s.startDate,
                                endDate: s.endDate,
                                dateLabel: `${fmtDate(s.startDate)} – ${fmtDate(s.endDate)}`,
                              }
                            : {}),
                        })
                      }
                    >
                      {selected?.id === s.id
                        ? "Reopen this decision"
                        : "Choose this direction"}
                    </Action>
                    <button
                      className="button ghost"
                      onClick={() => setScope(s.id)}
                    >
                      See linked ideas
                    </button>
                  </div>
                </article>
              ))}
          </div>
          {!scenarios.length && (
            <Empty title="Make room for possibilities">
              Compare dates, destinations, or ways to spend the trip.
            </Empty>
          )}
          {scenarios.some((s) => s.status === "ruled_out") && (
            <details className="card" style={{ marginTop: 20 }}>
              <summary>Ruled-out scenarios</summary>
              {scenarios
                .filter((s) => s.status === "ruled_out")
                .map((s) => (
                  <div className="mini-row" key={s.id}>
                    <span>
                      <strong>{s.title}</strong>
                      <small>{s.notes}</small>
                    </span>
                    <button
                      className="button small secondary"
                      onClick={() => edit("scenarios", s)}
                    >
                      Review
                    </button>
                  </div>
                ))}
            </details>
          )}
          <SectionTitle
            title="The idea collection"
            action={
              <button className="button" onClick={() => add("suggestions")}>
                + Add idea
              </button>
            }
          />
          <div className="toolbar">
            <input
              aria-label="Search ideas"
              placeholder="Find a place, flight, or detail…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Idea category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {["all", "stay", "flight", "food", "activity", "planning"].map(
                (c) => (
                  <option key={c} value={c}>
                    {c === "all" ? "All categories" : c}
                  </option>
                ),
              )}
            </select>
            <select
              aria-label="Idea scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              <option value="all">All scenarios</option>
              <option value="shortlist">Shortlist only</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <button
              className={`pill ${showDismissed ? "active" : ""}`}
              onClick={() => setShowDismissed(!showDismissed)}
            >
              {showDismissed ? "Show active" : "Dismissed"}
            </button>
          </div>
          <div className="idea-grid">
            {ideaCards(visible.filter((s) => s.itemType !== "reference"))}
          </div>
          {visible.some((s) => s.itemType === "reference") && (
            <details style={{ marginTop: 20 }}>
              <summary className="text-link">
                Planning notes & ruled-out research (
                {visible.filter((s) => s.itemType === "reference").length})
              </summary>
              <div className="idea-grid" style={{ marginTop: 15 }}>
                {ideaCards(visible.filter((s) => s.itemType === "reference"))}
              </div>
            </details>
          )}
          {!visible.length && (
            <Empty title="Nothing in this collection yet">
              Add an idea or change your filters.
            </Empty>
          )}
        </>
      )}
      {tab === "reservations" && (
        <>
          <SectionTitle
            title="Reservations & confirmations"
            action={
              <button
                className="button"
                onClick={() =>
                  add("bookings", {
                    startDate: trip.startDate ?? todayISO(),
                    endDate: trip.endDate ?? todayISO(),
                  })
                }
              >
                + Record reservation
              </button>
            }
          />
          <p className="notice" style={{ marginBottom: 20 }}>
            Record a booking you made with the provider. Confirmed requires a
            reference and a checked date. This portal does not purchase or
            cancel reservations.
          </p>
          <div className="booking-grid">
            {bookings.map((b) => (
              <article className="card" key={b.id}>
                <div className="card-header">
                  <span className="eyebrow">
                    {b.kind} · {b.provider}
                  </span>
                  <span
                    className={`badge ${bookingStatus(b) === "confirmed" ? "success" : "warning"}`}
                  >
                    {statusLabel[bookingStatus(b)]}
                  </span>
                </div>
                <h3>{b.name}</h3>
                <p className="page-intro">{b.details}</p>
                <dl>
                  <div>
                    <dt>Dates</dt>
                    <dd>
                      {fmtDate(b.startDate)} → {fmtDate(b.endDate)}
                    </dd>
                  </div>
                  <div>
                    <dt>Confirmation</dt>
                    <dd>
                      {b.confirmation ?? "Not recorded"}
                      {b.secondaryRef && (
                        <>
                          <br />
                          {b.secondaryRef}
                        </>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Cash paid</dt>
                    <dd>{fmtMoney(b.costPaid)}</dd>
                  </div>
                  <div>
                    <dt>Points spent</dt>
                    <dd>
                      {b.pointsCost
                        ? `${b.pointsCost.toLocaleString()} ${b.pointsProgram ?? "points"}`
                        : "None recorded"}
                    </dd>
                  </div>
                  <div>
                    <dt>Credits posted</dt>
                    <dd>{fmtMoney(b.creditsPosted ?? 0)}</dd>
                  </div>
                  <div>
                    <dt>Projected net</dt>
                    <dd>{fmtMoney(b.costNet)}</dd>
                  </div>
                </dl>
                {b.costNote && <p className="page-intro">{b.costNote}</p>}
                {b.cancelBy && (
                  <div className="notice" style={{ marginTop: 17 }}>
                    Cancellation terms: {b.cancelBy}
                    {!b.cancelAt && (
                      <>
                        <br />
                        Exact deadline and timezone need verification before a
                        reminder can be shown.
                      </>
                    )}
                  </div>
                )}
                {b.notes && <p className="page-intro">{b.notes}</p>}
                <div className="card-actions">
                  <button
                    className="button secondary"
                    onClick={() => edit("bookings", b)}
                  >
                    Review / edit
                  </button>
                  <button
                    className="button ghost"
                    onClick={() =>
                      add("tasks", {
                        title: `Follow up: ${b.name}`,
                        bookingId: b.id,
                      })
                    }
                  >
                    Add follow-up
                  </button>
                  {bookingStatus(b) !== "cancelled" && (
                    <button
                      className="button ghost"
                      onClick={() =>
                        add("itinerary", {
                          title: b.name,
                          date: b.startDate,
                          bookingId: b.id,
                          kind: "reservation",
                          location: b.name,
                          notes: b.details,
                        })
                      }
                    >
                      Add to itinerary
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!bookings.length && (
            <Empty title="Your reservations will live here">
              Keep exploring. When you book something, record its details here.
            </Empty>
          )}
        </>
      )}
      {tab === "itinerary" && (
        <>
          <SectionTitle
            title="Make a little room for each day"
            action={
              <button
                className="button"
                onClick={() =>
                  add("itinerary", { date: trip.startDate ?? todayISO() })
                }
              >
                + Add plan
              </button>
            }
          />
          <div className="toolbar">
            <button
              className="button secondary"
              disabled={!itinerary.length}
              onClick={() => downloadCalendar(itinerary, trip.name)}
            >
              Export calendar
            </button>
            <button className="button secondary" onClick={() => window.print()}>
              Print itinerary
            </button>
            <span className="muted" style={{ fontSize: 11 }}>
              Times are local to the destination. Calendar exports use floating
              local times.
            </span>
          </div>
          {Array.from(new Set(itinerary.map((i) => i.date))).map((date) => (
            <section className="timeline-day" key={date}>
              <h3 className="timeline-date">{fmtDate(date)}</h3>
              <div>
                {itinerary
                  .filter((i) => i.date === date)
                  .map((i) => {
                    const booking = p.bookings.find(
                      (b) => b.id === i.bookingId,
                    );
                    return (
                      <article className="timeline-item" key={i.id}>
                        <div className="time">
                          {i.time ?? "Anytime"} ·{" "}
                          {i.kind === "reservation"
                            ? "Reservation"
                            : "Your plan"}
                        </div>
                        <h3>{i.title}</h3>
                        {booking && (
                          <span
                            className={`badge ${bookingStatus(booking) === "confirmed" ? "success" : "warning"}`}
                          >
                            {statusLabel[bookingStatus(booking)]}
                          </span>
                        )}
                        {i.location && (
                          <p>
                            {i.location}{" "}
                            <a
                              className="text-link"
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(i.location)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Map ↗
                            </a>
                          </p>
                        )}
                        {i.notes && (
                          <p style={{ whiteSpace: "pre-wrap" }}>{i.notes}</p>
                        )}
                        <div className="card-actions">
                          <button
                            className="button small secondary"
                            onClick={() => edit("itinerary", i)}
                          >
                            Edit
                          </button>
                          <Action
                            className="button small ghost"
                            onClick={() =>
                              p.save("itinerary", { ...i, status: "removed" })
                            }
                          >
                            Remove from day
                          </Action>
                        </div>
                      </article>
                    );
                  })}
              </div>
            </section>
          ))}
          {!itinerary.length && (
            <Empty title="A blank page, in the best way">
              Add a reservation, a dinner idea, or a slow morning. Leave room
              for the unexpected.
            </Empty>
          )}
          {p.itinerary.some(
            (i) => i.tripSlug === slug && i.status === "removed",
          ) && (
            <details className="card">
              <summary>Removed plans</summary>
              {p.itinerary
                .filter((i) => i.tripSlug === slug && i.status === "removed")
                .map((i) => (
                  <div className="mini-row" key={i.id}>
                    <span>
                      {i.title} · {fmtDate(i.date)}
                    </span>
                    <Action
                      className="button small secondary"
                      onClick={() =>
                        p.save("itinerary", { ...i, status: "planned" })
                      }
                    >
                      Restore
                    </Action>
                  </div>
                ))}
            </details>
          )}
        </>
      )}
      {tab === "tasks" && <Tasks tripSlug={slug} compact />}
      {editor && <EntityEditor {...editor} onClose={() => setEditor(null)} />}
    </>
  );
}
