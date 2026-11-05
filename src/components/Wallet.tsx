"use client";
import { useState } from "react";
import Link from "next/link";
import { usePortal } from "./PortalProvider";
import { EntityEditor, newRecord } from "./Editors";
import { Empty, SectionTitle } from "./Kit";
import { daysUntil, fmtDate, fmtMoney, fmtPoints, todayISO } from "@/lib/model";
import type { EntityName } from "@/lib/types";
export default function Wallet() {
  const p = usePortal();
  const [editor, setEditor] = useState<{
      entity: EntityName;
      record: Record<string, unknown>;
    } | null>(null),
    [showPast, setShowPast] = useState(false);
  const credits = p.credits
    .filter((c) =>
      showPast ? c.resetDate < todayISO() : c.resetDate >= todayISO(),
    )
    .sort((a, b) => a.resetDate.localeCompare(b.resetDate));
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Wallet</h1>
          <p className="page-intro">Balances and card credits.</p>
        </div>
        <button
          className="button"
          onClick={() =>
            setEditor({ entity: "points", record: newRecord("points") })
          }
        >
          + Add balance
        </button>
      </div>
      <div className="grid-three">
        {p.points.map((b) => (
          <article className="card" key={b.id}>
            <h3>{b.program}</h3>
            <div className="balance-number">
              {b.approximate ? "~" : ""}
              {fmtPoints(b.balance)}
            </div>
            <p className="meta">
              {b.owner} · points · checked {fmtDate(b.asOf)}
            </p>
            {daysUntil(b.asOf) < -30 && (
              <span className="badge warning">
                Time for a balance check
              </span>
            )}
            <div className="progress-track">
              <span
                style={{
                  width: `${b.balance ? Math.min(100, ((b.earmarked ?? 0) / b.balance) * 100) : 0}%`,
                }}
              />
            </div>
            <div className="credit-values">
              <span>
                <strong>{fmtPoints(b.earmarked ?? 0)}</strong>earmarked
              </span>
              <span>
                <strong>
                  {fmtPoints(Math.max(0, b.balance - (b.earmarked ?? 0)))}
                </strong>
                unallocated
              </span>
            </div>
            {b.tripSlug && (
              <Link className="text-link" href={`/trips/${b.tripSlug}`}>
                For{" "}
                {p.trips.find((t) => t.slug === b.tripSlug)?.name ?? b.tripSlug}{" "}
                →
              </Link>
            )}
            <div className="card-actions">
              <button
                className="button secondary small"
                onClick={() =>
                  setEditor({ entity: "points", record: { ...b } })
                }
              >
                Update balance / allocation
              </button>
            </div>
          </article>
        ))}
      </div>
      {!p.points.length && (
        <Empty title="Your points, in one place">
          Add each program separately to keep its value clear.
        </Empty>
      )}
      <SectionTitle
        title="Credits"
        action={
          <button
            className="button secondary"
            onClick={() =>
              setEditor({ entity: "credits", record: newRecord("credits") })
            }
          >
            + Add credit period
          </button>
        }
      />
      <div className="toolbar">
        <button
          className={`pill ${!showPast ? "active" : ""}`}
          onClick={() => setShowPast(false)}
        >
          Current periods
        </button>
        <button
          className={`pill ${showPast ? "active" : ""}`}
          onClick={() => setShowPast(true)}
        >
          Past periods
        </button>
        <span className="meta">
          Pending means eligible spend recorded, credit not yet received.
        </span>
      </div>
      <div className="grid-three">
        {credits.map((c) => (
          <article key={c.id} className="card">
            <h3>{c.name}</h3>
            <div className="balance-number">{fmtMoney(c.limit - c.used)}</div>
            <p className="meta">
              {c.period} · remaining · ends {fmtDate(c.resetDate)}
            </p>
            <div className="progress-track">
              <span
                style={{ width: `${c.limit ? (c.used / c.limit) * 100 : 0}%` }}
              />
            </div>
            <div className="credit-values">
              <span>
                <strong>{fmtMoney(c.used - c.posted)}</strong>pending
              </span>
              <span>
                <strong>{fmtMoney(c.posted)}</strong>posted
              </span>
              <span>
                <strong>{fmtMoney(c.limit)}</strong>allowance
              </span>
            </div>
            {c.notes && <p className="page-intro">{c.notes}</p>}
            <div className="card-actions">
              <button
                className="button secondary small"
                onClick={() =>
                  setEditor({ entity: "credits", record: { ...c } })
                }
              >
                Update usage
              </button>
              <button
                className="button ghost small"
                onClick={() =>
                  setEditor({
                    entity: "credits",
                    record: {
                      ...newRecord("credits"),
                      name: c.name,
                      limit: c.limit,
                      notes: c.notes,
                    },
                  })
                }
              >
                Start next period
              </button>
            </div>
          </article>
        ))}
      </div>
      {!credits.length && (
        <Empty
          title={
            showPast
              ? "No previous periods recorded"
              : "Start with the credits you use"
          }
        >
          Record the allowance and what you’ve used this period. No usage is
          assumed.
        </Empty>
      )}
      <section className="card spaced">
        <h3>Previously noted credit programs</h3>
        <p className="page-intro">
          These are historical notes, not verified current benefit terms. Check
          your account before creating the current period.
        </p>
        <div className="mini-list">
          {[
            ["Amex Gold dining credit", 10],
            ["Amex Gold Dunkin credit", 7],
            ["Amex Platinum Resy credit", 100],
          ].map(([name, limit]) => (
            <div className="mini-row" key={name}>
              <span>
                <strong>{name}</strong>
                <small>
                  Previously noted: {fmtMoney(Number(limit))}{" "}
                  {Number(limit) === 100 ? "per quarter" : "per month"}
                </small>
              </span>
              <button
                className="button small secondary"
                onClick={() =>
                  setEditor({
                    entity: "credits",
                    record: { ...newRecord("credits"), name, limit },
                  })
                }
              >
                Set up period
              </button>
            </div>
          ))}
        </div>
      </section>
      {editor && <EntityEditor {...editor} onClose={() => setEditor(null)} />}
    </>
  );
}
