// Clip Farm v1.1 storage helpers shared by the signed-in actions, the page
// loader and the pipeline API. Everything here tolerates migration 0012 not
// having run yet: history reads come back empty and saves drop the new columns.
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CampaignSnapshot,
  Clip,
  ClipCampaign,
  ClipSnapshot,
} from "./clipfarm.ts";
import { isMissingColumn, withoutV11Columns } from "./clipfarm-records.ts";

const isMissingTable = (code?: string) => code === "42P01" || code === "PGRST205";

/** Keep history reads bounded: the last 120 days is plenty for refit, runway and pace. */
const HISTORY_DAYS = 120;

/**
 * Newest rows first, a page at a time: the Supabase API returns at most 1000
 * rows per request, and runway and pace need the most recent ones.
 */
async function readNewest(
  db: SupabaseClient,
  table: string,
  columns: string,
  uid: string,
  since: string,
  max: number,
) {
  const out: Record<string, unknown>[] = [];
  const page = 1000;
  for (let from = 0; from < max; from += page) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .eq("user_id", uid)
      .gte("captured_at", since)
      .order("captured_at", { ascending: false })
      .range(from, Math.min(from + page, max) - 1);
    if (error) return { data: null, error };
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return { data: out.reverse(), error: null };
}

export async function readHistory(db: SupabaseClient, uid: string) {
  const since = new Date(Date.now() - HISTORY_DAYS * 86400000).toISOString();
  const [c, k] = await Promise.all([
    readNewest(db, "clip_snapshots", "id, clip_id, captured_at, views", uid, since, 20000),
    readNewest(
      db,
      "campaign_snapshots",
      "id, campaign_id, captured_at, budget_used, active_clippers",
      uid,
      since,
      5000,
    ),
  ]);
  if (c.error || k.error) {
    const code = c.error?.code ?? k.error?.code;
    if (!isMissingTable(code)) console.error("Clip Farm history read failed", code);
    return { clipSnapshots: [], campaignSnapshots: [], historyReady: false };
  }
  const clipSnapshots: ClipSnapshot[] = (c.data ?? []).map((r) => ({
    id: String(r.id),
    clipId: String(r.clip_id),
    capturedAt: String(r.captured_at),
    views: Number(r.views),
  }));
  const campaignSnapshots: CampaignSnapshot[] = (k.data ?? []).map((r) => ({
    id: String(r.id),
    campaignId: String(r.campaign_id),
    capturedAt: String(r.captured_at),
    budgetUsed: Number(r.budget_used),
    activeClippers: r.active_clippers == null ? null : Number(r.active_clippers),
  }));
  return { clipSnapshots, campaignSnapshots, historyReady: true };
}

/**
 * When the new numbers were read: the record's own timestamp only if this
 * write moved it forward, otherwise now (a stale stamp would put a day-7
 * number at the day-1 mark and skew the refit).
 */
function freshTime(after?: string | null, before?: string | null) {
  const a = after ? Date.parse(after) : NaN;
  const b = before ? Date.parse(before) : NaN;
  if (Number.isFinite(a) && (!Number.isFinite(b) || a > b) && a <= Date.now() + 5 * 60000)
    return new Date(a).toISOString();
  return new Date().toISOString();
}

const snapId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

/** A views snapshot when a live clip's views changed. */
export function clipSnapshotRow(
  before: Pick<Clip, "views"> & { statsAsOf?: string | null } | null,
  after: Pick<Clip, "id" | "views" | "statsAsOf" | "postedAt">,
  uid: string,
) {
  if (!after.postedAt || after.views == null) return null;
  if (before && before.views === after.views) return null;
  if (!before && !after.views) return null;
  return {
    id: snapId("cs"),
    user_id: uid,
    clip_id: after.id,
    captured_at: freshTime(after.statsAsOf, before?.statsAsOf),
    views: after.views,
  };
}

/** A budget snapshot when a campaign's spend or clipper count changed. */
export function campaignSnapshotRow(
  before:
    | (Pick<ClipCampaign, "budgetUsed" | "activeClippers"> & { budgetCheckedAt?: string | null })
    | null,
  after: Pick<ClipCampaign, "id" | "budgetUsed" | "activeClippers" | "budgetCheckedAt">,
  uid: string,
) {
  if (after.budgetUsed == null) return null;
  if (
    before &&
    before.budgetUsed === after.budgetUsed &&
    before.activeClippers === after.activeClippers
  )
    return null;
  return {
    id: snapId("bs"),
    user_id: uid,
    campaign_id: after.id,
    captured_at: freshTime(after.budgetCheckedAt, before?.budgetCheckedAt),
    budget_used: after.budgetUsed,
    active_clippers: after.activeClippers,
  };
}

/** Writes snapshots; history is best effort, so a missing table never fails a save. */
export async function insertSnapshots(
  db: SupabaseClient,
  table: "clip_snapshots" | "campaign_snapshots",
  rows: (Record<string, unknown> | null)[],
) {
  const list = rows.filter((r): r is Record<string, unknown> => r != null);
  if (!list.length) return;
  const { error } = await db.from(table).insert(list);
  if (error && !isMissingTable(error.code))
    console.error("Clip Farm snapshot write failed", table, error.code);
}

type Write<T> = (rows: Record<string, unknown>[]) => PromiseLike<{
  data: T | null;
  error: { code?: string } | null;
}>;

/** Runs a write; if 0012's columns don't exist yet, retries once without them. */
export async function writeWithFallback<T>(
  rows: Record<string, unknown>[],
  write: Write<T>,
) {
  const first = await write(rows);
  if (!first.error || !isMissingColumn(first.error.code)) return first;
  return write(rows.map(withoutV11Columns));
}
