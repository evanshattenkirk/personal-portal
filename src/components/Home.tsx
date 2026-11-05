"use client";
import { useState } from "react";
import Link from "next/link";
import { usePortal } from "./PortalProvider";
import { Icon, SectionTitle, Action, Empty } from "./Kit";
import { EntityEditor, newRecord } from "./Editors";
import { TripCard, cover } from "./TripCard";
import {
  upcomingTrips,
  todayISO,
  fmtDate,
  fmtPoints,
  daysUntil,
  safeURL,
  resourceHref,
  bookingStatus,
  tripWhen,
} from "@/lib/model";
export default function Home() {
  const p = usePortal();
  const [adding, setAdding] = useState(false);
  const trips = upcomingTrips(p.trips);
  const next = trips[0];
  const tasks = p.tasks
    .filter(
      (t) =>
        t.status !== "done" &&
        (!t.snoozedUntil || t.snoozedUntil <= todayISO()),
    )
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const deadlines = p.deadlines
    .filter((d) => d.status !== "done")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const needsYou = p.externalTasks.filter(
    (t) =>
      t.needsEvan && !["completed", "canceled"].includes(t.statusType ?? ""),
  );
  const needsReview = p.bookings.filter(
    (b) => !["confirmed", "cancelled"].includes(bookingStatus(b)),
  );
  const pins = p.links.filter((l) => l.pinned).slice(0, 4);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {new Date(todayISO() + "T12:00:00Z").toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
          </h1>
          <p className="page-intro">
            Hi Evan. {trips.length} upcoming{" "}
            {trips.length === 1 ? "trip" : "trips"}
            {needsReview.length
              ? `, ${needsReview.length} ${needsReview.length === 1 ? "reservation" : "reservations"} to verify.`
              : "."}
          </p>
        </div>
        <button className="button secondary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} />
          Quick add
        </button>
      </div>
      <div className="home-grid">
        <section className="hero">
          {next ? (
            <>
              <img className="hero-photo" src={cover(next.slug)} alt="" />
              <div className="hero-content">
                <span className="hero-stamp">{tripWhen(next)}</span>
                <span className="eyebrow">
                  Next trip · {next.travelers ?? "?"} travelers
                </span>
                <h2>{next.name}</h2>
                <p>
                  {next.notes ??
                    "Your options, research, and next steps, all in one place."}
                </p>
                <Link className="button" href={`/trips/${next.slug}`}>
                  Open plan <Icon name="arrow" size={16} />
                </Link>
              </div>
            </>
          ) : (
            <div className="hero-content">
              <h2>Where to next?</h2>
              <p>
                A weekend away, a family adventure, or somewhere you’ve always
                wanted to go.
              </p>
              <Link className="button" href="/trips">
                Plan a trip <Icon name="arrow" size={16} />
              </Link>
            </div>
          )}
        </section>
        <aside className="home-actions">
          <h2>Next up</h2>
          {needsYou.slice(0, 2).map((t) => (
            <Link
              key={t.id}
              href={safeURL(t.url) ?? "/todo"}
              className="action-row"
              target={safeURL(t.url) ? "_blank" : undefined}
              rel="noreferrer"
            >
              <span className="badge warning">You</span>
              <div className="action-body">
                <h3>{t.actionNote ?? t.title}</h3>
                <p>
                  {t.externalId} · {t.status}
                </p>
              </div>
              <Icon name="arrow" size={16} />
            </Link>
          ))}
          {tasks
            .slice(0, Math.max(1, 3 - needsYou.slice(0, 2).length))
            .map((t, i) => (
              <div className="action-row" key={t.id}>
                <span className="action-number">0{i + 1}</span>
                <div className="action-body">
                  <h3>{t.title}</h3>
                  <p>
                    {p.trips.find((x) => x.slug === t.tripSlug)?.name ??
                      "Everyday life"}
                    {t.dueDate ? ` · ${fmtDate(t.dueDate)}` : ""}
                  </p>
                </div>
                <Action
                  className="check-button"
                  title={`Complete ${t.title}`}
                  onClick={() => p.save("tasks", { ...t, status: "done" })}
                >
                  <Icon name="check" size={16} />
                </Action>
              </div>
            ))}
          {tasks.length === 0 && needsYou.length === 0 && (
            <Empty title="Nothing waiting">
              No unsnoozed tasks. Your deadlines are below.
            </Empty>
          )}
          {needsYou.length > 0 && (
            <Link href="/todo" className="text-link">
              Your list · {needsYou.length} need you →
            </Link>
          )}
          <Link href="/deadlines" className="text-link">
            All actions & deadlines <Icon name="arrow" size={15} />
          </Link>
        </aside>
      </div>
      <SectionTitle
        title="Trips"
        action={
          <Link className="text-link" href="/trips">
            All trips <Icon name="arrow" size={16} />
          </Link>
        }
      />
      <div className="grid-three">
        {trips.slice(0, 3).map((t) => (
          <TripCard key={t.id} trip={t} />
        ))}
      </div>
      <div className="grid-two">
        <section>
          <SectionTitle
            title="Coming up"
            action={
              <Link className="text-link" href="/deadlines">
                View all
              </Link>
            }
          />
          <div className="card mini-list">
            {deadlines.slice(0, 4).map((d) => (
              <Link href="/deadlines" className="mini-row" key={d.id}>
                <span>
                  <strong>{d.title}</strong>
                  <small>{fmtDate(d.dueDate)}</small>
                </span>
                <span
                  className={`badge countdown ${daysUntil(d.dueDate) < 7 ? "warning" : "neutral"}`}
                >
                  {daysUntil(d.dueDate) < 0
                    ? "Overdue"
                    : daysUntil(d.dueDate) === 0
                      ? "Today"
                      : `${daysUntil(d.dueDate)} ${daysUntil(d.dueDate) === 1 ? "day" : "days"}`}
                </span>
              </Link>
            ))}
            {!deadlines.length && <Empty title="No deadlines recorded" />}
          </div>
        </section>
        <section>
          <SectionTitle
            title="Wallet"
            action={
              <Link className="text-link" href="/points">
                Open wallet
              </Link>
            }
          />
          <div className="card mini-list">
            {p.points.slice(0, 4).map((b) => (
              <Link href="/points" className="mini-row" key={b.id}>
                <span>
                  <strong>{b.program}</strong>
                  <small>
                    {b.owner} · Checked {fmtDate(b.asOf)}
                  </small>
                </span>
                <strong className="num">
                  {b.approximate ? "~" : ""}
                  {fmtPoints(b.balance)}
                </strong>
              </Link>
            ))}
          </div>
        </section>
      </div>
      {pins.length > 0 && (
        <>
          <SectionTitle
            title="Pinned"
            action={
              <Link href="/links" className="text-link">
                Library
              </Link>
            }
          />
          <div className="grid-three">
            {pins.map((l) => (
              <Link
                key={l.id}
                className="card"
                href={resourceHref(l, p.ledgers) ?? "/links"}
                target={safeURL(l.url) ? "_blank" : undefined}
                rel="noreferrer"
              >
                <span className="meta">{l.category}</span>
                <h3>{l.name}</h3>
                <p className="meta">
                  {safeURL(l.url)
                    ? "Open resource ↗"
                    : resourceHref(l, p.ledgers)
                      ? "Open ledger →"
                      : "View access instructions"}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
      {adding && (
        <EntityEditor
          entity="tasks"
          record={newRecord("tasks")}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}
