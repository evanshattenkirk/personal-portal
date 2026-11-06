import test from "node:test";
import assert from "node:assert/strict";
import {
  briefFit,
  compareAsText,
  nightsWarning,
  dayLabel,
  findDateRange,
  isTripOption,
  normalizeSketch,
  oneEmoji,
  quickSketch,
  rangeLabel,
  sketchFrame,
  sketchHash,
} from "../src/lib/sketch.ts";
import type { Suggestion, Trip, TripBrief } from "../src/lib/types.ts";

const trip: Trip = {
  id: "trip-family",
  slug: "family-trip",
  name: "Family trip",
  destination: "TBD",
  startDate: null,
  endDate: null,
  dateLabel: "Late Mar to Apr 2027",
  status: "planning",
  travelers: 6,
  notes: null,
  sortOrder: 0,
};
const brief: TripBrief = {
  id: "brief-family-trip",
  tripSlug: "family-trip",
  window: "Mid April 2027",
  nights: "4-5",
  styles: "Cruise, Airbnb/VRBO, All-inclusive, Resort, City break",
  vibes: "Food, Drinks, Live music, Having fun, Exploring, Meeting people, Relaxing",
  avoid: "Hiking, Skiing",
  budget: null,
  origin: null,
  who: null,
  mustHaves: null,
};
const idea = (over: Partial<Suggestion>): Suggestion => ({
  id: "s1",
  tripSlug: "family-trip",
  category: "stay",
  title: "Idea",
  subtitle: null,
  detail: null,
  priceLabel: null,
  url: null,
  source: null,
  status: "suggested",
  sortOrder: 0,
  itemType: "idea",
  ...over,
});
const virgin = idea({
  id: "virgin",
  title: "Virgin Voyages 5 nights from Miami",
  subtitle: "Resilient Lady · Apr 18-23, 2027 · Grand Turk + Bimini Beach Club",
  tags: "Cruise, Adults only, Nightlife",
});
const nola = idea({
  id: "nola",
  category: "activity",
  title: "New Orleans for French Quarter Fest",
  subtitle: "Apr 8-11, 2027 · 20+ music stages, 60+ local restaurants",
  tags: "City break, Live music, Food",
});
const unico = idea({
  id: "unico",
  title: "Unico 20 87",
  subtitle: "Adults-only all-inclusive, Riviera Maya (Kantenah)",
  tags: "All-inclusive, Adults only",
});

test("finds date ranges in option text", () => {
  assert.deepEqual(findDateRange("Apr 18-23, 2027 · Grand Turk", 2026), {
    start: "2027-04-18",
    end: "2027-04-23",
  });
  assert.deepEqual(findDateRange("Dec 10–13 (3 nights)", 2026), {
    start: "2026-12-10",
    end: "2026-12-13",
  });
  assert.deepEqual(findDateRange("Apr 30 - May 3", 2027), {
    start: "2027-04-30",
    end: "2027-05-03",
  });
  assert.equal(findDateRange("Dec 28 - Jan 2", 2026)?.end, "2027-01-02");
  assert.equal(findDateRange("no dates here", 2027), null);
  assert.equal(findDateRange("Feb 30-31", 2027), null);
});

test("labels days and ranges", () => {
  assert.equal(dayLabel("2027-04-08"), "Thu, Apr 8");
  assert.equal(rangeLabel("2027-04-18", "2027-04-23"), "Apr 18 – 23, 2027");
  assert.equal(rangeLabel("2027-04-30", "2027-05-03"), "Apr 30 – May 3, 2027");
});

test("sizes a sketch from dates, stated nights, or the brief", () => {
  assert.deepEqual(sketchFrame(virgin, trip, brief), {
    nights: 5,
    start: "2027-04-18",
    end: "2027-04-23",
  });
  assert.equal(sketchFrame(nola, trip, brief).nights, 3);
  assert.deepEqual(sketchFrame(unico, trip, brief), {
    nights: 5,
    start: null,
    end: null,
  });
  assert.equal(
    sketchFrame(idea({ title: "Utopia of the Seas 4 nights" }), trip, brief)
      .nights,
    4,
  );
});

test("only whole-trip options get sketches", () => {
  assert.ok(isTripOption(virgin, trip, brief));
  assert.ok(isTripOption(nola, trip, brief));
  assert.ok(isTripOption(unico, trip, brief));
  assert.ok(!isTripOption(idea({ category: "flight", title: "AA 1234" }), trip, brief));
  assert.ok(!isTripOption(idea({ category: "food", title: "Canlis dinner" }), trip, brief));
  assert.ok(!isTripOption(idea({ title: "Space Needle tickets", category: "activity" }), trip, brief));
  assert.ok(!isTripOption({ ...virgin, status: "dismissed" }, trip, brief));
  assert.ok(!isTripOption({ ...virgin, itemType: "task" }, trip, brief));
});

test("hash changes with the option or the brief", () => {
  const a = sketchHash(virgin, brief);
  assert.equal(a, sketchHash({ ...virgin }, brief));
  assert.notEqual(a, sketchHash({ ...virgin, subtitle: "Apr 12-17" }, brief));
  assert.notEqual(a, sketchHash(virgin, { ...brief, avoid: "Cruises" }));
  const b = sketchHash(virgin, brief, trip);
  assert.notEqual(b, sketchHash(virgin, brief, { ...trip, travelers: 8 }));
  assert.notEqual(b, sketchHash(virgin, brief, { ...trip, startDate: "2027-04-20" }));
});

