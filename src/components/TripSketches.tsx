"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useId,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { usePortal } from "./PortalProvider";
import { Icon } from "./Kit";
import { drawSketch, loadSketches, undoSketch } from "@/app/sketch-actions";
import {
  briefFit,
  compareAsText,
  dayPartLabel,
  dayParts,
  nightsLabel,
  nightsWarning,
  quickSketch,
  sketchFrame,
  sketchHash,
  type OptionSketch,
  type SketchDay,
} from "@/lib/sketch";
import type { EntityName, Suggestion, Trip, TripBrief } from "@/lib/types";

// Sample itineraries for a trip's options: a hover preview on the idea board,
// a bottom sheet on phones, and a side-by-side compare for up to 3 options.

const MAX_COMPARE = 3;
const OPEN_DELAY = 350,
  SKIM_DELAY = 100,
  SKIM_WINDOW = 600,
  CLOSE_GRACE = 200,
  SCROLL_QUIET = 300;

type Status = "loading" | "ready" | "updating" | "error";
interface Entry {
  sketch: OptionSketch | null;
  status: Status;
  error?: string;
  drawing?: boolean; // a request for this option is in flight
  slow?: boolean; // ...and it's taking longer than usual
}
interface Preview {
  id: string;
  anchor: HTMLElement;
  pinned: boolean;
}
interface Toast {
  text: string;
  undo?: () => void;
}
type Ctx = {
  trip: Trip;
  brief: TripBrief | null;
  options: Suggestion[];
  entries: Record<string, Entry>;
  stored: boolean;
  aiReady: boolean;
  prefetch: (id: string) => void;
  redraw: (id: string) => Promise<void>;
  undo: (id: string) => Promise<void>;
  retry: (id: string) => void;
  selected: string[];
  toggle: (id: string) => void;
  clear: () => void;
  limitNote: string;
  flash: number;
  preview: Preview | null;
  hoverOpen: (id: string, anchor: HTMLElement) => void;
  hoverLeave: (e: React.PointerEvent) => void;
  pin: (id: string, anchor: HTMLElement) => void;
  closePreview: (focusBack?: boolean) => void;
  keepPreview: () => void;
  compareOpen: string[] | null;
  openCompare: (ids?: string[], from?: HTMLElement | null) => void;
  closeCompare: () => void;
  onEdit: (entity: EntityName, record: object) => void;
  toast: (t: Toast) => void;
};
const SketchContext = createContext<Ctx | null>(null);
const useSketches = () => {
  const c = useContext(SketchContext);
  if (!c) throw new Error("SketchProvider missing");
  return c;
};

