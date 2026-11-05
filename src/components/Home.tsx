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
          <div className="welcome-date">
            {new Date(todayISO() + "T12:00:00Z").toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}{" "}
            · Your personal home base
          </div>
          <h1>Good things ahead, Evan.</h1>
          <p className="page-intro">
            A place for your next adventure. And the little things that get you
            there.
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
              <div className="hero-stamp">{tripWhen(next)}</div>
              <div className="hero-content">
                <span className="eyebrow">
                  On the horizon · {next.travelers ?? "?"} travelers
                </span>
                <h2>{next.name}</h2>
                <p>
                  {next.notes ??
                    "Your options, research, and next steps, all in one place."}
                </p>
                <Link className="button" href={`/trips/${next.slug}`}>
                  Keep planning <Icon name="arrow" size={16} />
                </Link>
              </div>
            </>
          ) : (
            <div className="hero-content">
              <span className="eyebrow">Your next chapter</span>
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
          <span className="eyebrow">A little progress today</span>
          <h2>Your next moves</h2>
          <p className="muted" style={{ fontSize: 12 }}>
            Small steps. More peace of mind.
          </p>
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
            <Empty title="A little breathing room">
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
      <div className="home-strip">
        <div>
          <Icon name="plane" size={18} />
          <strong>
            {trips.length} upcoming {trips.length === 1 ? "trip" : "trips"}
          </strong>
        </div>
        <div>
          <Icon name="clock" size={18} />
          <strong>
            {needsReview.length} reservation
            {needsReview.length === 1 ? "" : "s"} to verify
          </strong>
        </div>
        <Link href="/points" className="text-link">
          Put your points to work <Icon name="arrow" size={15} />
        </Link>
      </div>
      <SectionTitle
        eyebrow="Room for a little adventure"
        title="Your travel chapters"
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
            title="Don’t let these slip"
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
                  className={`badge ${daysUntil(d.dueDate) < 7 ? "warning" : "neutral"}`}
                >
                  {daysUntil(d.dueDate) < 0
                    ? "Overdue"
                    : daysUntil(d.dueDate) === 0
                      ? "Today"
                      : `${daysUntil(d.dueDate)} days`}
                </span>
              </Link>
            ))}
            {!deadlines.length && <Empty title="No deadlines recorded" />}
          </div>
        </section>
        <section>
          <SectionTitle
            title="Your travel wallet"
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
                <strong>
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
            title="Close at hand"
            action={
              <Link href="/links" className="text-link">
                Your library
              </Link>
            }
          />
          <div className="grid-three">
            {pins.map((l) => (
              <Link
                key={l.id}
                className="card"
                href={safeURL(l.url) ?? "/links"}
                target={safeURL(l.url) ? "_blank" : undefined}
                rel="noreferrer"
              >
                <span className="eyebrow">{l.category}</span>
                <h3>{l.name}</h3>
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  {l.url ? "Open resource ↗" : "View access instructions"}
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
