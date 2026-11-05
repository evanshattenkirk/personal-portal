"use client";
import { useState } from "react";
import { usePortal } from "./PortalProvider";
import { Action, Empty, SectionTitle } from "./Kit";
import { newRecord } from "./Editors";
import TripChat from "./TripChat";
import Proposals from "./Proposals";
import {
  buildAIBrief,
  hasTag,
  parseAIIdeas,
  promptStarters,
  splitTags,
} from "@/lib/brainstorm";
import type {
  EntityName,
  Suggestion,
  SuggestionCategory,
  Trip,
} from "@/lib/types";

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = value;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export default function Brainstorm({
  trip,
  onEdit,
  onAdd,
  onOpenIdeas,
}: {
  trip: Trip;
  onEdit: (entity: EntityName, record: object) => void;
  onAdd: (entity: EntityName, overrides?: Record<string, unknown>) => void;
  onOpenIdeas: () => void;
}) {
  const p = usePortal();
  const slug = trip.slug;
  const ready = p.brainstormReady !== false;
  const brief = p.briefs.find((b) => b.tripSlug === slug) ?? null;
  const notes = p.notes
    .filter((n) => n.tripSlug === slug)
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  const suggestions = p.suggestions.filter((s) => s.tripSlug === slug);
  const scenarios = p.scenarios.filter((s) => s.tripSlug === slug);

  const [copied, setCopied] = useState(""),
    [reply, setReply] = useState(""),
    [importMsg, setImportMsg] = useState(""),
    [quick, setQuick] = useState(""),
    [quickCat, setQuickCat] = useState<SuggestionCategory>("stay"),
    [quickTag, setQuickTag] = useState("");

  const styles = splitTags(brief?.styles);
  const briefFor = (ask?: string) =>
    buildAIBrief({ trip, brief, notes, scenarios, suggestions, ask });
  const preview = briefFor();

  const copy = async (id: string, ask?: string) => {
    const ok = await copyText(briefFor(ask));
    setCopied(ok ? id : "");
    if (!ok) throw new Error("Copy was blocked. Use Download instead.");
    window.setTimeout(() => setCopied((c) => (c === id ? "" : c)), 2500);
  };
  const download = () => {
    const blob = new Blob([briefFor()], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}-ai-brief.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importIdeas = async () => {
    setImportMsg("");
    const known = new Set(suggestions.map((s) => s.title.trim().toLowerCase()));
    const ideas = parseAIIdeas(reply, slug, () => crypto.randomUUID()).filter(
      (s) => !known.has(s.title.trim().toLowerCase()),
    );
    if (!ideas.length)
      throw new Error("Those ideas are already in your collection.");
    for (const idea of ideas) await p.save("suggestions", idea);
    setReply("");
    setImportMsg(
      `Added ${ideas.length} idea${ideas.length === 1 ? "" : "s"}. Shortlist the good ones below or in Options & ideas.`,
    );
  };

  const addQuick = async () => {
    if (!quick.trim()) throw new Error("Name the idea first.");
    await p.save("suggestions", {
      ...(newRecord("suggestions", slug) as unknown as Suggestion),
      title: quick.trim(),
      category: quickCat,
      source: "Your brainstorm",
      verification: "modeled",
      ...(quickTag ? { tags: quickTag } : {}),
    });
    setQuick("");
  };

  const lanes = [
    ...styles.map((style) => ({
      style,
      items: suggestions.filter(
        (s) => s.status !== "dismissed" && hasTag(s, style),
      ),
    })),
    {
      style: styles.length ? "Everything else" : "All ideas",
      items: suggestions.filter(
        (s) => s.status !== "dismissed" && !styles.some((st) => hasTag(s, st)),
      ),
    },
  ];

  return (
    <>
      {!ready && (
        <div className="notice warning" style={{ marginBottom: 20 }}>
          Notes and the trip brief need one database update before they can be
          saved. Paste <strong>0007_trip_brainstorm.sql</strong> into the
          Supabase SQL editor once, then reload. Everything else keeps working.
        </div>
      )}
      <Proposals tripSlug={slug} showDecided />
      <div className="grid-two">
        <TripChat slug={slug} onEdit={onEdit} />
        <section className="card">
          <div className="card-header">
            <div>
              <span className="eyebrow">The brief</span>
              <h2>What this trip should feel like</h2>
            </div>
            <button
              className="button small secondary"
              disabled={!ready}
              onClick={() =>
                brief
                  ? onEdit("briefs", brief)
                  : onAdd("briefs", { id: `brief-${slug}` })
              }
            >
              {brief ? "Edit" : "Fill it in"}
            </button>
          </div>
          {brief ? (
            <>
              <dl className="scenario-facts brief-facts">
                {(
                  [
                    ["When", brief.window || trip.dateLabel],
                    ["Nights", brief.nights],
                    ["Who", brief.who],
                    ["From", brief.origin],
                    ["Budget", brief.budget],
                  ] as const
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
              {(
                [
                  ["Styles to explore", brief.styles, ""],
                  ["What we want", brief.vibes, "success"],
                  ["Skip", brief.avoid, "coral"],
                ] as const
              ).map(
                ([label, value, tone]) =>
                  splitTags(value).length > 0 && (
                    <div className="tag-row" key={label}>
                      <small className="eyebrow">{label}</small>
                      <div>
                        {splitTags(value).map((t) => (
                          <span className={`badge ${tone}`} key={t}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  ),
              )}
              {brief.mustHaves && (
                <p
                  className="notice"
                  style={{ whiteSpace: "pre-wrap", marginTop: 14 }}
                >
                  {brief.mustHaves}
                </p>
              )}
            </>
          ) : (
            <Empty title="Give your brainstorm a target">
              When, how long, who&apos;s coming, the styles to explore (cruise,
              Airbnb, all-inclusive…), what you want, and what to skip. Your AI
              uses this for every idea.
            </Empty>
          )}
        </section>
      </div>

      <SectionTitle
        eyebrow="The brainstorm board"
        title="Ideas by trip style"
        action={
          <button className="text-link" onClick={onOpenIdeas}>
            Full idea collection →
          </button>
        }
      />
      <div className="toolbar">
        <input
          aria-label="Quick idea"
          placeholder="Drop an idea: Royal Caribbean 4-night Bahamas, Nashville Airbnb…"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addQuick().catch(() => undefined);
            }
          }}
        />
        <select
          aria-label="Idea category"
          value={quickCat}
          onChange={(e) => setQuickCat(e.target.value as SuggestionCategory)}
        >
          {["stay", "activity", "food", "flight", "planning"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {ready && styles.length > 0 && (
          <select
            aria-label="Trip style"
            value={quickTag}
            onChange={(e) => setQuickTag(e.target.value)}
          >
            <option value="">No style</option>
            {styles.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <Action className="button" onClick={addQuick}>
          + Add
        </Action>
      </div>
      <div className="lane-grid">
        {lanes
          .filter((l) => l.items.length || styles.includes(l.style))
          .map((lane) => (
            <section className="card lane" key={lane.style}>
              <div className="card-header" style={{ marginBottom: 8 }}>
                <h3>{lane.style}</h3>
                <span className="badge neutral">{lane.items.length}</span>
              </div>
              {lane.items.map((s) => (
                <div className="mini-row" key={s.id}>
                  <span>
                    <strong>{s.title}</strong>
                    <small>
                      {[s.category, s.priceLabel, s.subtitle]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </span>
                  <span style={{ display: "flex", gap: 4 }}>
                    <Action
                      className="button small ghost"
                      title={
                        s.status === "saved"
                          ? "Remove from shortlist"
                          : "Shortlist"
                      }
                      onClick={() =>
                        p.save("suggestions", {
                          ...s,
                          status: s.status === "saved" ? "suggested" : "saved",
                        })
                      }
                    >
                      {s.status === "saved" ? "★" : "☆"}
                    </Action>
                    <button
                      className="button small ghost"
                      onClick={() => onEdit("suggestions", s)}
                    >
                      Edit
                    </button>
                  </span>
                </div>
              ))}
              {!lane.items.length && (
                <p className="muted" style={{ fontSize: 12 }}>
                  Nothing here yet. Ask your AI to brainstorm this style.
                </p>
              )}
            </section>
          ))}
      </div>
      {!suggestions.length && (
        <Empty title="An empty board, ready to fill">
          Drop a quick idea above, or copy &ldquo;Brainstorm fresh
          options&rdquo; and paste the reply back in.
        </Empty>
      )}
      <details className="brief-handoff" style={{ marginTop: 28 }}>
        <summary className="section-title" style={{ cursor: "pointer" }}>
          <div>
            <span className="eyebrow">Using another AI?</span>
            <h2>Copy a brief, paste the reply back</h2>
          </div>
        </summary>
        <div className="card-actions" style={{ margin: "14px 0" }}>
          <button className="button secondary" onClick={download}>
            Download brief (.md)
          </button>
        </div>
        <div className="prompt-grid">
          {promptStarters.map((s) => (
            <article className="card prompt-card" key={s.id}>
              <h3>{s.label}</h3>
              <p>{s.ask}</p>
              <Action
                className="button small"
                onClick={() => copy(s.id, s.ask)}
              >
                {copied === s.id ? "✓ Copied" : "Copy brief + ask"}
              </Action>
            </article>
          ))}
        </div>
        <details className="card" style={{ marginTop: 16 }}>
          <summary className="text-link">
            See exactly what your AI will read
          </summary>
          <pre className="brief-preview">{preview}</pre>
          <Action
            className="button small secondary"
            onClick={() => copy("plain")}
          >
            {copied === "plain" ? "✓ Copied" : "Copy brief only"}
          </Action>
        </details>

        <SectionTitle eyebrow="Bring ideas back" title="Paste the reply" />
        <section className="card">
          <p className="page-intro">
            The brief asks your AI to end with a short list of ideas in a fixed
            format. Paste the whole reply here and they land in your idea
            collection, marked as estimates to check.
          </p>
          <label className="field wide" style={{ marginTop: 12 }}>
            <span className="sr-only">AI reply</span>
            <textarea
              rows={5}
              value={reply}
              placeholder="Paste the reply, including the ```json block at the end…"
              onChange={(e) => setReply(e.target.value)}
            />
          </label>
          <div className="card-actions" style={{ marginTop: 10 }}>
            <Action className="button" onClick={importIdeas}>
              Import ideas
            </Action>
            {importMsg && (
              <span
                className="muted"
                style={{ fontSize: 12, alignSelf: "center" }}
              >
                {importMsg}
              </span>
            )}
          </div>
        </section>
      </details>
    </>
  );
}
