"use client";
import { useState } from "react";
import Link from "next/link";
import { usePortal } from "./PortalProvider";
import { Empty, SectionTitle } from "./Kit";
import { daysUntil, fmtDate, safeURL } from "@/lib/model";
import type { PortalTask } from "@/lib/types";
export default function YourList() {
  const p = usePortal();
  const [q, setQ] = useState(""),
    [done, setDone] = useState(false);
  const tasks = p.externalTasks.filter(
    (t) =>
      `${t.title} ${t.externalId} ${t.actionNote ?? ""}`
        .toLowerCase()
        .includes(q.toLowerCase()) &&
      (done || !["completed", "canceled"].includes(t.statusType ?? "")),
  );
  const owners: Record<string, string> = {
    "owner:evan": "You",
    "owner:muse": "Jarvis",
    "owner:claude": "Claude Duet",
  };
  const row = (t: PortalTask) => (
    <article key={t.id} className="task-card">
      <div className="task-content">
        <div className="card-header">
          <span className="eyebrow">
            {t.externalId} ·{" "}
            {owners[t.ownerLabel ?? ""] ?? t.ownerLabel ?? "Unassigned"}
          </span>
          <span className="badge">{t.status}</span>
        </div>
        <h3>{t.title}</h3>
        {t.actionNote && (
          <p className="notice warning">Your move: {t.actionNote}</p>
        )}
        {t.dueDate && (
          <p>
            {fmtDate(t.dueDate)} ·{" "}
            {daysUntil(t.dueDate) < 0
              ? "Overdue"
              : daysUntil(t.dueDate) === 0
                ? "Due today"
                : daysUntil(t.dueDate) === 1
                  ? "Tomorrow"
                  : `In ${daysUntil(t.dueDate)} days`}
          </p>
        )}
      </div>
      {safeURL(t.url) && (
        <a
          href={safeURL(t.url)!}
          className="button secondary small"
          target="_blank"
          rel="noreferrer"
        >
          Open issue ↗
        </a>
      )}
    </article>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Your work, in context</span>
          <h1>Your list.</h1>
          <p className="page-intro">
            The things that need you first. Synced from your Linear board;
            changes happen in the original issue.
          </p>
        </div>
        <Link className="button secondary" href="/deadlines">
          Personal actions →
        </Link>
      </div>
      <div className="toolbar">
        <input
          aria-label="Search your list"
          placeholder="Search an issue or next step…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className={`pill ${done ? "active" : ""}`}
          onClick={() => setDone(!done)}
        >
          {done ? "Including completed" : "Show completed"}
        </button>
      </div>
      <SectionTitle
        title={`Needs you (${tasks.filter((t) => t.needsEvan).length})`}
      />
      <div className="stack">{tasks.filter((t) => t.needsEvan).map(row)}</div>
      {!tasks.some((t) => t.needsEvan) && (
        <Empty title="Nothing needs you in this view" />
      )}
      <SectionTitle title="Agents are on it" />
      <div className="stack">{tasks.filter((t) => !t.needsEvan).map(row)}</div>
      {!tasks.some((t) => !t.needsEvan) && (
        <Empty title="No other work in this view" />
      )}
    </>
  );
}
