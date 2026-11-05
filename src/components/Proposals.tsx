"use client";
import { useState } from "react";
import { usePortal } from "./PortalProvider";
import { Action } from "./Kit";
import {
  describeChange,
  parseChanges,
  proposalKindLabel,
  type ProposalChange,
} from "@/lib/proposals";
import { fmtDate, safeURL } from "@/lib/model";
import type { TripProposal } from "@/lib/types";

function ProposalCard({ proposal }: { proposal: TripProposal }) {
  const p = usePortal();
  const [asking, setAsking] = useState(false),
    [feedback, setFeedback] = useState("");
  let changes: ProposalChange[] = [],
    problem = "";
  try {
    changes = parseChanges(proposal.changes);
  } catch (e) {
    problem = e instanceof Error ? e.message : "These changes can't be read.";
  }
  const trip = p.trips.find((t) => t.slug === proposal.tripSlug);
  const link = safeURL(proposal.url);
  return (
    <article className="card proposal-card">
      <div className="card-header" style={{ marginBottom: 8 }}>
        <span className="eyebrow">
          {proposalKindLabel[proposal.kind]}
          {trip ? ` · ${trip.name}` : ""}
          {proposal.author ? ` · from ${proposal.author}` : ""}
        </span>
        <small className="muted">
          {proposal.createdAt ? fmtDate(proposal.createdAt.slice(0, 10)) : ""}
        </small>
      </div>
      <h3>{proposal.title}</h3>
      {proposal.body && <p className="proposal-body">{proposal.body}</p>}
      {changes.length > 0 && (
        <ul className="change-list">
          {changes.map((c, i) => (
            <li key={i}>{describeChange(c)}</li>
          ))}
        </ul>
      )}
      {problem && <p className="notice warning">{problem}</p>}
      {link && (
        <a className="text-link" href={link} target="_blank" rel="noreferrer">
          Open source ↗
        </a>
      )}
      {asking && (
        <label className="field wide" style={{ marginTop: 12 }}>
          <span>What should change?</span>
          <textarea
            rows={3}
            value={feedback}
            placeholder="e.g. Close, but find something with a shorter flight."
            onChange={(e) => setFeedback(e.target.value)}
          />
        </label>
      )}
      <div className="card-actions">
        {!asking ? (
          <>
            {!problem && (
              <Action
                className="button small"
                onClick={() => p.decide(proposal.id, "accepted")}
              >
                {changes.length
                  ? `Confirm ${changes.length === 1 ? "change" : `${changes.length} changes`}`
                  : "Got it"}
              </Action>
            )}
            <button
              className="button small secondary"
              onClick={() => setAsking(true)}
            >
              Ask for changes
            </button>
            <Action
              className="button small ghost"
              onClick={() => p.decide(proposal.id, "rejected")}
            >
              No thanks
            </Action>
          </>
        ) : (
          <>
            <Action
              className="button small"
              onClick={async () => {
                if (!feedback.trim())
                  throw new Error("Say what should change.");
                await p.decide(proposal.id, "rejected", feedback);
              }}
            >
              Send back
            </Action>
            <button
              className="button small ghost"
              onClick={() => setAsking(false)}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </article>
  );
}

/** Pending assistant proposals. Nothing is applied until Evan confirms. */
export default function Proposals({
  tripSlug,
  showDecided = false,
}: {
  tripSlug?: string | null;
  showDecided?: boolean;
}) {
  const p = usePortal();
  const mine = p.proposals
    .filter((x) => tripSlug === undefined || x.tripSlug === tripSlug)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const pending = mine.filter((x) => x.status === "pending");
  const decided = mine.filter((x) => x.status !== "pending");
  if (!pending.length && !(showDecided && decided.length)) return null;
  return (
    <div className="proposals">
      {pending.length > 0 && (
        <>
          <div className="section-title" style={{ marginTop: 0 }}>
            <div>
              <span className="eyebrow">Waiting for your OK</span>
              <h2>
                {pending.length} proposal{pending.length === 1 ? "" : "s"} from
                your AI
              </h2>
            </div>
          </div>
          <div className="idea-grid">
            {pending.map((x) => (
              <ProposalCard key={x.id} proposal={x} />
            ))}
          </div>
        </>
      )}
      {showDecided && decided.length > 0 && (
        <details style={{ marginTop: 14 }}>
          <summary className="text-link">
            Past proposals ({decided.length})
          </summary>
          {decided.map((x) => (
            <div className="mini-row" key={x.id}>
              <span>
                <strong>{x.title}</strong>
                <small>
                  {x.status === "accepted" ? "Confirmed" : "Declined"}
                  {x.decidedAt ? ` · ${fmtDate(x.decidedAt.slice(0, 10))}` : ""}
                  {x.feedback ? ` · “${x.feedback}”` : ""}
                </small>
              </span>
              <span className="badge neutral">{proposalKindLabel[x.kind]}</span>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
