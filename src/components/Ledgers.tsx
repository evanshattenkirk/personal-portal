"use client";
import Link from "next/link";
import { useState } from "react";
import { usePortal } from "./PortalProvider";
import { Empty, SectionTitle } from "./Kit";
import { fmtMoney, fmtDate } from "@/lib/model";
export default function Ledgers({ slug }: { slug?: string }) {
  const p = usePortal();
  const [q, setQ] = useState(""),
    [direction, setDirection] = useState("all");
  if (!slug)
    return (
      <>
        <div className="page-heading">
          <div>
            <h1>Ledgers</h1>
            <p className="page-intro">
              Reconciled summaries from your ledger sources.
            </p>
          </div>
        </div>
        <div className="grid-two">
          {p.ledgers.map((l) => (
            <Link key={l.id} href={`/ledgers/${l.slug}`} className="card">
              <span className="eyebrow">
                {l.asOf ? `As of ${l.asOf}` : "Update date not recorded"}
              </span>
              <h2>
                {l.icon} {l.name}
              </h2>
              <div className="balance-number">{fmtMoney(l.net)}</div>
              <p className="muted">{l.netLabel ?? "Recorded net"}</p>
              <div className="credit-values">
                <span>
                  <strong>{fmtMoney(l.totalIn)}</strong>in
                </span>
                <span>
                  <strong>{fmtMoney(l.totalOut)}</strong>out
                </span>
              </div>
              {l.balanceValue != null && (
                <p>
                  {l.balanceLabel ?? "Balance"}: {fmtMoney(l.balanceValue)}
                </p>
              )}
              <p className="text-link" style={{ marginTop: 16 }}>
                View ledger · {l.entriesCount ?? 0} recorded entries →
              </p>
            </Link>
          ))}
        </div>
        {!p.ledgers.length && (
          <Empty title="No ledgers loaded">
            Your synced ledger summaries will appear here.
          </Empty>
        )}
      </>
    );
  const ledger = p.ledgers.find((l) => l.slug === slug);
  if (!ledger)
    return (
      <Empty title="Ledger not found">
        <Link href="/ledgers">Back to ledgers</Link>
      </Empty>
    );
  const entries = p.ledgerEntries
    .filter(
      (e) =>
        e.ledgerSlug === slug &&
        (direction === "all" || e.direction === direction) &&
        `${e.note ?? ""} ${e.entryDate} ${e.amount}`
          .toLowerCase()
          .includes(q.toLowerCase()),
    )
    .sort(
      (a, b) =>
        b.entryDate.localeCompare(a.entryDate) || b.sortOrder - a.sortOrder,
    );
  return (
    <>
      <Link className="text-link" href="/ledgers">
        ← All ledgers
      </Link>
      <div className="page-heading" style={{ marginTop: 20 }}>
        <div>
          <span className="eyebrow">
            {ledger.asOf ? `As of ${ledger.asOf}` : "Recorded summary"}
          </span>
          <h1>{ledger.name}</h1>
          <p className="page-intro">{ledger.summary}</p>
        </div>
      </div>
      <div className="metrics">
        {[
          ["Total in", ledger.totalIn],
          ["Total out", ledger.totalOut],
          [ledger.netLabel ?? "Recorded net", ledger.net],
          [ledger.balanceLabel ?? "Balance", ledger.balanceValue],
        ].map(([label, value]) => (
          <div className="metric" key={String(label)}>
            <small>{label}</small>
            <strong>{fmtMoney(value as number | null)}</strong>
          </div>
        ))}
      </div>
      <SectionTitle title={`Itemized entries (${entries.length})`} />
      <p className="notice" style={{ marginBottom: 20 }}>
        The summary is the reconciled source total. Itemized entries may cover
        only part of that total; filtering this list does not change the
        summary.
      </p>
      <div className="toolbar">
        <input
          aria-label="Search ledger entries"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notes, dates, or amounts…"
        />
        <select
          aria-label="Entry direction"
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
        >
          <option value="all">Money in & out</option>
          <option value="in">In only</option>
          <option value="out">Out only</option>
        </select>
      </div>
      <div className="card table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>In</th>
              <th>Out</th>
              <th>Note</th>
              <th>Fee</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{fmtDate(e.entryDate)}</td>
                <td>{e.direction === "in" ? fmtMoney(e.amount) : "—"}</td>
                <td>{e.direction === "out" ? fmtMoney(e.amount) : "—"}</td>
                <td>{e.note ?? "—"}</td>
                <td>{e.fee == null ? "—" : fmtMoney(e.fee)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!entries.length && <Empty title="No itemized entries in this view" />}
      </div>
    </>
  );
}
