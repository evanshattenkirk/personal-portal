import type { Suggestion, Trip, TripBrief } from "./types";
import { splitTags } from "./brainstorm.ts";

// Mock day-by-day itineraries ("sketches") for a trip's options, so options
// can be previewed on a little calendar and compared side by side.
// Pure helpers only: generation lives in src/lib/sketch-ai.ts.

export type DayPart = "morning" | "afternoon" | "evening";
export const dayParts: DayPart[] = ["morning", "afternoon", "evening"];
export const dayPartLabel: Record<DayPart, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

export interface SketchSlot {
  part: DayPart;
  emoji: string;
  title: string; // a few words, e.g. "Beignets at Café du Monde"
  note: string | null; // one short line
}
export interface SketchDay {
  label: string; // "Thu, Apr 8" when dates are known, otherwise "Day 1"
  date: string | null; // ISO date
  theme: string; // "Arrive + Frenchmen St"
  emoji: string;
  slots: SketchSlot[];
}
export interface OptionSketch {
  optionId: string;
  tripSlug: string;
  hash: string; // changes when the option or brief changes
  headline: string; // one line that sells the option
  nights: number;
  dateLabel: string | null; // "Apr 18 – 23, 2027"
  days: SketchDay[];
  highlights: string[];
  watchOut: string | null;
  travel: string | null; // "2h flight from Chicago"
  roughTotal: string | null; // "~$7k–9k for 6 (estimate)"
  source: "ai" | "quick";
  generatedAt: string;
}

const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const monthShort = months.map((m) => m[0].toUpperCase() + m.slice(1));
const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const addDays = (isoDate: string, n: number) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const nightsBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
  );

