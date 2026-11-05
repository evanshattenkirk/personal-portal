import type {
  Scenario,
  Suggestion,
  SuggestionCategory,
  Trip,
  TripBrief,
  TripNote,
} from "./types";

export const splitTags = (value?: string | null) =>
  (value ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

export const sameTag = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export const hasTag = (s: Pick<Suggestion, "tags">, tag: string) =>
  splitTags(s.tags).some((t) => sameTag(t, tag));

export const noteKindLabel: Record<TripNote["kind"], string> = {
  note: "Note",
  ask_ai: "Ask AI",
  preference: "Preference",
};

export interface PromptStarter {
  id: string;
  label: string;
  ask: string;
}

export const promptStarters: PromptStarter[] = [
  {
    id: "fresh",
    label: "Brainstorm fresh options",
    ask: "Brainstorm 8 to 10 trip options that fit this brief, spread across the trip styles listed. Mix well-known picks with a few less obvious ones. For each, give where it is, the style, why it fits this group, a rough price per person, travel time from where we leave, and the best way to book. Don't repeat anything already in my ideas or ruled-out list.",
  },
  {
    id: "notes",
    label: "Act on my open notes",
    ask: "Work through my open notes one at a time and do what each one asks. Label every answer with the note number it belongs to, and say plainly if a note needs something from me.",
  },
  {
    id: "compare",
    label: "Compare my shortlist",
    ask: "Compare my shortlisted ideas side by side for this group: total cost, travel time, the vibe, what's included, and what could go wrong. Recommend one and say why.",
  },
  {
    id: "days",
    label: "Sketch the days",
    ask: "Sketch a loose day-by-day plan for the favorite option: one or two anchors a day (a great meal, live music, a place to wander), with plenty of slack. No hiking or early starts unless my notes ask for them.",
  },
];

const line = (label: string, value?: string | null) =>
  value?.trim() ? `- ${label}: ${value.trim()}` : null;

export function buildAIBrief({
  trip,
  brief,
  notes,
  scenarios,
  suggestions,
  ask,
  exportedAt = new Date().toISOString().slice(0, 10),
}: {
  trip: Trip;
  brief?: TripBrief | null;
  notes: TripNote[];
  scenarios: Scenario[];
  suggestions: Suggestion[];
  ask?: string;
  exportedAt?: string;
}) {
  const out: string[] = [];
  const push = (...rows: (string | null | false | undefined)[]) =>
    rows.forEach(
      (r) => r !== null && r !== false && r !== undefined && out.push(r),
    );
  push(
    `# Trip brief: ${trip.name}`,
    `Trip id \`${trip.slug}\` · exported ${exportedAt} from Evan's Portal`,
    "",
  );
  if (ask?.trim()) push("## What I'm asking", ask.trim(), "");
  push(
    "## The trip",
    line("Destination", trip.destination),
    line("When", brief?.window || trip.dateLabel),
    line("Nights", brief?.nights),
    line(
      "Who's coming",
      brief?.who || (trip.travelers ? `${trip.travelers} travelers` : null),
    ),
    line("Leaving from", brief?.origin),
    line("Budget", brief?.budget),
    line("Trip styles to explore", brief?.styles),
    line("What we want", brief?.vibes),
    line("Skip", brief?.avoid),
    line("Must-haves and dealbreakers", brief?.mustHaves),
    trip.notes?.trim() ? `- Trip notes: ${trip.notes.trim()}` : null,
    "",
  );
  // Only Evan's own notes are instructions; assistant replies are context.
  const mine = notes.filter((n) => (n.author ?? "evan") === "evan");
  const open = mine.filter(
    (n) => n.status === "open" && n.kind !== "preference",
  );
  const prefs = mine.filter(
    (n) => n.status === "open" && n.kind === "preference",
  );
  if (open.length) {
    push("## My open notes (act on these)");
    open.forEach((n, i) =>
      push(
        `${i + 1}. [${noteKindLabel[n.kind]}] ${n.body.trim().replace(/\n+/g, " / ")}`,
      ),
    );
    push("");
  }
  if (prefs.length) {
    push("## Preferences to keep in mind");
    prefs.forEach((n) => push(`- ${n.body.trim().replace(/\n+/g, " / ")}`));
    push("");
  }
  const liveScenarios = scenarios.filter((s) => s.status !== "ruled_out");
  if (liveScenarios.length) {
    push("## Directions being compared");
    liveScenarios.forEach((s) =>
      push(
        `- ${s.title} (${s.destination}${s.startDate ? `, ${s.startDate} to ${s.endDate ?? "?"}` : ""})${s.summary ? `: ${s.summary.replace(/\n+/g, " / ")}` : ""}`,
      ),
    );
    push("");
  }
  const active = suggestions.filter((s) => s.status !== "dismissed");
  if (active.length) {
    push("## Ideas so far (★ = shortlisted)");
    active.forEach((s) =>
      push(
        `- ${s.status === "saved" ? "★ " : ""}${s.title} · ${s.category}${s.tags ? ` · ${s.tags}` : ""}${s.priceLabel ? ` · ${s.priceLabel}` : ""}${s.subtitle ? ` · ${s.subtitle}` : ""}`,
      ),
    );
    push("");
  }
  const ruledOut = [
    ...suggestions.filter((s) => s.status === "dismissed").map((s) => s.title),
    ...scenarios.filter((s) => s.status === "ruled_out").map((s) => s.title),
  ];
  if (ruledOut.length)
    push(
      "## Already ruled out (don't suggest again)",
      ...ruledOut.map((t) => `- ${t}`),
      "",
    );
  push(
    "## How to reply",
    "Answer in plain language first. If you handled any of my numbered notes, say which number each answer is for.",
    "Then end with one JSON block of new ideas so I can import them into my portal. Use this exact shape (category is one of stay, flight, food, activity, planning; tags are comma-separated, ideally using my trip styles):",
    "```json",
    '[{"title": "Name of the idea", "category": "stay", "subtitle": "One line: where and what", "priceLabel": "~$900 per person", "tags": "all-inclusive, beach", "detail": "Why it fits, what to watch for, how to book", "url": "https://example.com"}]',
    "```",
  );
  return out.join("\n");
}

const categories: SuggestionCategory[] = [
  "stay",
  "flight",
  "food",
  "activity",
  "planning",
];
const text = (v: unknown, max = 2000) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** Pulls the ideas array out of an AI reply. Accepts a ```json block or a bare array. */
export function parseAIIdeas(
  reply: string,
  tripSlug: string,
  makeId: () => string,
): Suggestion[] {
  const blocks = [...reply.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(
    (m) => m[1],
  );
  const candidates = blocks.length ? blocks.reverse() : [reply];
  let items: unknown = null;
  for (const c of candidates) {
    const start = c.indexOf("["),
      end = c.lastIndexOf("]");
    if (start < 0 || end <= start) continue;
    try {
      items = JSON.parse(c.slice(start, end + 1));
      if (Array.isArray(items)) break;
    } catch {
      items = null;
    }
  }
  if (!Array.isArray(items))
    throw new Error(
      "No list of ideas found. Paste the reply that ends with the JSON block.",
    );
  const ideas = items.flatMap((raw, i): Suggestion[] => {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const title = text(r.title, 200);
    if (!title) return [];
    const category = String(
      r.category ?? "",
    ).toLowerCase() as SuggestionCategory;
    let url = text(r.url, 1000);
    if (url) {
      try {
        if (!["http:", "https:"].includes(new URL(url).protocol)) url = null;
      } catch {
        url = null;
      }
    }
    const tags = Array.isArray(r.tags)
      ? r.tags.filter((t) => typeof t === "string").join(", ")
      : text(r.tags, 300);
    return [
      {
        id: makeId(),
        tripSlug,
        category: categories.includes(category) ? category : "activity",
        title,
        subtitle: text(r.subtitle, 300),
        detail: text(r.detail, 5000),
        priceLabel: text(r.priceLabel ?? r.price, 120),
        url,
        source: "AI brainstorm",
        status: "suggested",
        sortOrder: 100 + i,
        scenarioId: null,
        itemType: "idea",
        verification: "modeled",
        checkedAt: null,
        tags: tags || null,
      },
    ];
  });
  if (!ideas.length) throw new Error("The list had no ideas with a title.");
  return ideas.slice(0, 40);
}

export interface PlanningStage {
  id: "brief" | "ideas" | "shortlist" | "direction" | "book" | "days";
  label: string;
  done: boolean;
  tab: "brainstorm" | "options" | "reservations" | "itinerary";
}

/** Where a trip is in its planning, so the trip page can point at the next step. */
export function planningStages({
  trip,
  brief,
  suggestions,
  scenarios,
  bookingCount,
  itineraryCount,
}: {
  trip: Trip;
  brief?: TripBrief | null;
  suggestions: Suggestion[];
  scenarios: Scenario[];
  bookingCount: number;
  itineraryCount: number;
}): PlanningStage[] {
  const active = suggestions.filter((s) => s.status !== "dismissed");
  const briefDone = Boolean(
    brief &&
    [brief.window, brief.nights, brief.styles, brief.vibes, brief.who].filter(
      (v) => v?.trim(),
    ).length >= 2,
  );
  return [
    {
      id: "brief",
      label: "Describe the trip",
      done: briefDone,
      tab: "brainstorm",
    },
    {
      id: "ideas",
      label: "Gather ideas",
      done: active.length >= 3,
      tab: "brainstorm",
    },
    {
      id: "shortlist",
      label: "Shortlist favorites",
      done: active.some((s) => s.status === "saved"),
      tab: "options",
    },
    {
      id: "direction",
      label: "Choose a direction",
      done:
        Boolean(trip.selectedScenarioId) ||
        (!scenarios.length && Boolean(trip.startDate) && bookingCount > 0),
      tab: "options",
    },
    {
      id: "book",
      label: "Book it",
      done: bookingCount > 0,
      tab: "reservations",
    },
    {
      id: "days",
      label: "Plan the days",
      done: itineraryCount > 0,
      tab: "itinerary",
    },
  ];
}
