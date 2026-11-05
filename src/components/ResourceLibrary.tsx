"use client";
import { useState } from "react";
import { usePortal } from "./PortalProvider";
import { Action, Empty, Icon } from "./Kit";
import { EntityEditor, newRecord } from "./Editors";
import { safeURL, resourceHref } from "@/lib/model";
export default function ResourceLibrary() {
  const p = usePortal();
  const [q, setQ] = useState(""),
    [category, setCategory] = useState("all"),
    [pins, setPins] = useState(false),
    [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const links = p.links
    .filter(
      (l) =>
        (!pins || l.pinned) &&
        (category === "all" || l.category === category) &&
        `${l.name} ${l.description} ${l.location ?? ""}`
          .toLowerCase()
          .includes(q.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(b.pinned ?? false) - Number(a.pinned ?? false) ||
        a.sortOrder - b.sortOrder,
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Everything has a place</span>
          <h1>Close at hand.</h1>
          <p className="page-intro">
            Your projects, useful places, and everyday resources. Ready when you
            need them.
          </p>
        </div>
        <button
          className="button"
          onClick={() => setRecord(newRecord("links"))}
        >
          + Add resource
        </button>
      </div>
      <div className="toolbar">
        <input
          aria-label="Search resources"
          placeholder="Search your library…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="Resource category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">All categories</option>
          {Array.from(new Set(p.links.map((l) => l.category))).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button
          className={`pill ${pins ? "active" : ""}`}
          onClick={() => setPins(!pins)}
        >
          ★ Pinned only
        </button>
      </div>
      <div className="grid-three">
        {links.map((l) => (
          <article key={l.id} className="card resource-card">
            <div className="card-header">
              <div className="resource-icon">
                <Icon name={l.category === "Projects" ? "compass" : "link"} />
              </div>
              <Action
                className="button ghost small"
                title={l.pinned ? `Unpin ${l.name}` : `Pin ${l.name} to Home`}
                onClick={() => p.save("links", { ...l, pinned: !l.pinned })}
              >
                {l.pinned ? "★ Pinned" : "☆ Pin"}
              </Action>
            </div>
            <span className="eyebrow">{l.category}</span>
            <h3>{l.name}</h3>
            <p>{l.description.replace(/^His product:/, "My product:")}</p>
            {l.location && (
              <div className="notice" style={{ overflowWrap: "anywhere" }}>
                {l.location}
              </div>
            )}
            {!resourceHref(l, p.ledgers) && !l.location && (
              <span className="badge warning">
                Add a location or access instructions
              </span>
            )}
            <div className="card-actions">
              {resourceHref(l, p.ledgers) && (
                <a
                  className="button"
                  href={resourceHref(l, p.ledgers)!}
                  target={safeURL(l.url) ? "_blank" : undefined}
                  rel="noreferrer"
                >
                  {safeURL(l.url) ? "Open resource ↗" : "Open ledger →"}
                </a>
              )}
              {l.location && (
                <Action
                  className="button secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(l.location!);
                  }}
                >
                  Copy location
                </Action>
              )}
              <button
                className="button secondary"
                onClick={() => setRecord({ ...l })}
              >
                Edit
              </button>
            </div>
          </article>
        ))}
      </div>
      {!links.length && (
        <Empty title="Nothing matches yet">
          Try a different search or add a new resource.
        </Empty>
      )}
      {record && (
        <EntityEditor
          entity="links"
          record={record}
          onClose={() => setRecord(null)}
        />
      )}
    </>
  );
}