/** "Thu, Apr 8" */
export function dayLabel(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${weekday[d.getUTCDay()]}, ${monthShort[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Apr 18 – 23, 2027" or "Apr 30 – May 3, 2027" */
export function rangeLabel(start: string, end: string) {
  const a = new Date(`${start}T00:00:00Z`),
    b = new Date(`${end}T00:00:00Z`);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  const left = `${monthShort[a.getUTCMonth()]} ${a.getUTCDate()}`;
  const right = sameMonth
    ? `${b.getUTCDate()}`
    : `${monthShort[b.getUTCMonth()]} ${b.getUTCDate()}`;
  return `${left} – ${right}, ${b.getUTCFullYear()}`;
}

/**
 * Finds a date range like "Apr 18-23, 2027", "Apr 8–11", "Dec 10 - 13" or
 * "Apr 30 - May 3" in free text. The year falls back to `yearHint`.
 */
export function findDateRange(
  text: string,
  yearHint: number,
): { start: string; end: string } | null {
  const mon = "(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
  const re = new RegExp(
    `\\b${mon}\\s+(\\d{1,2})\\s*(?:-|–|—|to)\\s*(?:${mon}\\s+)?(\\d{1,2})(?:,?\\s*(\\d{4}))?`,
    "i",
  );
  const m = text.match(re);
  if (!m) return null;
  const m1 = months.indexOf(m[1].slice(0, 3).toLowerCase());
  const m2 = m[3] ? months.indexOf(m[3].slice(0, 3).toLowerCase()) : m1;
  const d1 = Number(m[2]),
    d2 = Number(m[4]);
  const year = m[5] ? Number(m[5]) : yearHint;
  if (m1 < 0 || m2 < 0 || d1 < 1 || d1 > 31 || d2 < 1 || d2 > 31) return null;
  const start = utc(year, m1, d1);
  const end = utc(m2 < m1 ? year + 1 : year, m2, d2);
  if (start.getUTCDate() !== d1 || end.getUTCDate() !== d2) return null;
  const n = nightsBetween(iso(start), iso(end));
  if (n < 1 || n > 21) return null;
  return { start: iso(start), end: iso(end) };
}

const optionText = (s: Suggestion) =>
  [s.title, s.subtitle, s.detail, s.priceLabel, s.tags]
    .filter(Boolean)
    .join(" · ");

const yearHintFor = (trip: Trip, brief?: TripBrief | null) => {
  const m = `${brief?.window ?? ""} ${trip.dateLabel} ${trip.startDate ?? ""}`.match(
    /\b(20\d\d)\b/,
  );
  return m ? Number(m[1]) : new Date().getUTCFullYear();
};

/** How long the sketch should be, and its dates when the option names them. */
export function sketchFrame(
  s: Suggestion,
  trip: Trip,
  brief?: TripBrief | null,
): { nights: number; start: string | null; end: string | null } {
  const range =
    findDateRange(`${s.subtitle ?? ""} ${s.title}`, yearHintFor(trip, brief)) ??
    findDateRange(s.detail ?? "", yearHintFor(trip, brief));
  if (range) {
    const nights = Math.min(nightsBetween(range.start, range.end), 7);
    return { nights, start: range.start, end: addDays(range.start, nights) };
  }
  // An option's own stated length beats the trip's dates: a "3-night cruise"
  // on a 5-night trip should sketch (and compare) as 3 nights.
  const stated = optionText(s).match(/\b(\d{1,2})[- ]nights?\b/i);
  if (trip.startDate && trip.endDate) {
    const n = nightsBetween(trip.startDate, trip.endDate);
    if (n >= 1 && n <= 14) {
      const nights = Math.max(1, Math.min(stated ? Number(stated[1]) : n, 7));
      return {
        nights,
        start: trip.startDate,
        end: addDays(trip.startDate, nights),
      };
    }
  }
  const fromBrief = (brief?.nights ?? "").match(/\d+/g)?.map(Number) ?? [];
  const n = stated
    ? Number(stated[1])
    : fromBrief.length
      ? Math.max(...fromBrief)
      : 4;
  return { nights: Math.max(1, Math.min(n || 4, 7)), start: null, end: null };
}

const tripOptionWords =
  /\b(cruise|sailing|voyage|nights?|all[- ]inclusive|resort|villa|airbnb|vrbo|house|fest(ival)?|weekend|getaway|trip|city break|escape|retreat|road trip|island|beach club)\b/i;

/**
 * Which ideas are whole-trip options worth a day-by-day sketch. Flights,
 * restaurants and to-dos are pieces of a trip, not options for one.
 */
export function isTripOption(
  s: Suggestion,
  trip: Trip,
  brief?: TripBrief | null,
) {
  if (s.status === "dismissed" || s.status === "booked") return false;
  if ((s.itemType ?? "idea") !== "idea") return false;
  if (s.category !== "stay" && s.category !== "activity") return false;
  if (trip.status === "completed") return false;
  const tags = splitTags(s.tags).map((t) => t.toLowerCase());
  if (tags.includes("no preview")) return false;
  if (tags.includes("trip option")) return true;
  const styles = splitTags(brief?.styles).map((t) => t.toLowerCase());
  const tagged = splitTags(s.tags).some((t) =>
    styles.includes(t.toLowerCase()),
  );
  return tagged || tripOptionWords.test(optionText(s));
}

/** Small stable hash, so a sketch is redrawn only when its inputs change. */
export function sketchHash(
  s: Suggestion,
  brief?: TripBrief | null,
  trip?: Trip | null,
) {
  const input = [
    trip?.name,
    trip?.destination,
    trip?.startDate,
    trip?.endDate,
    trip?.dateLabel,
    trip?.travelers,
    trip?.notes,
    s.title,
    s.subtitle,
    s.detail,
    s.priceLabel,
    s.tags,
    brief?.window,
    brief?.nights,
    brief?.who,
    brief?.origin,
    brief?.vibes,
    brief?.avoid,
    brief?.mustHaves,
    "v2",
  ]
    .map((v) => v ?? "")
    .join("␟");
  let h = 5381;
  for (let i = 0; i < input.length; i++)
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

// Emoji belong in the emoji slot only; titles and notes stay plain words.
const stripEmoji = (v: string) =>
  v.replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, "");
const clean = (v: unknown, max: number) => {
  if (typeof v !== "string") return null;
  const out = stripEmoji(v).replace(/\s+/g, " ").trim().slice(0, max);
  return out || null;
};

/** One emoji (one grapheme), or the fallback. */
export function oneEmoji(v: unknown, fallback = "✨") {
  if (typeof v !== "string" || !v.trim()) return fallback;
  const first = (() => {
    try {
      const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
      return [...seg.segment(v.trim())][0]?.segment ?? "";
    } catch {
      return [...v.trim()][0] ?? "";
    }
  })();
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(first)
    ? first
    : fallback;
}

/** Validates a model's answer into a sketch. Throws when nothing usable is in it. */
export function normalizeSketch(
  raw: unknown,
  ctx: {
    optionId: string;
    tripSlug: string;
    hash: string;
    nights: number;
    start: string | null;
    end: string | null;
    source: OptionSketch["source"];
    now?: string;
  },
): OptionSketch {
  if (!raw || typeof raw !== "object") throw new Error("No sketch returned.");
  const r = raw as Record<string, unknown>;
  const daysIn = Array.isArray(r.days) ? r.days : [];
  const dayCount = ctx.nights + 1;
  const days: SketchDay[] = daysIn.slice(0, dayCount).map((d, i) => {
    const o = (d && typeof d === "object" ? d : {}) as Record<string, unknown>;
    const slotsIn = Array.isArray(o.slots) ? o.slots : [];
    const slots = dayParts.flatMap((part): SketchSlot[] => {
      const found = slotsIn.find(
        (x) =>
          x &&
          typeof x === "object" &&
          String((x as Record<string, unknown>).part).toLowerCase() === part,
      ) as Record<string, unknown> | undefined;
      const title = clean(found?.title, 48);
      return title
        ? [
            {
              part,
              emoji: oneEmoji(found?.emoji),
              title,
              note: clean(found?.note, 90),
            },
          ]
        : [];
    });
    const date = ctx.start ? addDays(ctx.start, i) : null;
    return {
      label: date ? dayLabel(date) : `Day ${i + 1}`,
      date,
      theme: clean(o.theme, 40) ?? `Day ${i + 1}`,
      emoji: oneEmoji(o.emoji, slots[0]?.emoji ?? "📍"),
      slots,
    };
  });
  const usable = days.filter((d) => d.slots.length);
  if (!usable.length) throw new Error("The sketch had no days.");
  const highlights = (Array.isArray(r.highlights) ? r.highlights : [])
    .map((h) => clean(h, 60))
    .filter((h): h is string => Boolean(h))
    .slice(0, 3);
  return {
    optionId: ctx.optionId,
    tripSlug: ctx.tripSlug,
    hash: ctx.hash,
    headline: clean(r.headline, 110) ?? "",
    nights: ctx.nights,
    dateLabel: ctx.start && ctx.end ? rangeLabel(ctx.start, ctx.end) : null,
    days,
    highlights,
    watchOut: clean(r.watchOut, 120),
    travel: clean(r.travel, 60),
    roughTotal: clean(r.roughTotal, 60),
    source: ctx.source,
    generatedAt: ctx.now ?? new Date().toISOString(),
  };
}

type Kit = {
  test: RegExp;
  arrive: [string, string];
  days: [string, string, [string, string][]][];
  leave: [string, string];
  highlights: string[];
};
// Used when the AI isn't available: a believable, clearly labeled quick sketch.
const kits: Kit[] = [
  {
    test: /cruise|sailing|voyage|ship|of the seas|lady\b/i,
    arrive: ["🛳️", "Board + sail away"],
    days: [
      [
        "🏝️",
        "Island day",
        [
          ["☕", "Breakfast with a view"],
          ["🏖️", "Beach club afternoon"],
          ["🍹", "Sunset deck drinks"],
        ],
      ],
      [
        "🌊",
        "Sea day",
        [
          ["🧘", "Slow morning on deck"],
          ["🏊", "Pools + games"],
          ["🎭", "Dinner + a show"],
        ],
      ],
      [
        "⚓",
        "Port day",
        [
          ["🚶", "Wander the port town"],
          ["🐠", "Snorkel or swim"],
          ["🎶", "Live music bar"],
        ],
      ],
    ],
    leave: ["🧳", "Disembark + fly home"],
    highlights: ["Unpack once", "Food included", "Nightlife on board"],
  },
  {
    test: /fest|festival|music|jazz|concert/i,
    arrive: ["🧳", "Arrive + settle in"],
    days: [
      [
        "🎺",
        "Festival day",
        [
          ["☕", "Coffee + pastries"],
          ["🎶", "Stages all afternoon"],
          ["🍤", "Big local dinner"],
        ],
      ],
      [
        "🚶",
        "Explore the city",
        [
          ["🥐", "Neighborhood brunch"],
          ["🛍️", "Shops + markets"],
          ["🎷", "Late-night live music"],
        ],
      ],
    ],
    leave: ["🛫", "Last brunch + fly home"],
    highlights: ["Live music everywhere", "Walkable", "Great food scene"],
  },
  {
    test: /all[- ]inclusive|resort|riviera|beach|island|cancun|caribbean/i,
    arrive: ["🛬", "Fly in + check in"],
    days: [
      [
        "🏖️",
        "Beach day",
        [
          ["🥭", "Breakfast by the water"],
          ["🏖️", "Cabanas + swim-up bar"],
          ["🍣", "À la carte dinner"],
        ],
      ],
      [
        "🧭",
        "Day out",
        [
          ["🚤", "Cenote or boat trip"],
          ["🌮", "Tacos in town"],
          ["🎶", "Resort show + drinks"],
        ],
      ],
      [
        "💆",
        "Slow day",
        [
          ["🧘", "Spa or yoga"],
          ["📚", "Pool + a book"],
          ["🍷", "Wine dinner"],
        ],
      ],
    ],
    leave: ["🧳", "Late checkout + fly home"],
    highlights: ["Everything included", "Beach every day", "Zero planning"],
  },
];
const cityKit: Kit = {
  test: /./,
  arrive: ["🧳", "Arrive + settle in"],
  days: [
    [
      "🚶",
      "Explore",
      [
        ["☕", "Local coffee"],
        ["🏛️", "Top sights"],
        ["🍽️", "Dinner reservation"],
      ],
    ],
    [
      "🍻",
      "Eat + drink",
      [
        ["🥐", "Brunch spot"],
        ["🛍️", "Markets + shops"],
        ["🎶", "Live music night"],
      ],
    ],
  ],
  leave: ["🛫", "Easy morning + fly home"],
  highlights: ["Food + drinks", "Room to wander", "Something every night"],
};

/** A labeled stand-in sketch made from the option's words, without AI. */
export function quickSketch(
  s: Suggestion,
  trip: Trip,
  brief?: TripBrief | null,
  now?: string,
): OptionSketch {
  const frame = sketchFrame(s, trip, brief);
  const kit = kits.find((k) => k.test.test(optionText(s))) ?? cityKit;
  const total = frame.nights + 1;
  const raw = {
    headline: s.subtitle ?? "",
    highlights: kit.highlights,
    days: Array.from({ length: total }, (_, i) => {
      if (i === 0)
        return {
          emoji: kit.arrive[0],
          theme: kit.arrive[1],
          slots: [
            { part: "afternoon", emoji: kit.arrive[0], title: kit.arrive[1] },
            { part: "evening", emoji: "🍽️", title: "Welcome dinner" },
          ],
        };
      if (i === total - 1)
        return {
          emoji: kit.leave[0],
          theme: "Head home",
          slots: [{ part: "morning", emoji: kit.leave[0], title: kit.leave[1] }],
        };
      const [emoji, theme, slots] = kit.days[(i - 1) % kit.days.length];
      return {
        emoji,
        theme,
        slots: slots.map(([e, title], j) => ({
          part: dayParts[j],
          emoji: e,
          title,
        })),
      };
    }),
  };
  return normalizeSketch(raw, {
    optionId: s.id,
    tripSlug: s.tripSlug,
    hash: sketchHash(s, brief, trip),
    nights: frame.nights,
    start: frame.start,
    end: frame.end,
    source: "quick",
    now,
  });
}

/** How an option lines up with the brief: wants it touches, skips it trips over. */
export function briefFit(
  s: Suggestion,
  sketch: OptionSketch | null,
  brief?: TripBrief | null,
) {
  const text = [
    optionText(s),
    sketch?.headline,
    ...(sketch?.highlights ?? []),
    ...(sketch?.days.flatMap((d) => [d.theme, ...d.slots.map((x) => x.title)]) ??
      []),
  ]
    .join(" ")
    .toLowerCase();
  const stems: Record<string, string[]> = {
    food: ["food", "dinner", "restaurant", "eat", "brunch", "taco", "eateries", "tasting"],
    drinks: ["drink", "bar", "cocktail", "wine", "beer", "rum", "brew"],
    "live music": ["music", "jazz", "band", "stage", "concert", "dj"],
    "having fun": ["fun", "party", "games", "show", "nightlife"],
    exploring: ["explore", "wander", "walk", "port", "town", "market", "tour"],
    "meeting people": ["meet", "social", "festival", "fest", "crowd", "nightlife", "party"],
    relaxing: ["relax", "spa", "pool", "beach", "slow", "lounge", "cabana"],
    hiking: ["hike", "hiking", "trail", "trek"],
    skiing: ["ski", "skiing", "slopes"],
  };
  const hit = (tag: string) => {
    const key = tag.toLowerCase();
    const words = stems[key] ?? [key];
    return words.some((w) => text.includes(w));
  };
  return {
    wants: splitTags(brief?.vibes).filter(hit),
    missing: splitTags(brief?.vibes).filter((t) => !hit(t)),
    avoids: splitTags(brief?.avoid).filter(hit),
  };
}

export const nightsLabel = (n: number) => `${n} night${n === 1 ? "" : "s"}`;

/** "3 nights · shorter than your 4-5", when an option falls outside the brief's range. */
export function nightsWarning(nights: number, brief?: TripBrief | null) {
  const range = (brief?.nights ?? "").match(/\d+/g)?.map(Number) ?? [];
  if (!range.length) return null;
  const lo = Math.min(...range),
    hi = Math.max(...range);
  const want = lo === hi ? `${lo}` : `${lo}–${hi}`;
  if (nights < lo) return `${nightsLabel(nights)} · shorter than your ${want}`;
  if (nights > hi) return `${nightsLabel(nights)} · longer than your ${want}`;
  return null;
}

/** Plain text for a family group chat: each option and its days in one line each. */
export function compareAsText(
  title: string,
  items: { option: Suggestion; sketch: OptionSketch | null }[],
) {
  const out = [title, ""];
  items.forEach(({ option, sketch }, i) => {
    const meta = [
      sketch ? nightsLabel(sketch.nights) : null,
      sketch?.dateLabel,
      option.priceLabel,
    ]
      .filter(Boolean)
      .join(" · ");
    out.push(`${i + 1}. ${option.title}${meta ? ` (${meta})` : ""}`);
    if (sketch?.headline) out.push(`   ${sketch.headline}`);
    sketch?.days.forEach((d) => {
      const bits = d.slots.map((s) => `${s.emoji} ${s.title}`).join(", ");
      out.push(`   ${d.label}: ${bits || d.theme}`);
    });
    out.push("");
  });
  out.push("Sample itineraries sketched by AI. Prices are estimates.");
  return out.join("\n");
}
