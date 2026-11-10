"use client";
import { useState } from "react";
import Link from "next/link";
import { usePortal } from "./PortalProvider";
import { Action, Empty, Icon } from "./Kit";
import { EntityEditor, newRecord } from "./Editors";
import { todayISO, fmtDate, daysUntil, bookingStatus } from "@/lib/model";
import type { EntityName } from "@/lib/types";
export default function Tasks({
  tripSlug,
  compact = false,
}: {
  tripSlug?: string;
  compact?: boolean;
}) {
  const p = usePortal();
  const [filter, setFilter] = useState("open"),
    [query, setQuery] = useState(""),
    [editor, setEditor] = useState<{
      entity: EntityName;
      record: Record<string, unknown>;
    } | null>(null);
  const tasks = p.tasks.filter((t) => !tripSlug || t.tripSlug === tripSlug);
  const deadlines = p.deadlines.filter(
    (t) => !tripSlug || t.tripSlug === tripSlug,
  );
  const rows = [
    ...tasks.map((t) => ({
      ...t,
      entity: "tasks" as const,
      done: t.status === "done",
    })),
    ...deadlines.map((t) => ({
      ...t,
      entity: "deadlines" as const,
      done: t.status === "done",
    })),
  ]
    .filter((r) =>
      `${r.title} ${r.notes}`.toLowerCase().includes(query.toLowerCase()),
    )
    .filter((r) =>
      filter === "done"
        ? r.done
        : filter === "waiting"
          ? r.status === "waiting" || r.status === "watching"
          : filter === "snoozed"
            ? r.snoozedUntil && r.snoozedUntil > todayISO()
            : !r.done && (!r.snoozedUntil || r.snoozedUntil <= todayISO()),
    )
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  const cancellations = p.bookings
    .filter(
      (b) =>
        (!tripSlug || b.tripSlug === tripSlug) &&
        bookingStatus(b) !== "cancelled" &&
        b.cancelAt,
    )
    .sort((a, b) => String(a.cancelAt).localeCompare(String(b.cancelAt)));
  const pending = p.bookings.filter(
    (b) =>
      (!tripSlug || b.tripSlug === tripSlug) &&
      !["confirmed", "cancelled"].includes(bookingStatus(b)),
  );
  return (
    <>
      {!compact && (
        <div className="page-heading">
          <div>
            <span className="eyebrow">Less to remember</span>
            <h1>A little progress.</h1>
            <p className="page-intro">
              Trip to-dos, everyday deadlines, and the confirmations that need a
              second look.
            </p>
          </div>
        </div>
      )}
      <div className="toolbar">
        <button
          className="button"
          onClick={() =>
            setEditor({
              entity: "tasks",
              record: newRecord("tasks", tripSlug ?? null),
            })
          }
        >
          <Icon name="plus" size={15} />
          Add action
        </button>
        <button
          className="button secondary"
          onClick={() =>
            setEditor({
              entity: "deadlines",
              record: newRecord("deadlines", tripSlug ?? null),
            })
          }
        >
          Add deadline
        </button>
        <input
          aria-label="Search actions"
          placeholder="Search actions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="toolbar">
        {[
          ["open", "Needs attention"],
          ["waiting", "Waiting & watching"],
          ["snoozed", "Snoozed"],
          ["done", "Completed"],
        ].map(([value, label]) => (
          <button
            className={`pill ${filter === value ? "active" : ""}`}
            key={value}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="stack">
        {rows.map((row) => {
          const original =
            row.entity === "tasks"
              ? p.tasks.find((t) => t.id === row.id)!
              : p.deadlines.find((t) => t.id === row.id)!;
          return (
            <article
              className={`task-card ${row.done ? "done" : ""}`}
              key={row.entity + row.id}
            >
              <Action
                className="check-button"
                title={`${row.done ? "Reopen" : "Complete"} ${row.title}`}
                onClick={() =>
                  row.entity === "tasks"
                    ? p.save("tasks", {
                        ...p.tasks.find((t) => t.id === row.id)!,
                        status: row.done ? "todo" : "done",
                        snoozedUntil: null,
                      })
                    : p.save("deadlines", {
                        ...p.deadlines.find((t) => t.id === row.id)!,
                        status: row.done ? "open" : "done",
                        snoozedUntil: null,
                      })
                }
              >
                <Icon name="check" size={16} />
              </Action>
              <div className="task-content">
                <h3>{row.title}</h3>
                <p>
                  {row.tripSlug ? (
                    <Link className="text-link" href={`/trips/${row.tripSlug}`}>
                      {p.trips.find((t) => t.slug === row.tripSlug)?.name ??
                        row.tripSlug}
                    </Link>
                  ) : (
                    "Everyday life"
                  )}{" "}
                  · {row.entity === "deadlines" ? "Deadline" : "Task"}
                  {row.dueDate
                    ? ` · ${fmtDate(row.dueDate)}`
                    : " · No due date"}
                </p>
                {row.notes && <p>{row.notes}</p>}
                {row.snoozedUntil && (
                  <span className="badge">
                    Reminder snoozed until {fmtDate(row.snoozedUntil)}
                  </span>
                )}
              </div>
              <div className="task-tools">
                {row.dueDate && !row.done && (
                  <span
                    className={`badge ${daysUntil(row.dueDate) <= 7 ? "warning" : "neutral"}`}
                  >
                    {daysUntil(row.dueDate) < 0
                      ? "Overdue"
                      : daysUntil(row.dueDate) === 0
                        ? "Today"
                        : daysUntil(row.dueDate) === 1
                          ? "Tomorrow"
                          : `In ${daysUntil(row.dueDate)} days`}
                  </span>
                )}
                <button
                  className="button small secondary"
                  onClick={() =>
                    setEditor({ entity: row.entity, record: { ...original } })
                  }
                >
                  Edit / snooze
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {!rows.length && (
        <Empty title="Nothing in this view">
          Try another filter or add your next step.
        </Empty>
      )}
      {pending.length > 0 && (
        <section style={{ marginTop: 30 }}>
          <h2 style={{ marginBottom: 15 }}>Reservation check-in</h2>
          <div className="notice warning">
            These reservations were recorded, but still need an explicit
            confirmation check. Reviewing them won’t complete any separate
            follow-up tasks.
          </div>
          <div className="mini-list">
            {pending.map((b) => (
              <div key={b.id} className="mini-row">
                <span>
                  <strong>{b.name}</strong>
                  <small>
                    {p.trips.find((t) => t.slug === b.tripSlug)?.name} ·{" "}
                    {b.confirmation
                      ? "Reference on file; verify details"
                      : "Confirmation reference missing"}
                  </small>
                </span>
                <button
                  className="button secondary small"
                  onClick={() =>
                    setEditor({ entity: "bookings", record: { ...b } })
                  }
                >
                  Review
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {cancellations.length > 0 && (
        <section style={{ marginTop: 30 }}>
          <h2>Cancellation cutoffs</h2>
          <p className="page-intro">
            Exact reservation deadlines stay visible even when a reminder is
            snoozed.
          </p>
          <div className="mini-list">
            {cancellations.map((b) => (
              <Link
                key={b.id}
                className="mini-row"
                href={`/trips/${b.tripSlug}#reservations`}
              >
                <span>
                  <strong>{b.name}</strong>
                  <small>
                    {new Date(b.cancelAt!).toLocaleString("en-US", {
                      timeZone: "America/Chicago",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}{" "}
                    Chicago time
                  </small>
                </span>
                <span className="badge warning">
                  {new Date(b.cancelAt!) < new Date()
                    ? "Cutoff passed"
                    : "Cancellation cutoff"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {editor && <EntityEditor {...editor} onClose={() => setEditor(null)} />}
    </>
  );
}
