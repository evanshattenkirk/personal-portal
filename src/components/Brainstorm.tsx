"use client";
import { useState } from "react";
import { usePortal } from "./PortalProvider";
import { Action, Empty, SectionTitle } from "./Kit";
import { newRecord } from "./Editors";
import {
  buildAIBrief,
  hasTag,
  noteKindLabel,
  parseAIIdeas,
  promptStarters,
  splitTags,
} from "@/lib/brainstorm";
import { fmtDate } from "@/lib/model";
import type {
  EntityName,
  Suggestion,
  SuggestionCategory,
  Trip,
  TripNote,
} from "@/lib/types";

const noteKinds: TripNote["kind"][] = ["note", "ask_ai", "preference"];
const noteHint: Record<TripNote["kind"], string> = {
  note: "A thought, a link, something someone said…",
  ask_ai:
    "e.g. Find three all-inclusives with a good live music scene, under $700 a night.",
  preference:
    "e.g. Mom wants a direct flight. We'd rather be walkable than on a remote beach.",
};

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
  const openNotes = notes.filter((n) => n.status === "open");
  const doneNotes = notes.filter((n) => n.status === "done");

  const [draft, setDraft] = useState(""),
    [kind, setKind] = useState<TripNote["kind"]>("ask_ai"),
    [copied, setCopied] = useState(""),
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

  const saveNote = async () => {
    if (!draft.trim()) throw new Error("Write a note first.");
    await p.save("notes", {
      ...(newRecord("notes", slug) as unknown as TripNote),
      body: draft.trim(),
      kind,
    });
    setDraft("");
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
      <div className="grid-two">
        <section className="card brainstorm-notes">
          <span className="eyebrow">Notes for your AI</span>
          <h2>Jot it down, hand it off</h2>
          <p className="page-intro">
            Type anything here. When you&apos;re ready, copy the brief below and
            paste it to Claude. It reads every open note and acts on the
            &ldquo;Ask AI&rdquo; ones.
          </p>
          <div className="toolbar" style={{ margin: "14px 0 10px" }}>
            {noteKinds.map((k) => (
              <button
                key={k}
                className={`pill ${kind === k ? "active" : ""}`}
                onClick={() => setKind(k)}
              >
                {noteKindLabel[k]}
              </button>
            ))}
          </div>
          <label className="field wide">
            <span className="sr-only">New note</span>
            <textarea
              rows={4}
              value={draft}
              placeholder={noteHint[kind]}
              disabled={!ready}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  saveNote().catch(() => undefined);
                }
              }}
            />
          </label>
          <div className="card-actions" style={{ marginTop: 10 }}>
            <Action className="button" onClick={saveNote}>
              Save note
            </Action>
            <span
              className="muted"
              style={{ fontSize: 11, alignSelf: "center" }}
            >
              ⌘/Ctrl + Enter saves
            </span>
          </div>
          <div className="note-list">
            {openNotes.map((n) => (
              <article className="note-item" key={n.id}>
                <div className="card-header" style={{ marginBottom: 6 }}>
                  <span
                    className={`badge ${n.kind === "ask_ai" ? "coral" : n.kind === "preference" ? "success" : "neutral"}`}
                  >
                    {n.kind === "preference"
                      ? ""
                      : `#${openNotes.filter((x) => x.kind !== "preference").indexOf(n) + 1} · `}
                    {noteKindLabel[n.kind]}
                  </span>
                  <small className="muted">
                    {n.createdAt ? fmtDate(n.createdAt.slice(0, 10)) : ""}
                  </small>
                </div>
                <p style={{ whiteSpace: "pre-wrap" }}>{n.body}</p>
                {n.aiReply && (
                  <details>
                    <summary className="text-link">What your AI said</summary>
                    <p style={{ whiteSpace: "pre-wrap" }}>{n.aiReply}</p>
                  </details>
                )}
                <div className="card-actions" style={{ marginTop: 8 }}>
                  <Action
                    className="button small secondary"
                    onClick={() => p.save("notes", { ...n, status: "done" })}
                  >
                    Mark handled
                  </Action>
                  <button
                    className="button small ghost"
                    onClick={() => onEdit("notes", n)}
                  >
                    Edit / add AI reply
                  </button>
                </div>
              </article>
            ))}
            {!openNotes.length && ready && (
              <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
                No open notes. Anything you add shows up in the AI brief.
              </p>
            )}
          </div>
          {!!doneNotes.length && (
            <details style={{ marginTop: 14 }}>
              <summary className="text-link">
                Handled notes ({doneNotes.length})
              </summary>
              {doneNotes.map((n) => (
                <div className="mini-row" key={n.id}>
                  <span>
                    <strong>{noteKindLabel[n.kind]}</strong>
                    <small style={{ whiteSpace: "pre-wrap" }}>{n.body}</small>
                  </span>
                  <Action
                    className="button small secondary"
                    onClick={() => p.save("notes", { ...n, status: "open" })}
                  >
                    Reopen
                  </Action>
                </div>
              ))}
            </details>
          )}
        </section>
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
        eyebrow="Hand it to your AI"
        title="Copy a brief, paste it to Claude"
        action={
          <button className="button secondary" onClick={download}>
            Download brief (.md)
          </button>
        }
      />
      <div className="prompt-grid">
        {promptStarters.map((s) => (
          <article className="card prompt-card" key={s.id}>
            <h3>{s.label}</h3>
            <p>{s.ask}</p>
            <Action className="button small" onClick={() => copy(s.id, s.ask)}>
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

      <SectionTitle eyebrow="Bring ideas back" title="Paste your AI's reply" />
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
    </>
  );
}
