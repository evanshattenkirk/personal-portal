"use client";
import { useEffect, useRef, useState } from "react";
import { usePortal } from "./PortalProvider";
import { Action } from "./Kit";
import { newRecord } from "./Editors";
import { noteKindLabel } from "@/lib/brainstorm";
import { attachmentBucket, splitAttachments } from "@/lib/records";
import { createClient } from "@/lib/supabase/client";
import type { EntityName, TripNote } from "@/lib/types";

const noteKinds: TripNote["kind"][] = ["ask_ai", "note", "preference"];
const noteHint: Record<TripNote["kind"], string> = {
  note: "A thought, a link, something someone said…",
  ask_ai:
    "e.g. Find three all-inclusives with a good live music scene, under $700 a night.",
  preference:
    "e.g. Mom wants a direct flight. We'd rather be walkable than on a remote beach.",
};
const MAX_FILES = 6,
  MAX_BYTES = 10 * 1024 * 1024;
export const isEvan = (n: TripNote) => (n.author ?? "evan") === "evan";
const who = (n: TripNote) =>
  isEvan(n) ? "You" : (n.author ?? "AI").replace(/^./, (c) => c.toUpperCase());
const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Chicago",
      })
    : "";

/** Private screenshot thumbnails, loaded through short-lived signed links. */
function Screenshots({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join("|");
  useEffect(() => {
    if (!key) return;
    let live = true;
    createClient()
      .storage.from(attachmentBucket)
      .createSignedUrls(key.split("|"), 60 * 60)
      .then(({ data }) => {
        if (!live || !data) return;
        setUrls(
          Object.fromEntries(
            data
              .filter((d) => d.path && d.signedUrl)
              .map((d) => [d.path!, d.signedUrl as string]),
          ),
        );
      });
    return () => {
      live = false;
    };
  }, [key]);
  if (!paths.length) return null;
  return (
    <div className="shot-row">
      {paths.map((path) =>
        urls[path] ? (
          <a key={path} href={urls[path]} target="_blank" rel="noreferrer">
            <img src={urls[path]} alt="Attached screenshot" />
          </a>
        ) : (
          <span key={path} className="shot-placeholder">
            Screenshot
          </span>
        ),
      )}
    </div>
  );
}

export default function TripChat({
  slug,
  onEdit,
}: {
  slug: string;
  onEdit: (entity: EntityName, record: object) => void;
}) {
  const p = usePortal();
  const ready = p.brainstormReady !== false;
  const canAttach = ready && p.assistantReady !== false && !p.demo;
  const thread = p.notes
    .filter((n) => n.tripSlug === slug)
    .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
  const [draft, setDraft] = useState(""),
    [kind, setKind] = useState<TripNote["kind"]>("ask_ai"),
    [files, setFiles] = useState<File[]>([]),
    [showAll, setShowAll] = useState(false),
    [fileError, setFileError] = useState(""),
    [thinking, setThinking] = useState<"" | "chat" | "research">(""),
    [askError, setAskError] = useState(""),
    [askInfo, setAskInfo] = useState("");
  const instant = Boolean(p.instantReplies) && !p.demo;
  const input = useRef<HTMLInputElement>(null);
  const shown = showAll ? thread : thread.slice(-12);
  const unread = thread.filter((n) => !isEvan(n) && n.status === "open");
  const waiting = thread.filter((n) => isEvan(n) && n.status === "open");
  const evanOpen = waiting.filter((n) => n.kind !== "preference");

  const pick = (list: FileList | null) => {
    setFileError("");
    const next = [...files, ...Array.from(list ?? [])];
    const bad = next.find((f) => !f.type.startsWith("image/"));
    if (bad) return setFileError(`${bad.name} isn't an image.`);
    if (next.some((f) => f.size > MAX_BYTES))
      return setFileError("Each screenshot must be under 10 MB.");
    if (next.length > MAX_FILES)
      return setFileError(`Attach up to ${MAX_FILES} screenshots at a time.`);
    setFiles(next);
  };

  const upload = async () => {
    if (!files.length) return null;
    if (p.demo)
      throw new Error(
        "Screenshots need the live portal. Demo mode can't store files.",
      );
    const db = createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) throw new Error("Your session expired. Sign in again.");
    const paths: string[] = [];
    for (const file of files) {
      const ext =
        (file.name.split(".").pop() ?? "png")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 5) || "png";
      const path = `${user.id}/${slug}/${crypto.randomUUID()}.${ext}`;
      const { error } = await db.storage
        .from(attachmentBucket)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error)
        throw new Error(
          "A screenshot didn't upload. Check that migration 0008 has run, then try again.",
        );
      paths.push(path);
    }
    return paths.join("\n");
  };

  const ask = async (research?: boolean) => {
    setAskError("");
    setAskInfo("");
    setThinking(research ? "research" : "chat");
    try {
      const message = await p.ask(slug, research);
      if (message) setAskInfo(message);
    } catch (e) {
      setAskError(e instanceof Error ? e.message : "Claude couldn't reply.");
    } finally {
      setThinking("");
    }
  };

  const send = async () => {
    if (!draft.trim() && !files.length)
      throw new Error("Write a note or attach a screenshot first.");
    const attachments = await upload();
    await p.save("notes", {
      ...(newRecord("notes", slug) as unknown as TripNote),
      body: draft.trim() || "(screenshot)",
      kind,
      ...(attachments ? { attachments } : {}),
    });
    setDraft("");
    setFiles([]);
    if (input.current) input.current.value = "";
    // Reply right away on Evan's API key. Preferences are just remembered.
    if (instant && kind !== "preference") void ask();
  };

  return (
    <section className="card chat-card">
      <div className="card-header">
        <div>
          <span className="eyebrow">Notes & chat with your AI</span>
          <h2>Jot it down, hand it off</h2>
        </div>
        {unread.length > 0 && (
          <Action
            className="button small secondary"
            onClick={async () => {
              for (const n of unread)
                await p.save("notes", { ...n, status: "done" });
            }}
          >
            Mark {unread.length} read
          </Action>
        )}
      </div>
      <p className="page-intro">
        Type notes, questions, or requests and attach screenshots.{" "}
        {instant
          ? "Claude replies here in a few seconds, and a daily check catches anything left open."
          : "Your AI checks once a day and replies here."}{" "}
        Anything that would change the plan comes as a proposal for you to
        confirm.
      </p>
      <div className="chat-log">
        {thread.length > shown.length && (
          <button className="text-link" onClick={() => setShowAll(true)}>
            Show {thread.length - shown.length} earlier
          </button>
        )}
        {shown.map((n) => (
          <article
            key={n.id}
            className={`chat-bubble ${isEvan(n) ? "mine" : "theirs"} ${n.status === "open" ? "open" : ""}`}
          >
            <div className="chat-meta">
              <strong>{who(n)}</strong>
              {isEvan(n) && (
                <span
                  className={`badge ${n.kind === "ask_ai" ? "coral" : n.kind === "preference" ? "success" : "neutral"}`}
                >
                  {n.kind === "ask_ai" && n.status === "open"
                    ? `#${evanOpen.indexOf(n) + 1} · `
                    : ""}
                  {noteKindLabel[n.kind]}
                </span>
              )}
              {!isEvan(n) && n.status === "open" && (
                <span className="badge coral">New</span>
              )}
              {isEvan(n) && n.status === "done" && n.kind !== "preference" && (
                <span className="badge success">Handled</span>
              )}
              <small>{when(n.createdAt)}</small>
            </div>
            <p>{n.body}</p>
            <Screenshots paths={splitAttachments(n.attachments)} />
            {n.aiReply && (
              <details>
                <summary className="text-link">What your AI said</summary>
                <p>{n.aiReply}</p>
              </details>
            )}
            {isEvan(n) && (
              <div className="chat-actions">
                {n.kind !== "preference" && (
                  <Action
                    className="text-link"
                    onClick={() =>
                      p.save("notes", {
                        ...n,
                        status: n.status === "open" ? "done" : "open",
                      })
                    }
                  >
                    {n.status === "open" ? "Mark handled" : "Reopen"}
                  </Action>
                )}
                <button
                  className="text-link"
                  onClick={() => onEdit("notes", n)}
                >
                  Edit
                </button>
              </div>
            )}
          </article>
        ))}
        {thinking && (
          <article className="chat-bubble theirs">
            <div className="chat-meta">
              <strong>Claude</strong>
            </div>
            <p className="muted">
              {thinking === "research"
                ? "Looking it up on the web… this can take up to a minute."
                : "Typing…"}
            </p>
          </article>
        )}
        {askError && <p className="notice warning">{askError}</p>}
        {askInfo && (
          <p className="muted" style={{ fontSize: 12 }}>
            {askInfo}
          </p>
        )}
        {!thread.length && ready && (
          <p className="muted" style={{ fontSize: 12 }}>
            Nothing yet. Your first note starts the conversation.
          </p>
        )}
      </div>
      <div className="chat-compose">
        <div className="toolbar" style={{ margin: "0 0 8px" }}>
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
            rows={3}
            value={draft}
            placeholder={noteHint[kind]}
            disabled={!ready}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={(e) => {
              const images = Array.from(e.clipboardData.files).filter((f) =>
                f.type.startsWith("image/"),
              );
              if (images.length) {
                e.preventDefault();
                const dt = new DataTransfer();
                images.forEach((f) => dt.items.add(f));
                pick(dt.files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send().catch(() => undefined);
              }
            }}
          />
        </label>
        {files.length > 0 && (
          <div className="file-chips">
            {files.map((f, i) => (
              <span className="badge neutral" key={`${f.name}-${i}`}>
                {f.name}
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {fileError && <span className="error-inline">{fileError}</span>}
        <div className="card-actions" style={{ marginTop: 10 }}>
          <Action className="button" onClick={send}>
            Send
          </Action>
          <label className={`button secondary ${!canAttach ? "disabled" : ""}`}>
            Attach screenshots
            <input
              ref={input}
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={!canAttach}
              onChange={(e) => pick(e.target.files)}
            />
          </label>
          {instant && evanOpen.length > 0 && !thinking && (
            <>
              <button
                type="button"
                className="button secondary"
                onClick={() => ask(false)}
              >
                Reply now
              </button>
              <button
                type="button"
                className="button ghost"
                title="Uses a bigger model with web search (about 10-25¢)"
                onClick={() => ask(true)}
              >
                Look it up
              </button>
            </>
          )}
          <span className="muted" style={{ fontSize: 11, alignSelf: "center" }}>
            Paste images straight in · ⌘/Ctrl + Enter sends
          </span>
        </div>
      </div>
    </section>
  );
}
