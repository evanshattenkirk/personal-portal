"use server";
import { createClient } from "@/lib/supabase/server";
import { isPortalOwner, isSupabaseConfigured } from "@/lib/data";
import {
  canApprove,
  clipFlags,
  REJECT_REASONS,
  type Clip,
} from "@/lib/clipfarm";
import {
  clipTables,
  fromClipRow,
  toClipRow,
  validateClipRecord,
  type ClipEntity,
  type ClipEntityMap,
} from "@/lib/clipfarm-records";

type Result<T> = { record: T | null; error: string | null };

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

const fail = (error: unknown) => ({
  record: null,
  error: error instanceof Error ? error.message : "Could not save.",
});

/** Create or edit a campaign, account, payout, or a clip's non-review fields. */
export async function saveClipRecord<K extends ClipEntity>(
  entity: K,
  input: unknown,
): Promise<Result<ClipEntityMap[K]>> {
  try {
    const record = validateClipRecord(entity, input) as unknown as Record<
      string,
      unknown
    >;
    const { db, user } = await ownerSession();
    if (entity === "clips") {
      // Approval only happens through reviewClip, which re-checks the guards.
      const { data: existing } = await db
        .from("clips")
        .select("status")
        .eq("id", record.id)
        .eq("user_id", user.id)
        .maybeSingle();
      const before = (existing?.status as string | undefined) ?? "review";
      const goingLive = ["approved", "posted", "submitted"];
      if (!goingLive.includes(before) && goingLive.includes(String(record.status)))
        throw new Error("Approve a clip from the review queue.");
    }
    for (const [field, table] of [
      ["campaignId", "clip_campaigns"],
      ["accountId", "clip_accounts"],
    ] as const) {
      if (!record[field]) continue;
      const { data } = await db
        .from(table)
        .select("id")
        .eq("id", record[field])
        .eq("user_id", user.id)
        .maybeSingle();
      if (!data) throw new Error(`That ${field.replace("Id", "")} wasn't found.`);
    }
    const { data, error } = await db
      .from(clipTables[entity])
      .upsert({ ...toClipRow(entity, record), user_id: user.id })
      .select("*")
      .single();
    if (error || !data) {
      console.error("Clip Farm save failed", clipTables[entity], error?.code);
      throw new Error("Could not save. Check that migration 0011 has run.");
    }
    return { record: fromClipRow(entity, data), error: null };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteClipRecord(entity: ClipEntity, id: string) {
  try {
    const { db, user } = await ownerSession();
    const { error } = await db
      .from(clipTables[entity])
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error("Could not delete.");
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not delete." };
  }
}

/**
 * Evan's yes or no on a clip in the queue. A yes re-runs the same guards the
 * card shows, on fresh data, so a stale page can't approve a blocked clip.
 */
export async function reviewClip(
  id: string,
  decision: "approve" | "reject",
  opts: { accountId?: string | null; reason?: string | null } = {},
): Promise<Result<Clip>> {
  try {
    const { db, user } = await ownerSession();
    const read = async (table: string) => {
      const { data, error } = await db.from(table).select("*").eq("user_id", user.id);
      if (error) throw new Error("Could not check the clip.");
      return data ?? [];
    };
    const [clipRows, campaignRows, accountRows] = await Promise.all([
      read("clips"),
      read("clip_campaigns"),
      read("clip_accounts"),
    ]);
    const clips = clipRows.map((r) => fromClipRow("clips", r));
    const clip = clips.find((c) => c.id === id);
    if (!clip) throw new Error("That clip wasn't found.");
    if (clip.status !== "review" && clip.status !== "rejected")
      throw new Error("This clip has already been decided.");
    const accounts = accountRows.map((r) => fromClipRow("accounts", r));
    const campaigns = campaignRows.map((r) => fromClipRow("campaigns", r));
    const next: Clip = { ...clip };
    if (opts.accountId !== undefined) {
      if (opts.accountId && !accounts.some((a) => a.id === opts.accountId))
        throw new Error("That account wasn't found.");
      next.accountId = opts.accountId;
    }
    if (decision === "approve") {
      const flags = clipFlags(next, { campaigns, accounts, clips });
      if (!canApprove(flags))
        throw new Error(
          flags.filter((f) => f.level === "block").map((f) => f.text).join(". "),
        );
      next.status = "approved";
      next.rejectReason = null;
    } else {
      const reason = opts.reason ?? "";
      if (!(REJECT_REASONS as readonly string[]).includes(reason))
        throw new Error("Pick a reason so the pipeline learns from it.");
      next.status = "rejected";
      next.rejectReason = reason;
    }
    const { data, error } = await db
      .from("clips")
      .update({
        status: next.status,
        account_id: next.accountId,
        reject_reason: next.rejectReason,
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();
    if (error || !data) throw new Error("Could not save the decision.");
    return { record: fromClipRow("clips", data), error: null };
  } catch (error) {
    return fail(error);
  }
}
