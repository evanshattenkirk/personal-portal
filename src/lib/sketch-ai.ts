import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  normalizeSketch,
  sketchFrame,
  sketchHash,
  type OptionSketch,
} from "./sketch";
import type { Suggestion, Trip, TripBrief } from "./types";

// Draws a mock day-by-day itinerary for one trip option with Claude Haiku.
// Small and cheap on purpose: one call, thinking off, a short JSON answer.
const SKETCH_MODEL =
  process.env.SKETCH_MODEL?.trim() ||
  process.env.ASSISTANT_CHAT_MODEL?.trim() ||
  "claude-haiku-5-5";

const SYSTEM = `You sketch believable, fun mock itineraries for trip options in Evan's trip planner. The sketch is shown on a small calendar so Evan can picture an option and compare it with others, and show it to the people coming.

Rules:
- Fit the option exactly: a cruise follows its real ports and sea days in order; a festival trip plans around the festival; an all-inclusive mixes resort days with one or two outings; a city break uses real neighborhoods and well-known spots.
- Fit the brief: lean into what the group wants and never plan anything on the skip list.
- Day 1 is arrival (usually afternoon and evening only). The last day is the trip home (usually morning only). Middle days have morning, afternoon and evening.
- Each slot: one emoji that shows the activity, a title of at most 5 words, and an optional note of at most 10 words. Name real places when you are confident they exist; otherwise describe the kind of place. Never invent prices, times or bookings.
- Each day: a theme of at most 4 words and one emoji.
- highlights: exactly 3 short selling points (at most 5 words each). watchOut: one honest catch in at most 14 words, or null.
- headline: one upbeat line of at most 14 words.
- travel: how they get there in at most 8 words (e.g. "2h flight from Chicago, then 1h transfer"), using where they leave from if known, or null.
- roughTotal: a rough total for the whole group from the option's own price, labeled as an estimate (e.g. "~$7k–9k for 6 (estimate)"), or null if you can't tell.
- Use emoji consistently so options compare at a glance: ✈️ flight, 🚢 embark or cruise day, ⚓ port day, 🚗 drive or transfer, 🏨 check-in, 🏠 house or Airbnb, 🌴 beach or free time, 🧖 spa, 🍽️ dinner, 🥐 breakfast or brunch, 🍹 drinks, 🎶 live music, 💃 nightlife, 🎭 show, 🛍️ shopping or markets, 🚶 wandering, 🧳 heading home. Pick another fitting emoji when none of these fit. No flags or people.

Answer with only this JSON, no other text:
{"headline":"…","highlights":["…","…","…"],"watchOut":"…","travel":"…","roughTotal":"…","days":[{"theme":"…","emoji":"…","slots":[{"part":"morning|afternoon|evening","emoji":"…","title":"…","note":"…"}]}]}`;

export class SketchError extends Error {
  // Checked by name-independent flag: class names don't survive minification.
  readonly sketchError = true;
  constructor(
    message: string,
    public status = 500,
  ) {
    super(message);
  }
}

export const sketchAIConfigured = () =>
  Boolean(process.env.ANTHROPIC_API_KEY?.trim());

export async function drawSketchWithAI(
  option: Suggestion,
  trip: Trip,
  brief: TripBrief | null,
): Promise<OptionSketch> {
  const frame = sketchFrame(option, trip, brief);
  const context = {
    trip: {
      name: trip.name,
      destination: trip.destination,
      when: brief?.window || trip.dateLabel,
      travelers: trip.travelers,
      notes: trip.notes,
    },
    brief: brief
      ? {
          who: brief.who,
          leavingFrom: brief.origin,
          wants: brief.vibes,
          skip: brief.avoid,
          mustHaves: brief.mustHaves,
        }
      : null,
    option: {
      title: option.title,
      what: option.subtitle,
      detail: option.detail,
      price: option.priceLabel,
      tags: option.tags,
    },
    plan: {
      days: frame.nights + 1,
      nights: frame.nights,
      dates: frame.start ? `${frame.start} to ${frame.end}` : "not set",
    },
  };
  // Fail fast: a stuck sketch is worse than a "Try again".
  const client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: SKETCH_MODEL,
      max_tokens: 2500,
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: `Sketch exactly ${frame.nights + 1} days for this option.\n${JSON.stringify(context)}`,
        },
      ],
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
    } as Anthropic.MessageCreateParamsNonStreaming);
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error("Sketch API error", error.status, error.message);
      throw new SketchError(
        error.status === 401 || error.status === 403
          ? "Your Anthropic API key was rejected."
          : error.status === 429
            ? "Claude is busy right now."
            : "Claude couldn't sketch this one just now.",
        502,
      );
    }
    throw error;
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const start = text.indexOf("{"),
    end = text.lastIndexOf("}");
  let raw: unknown = null;
  try {
    raw = start >= 0 && end > start ? JSON.parse(text.slice(start, end + 1)) : null;
  } catch {
    raw = null;
  }
  try {
    return normalizeSketch(raw, {
      optionId: option.id,
      tripSlug: option.tripSlug,
      hash: sketchHash(option, brief, trip),
      nights: frame.nights,
      start: frame.start,
      end: frame.end,
      source: "ai",
    });
  } catch {
    throw new SketchError("The sketch came back garbled. Try again.", 502);
  }
}