test("keeps one emoji and drops text", () => {
  assert.equal(oneEmoji("🎷 jazz"), "🎷");
  assert.equal(oneEmoji("👨‍👩‍👧‍👦"), "👨‍👩‍👧‍👦");
  assert.equal(oneEmoji("jazz"), "✨");
  assert.equal(oneEmoji(null, "📍"), "📍");
});

test("normalizes a model answer into dated days", () => {
  const s = normalizeSketch(
    {
      headline: "Five nights of food and beach clubs",
      highlights: ["Bimini Beach Club", "20+ restaurants", "Adults only", "extra"],
      watchOut: "Drinks cost extra",
      days: [
        {
          theme: "Sail away",
          emoji: "🛳️",
          slots: [
            { part: "Afternoon", emoji: "🛳️", title: "Board in Miami" },
            { part: "evening", emoji: "🍸", title: "Sail-away party", note: "Top deck" },
            { part: "night", emoji: "🌙", title: "ignored" },
          ],
        },
        { theme: "", slots: [] },
        ...Array.from({ length: 8 }, () => ({
          theme: "Sea",
          slots: [{ part: "morning", emoji: "🌊", title: "Sea day" }],
        })),
      ],
    },
    {
      optionId: "virgin",
      tripSlug: "family-trip",
      hash: "h",
      nights: 5,
      start: "2027-04-18",
      end: "2027-04-23",
      source: "ai",
      now: "2026-11-06T00:00:00Z",
    },
  );
  assert.equal(s.days.length, 6);
  assert.equal(s.days[0].label, "Sun, Apr 18");
  assert.equal(s.days[5].date, "2027-04-23");
  assert.deepEqual(
    s.days[0].slots.map((x) => x.part),
    ["afternoon", "evening"],
  );
  assert.equal(s.days[1].slots.length, 0);
  assert.equal(s.highlights.length, 3);
  assert.equal(s.dateLabel, "Apr 18 – 23, 2027");
  assert.throws(() =>
    normalizeSketch({ days: [] }, { optionId: "x", tripSlug: "t", hash: "h", nights: 3, start: null, end: null, source: "ai" }),
  );
});

test("quick sketches cover every day and pick a fitting kit", () => {
  const s = quickSketch(virgin, trip, brief);
  assert.equal(s.source, "quick");
  assert.equal(s.days.length, 6);
  assert.ok(s.days.every((d) => d.slots.length > 0));
  assert.ok(JSON.stringify(s).includes("Sea day"));
  const n = quickSketch(nola, trip, brief);
  assert.equal(n.days[0].label, "Thu, Apr 8");
  assert.ok(JSON.stringify(n).includes("Festival day"));
  assert.equal(quickSketch(unico, trip, brief).days[0].label, "Day 1");
});

test("brief fit finds wants and avoids", () => {
  const fit = briefFit(nola, quickSketch(nola, trip, brief), brief);
  assert.ok(fit.wants.includes("Live music"));
  assert.ok(fit.wants.includes("Food"));
  assert.deepEqual(fit.avoids, []);
  const hike = briefFit(idea({ title: "Hiking lodge weekend" }), null, brief);
  assert.deepEqual(hike.avoids, ["Hiking"]);
});

test("warns when nights fall outside the brief", () => {
  assert.equal(nightsWarning(3, brief), "3 nights · shorter than your 4–5");
  assert.equal(nightsWarning(5, brief), null);
  assert.equal(nightsWarning(7, brief), "7 nights · longer than your 4–5");
  assert.equal(nightsWarning(3, { ...brief, nights: null }), null);
});

test("strips emoji from titles and copies a compare as text", () => {
  const s = normalizeSketch(
    { days: [{ slots: [{ part: "evening", emoji: "🎶", title: "🎶 Jazz on Frenchmen" }] }] },
    { optionId: "nola", tripSlug: "t", hash: "h", nights: 1, start: null, end: null, source: "ai" },
  );
  assert.equal(s.days[0].slots[0].title, "Jazz on Frenchmen");
  const text = compareAsText("2 ways", [
    { option: nola, sketch: s },
    { option: unico, sketch: null },
  ]);
  assert.match(text, /1\. New Orleans for French Quarter Fest \(1 night\)/);
  assert.match(text, /Day 1: 🎶 Jazz on Frenchmen/);
  assert.match(text, /2\. Unico 20 87/);
});

test("tags can force a preview on or off", () => {
  assert.ok(isTripOption(idea({ title: "Somewhere", tags: "trip option" }), trip, brief));
  assert.ok(!isTripOption({ ...virgin, tags: "Cruise, no preview" }, trip, brief));
});

test("an option's stated nights beat the trip's dates", () => {
  const dated = { ...trip, startDate: "2027-04-16", endDate: "2027-04-21" };
  const f = sketchFrame(idea({ title: "Carnival 3-night cruise", category: "stay" }), dated, brief);
  assert.equal(f.nights, 3);
  assert.equal(f.start, "2027-04-16");
  assert.equal(f.end, "2027-04-19");
  assert.equal(sketchFrame(idea({ title: "Beach house", category: "stay" }), dated, brief).nights, 5);
});
