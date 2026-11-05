"use server";
import { createClient } from "@/lib/supabase/server";
import { fromRow, tables, toRow, validateRecord } from "@/lib/records";
import { isSupabaseConfigured, isPortalOwner } from "@/lib/data";
import type { EntityName } from "@/lib/types";
export async function saveRecord(entity: EntityName, input: unknown) {
  try {
    if (!isSupabaseConfigured())
      throw new Error("Live storage is not configured.");
    const record = validateRecord(entity, input) as unknown as Record<
      string,
      unknown
    >;
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user || !isPortalOwner(user.email))
      throw new Error("Your session expired. Sign in again before saving.");
    for (const [field, table, key] of [
      ["tripSlug", "trips", "slug"],
      ["bookingId", "bookings", "id"],
      ["scenarioId", "trip_scenarios", "id"],
      ["selectedScenarioId", "trip_scenarios", "id"],
      ["sourceSuggestionId", "trip_suggestions", "id"],
    ]) {
      if (record[field]) {
        const { data, error } = await db
          .from(table)
          .select("*")
          .eq(key, record[field])
          .eq("user_id", user.id)
          .maybeSingle();
        if (error || !data)
          throw new Error(`The related ${field} is unavailable.`);
        if (
          data.trip_slug &&
          data.trip_slug !== (record.tripSlug ?? record.slug)
        )
          throw new Error("Related records must belong to the same trip.");
      }
    }
    if (entity === "trips") {
      const { data: previous } = await db
        .from("trips")
        .select("slug")
        .eq("id", record.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (previous && previous.slug !== record.slug)
        throw new Error("The trip address cannot change after creation.");
    }
    // A shortlist action is never a booking. Existing legacy values can only be preserved for review.
    if (entity === "suggestions" && record.status === "booked") {
      const { data: previous } = await db
        .from("trip_suggestions")
        .select("status")
        .eq("id", record.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (previous?.status !== "booked")
        throw new Error("Use Record reservation to record a booking.");
    }
    const { data, error } = await db
      .from(tables[entity])
      .upsert({ ...toRow(entity, record), user_id: user.id })
      .select("*")
      .single();
    if (error) {
      console.error("Portal save failed", tables[entity], error.code);
      throw new Error(
        "Could not save. Your previous data is unchanged. Check the connection and try again.",
      );
    }
    return { record: fromRow(entity, data), error: null };
  } catch (error) {
    return {
      record: null,
      error: error instanceof Error ? error.message : "Could not save.",
    };
  }
}