const readLocal = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeLocal = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Browser storage is a convenience only. */
  }
};
/** A ref that always holds the latest value, updated after each render. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
const useMedia = (query: string) => {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
};

export function SketchProvider({
  trip,
  brief,
  options,
  onEdit,
  children,
}: {
  trip: Trip;
  brief: TripBrief | null;
  options: Suggestion[];
  onEdit: (entity: EntityName, record: object) => void;
  children: ReactNode;
}) {
  const p = usePortal();
  const slug = trip.slug;
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [stored, setStored] = useState(true);
  const [aiReady, setAiReady] = useState(true);
  const entriesRef = useLatest(entries);
  const queue = useRef<string[]>([]);
  const inflight = useRef(new Set<string>());
  const dirty = useRef(new Set<string>());
  const seq = useRef<Record<string, number>>({});
  const running = useRef(0);
  const optionsRef = useLatest(options);
  const hashes = useMemo(
    () => Object.fromEntries(options.map((o) => [o.id, sketchHash(o, brief, trip)])),
    [options, brief, trip],
  );
  const hashesRef = useLatest(hashes);
  const hashKey = Object.entries(hashes)
    .map(([k, v]) => `${k}:${v}`)
    .join("|");

  const patch = useCallback((id: string, e: Partial<Entry>) => {
    setEntries((prev) => {
      const base: Entry = prev[id] ?? { sketch: null, status: "loading" };
      return { ...prev, [id]: { ...base, ...e } };
    });
  }, []);

  const failText = () =>
    typeof navigator !== "undefined" && !navigator.onLine
      ? "You're offline. The sketch will load when you're back."
      : "Couldn't sketch this one.";

  /** One draw at a time per option; a newer request always wins. */
  const run = useCallback(
    async (id: string, fresh: boolean) => {
      const mine = (seq.current[id] = (seq.current[id] ?? 0) + 1);
      inflight.current.add(id);
      patch(id, { drawing: true, slow: false });
      const slowTimer = window.setTimeout(
        () => seq.current[id] === mine && patch(id, { slow: true }),
        12000,
      );
      try {
        const res = await drawSketch(id, fresh);
        if (seq.current[id] !== mine) return res;
        if (res.sketch) {
          if (!res.stored) setStored(false);
          const current = res.sketch.hash === hashesRef.current[id];
          patch(id, {
            sketch: res.sketch,
            status: current ? "ready" : "updating",
            error: undefined,
          });
          if (!current) dirty.current.add(id);
        } else
          patch(id, {
            status: entriesRef.current[id]?.sketch ? "ready" : "error",
            error: res.error ?? failText(),
          });
        return res;
      } catch {
        if (seq.current[id] === mine)
          patch(id, {
            status: entriesRef.current[id]?.sketch ? "ready" : "error",
            error: failText(),
          });
        return null;
      } finally {
        window.clearTimeout(slowTimer);
        if (seq.current[id] === mine) {
          inflight.current.delete(id);
          patch(id, { drawing: false, slow: false });
        }
      }
    },
    [patch, entriesRef, hashesRef],
  );

  const pumpRef = useRef<() => void>(() => undefined);
  const pump = useCallback(() => {
    while (running.current < 2 && queue.current.length) {
      const id = queue.current.shift()!;
      if (inflight.current.has(id)) {
        // Already drawing: draw again once that finishes, with fresh inputs.
        dirty.current.add(id);
        continue;
      }
      running.current++;
      run(id, false).finally(() => {
        running.current--;
        if (dirty.current.delete(id) && !inflight.current.has(id))
          queue.current.push(id);
        pumpRef.current();
      });
    }
  }, [run]);
  useLayoutEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const [loadTick, setLoadTick] = useState(0);
  // Load: cached copy first (instant), then the server's, then draw what's missing.
  useEffect(() => {
    let cancelled = false;
    const opts = optionsRef.current;
    const local = readLocal<Record<string, OptionSketch>>(
      `sketches:${slug}`,
      {},
    );
    const seed: Record<string, Entry> = {};
    for (const o of opts) {
      const have = entriesRef.current[o.id]?.sketch ?? local[o.id] ?? null;
      seed[o.id] = have
        ? {
            sketch: have,
            status: have.hash === hashes[o.id] ? "ready" : "updating",
          }
        : { sketch: null, status: "loading" };
    }
    // Seeding from the browser cache is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEntries(seed);
    if (p.demo) {
      const next: Record<string, Entry> = {};
      for (const o of opts) {
        const cached = local[o.id];
        next[o.id] = {
          sketch:
            cached?.hash === hashes[o.id] ? cached : quickSketch(o, trip, brief),
          status: "ready",
        };
      }
      setEntries(next);
      setAiReady(false);
      return;
    }
    loadSketches(slug)
      .then((res) => {
        if (cancelled) return;
        setStored(res.stored);
        setAiReady(res.aiReady);
        const server = Object.fromEntries(
          res.sketches.map((s) => [s.optionId, s]),
        );
        const next = { ...seed };
        for (const o of opts) {
          const s = server[o.id];
          if (s)
            next[o.id] = {
              sketch: s,
              status: s.hash === hashes[o.id] ? "ready" : "updating",
            };
        }
        setEntries(next);
        const stale = opts.filter((o) => {
          const s = next[o.id]?.sketch;
          return (
            !s ||
            s.hash !== hashes[o.id] ||
            (res.aiReady && res.stored && s.source === "quick")
          );
        });
        // Shortlisted first, then board order.
        stale.sort(
          (a, b) =>
            Number(b.status === "saved") - Number(a.status === "saved"),
        );
        queue.current = stale.map((o) => o.id);
        pump();
      })
      .catch(() => {
        if (cancelled) return;
        setEntries((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([id, e]) => [
              id,
              e.sketch ? e : { ...e, status: "error", error: failText() },
            ]),
          ),
        );
      });
    return () => {
      cancelled = true;
    };
    // hashKey covers the options and the brief.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, hashKey, p.demo, loadTick]);
  // Back online: try again.
  useEffect(() => {
    const on = () => setLoadTick((t) => t + 1);
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, []);

  // Keep a local copy so the next visit shows sketches immediately.
  useEffect(() => {
    const ready = Object.fromEntries(
      Object.entries(entries)
        .filter(([, e]) => e.sketch)
        .map(([id, e]) => [id, e.sketch]),
    );
    if (Object.keys(ready).length) writeLocal(`sketches:${slug}`, ready);
  }, [entries, slug]);

  const prefetch = useCallback(
    (id: string) => {
      if (p.demo || inflight.current.has(id)) return;
      const i = queue.current.indexOf(id);
      if (i > 0) {
        queue.current.splice(i, 1);
        queue.current.unshift(id);
      }
    },
    [p.demo],
  );
  const retry = useCallback(
    (id: string) => {
      patch(id, { status: "loading", error: undefined });
      queue.current = [id, ...queue.current.filter((x) => x !== id)];
      pump();
    },
    [patch, pump],
  );

  const [toastState, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const armToast = useCallback(() => {
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 10000);
  }, []);
  const toast = useCallback(
    (t: Toast) => {
      setToast(t);
      armToast();
    },
    [armToast],
  );
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const undo = useCallback(
    async (id: string) => {
      const res = await undoSketch(id);
      if (!res.sketch) throw new Error(res.error ?? "Couldn't undo.");
      seq.current[id] = (seq.current[id] ?? 0) + 1;
      patch(id, { sketch: res.sketch, status: "ready" });
    },
    [patch],
  );
  const redraw = useCallback(
    async (id: string) => {
      const option = optionsRef.current.find((o) => o.id === id);
      if (!option || entriesRef.current[id]?.drawing) return;
      if (p.demo) {
        patch(id, { sketch: quickSketch(option, trip, brief), status: "ready" });
        return;
      }
      const before = entriesRef.current[id]?.sketch ?? null;
      patch(id, { status: before ? "updating" : "loading", error: undefined });
      queue.current = queue.current.filter((x) => x !== id);
      dirty.current.delete(id);
      const res = await run(id, true);
      if (!res?.sketch) {
        if (before) patch(id, { status: "ready" });
        throw new Error(res?.error ?? "Couldn't sketch a new version.");
      }
      if (res.canUndo)
        toast({
          text: `New sketch for ${option.title}.`,
          undo: () => {
            undo(id).catch((e) =>
              toast({ text: e instanceof Error ? e.message : "Couldn't undo." }),
            );
          },
        });
    },
    [p.demo, patch, trip, brief, toast, undo, run, optionsRef, entriesRef],
  );

  // Compare selection, remembered per trip.
  const [selected, setSelected] = useState<string[]>([]);
  const [limitNote, setLimitNote] = useState("");
  const [flash, setFlash] = useState(0);
  const loadedFor = useRef("");
  useEffect(() => {
    // Browser storage can't be read during the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(readLocal<string[]>(`compare:${slug}`, []));
    loadedFor.current = slug;
  }, [slug]);
  useEffect(() => {
    if (loadedFor.current === slug) writeLocal(`compare:${slug}`, selected);
  }, [selected, slug]);
  // Ideas that left the board drop out of the comparison.
  const known = useMemo(() => new Set(options.map((o) => o.id)), [options]);
  const live = useMemo(
    () => selected.filter((id) => known.has(id)),
    [selected, known],
  );
  const liveRef = useLatest(live);
  const noteTimer = useRef<number | undefined>(undefined);
  const flashTimer = useRef<number | undefined>(undefined);
  const toggle = useCallback(
    (id: string) => {
      const s = liveRef.current;
      window.clearTimeout(noteTimer.current);
      if (s.includes(id)) {
        setLimitNote("");
        setSelected(s.filter((x) => x !== id));
        return;
      }
      if (s.length >= MAX_COMPARE) {
        const t = optionsRef.current.find((o) => o.id === id)?.title ?? "";
        setLimitNote(
          `You can compare 3 at a time. Remove one to add ${t.length > 28 ? `${t.slice(0, 27)}…` : t}.`,
        );
        setFlash((f) => f + 1);
        window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFlash(0), 1500);
        noteTimer.current = window.setTimeout(() => setLimitNote(""), 6000);
        return;
      }
      setLimitNote("");
      setSelected([...s, id]);
    },
    [liveRef, optionsRef],
  );
  const clear = useCallback(() => {
    const prev = liveRef.current;
    setSelected([]);
    setLimitNote("");
    if (prev.length)
      toast({
        text: `Cleared ${prev.length} from compare.`,
        undo: () => setSelected(prev),
      });
  }, [toast, liveRef]);

  // Preview: hover intent, skim mode, scroll suppression, safe triangle, pin.
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewRef = useLatest(preview);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const lastClose = useRef(0);
  const lastScroll = useRef(0);
  const [compareOpen, setCompareOpen] = useState<string[] | null>(null);
  const compareFrom = useRef<HTMLElement | null>(null);
  const compareOpenRef = useLatest(compareOpen);

  const closePreview = useCallback(
    (focusBack = false) => {
      window.clearTimeout(closeTimer.current);
      window.clearTimeout(openTimer.current);
      const cur = previewRef.current;
      if (cur) {
        lastClose.current = Date.now();
        if (focusBack) cur.anchor.focus();
      }
      setPreview(null);
    },
    [previewRef],
  );
  const hoverOpen = useCallback(
    (id: string, anchor: HTMLElement) => {
      window.clearTimeout(closeTimer.current);
      window.clearTimeout(openTimer.current);
      prefetch(id);
      const cur = previewRef.current;
      if (cur?.pinned) return;
      if (cur?.id === id && cur.anchor === anchor) return;
      const skimming = cur || Date.now() - lastClose.current < SKIM_WINDOW;
      const wait = Math.max(
        skimming ? SKIM_DELAY : OPEN_DELAY,
        lastScroll.current + SCROLL_QUIET - Date.now(),
      );
      openTimer.current = window.setTimeout(() => {
        if (document.querySelector("dialog[open]")) return;
        if (window.getSelection()?.toString()) return;
        setPreview({ id, anchor, pinned: false });
      }, wait);
    },
    [prefetch, previewRef],
  );
  // Safe triangle: while the pointer heads from the row toward the preview,
  // keep it open even if it crosses other rows on the way. When it comes to
  // rest, open whatever it rests on.
  const exitPoint = useRef<{ x: number; y: number } | null>(null);
  const hoverLeave = useCallback(
    (e: React.PointerEvent) => {
      window.clearTimeout(openTimer.current);
      const cur = previewRef.current;
      if (!cur || cur.pinned) return;
      exitPoint.current = { x: e.clientX, y: e.clientY };
      window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(
        () => closePreview(),
        CLOSE_GRACE,
      );
    },
    [closePreview, previewRef],
  );
  const keepPreview = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    window.clearTimeout(openTimer.current);
    exitPoint.current = null;
  }, []);
  useEffect(() => {
    if (!preview || preview.pinned) return;
    const onMove = (e: PointerEvent) => {
      const start = exitPoint.current;
      const pop = document.getElementById("sketch-popover");
      if (!start || !pop) return;
      const r = pop.getBoundingClientRect();
      const nearX = start.x < r.left ? r.left : r.right;
      const a = { x: nearX, y: r.top - 20 },
        b = { x: nearX, y: r.bottom + 20 };
      const sign = (p1: typeof a, p2: typeof a, p3: typeof a) =>
        (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
      const pt = { x: e.clientX, y: e.clientY };
      const d1 = sign(pt, start, a),
        d2 = sign(pt, a, b),
        d3 = sign(pt, b, start);
      const inside = !(
        (d1 < 0 || d2 < 0 || d3 < 0) &&
        (d1 > 0 || d2 > 0 || d3 > 0)
      );
      if (!inside) return;
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
      closeTimer.current = window.setTimeout(() => {
        const under = document.elementFromPoint(pt.x, pt.y);
        if (under?.closest("#sketch-popover")) return;
        const trigger = under?.closest<HTMLElement>(".preview-trigger");
        const id = trigger?.dataset.option;
        if (trigger && id) {
          exitPoint.current = null;
          prefetch(id);
          setPreview({ id, anchor: trigger, pinned: false });
        } else closePreview();
      }, 120);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [preview, closePreview, prefetch]);
  useEffect(() => {
    const onScroll = (e: Event) => {
      const t = e.target as Element | null;
      if (t?.closest?.("#sketch-popover")) return;
      lastScroll.current = Date.now();
      window.clearTimeout(openTimer.current);
      if (previewRef.current && !previewRef.current.pinned) closePreview();
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("wheel", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("wheel", onScroll);
    };
  }, [closePreview, previewRef]);
  const pin = useCallback(
    (id: string, anchor: HTMLElement) => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
      prefetch(id);
      const cur = previewRef.current;
      if (cur?.pinned && cur.id === id && cur.anchor === anchor) {
        closePreview();
        return;
      }
      setPreview({ id, anchor, pinned: true });
    },
    [prefetch, closePreview, previewRef],
  );

  const openCompare = useCallback(
    (list?: string[], from?: HTMLElement | null) => {
      if (!compareOpenRef.current) {
        const origin = from ?? (document.activeElement as HTMLElement | null);
        // A button inside the preview goes away with it; return to its row.
        compareFrom.current = origin?.closest?.("#sketch-popover, .sketch-sheet")
          ? (previewRef.current?.anchor ?? null)
          : origin;
      }
      closePreview();
      setCompareOpen(list ?? liveRef.current);
    },
    [closePreview, compareOpenRef, previewRef, liveRef],
  );
  const closeCompare = useCallback(() => {
    setCompareOpen(null);
    window.setTimeout(() => compareFrom.current?.focus(), 0);
  }, []);

  const value: Ctx = {
    trip,
    brief,
    options,
    entries,
    stored,
    aiReady,
    prefetch,
    redraw,
    undo,
    retry,
    selected: live,
    toggle,
    clear,
    limitNote,
    flash,
    preview,
    hoverOpen,
    hoverLeave,
    pin,
    closePreview,
    keepPreview,
    compareOpen,
    openCompare,
    closeCompare,
    onEdit,
    toast,
  };
  return (
    <SketchContext.Provider value={value}>
      {children}
      <SketchPopover />
      <CompareTray />
      <CompareDialog />
      {toastState && (
        <div
          className="sketch-toast"
          role="status"
          onPointerEnter={() => window.clearTimeout(toastTimer.current)}
          onPointerLeave={armToast}
          onFocus={() => window.clearTimeout(toastTimer.current)}
          onBlur={armToast}
        >
          <span>{toastState.text}</span>
          {toastState.undo && (
            <button
              className="text-link"
              onClick={() => {
                toastState.undo?.();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
          <button
            className="sketch-x"
            aria-label="Dismiss"
            onClick={() => setToast(null)}
          >
            ×
          </button>
        </div>
      )}
    </SketchContext.Provider>
  );
}

/** Notices for the sketch feature, shown above the board. */
export function SketchNotices() {
  const c = useSketches();
  const p = usePortal();
  if (!c.options.length || p.demo) return null;
  if (!c.stored)
    return (
      <div className="notice warning" style={{ marginBottom: 14 }}>
        Sample itineraries need one database update to be saved. Paste{" "}
        <strong>0010_option_sketches.sql</strong> into the Supabase SQL editor
        once, then reload. Until then they&apos;re sketched fresh on each visit.
      </div>
    );
  if (!c.aiReady)
    return (
      <div className="notice" style={{ marginBottom: 14 }}>
        These are quick sample trips. Add an Anthropic API key in Vercel for
        sketches written around each option.
      </div>
    );
  return null;
}

export function SketchHint() {
  const c = useSketches();
  if (!c.options.length) return null;
  return (
    <p className="sketch-hint">
      <span className="only-hover">Hover an option to see a sample trip.</span>
      <span className="only-touch">Tap an option to see a sample trip.</span>{" "}
      Tick up to 3 to compare.
    </p>
  );
}

/** The checkbox on an eligible idea row. */
export function CompareCheck({ option }: { option: Suggestion }) {
  const c = useSketches();
  const on = c.selected.includes(option.id);
  return (
    <label className="compare-check" title={on ? "Remove from compare" : "Add to compare"}>
      <input
        type="checkbox"
        checked={on}
        onChange={() => c.toggle(option.id)}
        aria-label={`Compare ${option.title}`}
      />
    </label>
  );
}

/** The idea's title and meta line, as the preview trigger. */
export function OptionTitle({
  option,
  meta,
}: {
  option: Suggestion;
  meta: string;
}) {
  const c = useSketches();
  const triggerId = useId();
  const finePointer = useMedia("(hover: hover) and (pointer: fine)");
  const open =
    c.preview?.id === option.id &&
    c.preview.anchor.dataset.trigger === triggerId;
  return (
    <button
      data-trigger={triggerId}
      data-option={option.id}
      type="button"
      className={`preview-trigger${open ? " active" : ""}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? "sketch-popover" : undefined}
      onPointerEnter={(e) => {
        if (finePointer && e.pointerType === "mouse")
          c.hoverOpen(option.id, e.currentTarget);
        else c.prefetch(option.id);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") c.hoverLeave(e);
      }}
      onPointerDown={(e) => {
        if (e.buttons === 1 && e.pointerType === "mouse") c.keepPreview();
      }}
      onClick={(e) => c.pin(option.id, e.currentTarget)}
    >
      <strong>{option.title}</strong>
      <small>
        {meta}
        <span className="preview-cue" aria-hidden="true">
          <Icon name="calendar" size={12} />
          Sample trip
        </span>
      </small>
    </button>
  );
}

function useEntry(id: string | undefined) {
  const c = useSketches();
  const option = c.options.find((o) => o.id === id) ?? null;
  const entry = id ? c.entries[id] : undefined;
  const frame = option ? sketchFrame(option, c.trip, c.brief) : null;
  return { c, option, entry, frame };
}

function SketchPopover() {
  const c = useSketches();
  const phone = useMedia("(max-width: 699px)");
  const pv = c.preview;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const place = useCallback(() => {
    const el = ref.current;
    if (!el || !pv) return;
    const vw = window.innerWidth,
      vh = window.innerHeight,
      m = 16,
      gap = 8;
    const w = el.offsetWidth,
      h = el.offsetHeight;
    const row = pv.anchor.getBoundingClientRect();
    const lane = (pv.anchor.closest(".lane") as HTMLElement | null)?.getBoundingClientRect() ?? row;
    const clampY = (y: number) => Math.max(m, Math.min(y, vh - m - h));
    const clampX = (x: number) => Math.max(m, Math.min(x, vw - m - w));
    let left: number, top: number;
    if (lane.right + gap + w <= vw - m) {
      left = lane.right + gap;
      top = clampY(row.top - 12);
    } else if (lane.left - gap - w >= m) {
      left = lane.left - gap - w;
      top = clampY(row.top - 12);
    } else if (row.bottom + gap + h <= vh - m) {
      left = clampX(row.left);
      top = row.bottom + gap;
    } else {
      left = clampX(row.left);
      top = Math.max(m, row.top - gap - h);
    }
    setPos({ left, top });
  }, [pv]);

  useLayoutEffect(() => {
    if (!pv || phone) return;
    place();
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [pv, phone, place]);

  // Pinned: Esc or a click outside closes it; focus moves inside.
  useEffect(() => {
    if (!pv) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector("dialog.compare-dialog[open]")) return;
      // Only pull focus back when it was in the preview or the preview was pinned.
      const inside = ref.current?.contains(document.activeElement);
      c.closePreview(pv.pinned || Boolean(inside));
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || pv.anchor.contains(t)) return;
      if ((t as HTMLElement).closest?.(".compare-tray, .sketch-toast, .sketch-sheet"))
        return;
      c.closePreview();
    };
    window.addEventListener("keydown", onKey);
    // On phones the sheet's backdrop handles outside taps.
    if (pv.pinned && !phone) window.addEventListener("pointerdown", onDown);
    if (pv.pinned && !phone)
      window.setTimeout(() => ref.current?.querySelector<HTMLElement>("h3")?.focus(), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [pv, c, phone]);

  if (!pv || typeof document === "undefined") return null;
  if (phone && pv.pinned)
    return createPortal(<SketchSheet id={pv.id} />, document.body);
  if (phone) return null;
  return createPortal(
    <div
      id="sketch-popover"
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby="sketch-popover-title"
      className={`sketch-popover${pv.pinned ? " pinned" : ""}`}
      style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden", left: 0, top: 0 }}
      onPointerEnter={c.keepPreview}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse" && !pv.pinned) c.hoverLeave(e);
      }}
      onKeyDown={(e) => {
        // Tab past either end returns to the board instead of the page's end.
        if (e.key !== "Tab" || !ref.current) return;
        const focusable = [
          ...ref.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"),
        ];
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (!e.shiftKey && active === last) {
          e.preventDefault();
          const next = pv.anchor
            .closest(".mini-row")
            ?.querySelector<HTMLElement>(":scope > span:last-child button");
          c.closePreview();
          (next ?? pv.anchor).focus();
        } else if (e.shiftKey && (active === first || active?.tagName === "H3")) {
          e.preventDefault();
          c.closePreview(true);
        }
      }}
    >
      <SketchCard id={pv.id} titleId="sketch-popover-title" pinned={pv.pinned} />
    </div>,
    document.body,
  );
}

/** Phone: a bottom sheet with swipe-down to close. */
function SketchSheet({ id }: { id: string }) {
  const c = useSketches();
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ y: number; samples: { y: number; t: number }[] } | null>(null);
  const [dy, setDy] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    document.documentElement.classList.add("sheet-open");
    return () => document.documentElement.classList.remove("sheet-open");
  }, []);
  const start = (y: number) => {
    drag.current = { y, samples: [{ y, t: Date.now() }] };
  };
  const move = (y: number) => {
    const d = drag.current;
    if (!d) return;
    const now = Date.now();
    d.samples = [...d.samples.filter((s) => now - s.t < 80), { y, t: now }];
    const dist = y - d.y;
    // Pulling up past the top resists more the further it goes.
    setDy(dist > 0 ? dist : -(1 - 1 / (1 + Math.abs(dist) / 200)) * 60);
  };
  const end = (y: number) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const first = d.samples[0];
    const v = (y - first.y) / Math.max(1, Date.now() - first.t);
    if (y - d.y > 80 || v > 0.5) {
      setLeaving(true);
      window.setTimeout(() => c.closePreview(true), 180);
    } else setDy(0);
  };
  return (
    <dialog
      ref={ref}
      className="sketch-sheet"
      aria-labelledby="sketch-sheet-title"
      style={
        leaving
          ? { transform: "translateY(100%)" }
          : dy
            ? { transform: `translateY(${dy}px)`, transition: "none" }
            : undefined
      }
      onCancel={(e) => {
        e.preventDefault();
        c.closePreview(true);
      }}
      onClick={(e) => {
        if (e.target === ref.current) c.closePreview(true);
      }}
    >
      <div
        className="sheet-grab"
        onPointerDown={(e) => {
          start(e.clientY);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => move(e.clientY)}
        onPointerUp={(e) => end(e.clientY)}
        onPointerCancel={() => {
          drag.current = null;
          setDy(0);
        }}
      >
        <span aria-hidden="true" />
      </div>
      <div
        onTouchStart={(e) => {
          const t = e.target as HTMLElement;
          if (ref.current?.scrollTop === 0 && t.closest(".sketch-head"))
            start(e.touches[0].clientY);
        }}
        onTouchMove={(e) => move(e.touches[0].clientY)}
        onTouchEnd={(e) => end(e.changedTouches[0].clientY)}
      >
        <SketchCard id={id} titleId="sketch-sheet-title" pinned agenda />
      </div>
    </dialog>
  );
}

function FitBadges({
  option,
  sketch,
  max = 3,
}: {
  option: Suggestion;
  sketch: OptionSketch | null;
  max?: number;
}) {
  const c = useSketches();
  const fit = briefFit(option, sketch, c.brief);
  const warn = sketch ? nightsWarning(sketch.nights, c.brief) : null;
  return (
    <>
      {fit.wants.slice(0, max).map((w) => (
        <span className="badge success" key={w}>
          {w}
        </span>
      ))}
      {fit.wants.length > max && (
        <span className="badge success">+{fit.wants.length - max}</span>
      )}
      {fit.avoids.map((a) => (
        <span className="badge coral" key={a}>
          Heads-up: {a.toLowerCase()}
        </span>
      ))}
      {warn && <span className="badge warning">{warn}</span>}
    </>
  );
}

/** The preview's content: header, calendar, highlights, actions. */
function SketchCard({
  id,
  titleId,
  pinned,
  agenda = false,
}: {
  id: string;
  titleId: string;
  pinned: boolean;
  agenda?: boolean;
}) {
  const { c, option, entry, frame } = useEntry(id);
  if (!option || !frame) return null;
  const sketch = entry?.sketch ?? null;
  const nights = sketch?.nights ?? frame.nights;
  const meta = [
    nightsLabel(nights),
    sketch?.dateLabel,
    option.priceLabel,
  ].filter(Boolean);
  const on = c.selected.includes(id);
  return (
    <div className="sketch-card">
      <header className="sketch-head">
        <div>
          <span className="eyebrow">Sample itinerary · {sketch?.source === "quick" ? "quick sketch" : "AI sketch"}</span>
          <h3 id={titleId} tabIndex={-1}>
            {option.title}
          </h3>
          <p className="sketch-meta">{meta.join(" · ")}</p>
          {sketch?.headline && <p className="sketch-headline">{sketch.headline}</p>}
          <div className="sketch-badges">
            <FitBadges option={option} sketch={sketch} />
            {entry?.status === "updating" && (
              <span className="badge neutral">Updating…</span>
            )}
          </div>
        </div>
        {pinned && (
          <button
            className="sketch-x"
            aria-label="Close sample itinerary"
            onClick={() => c.closePreview(true)}
          >
            ×
          </button>
        )}
      </header>
      <div className="sketch-body">
        {sketch ? (
          agenda ? (
            <Agenda days={sketch.days} />
          ) : (
            <Calendar days={sketch.days} />
          )
        ) : entry?.status === "error" ? (
          <div className="sketch-error">
            <p>{entry.error ?? "Couldn't sketch this one."}</p>
            <button className="button small secondary" onClick={() => c.retry(id)}>
              Try again
            </button>
          </div>
        ) : (
          <SkeletonCalendar days={frame.nights + 1} agenda={agenda} />
        )}
      </div>
      {sketch && sketch.highlights.length > 0 && (
        <ul className="sketch-highlights">
          {sketch.highlights.map((h) => (
            <li key={h}>
              <Icon name="check" size={14} />
              {h}
            </li>
          ))}
        </ul>
      )}
      <footer className="sketch-foot">
        <small aria-live="polite">
          {entry?.drawing && sketch
            ? "Sketching a new version…"
            : entry?.slow
              ? "Taking longer than usual…"
              : sketch
            ? sketch.source === "quick"
              ? "A quick sample trip from the idea's details. Not booked or price-checked."
              : "Sketched by AI from your brief. Not booked or price-checked."
            : "Sketching a sample trip… usually a few seconds."}
        </small>
        <span className="sketch-actions">
          <button
            className={`button small secondary${on ? " is-on" : ""}`}
            aria-pressed={on}
            onClick={() => c.toggle(id)}
          >
            {on ? "✓ Comparing" : "+ Compare"}
          </button>
          <button
            className="button small secondary"
            onClick={(e) => c.openCompare([id], e.currentTarget)}
          >
            Open full
          </button>
          <RedrawButton id={id} />
        </span>
      </footer>
    </div>
  );
}

function RedrawButton({ id, label = false }: { id: string; label?: boolean }) {
  const c = useSketches();
  const entry = c.entries[id];
  // Shared state, so every re-sketch button for this option locks together.
  const busy = Boolean(entry?.drawing) || entry?.status === "loading";
  return (
    <button
      className={`button small ${label ? "secondary" : "ghost"}`}
      aria-label="Sketch a new version"
      aria-busy={busy}
      title="Sketch a new version"
      disabled={busy}
      onClick={async () => {
        try {
          await c.redraw(id);
        } catch (e) {
          c.toast({ text: e instanceof Error ? e.message : "Couldn't re-sketch." });
        }
      }}
    >
      {label ? "↻ Re-sketch" : "↻"}
    </button>
  );
}

const partShort = { morning: "Morn", afternoon: "Aft", evening: "Eve" } as const;
const travelish = /fly|flight|board|embark|disembark|transfer|drive|arrive|check[- ]?in|head home|depart/i;
const dayHead = (d: SketchDay) => {
  const [wd, rest] = d.date ? d.label.split(", ") : [d.label, ""];
  return { wd, rest };
};

function Calendar({ days }: { days: SketchDay[] }) {
  return (
    <div className="sketch-cal-scroll">
      <div
        className="sketch-cal"
        role="table"
        aria-label={`Sample itinerary, ${days.length} days`}
        style={{ gridTemplateColumns: `44px repeat(${days.length}, minmax(88px, 1fr))` }}
      >
        <div role="row" className="cal-row">
          <span role="columnheader" className="cal-corner" />
          {days.map((d, i) => {
            const h = dayHead(d);
            return (
              <div role="columnheader" className="cal-day" key={i}>
                <span className="cal-wd">{h.wd}</span>
                {h.rest && <span className="cal-date">{h.rest}</span>}
                <span className="cal-theme" title={d.theme}>
                  <span aria-hidden="true">{d.emoji} </span>
                  {d.theme}
                </span>
              </div>
            );
          })}
        </div>
        {dayParts.map((part) => (
          <div role="row" className="cal-row" key={part}>
            <span role="rowheader" className="cal-part">
              <span aria-hidden="true">{partShort[part]}</span>
              <span className="sr-only">{dayPartLabel[part]}</span>
            </span>
            {days.map((d, i) => {
              const slot = d.slots.find((s) => s.part === part);
              return (
                <div
                  role="cell"
                  key={i}
                  className={`cal-slot${!slot ? " empty" : ""}${slot && travelish.test(slot.title) ? " travel" : ""}`}
                  title={slot ? [slot.title, slot.note].filter(Boolean).join(" · ") : undefined}
                >
                  {slot ? (
                    <>
                      <span className="cal-emoji" aria-hidden="true">
                        {slot.emoji}
                      </span>
                      <strong>{slot.title}</strong>
                      {slot.note && <small>{slot.note}</small>}
                    </>
                  ) : (
                    <span className="sr-only">Free</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Agenda({ days }: { days: SketchDay[] }) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);
  // Follow the day being read as the sheet scrolls.
  useEffect(() => {
    const io = new IntersectionObserver(
      (items) => {
        const top = items
          .filter((x) => x.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(Number((top.target as HTMLElement).dataset.day));
      },
      { rootMargin: "-90px 0px -55% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [days]);
  return (
    <div className="sketch-agenda">
      <div className="agenda-chips" aria-label="Jump to day">
        {days.map((d, i) => (
          <button
            key={i}
            aria-current={active === i ? "true" : undefined}
            className={`agenda-chip${active === i ? " on" : ""}`}
            onClick={() => {
              setActive(i);
              const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
              refs.current[i]?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
            }}
          >
            {d.date ? d.label.replace(/^(\w+), \w+ /, "$1 ") : d.label}
          </button>
        ))}
      </div>
      {days.map((d, i) => (
        <section
          key={i}
          className="agenda-day"
          data-day={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <h4>
            <span>{d.date ? d.label : `Day ${i + 1}`}</span>
            <small>
              <span aria-hidden="true">{d.emoji} </span>
              {d.theme}
            </small>
          </h4>
          {d.slots.map((s) => (
            <div className="agenda-slot" key={s.part}>
              <span className="agenda-part">{dayPartLabel[s.part]}</span>
              <span className="agenda-emoji" aria-hidden="true">
                {s.emoji}
              </span>
              <span>
                <strong>{s.title}</strong>
                {s.note && <small>{s.note}</small>}
              </span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function SkeletonCalendar({ days, agenda }: { days: number; agenda: boolean }) {
  if (agenda)
    return (
      <div className="sketch-skeleton agenda" role="status">
        <span className="sr-only">Sketching a sample trip</span>
        <div className="skel-block chips" aria-hidden="true" />
        {Array.from({ length: Math.min(days, 3) }, (_, i) => (
          <div key={i} className="skel-block tall" />
        ))}
      </div>
    );
  return (
    <div
      className="sketch-cal sketch-skeleton"
      role="status"
      style={{ gridTemplateColumns: `44px repeat(${days}, minmax(88px, 1fr))` }}
    >
      <span className="sr-only">Sketching a sample trip</span>
      {Array.from({ length: 4 }, (_, r) => (
        <div className="cal-row" key={r} aria-hidden="true">
          <span className="cal-part" />
          {Array.from({ length: days }, (_, i) => (
            <div key={i} className={`skel-block${r === 0 ? " head" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function CompareTray() {
  const c = useSketches();
  const phone = useMedia("(max-width: 699px)");
  const [listOpen, setListOpen] = useState(false);
  const n = c.selected.length;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("tray-open", n > 0);
    // Toasts sit just above the tray, however tall it gets.
    const el = ref.current;
    const ro = el
      ? new ResizeObserver(() =>
          root.style.setProperty("--tray-h", `${el.offsetHeight}px`),
        )
      : null;
    if (el) ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.classList.remove("tray-open");
      root.style.removeProperty("--tray-h");
    };
  }, [n]);
  useEffect(() => {
    if (!listOpen) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.(".tray-chips")) setListOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [listOpen]);
  if (!n) return null;
  return (
    <div className="compare-tray" role="region" aria-label="Compare tray" ref={ref}>
      <span className="eyebrow tray-count">
        Compare · {n} of {MAX_COMPARE}
      </span>
      <div className="tray-chips">
        {phone ? (
          <button className={`badge neutral tray-chip${c.flash ? " flash" : ""}`} onClick={() => setListOpen((v) => !v)} aria-expanded={listOpen}>
            {n} picked ▾
          </button>
        ) : (
          c.selected.map((id) => {
            const o = c.options.find((x) => x.id === id);
            const emoji = c.entries[id]?.sketch?.days[0]?.emoji;
            return (
              <span className={`badge neutral tray-chip${c.flash ? " flash" : ""}`} key={id}>
                {emoji && <span aria-hidden="true">{emoji}</span>}
                <span className="chip-title">{o?.title}</span>
                <button className="sketch-x small" aria-label={`Remove ${o?.title}`} onClick={() => c.toggle(id)}>
                  ×
                </button>
              </span>
            );
          })
        )}
        {phone && listOpen && (
          <div
            className="tray-list"
            onKeyDown={(e) => e.key === "Escape" && setListOpen(false)}
          >
            {c.selected.map((id) => {
              const o = c.options.find((x) => x.id === id);
              return (
                <div key={id}>
                  <span>{o?.title}</span>
                  <button className="sketch-x small" aria-label={`Remove ${o?.title}`} onClick={() => c.toggle(id)}>
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <span className="tray-actions">
        <button className="button small ghost" onClick={c.clear}>
          Clear
        </button>
        <button
          className="button small"
          disabled={n < 2}
          onClick={(e) => c.openCompare(undefined, e.currentTarget)}
        >
          {n < 2 ? "Pick 1 more" : `Compare ${n} →`}
        </button>
      </span>
      <span className="tray-note" role="status" aria-live="polite">
        {c.limitNote}
      </span>
    </div>
  );
}

async function copyText(value: string, host: HTMLElement | null) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Inside a modal dialog the rest of the page is inert, so copy from within it.
    const area = document.createElement("textarea");
    area.value = value;
    (host ?? document.body).appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function CompareDialog() {
  const c = useSketches();
  const p = usePortal();
  const ref = useRef<HTMLDialogElement>(null);
  const [present, setPresent] = useState(false);
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  // Shortlist taps show at once and roll back if the save fails.
  const [stars, setStars] = useState<Record<string, Suggestion["status"]>>({});
  const ids = c.compareOpen;
  const open = Boolean(ids);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      document.documentElement.classList.add("compare-open");
      window.setTimeout(() => d.querySelector<HTMLElement>("h2")?.focus(), 0);
    }
    if (!open && d.open) d.close();
    if (!open) document.documentElement.classList.remove("compare-open");
  }, [open]);
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setPresent(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  if (typeof document === "undefined") return null;
  const close = () => {
    setPresent(false);
    if (document.fullscreenElement)
      document.exitFullscreen().catch(() => undefined);
    c.closeCompare();
  };

  const cols = (ids ?? [])
    .map((id) => {
      const option = c.options.find((o) => o.id === id);
      if (!option) return null;
      const entry = c.entries[id];
      const frame = sketchFrame(option, c.trip, c.brief);
      return { id, option, entry, sketch: entry?.sketch ?? null, frame };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  const dayCount = Math.max(
    0,
    ...cols.map((x) => (x.sketch?.days.length ?? x.frame.nights + 1)),
  );
  const when = c.brief?.window || c.trip.dateLabel;
  const heading =
    cols.length === 1
      ? cols[0].option.title
      : `${cols.length} ways to do ${when}`;
  const sub = [
    c.brief?.who || (c.trip.travelers ? `${c.trip.travelers} people` : null),
    c.brief?.nights ? `${c.brief.nights} nights` : null,
    c.brief?.origin ? `from ${c.brief.origin}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const vibes = c.brief?.vibes ? c.brief.vibes.split(",").map((v) => v.trim()).filter(Boolean) : [];
  const n = cols.length;
  const grid = { "--cols": n } as React.CSSProperties;

  const togglePresent = async () => {
    const d = ref.current;
    if (!present) {
      setPresent(true);
      try {
        await d?.requestFullscreen?.();
      } catch {
        /* Fullscreen is optional; present mode still enlarges everything. */
      }
    } else {
      setPresent(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    }
  };

  const rail = (label: string, sr?: string) => (
    <div className="cmp-rail" role="rowheader">
      <span aria-hidden={sr ? "true" : undefined}>{label}</span>
      {sr && <span className="sr-only">{sr}</span>}
    </div>
  );

  return createPortal(
    <dialog
      ref={ref}
      className={`compare-dialog${present ? " present" : ""}`}
      aria-labelledby="compare-title"
      onCancel={(e) => {
        e.preventDefault();
        if (present) togglePresent();
        else close();
      }}
      onClose={() => {
        if (c.compareOpen) close();
      }}
    >
      {open && (
        <>
          <header className="cmp-head">
            <div>
              <span className="eyebrow">{n === 1 ? "Sample itinerary" : "Compare options"}</span>
              <h2 id="compare-title" tabIndex={-1}>
                {heading}
              </h2>
              {sub && <p className="cmp-sub">{sub}</p>}
            </div>
            <div className="cmp-tools">
              <button className="button small secondary" onClick={togglePresent}>
                {present ? "Exit present" : "Present"}
              </button>
              <button className="button small secondary cmp-edit" onClick={() => window.print()}>
                Print
              </button>
              <button
                className="button small secondary cmp-edit"
                onClick={async () => {
                  const ok = await copyText(
                    compareAsText(
                      `${heading}${sub ? ` (${sub})` : ""}`,
                      cols.map((x) => ({ option: x.option, sketch: x.sketch })),
                    ),
                    ref.current,
                  );
                  setCopied(ok ? "ok" : "fail");
                  window.setTimeout(() => setCopied(""), 2500);
                }}
              >
                {copied === "ok" ? "✓ Copied" : copied === "fail" ? "Couldn't copy" : "Copy as text"}
              </button>
              <button className="sketch-x" aria-label="Close compare" onClick={close}>
                ×
              </button>
            </div>
          </header>
          {n === 0 ? (
            <div className="empty-state">
              <h3>Those options aren&apos;t on the board anymore</h3>
              <p className="muted">Pick a couple from the board to compare.</p>
              <button className="button" onClick={close}>
                Back to the board
              </button>
            </div>
          ) : (
            <div className="cmp-scroll">
              {n > 2 && <p className="cmp-swipe">Swipe to see all {n} →</p>}
              <div className="cmp-grid" role="table" aria-label={heading} style={grid}>
                <div className="cmp-row cmp-sticky" role="row">
                  <div className="cmp-rail cmp-corner" role="columnheader" />
                  {cols.map((x) => (
                    <div className="cmp-option" role="columnheader" key={x.id}>
                      <span className="cmp-emoji" aria-hidden="true">
                        {x.sketch?.days[1]?.emoji ?? x.sketch?.days[0]?.emoji ?? "🧭"}
                      </span>
                      <h3>{x.option.title}</h3>
                      <span className="cmp-option-tools cmp-edit">
                        {(() => {
                          const status = stars[x.id] ?? x.option.status;
                          const saved = status === "saved";
                          return (
                            <button
                              className="button small ghost"
                              title={saved ? "Remove from shortlist" : "Shortlist"}
                              aria-label={saved ? "Remove from shortlist" : "Shortlist"}
                              aria-pressed={saved}
                              disabled={x.id in stars}
                              onClick={() => {
                                const next = saved ? "suggested" : "saved";
                                setStars((m) => ({ ...m, [x.id]: next }));
                                p.save("suggestions", { ...x.option, status: next })
                                  .catch((e) =>
                                    c.toast({ text: e instanceof Error ? e.message : "Couldn't save." }),
                                  )
                                  .finally(() =>
                                    setStars((m) => {
                                      const rest = { ...m };
                                      delete rest[x.id];
                                      return rest;
                                    }),
                                  );
                              }}
                            >
                              {saved ? "★" : "☆"}
                            </button>
                          );
                        })()}
                        {c.selected.includes(x.id) && n > 1 && (
                          <button
                            className="button small ghost"
                            aria-label={`Remove ${x.option.title} from compare`}
                            title="Remove from compare"
                            onClick={() => {
                              c.toggle(x.id);
                              c.openCompare(ids!.filter((i) => i !== x.id));
                            }}
                          >
                            ×
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="cmp-row" role="row">
                  {rail("The idea")}
                  {cols.map((x) => (
                    <div className="cmp-cell cmp-idea" role="cell" key={x.id}>
                      {x.sketch?.headline || x.option.subtitle || "—"}
                    </div>
                  ))}
                </div>

                <div className="cmp-row" role="row">
                  {rail("Price")}
                  {cols.map((x) => (
                    <div className="cmp-cell num" role="cell" key={x.id}>
                      {x.option.priceLabel ?? "Not priced yet"}
                      {x.sketch?.roughTotal && (
                        <small>
                          {x.sketch.roughTotal}
                          <span className="cmp-tag">AI estimate</span>
                        </small>
                      )}
                    </div>
                  ))}
                </div>
                <div className="cmp-row" role="row">
                  {rail("Nights")}
                  {cols.map((x) => {
                    const nights = x.sketch?.nights ?? x.frame.nights;
                    const warn = nightsWarning(nights, c.brief);
                    return (
                      <div className="cmp-cell num" role="cell" key={x.id}>
                        {nightsLabel(nights)}
                        {warn && <span className="badge warning">{warn.split(" · ")[1]}</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="cmp-row" role="row">
                  {rail("Dates")}
                  {cols.map((x) => (
                    <div className="cmp-cell num" role="cell" key={x.id}>
                      {x.sketch?.dateLabel ?? "Flexible"}
                    </div>
                  ))}
                </div>
                <div className="cmp-row" role="row">
                  {rail("Getting there")}
                  {cols.map((x) => (
                    <div className="cmp-cell" role="cell" key={x.id}>
                      {x.sketch?.travel ?? <span className="muted">—</span>}
                    </div>
                  ))}
                </div>
                {vibes.length > 0 && (
                  <div className="cmp-row" role="row">
                    {rail("Fits your brief")}
                    {cols.map((x) => {
                      const fit = briefFit(x.option, x.sketch, c.brief);
                      return (
                        <div className="cmp-cell" role="cell" key={x.id}>
                          <strong>
                            Hits {fit.wants.length} of {vibes.length}
                          </strong>
                          <span className="cmp-badges">
                            {fit.wants.map((w) => (
                              <span className="badge success" key={w}>
                                {w}
                              </span>
                            ))}
                            {fit.missing.map((w) => (
                              <span className="badge neutral" key={w}>
                                – {w}
                              </span>
                            ))}
                            {fit.avoids.map((a) => (
                              <span className="badge coral" key={a}>
                                Heads-up: {a.toLowerCase()}
                              </span>
                            ))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {Array.from({ length: dayCount }, (_, di) => (
                  <div className="cmp-day" role="rowgroup" key={di}>
                    <div className="cmp-row cmp-band" role="row">
                      {rail(`Day ${di + 1}`)}
                      {cols.map((x) => {
                        const d = x.sketch?.days[di];
                        const past = di >= (x.sketch?.days.length ?? x.frame.nights + 1);
                        return (
                          <div className="cmp-cell" role="cell" key={x.id}>
                            {past ? (
                              "—"
                            ) : d ? (
                              <>
                                <span className="cmp-date">{d.label}</span>
                                <span>
                                  <span aria-hidden="true">{d.emoji} </span>
                                  {d.theme}
                                </span>
                              </>
                            ) : (
                              <span className="skel-line" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {dayParts.map((part) => (
                      <div className="cmp-row" role="row" key={part}>
                        {rail(partShort[part], dayPartLabel[part])}
                        {cols.map((x) => {
                          const days = x.sketch?.days;
                          const past = di >= (days?.length ?? x.frame.nights + 1);
                          if (past)
                            return (
                              <div className="cmp-cell home" role="cell" key={x.id}>
                                {part === "morning" ? (
                                  <>
                                    <span aria-hidden="true">🏠 </span>Home by now
                                  </>
                                ) : (
                                  ""
                                )}
                              </div>
                            );
                          if (!days)
                            return (
                              <div className="cmp-cell" role="cell" key={x.id}>
                                {x.entry?.status === "error" ? (
                                  di === 0 && part === "morning" ? (
                                    <span>
                                      Couldn&apos;t sketch this one.{" "}
                                      <button className="text-link" onClick={() => c.retry(x.id)}>
                                        Try again
                                      </button>
                                    </span>
                                  ) : null
                                ) : (
                                  <span className="skel-line" />
                                )}
                              </div>
                            );
                          const slot = days[di]?.slots.find((s) => s.part === part);
                          return (
                            <div className={`cmp-cell slot${slot ? "" : " free"}`} role="cell" key={x.id}>
                              {slot ? (
                                <>
                                  <span className="cmp-slot-emoji" aria-hidden="true">
                                    {slot.emoji}
                                  </span>
                                  <span>
                                    <strong>{slot.title}</strong>
                                    {slot.note && <small>{slot.note}</small>}
                                  </span>
                                </>
                              ) : (
                                <span className="muted">
                                  {di === 0
                                    ? "Travel day"
                                    : di === days.length - 1
                                      ? "Heading home"
                                      : "Free time"}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))}

                <div className="cmp-row" role="row">
                  {rail("Best bits")}
                  {cols.map((x) => (
                    <div className="cmp-cell" role="cell" key={x.id}>
                      <ul className="sketch-highlights in-cell">
                        {(x.sketch?.highlights ?? []).map((h) => (
                          <li key={h}>
                            <Icon name="check" size={14} />
                            {h}
                          </li>
                        ))}
                      </ul>
                      {x.sketch?.watchOut && (
                        <p className="cmp-watch">Watch out: {x.sketch.watchOut}</p>
                      )}
                    </div>
                  ))}
                </div>
                <div className="cmp-row cmp-edit" role="row">
                  <div className="cmp-rail" role="rowheader" />
                  {cols.map((x) => (
                    <div className="cmp-cell cmp-foot" role="cell" key={x.id}>
                      <button
                        className="button small secondary"
                        onClick={() => {
                          close();
                          c.onEdit("suggestions", x.option);
                        }}
                      >
                        Edit idea
                      </button>
                      <RedrawButton id={x.id} label />
                    </div>
                  ))}
                </div>
              </div>
              <p className="cmp-disclaimer">
                Sample itineraries sketched by AI from the trip brief. Prices are estimates, nothing is booked.
              </p>
            </div>
          )}
        </>
      )}
    </dialog>,
    document.body,
  );
}
