"use server";
import { createClient } from "@/lib/supabase/server";
import { fromRow } from "@/lib/records";
import { isPortalOwner, isSupabaseConfigured } from "@/lib/data";
import {
  isTripOption,
  quickSketch,
  sketchHash,
  type OptionSketch,
} from "@/lib/sketch";
import type { Suggestion, Trip, TripBrief } from "@/lib/types";

// Sample itineraries for trip options: read the cache, or draw a new one.
// Owner-only like every other action; option, trip and brief are always
// re-read from the database, never taken from the browser.

const TABLE = "trip_option_sketches";
const DAILY_CAP = Number(process.env.SKETCH_DAILY_CAP) || 80;
const slugOk = (v: unknown): v is string =>
  typeof v === "string" && /^[a-z0-9-]{1,80}$/.test(v);
const idOk = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= 150;

async function owner() {
  if (!isSupabaseConfigured())
    throw new Error("Live storage is not configured.");
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user || !isPortalOwner(user.email))
    throw new Error("Your session expired. Sign in again.");
  return { db, user };
}

const missingTable = (code?: string) => code === "42P01" || code === "PGRST205";

/** Every cached sketch for a trip. `stored: false` means migration 0010 hasn't run. */
export async function loadSketches(tripSlug: string) {
  try {
    if (!slugOk(tripSlug)) throw new Error("Invalid trip.");
    const { db, user } = await owner();
    const { data, error } = await db
      .from(TABLE)
      .select("option_id, hash, sketch")
      .eq("user_id", user.id)
      .eq("trip_slug", tripSlug);
    if (error) {
      if (missingTable(error.code))
        return { sketches: [], stored: false, aiReady: aiReady(), error: null };
      throw new Error("Couldn't load sample itineraries.");
    }
    return {
      sketches: (data ?? []).map((r) => r.sketch as OptionSketch),
      stored: true,
      aiReady: aiReady(),
      error: null,
    };
  } catch (error) {
    return {
      sketches: [],
      stored: true,
      aiReady: aiReady(),
      error: error instanceof Error ? error.message : "Couldn't load.",
    };
  }
}

const aiReady = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

/** Draws (or re-draws, with `fresh`) one option's sample itinerary and caches it. */
export async function drawSketch(optionId: string, fresh = false) {
  try {
    if (!idOk(optionId)) throw new Error("Invalid option.");
    const { db, user } = await owner();
    const { data: row } = await db
      .from("trip_suggestions")
      .select("*")
      .eq("id", optionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!row) throw new Error("That idea is no longer on the board.");
    const option = fromRow("suggestions", row) as Suggestion;
    const [{ data: tripRow }, { data: briefRow }] = await Promise.all([
      db
        .from("trips")
        .select("*")
        .eq("slug", option.tripSlug)
        .eq("user_id", user.id)
        .maybeSingle(),
      db
        .from("trip_briefs")
        .select("*")
        .eq("trip_slug", option.tripSlug)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    if (!tripRow) throw new Error("That trip is no longer available.");
    const trip = fromRow("trips", tripRow) as Trip;
    const brief = briefRow ? (fromRow("briefs", briefRow) as TripBrief) : null;
    if (!isTripOption(option, trip, brief))
      throw new Error("Sample itineraries are for whole-trip options.");
    const hash = sketchHash(option, brief, trip);

    let stored = true;
    const { data: cached, error: readError } = await db
      .from(TABLE)
      .select("hash, sketch, draw_day, draw_count")
      .eq("user_id", user.id)
      .eq("option_id", optionId)
      .maybeSingle();
    if (readError) {
      if (!missingTable(readError.code))
        throw new Error("Couldn't load sample itineraries.");
      stored = false;
    }
    const cachedSketch = cached?.sketch as OptionSketch | undefined;
    if (
      !fresh &&
      cachedSketch &&
      cached?.hash === hash &&
      (cachedSketch.source === "ai" || !aiReady())
    )
      return { sketch: cachedSketch, stored, error: null };

    const today = new Date().toISOString().slice(0, 10);
    let sketch: OptionSketch;
    // Without the cache table every visit would pay for new sketches, so
    // only an explicit re-sketch uses the AI until migration 0010 runs.
    const useAI = aiReady() && (stored || fresh);
    if (useAI) {
      if (stored) {
        const { data: todays } = await db
          .from(TABLE)
          .select("draw_count")
          .eq("user_id", user.id)
          .eq("draw_day", today);
        const used = (todays ?? []).reduce(
          (n, r) => n + Number(r.draw_count ?? 0),
          0,
        );
        if (used >= DAILY_CAP)
          throw new Error(
            "Today's limit for new sketches is reached. Try again tomorrow.",
          );
      }
      const { drawSketchWithAI } = await import("@/lib/sketch-ai");
      sketch = await drawSketchWithAI(option, trip, brief);
    } else {
      sketch = quickSketch(option, trip, brief);
    }

    if (stored) {
      const { error } = await db.from(TABLE).upsert({
        user_id: user.id,
        option_id: optionId,
        trip_slug: option.tripSlug,
        hash,
        sketch,
        previous: fresh && cachedSketch ? cachedSketch : null,
        draw_day: today,
        draw_count:
          (cached?.draw_day === today ? Number(cached?.draw_count ?? 0) : 0) +
          (useAI ? 1 : 0),
        updated_at: new Date().toISOString(),
      });
      if (error) {
        if (missingTable(error.code)) stored = false;
        else console.error("Sketch save failed", error.code);
      }
    }
    return { sketch, stored, canUndo: Boolean(fresh && cachedSketch && stored), error: null };
  } catch (error) {
    const known =
      error instanceof Error &&
      ((error as { sketchError?: boolean }).sketchError === true ||
        /^(Invalid|That |Sample|Today|Your session|Couldn|Live storage|Nothing)/.test(
          error.message,
        ));
    if (!known) console.error("Sketch failed", error);
    return {
      sketch: null,
      stored: true,
      error: known
        ? (error as Error).message
        : "Couldn't sketch this one just now.",
    };
  }
}

/** Puts back the version from before the last re-sketch. */
export async function undoSketch(optionId: string) {
  try {
    if (!idOk(optionId)) throw new Error("Invalid option.");
    const { db, user } = await owner();
    const { data, error } = await db
      .from(TABLE)
      .select("sketch, previous")
      .eq("user_id", user.id)
      .eq("option_id", optionId)
      .maybeSingle();
    if (error || !data?.previous) throw new Error("Nothing to undo.");
    const sketch = data.previous as OptionSketch;
    const { error: saveError } = await db
      .from(TABLE)
      .update({ sketch, hash: sketch.hash, previous: data.sketch })
      .eq("user_id", user.id)
      .eq("option_id", optionId);
    if (saveError) throw new Error("Couldn't undo just now.");
    return { sketch, error: null };
  } catch (error) {
    return {
      sketch: null,
      error: error instanceof Error ? error.message : "Couldn't undo.",
    };
  }
}
