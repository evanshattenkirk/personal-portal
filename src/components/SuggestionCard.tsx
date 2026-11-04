"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_META } from "@/lib/trip-theme";
import type { Suggestion, SuggestionStatus } from "@/lib/types";

/**
 * One idea card with working controls. Save / Mark booked / Dismiss write the
 * suggestion's status straight to Supabase (RLS: owner-only), optimistically.
 * When `interactive` is false (demo/seed mode) the controls are hidden.
 */
export function SuggestionCard({
  s,
  interactive,
  index,
}: {
  s: Suggestion;
  interactive: boolean;
  index?: number;
}) {
  const meta = CATEGORY_META[s.category];
  const [status, setStatus] = useState<SuggestionStatus>(s.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(next: SuggestionStatus) {
    if (busy || next === status) return;
    const prev = status;
    setStatus(next);
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase
        .from("trip_suggestions")
        .update({ status: next })
        .eq("id", s.id);
      if (err) throw err;
    } catch {
      setStatus(prev);
      setError("Couldn't save that — try again.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "dismissed") {
    return (
      <div className="flex items-center justify-between rounded-xl border border-dashed border-zinc-800 px-4 py-2.5 text-xs text-zinc-500">
        <span>
          Dismissed: <span className="text-zinc-400">{s.title}</span>
        </span>
        {interactive ? (
          <button
            type="button"
            onClick={() => apply(s.status === "dismissed" ? "suggested" : s.status)}
            className="rounded-full border border-zinc-700 px-2.5 py-1 font-medium text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
          >
            Undo
          </button>
        ) : null}
      </div>
    );
  }

  const isBooked = status === "booked";
  const isSaved = status === "saved";

  return (
    <article
      className={`relative overflow-hidden rounded-xl border bg-zinc-900/60 p-4 pl-5 ${
        isBooked
          ? "border-emerald-500/40 ring-1 ring-emerald-500/30"
          : "border-zinc-800"
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-1 ${isBooked ? "bg-emerald-400" : meta.bar}`}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          {index != null ? (
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[11px] font-bold text-zinc-300">
              {index}
            </span>
          ) : null}
          <h3 className="leading-snug font-medium">
            {s.url ? (
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:text-sky-300"
              >
                {s.title}
              </a>
            ) : (
              s.title
            )}
          </h3>
        </div>
        {s.priceLabel ? (
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${meta.pill}`}
          >
            {s.priceLabel}
          </span>
        ) : null}
      </div>

      {s.subtitle ? (
        <p className="mt-1.5 text-xs font-medium tracking-wide text-zinc-400">
          {s.subtitle}
        </p>
      ) : null}
      {s.detail ? (
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
          {s.detail}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isBooked ? (
          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
            ✓ Booked
          </span>
        ) : isSaved ? (
          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300">
            ★ Saved
          </span>
        ) : null}

        {interactive ? (
          <span className="ml-auto inline-flex items-center gap-1.5">
            {!isBooked ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => apply(isSaved ? "suggested" : "saved")}
                className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:border-amber-400/60 hover:text-amber-300 disabled:opacity-50"
              >
                {isSaved ? "★ Saved" : "☆ Save"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => apply(isBooked ? "suggested" : "booked")}
              className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:border-emerald-400/60 hover:text-emerald-300 disabled:opacity-50"
            >
              {isBooked ? "↩ Un-book" : "✓ Mark booked"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => apply("dismissed")}
              aria-label={`Dismiss ${s.title}`}
              className="rounded-full border border-zinc-700 px-2 py-1 text-[11px] font-medium text-zinc-400 transition-colors hover:border-rose-400/60 hover:text-rose-300 disabled:opacity-50"
            >
              ✕
            </button>
          </span>
        ) : null}
      </div>

      {s.source ? (
        <div className="mt-2 text-[11px] tracking-wide text-zinc-600 uppercase">
          via {s.source}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </article>
  );
}
