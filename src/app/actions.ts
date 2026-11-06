"use server";
import { createClient } from "@/lib/supabase/server";
import { fromRow, tables, toRow, validateRecord } from "@/lib/records";
import { isSupabaseConfigured, isPortalOwner } from "@/lib/data";
import { parseChanges, resolveChange } from "@/lib/proposals";
import type { EntityName } from "@/lib/types";
type DB = Awaited<ReturnType<typeof createClient>>;
async function ownerSession() {
  if (!isSupabaseConfigured())
    throw new Error("Live storage is not configured.");
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user || !isPortalOwner(user.email))
    throw new Error("Your session expired. Sign in again before saving.");
  return { db, user };
}
export async function saveRecord(entity: EntityName, input: unknown) {
  try {
    if (entity === "proposals")
      throw new Error("Confirm or reject a proposal from its card.");
    const record = validateRecord(entity, input) as unknown as Record<
      string,
      unknown
    >;
    const { db, user } = await ownerSession();
    return { record: await persist(db, user.id, entity, record), error: null };
  } catch (error) {
    return {
      record: null,
      error: error instanceof Error ? error.message : "Could not save.",
    };
  }
}
async function persist(
  db: DB,
  userId: string,
  entity: EntityName,
  record: Record<string, unknown>,
) {
  const user = { id: userId };
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
      if (data.trip_slug && data.trip_slug !== (record.tripSlug ?? record.slug))
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
  return fromRow(entity, data);
}

/**
 * Confirm or reject an assistant's proposal. Confirming saves each proposed
 * change through the same checks as a normal edit; if any change fails, the
 * proposal stays pending and the error explains which one.
 */
export async function decideProposal(
  id: string,
  decision: "accepted" | "rejected",
  feedback?: string | null,
) {
  try {
    if (typeof id !== "string" || !id || id.length > 150)
      throw new Error("Invalid proposal.");
    if (decision !== "accepted" && decision !== "rejected")
      throw new Error("Invalid decision.");
    const { db, user } = await ownerSession();
    const { data: row, error } = await db
      .from("trip_proposals")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error || !row) throw new Error("That proposal is no longer available.");
    const proposal = fromRow("proposals", row);
    if (proposal.status !== "pending")
      throw new Error("This proposal was already decided.");
    const saved: { entity: EntityName; record: unknown }[] = [];
    if (decision === "accepted") {
      const changes = parseChanges(proposal.changes);
      // Resolve and validate everything first so a bad change saves nothing.
      const resolved = [];
      for (const change of changes) {
        let existing: Record<string, unknown> | null = null;
        if (change.op === "update") {
          const { data } = await db
            .from(tables[change.entity])
            .select("*")
            .eq("id", change.id)
            .eq("user_id", user.id)
            .maybeSingle();
          existing = data
            ? (fromRow(change.entity, data) as unknown as Record<
                string,
                unknown
              >)
            : null;
        }
        resolved.push({
          entity: change.entity,
          record: resolveChange(change, existing, {
            tripSlug: proposal.tripSlug,
            id: crypto.randomUUID(),
          }),
        });
      }
      for (const r of resolved)
        saved.push({
          entity: r.entity,
          record: await persist(db, user.id, r.entity, r.record),
        });
    }
    const note =
      typeof feedback === "string" ? feedback.trim().slice(0, 4000) : "";
    const { data: updated, error: updateError } = await db
      .from("trip_proposals")
      .update({
        status: decision,
        decided_at: new Date().toISOString(),
        feedback: note || null,
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (updateError || !updated)
      throw new Error(
        "Saved the changes, but couldn't mark the proposal decided.",
      );
    if (note && proposal.tripSlug) {
      // Feedback becomes a note so the next check picks it up.
      saved.push({
        entity: "notes",
        record: await persist(db, user.id, "notes", {
          id: crypto.randomUUID(),
          tripSlug: proposal.tripSlug,
          body: `About "${proposal.title}": ${note}`,
          kind: "ask_ai",
          status: "open",
          aiReply: null,
          createdAt: new Date().toISOString(),
        }),
      });
    }
    return {
      proposal: fromRow("proposals", updated),
      saved,
      error: null,
    };
  } catch (error) {
    return {
      proposal: null,
      saved: [],
      error: error instanceof Error ? error.message : "Could not save.",
    };
  }
}

/** Asks Claude (on Evan's API key) to reply to this trip's open notes now. */
export async function askAssistant(tripSlug: string, research?: boolean) {
  try {
    if (typeof tripSlug !== "string" || !/^[a-z0-9-]{1,80}$/.test(tripSlug))
      throw new Error("Invalid trip.");
    await ownerSession();
    const { replyInPortal } = await import("@/lib/assistant");
    const result = await replyInPortal(tripSlug, {
      research: typeof research === "boolean" ? research : undefined,
    });
    return { ...result, error: null };
  } catch (error) {
    if (!(error instanceof Error && "status" in error))
      console.error("Assistant reply failed", error);
    return {
      saved: [],
      model: null,
      message: null,
      error:
        error instanceof Error && "status" in error
          ? error.message
          : "Claude couldn't reply just now. Try again in a minute.",
    };
  }
}
