import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAIBrief,
  parseAIIdeas,
  planningStages,
  splitTags,
  hasTag,
} from "../src/lib/brainstorm.ts";
import { validateRecord } from "../src/lib/records.ts";
import type { Trip, TripNote } from "../src/lib/types.ts";

const trip: Trip = {
  id: "t1",
  slug: "spring-getaway",
  name: "Spring getaway",
  destination: "Somewhere warm",
  startDate: null,
  endDate: null,
  dateLabel: "Mid April",
  status: "planning",
  travelers: 4,
  notes: null,
  sortOrder: 0,
};
const note = (
  id: string,
  kind: TripNote["kind"],
  body: string,
  status: TripNote["status"] = "open",
  createdAt = "2026-11-05T00:00:00Z",
): TripNote => ({
  id,
  tripSlug: trip.slug,
  body,
  kind,
  status,
  aiReply: null,
  createdAt,
});

test("tags split, trim, and match case-insensitively", () => {
  assert.deepEqual(splitTags(" cruise, All-inclusive ,, "), [
    "cruise",
    "All-inclusive",
  ]);
  assert.ok(hasTag({ tags: "Cruise, beach" }, "cruise"));
  assert.ok(!hasTag({ tags: null }, "cruise"));
});

test("AI brief lists open notes by number, keeps preferences separate, and skips handled notes", () => {
  const md = buildAIBrief({
    trip,
    brief: {
      id: "b",
      tripSlug: trip.slug,
      window: "Mid April 2027",
      nights: "4-5",
      styles: "cruise, Airbnb/VRBO",
      vibes: "food, music",
      avoid: "hiking, skiing",
      budget: null,
      origin: null,
      who: null,
      mustHaves: null,
    },
    notes: [
      note("n1", "ask_ai", "Find three cruises"),
      note("n2", "preference", "Direct flights only"),
      note("n3", "note", "Old idea", "done"),
    ],
    scenarios: [],
    suggestions: [],
    ask: "Brainstorm options",
    exportedAt: "2026-11-05",
  });
  assert.match(md, /## What I'm asking\nBrainstorm options/);
  assert.match(md, /- Nights: 4-5/);
  assert.match(md, /- Skip: hiking, skiing/);
  assert.match(md, /1\. \[Ask AI\] Find three cruises/);
  assert.match(md, /## Preferences to keep in mind\n- Direct flights only/);
  assert.doesNotMatch(md, /Old idea/);
  assert.match(md, /```json/);
});

test("AI ideas import from the last JSON block and are sanitized", () => {
  let n = 0;
  const ideas = parseAIIdeas(
    'Here you go.\n```json\n[{"title":"Carnival 4-night Bahamas","category":"STAY","tags":["cruise","music"],"price":"$600 pp","url":"javascript:alert(1)"},{"title":""},{"title":"Nashville Airbnb","category":"nope","url":"https://example.com"}]\n```',
    trip.slug,
    () => `id-${++n}`,
  );
  assert.equal(ideas.length, 2);
  assert.equal(ideas[0].category, "stay");
  assert.equal(ideas[0].tags, "cruise, music");
  assert.equal(ideas[0].priceLabel, "$600 pp");
  assert.equal(ideas[0].url, null);
  assert.equal(ideas[1].category, "activity");
  assert.equal(ideas[1].status, "suggested");
  for (const idea of ideas) validateRecord("suggestions", idea);
  assert.throws(() => parseAIIdeas("no json here", trip.slug, () => "x"));
});

test("notes and briefs validate like other records", () => {
  validateRecord("notes", note("n1", "ask_ai", "Do a thing"));
  assert.throws(() =>
    validateRecord("notes", { ...note("n1", "ask_ai", "x"), kind: "other" }),
  );
  assert.throws(() =>
    validateRecord("notes", { ...note("n1", "ask_ai", "x"), body: " " }),
  );
  validateRecord("briefs", {
    id: "brief-x",
    tripSlug: "x",
    window: "April",
    nights: "4",
  });
});

test("planning stages point at the first unfinished step", () => {
  const stages = planningStages({
    trip,
    brief: null,
    suggestions: [],
    scenarios: [],
    bookingCount: 0,
    itineraryCount: 0,
  });
  assert.equal(stages.find((s) => !s.done)?.id, "brief");
  const later = planningStages({
    trip,
    brief: {
      id: "b",
      tripSlug: trip.slug,
      window: "April",
      nights: "4",
      styles: null,
      vibes: null,
      avoid: null,
      budget: null,
      origin: null,
      who: null,
      mustHaves: null,
    },
    suggestions: [],
    scenarios: [],
    bookingCount: 0,
    itineraryCount: 0,
  });
  assert.equal(later.find((s) => !s.done)?.id, "ideas");
});
