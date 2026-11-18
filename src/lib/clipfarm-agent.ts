import "server-only";
import { AgentError, ownerId, serviceClient } from "./agent";
import {
  budgetLeft,
  campaignRunway,
  dailyCap,
  emptyClipFarm,
  fitProjectionK,
  formatLeaderboard,
  postsToday,
  rankCampaigns,
  type Clip,
  type ClipCampaign,
} from "./clipfarm";
import {
  clipTables,
  fromClipRow,
  mergePipelineAccount,
  mergePipelineCampaign,
  mergePipelineClip,
  toClipRow,
  type ClipEntity,
  type ClipEntityMap,
} from "./clipfarm-records";
import {
  campaignSnapshotRow,
  clipSnapshotRow,
  insertSnapshots,
  readHistory,
  writeWithFallback,
} from "./clipfarm-history";

// The Clip Farm side of the assistant API, for the Claude Code pipeline on
// Evan's computer. Same PORTAL_AGENT_TOKEN as /api/agent/*. The pipeline
// adds clips to the review queue and keeps stats fresh; it can never approve.
// See docs/clip-farm.md.

async function load(entity: ClipEntity) {
  const db = serviceClient();
  const uid = await ownerId(db);
  const { data, error } = await db
    .from(clipTables[entity])
    .select("*")
    .eq("user_id", uid);
  if (error)
    throw new AgentError(
      error.code === "42P01" || error.code === "PGRST205"
        ? "Run migration 0011_clip_farm.sql first."
        : `Could not read ${clipTables[entity]}.`,
      error.code === "42P01" || error.code === "PGRST205" ? 503 : 500,
    );
  return { db, uid, rows: data ?? [] };
}

/** What the pipeline needs each morning and before each post. */
export async function clipFarmInbox() {
  const [c, a, k] = await Promise.all([
    load("campaigns"),
    load("accounts"),
    load("clips"),
  ]);
  const campaigns = c.rows.map((r) => fromClipRow("campaigns", r));
  const accounts = a.rows.map((r) => fromClipRow("accounts", r));
  const clips = k.rows.map((r) => fromClipRow("clips", r));
  const history = await readHistory(k.db, k.uid);
  const now = new Date();
  const live = clips.filter((x) => x.status !== "rejected" && x.status !== "archived");
  const projection = fitProjectionK({ ...emptyClipFarm(), clips, ...history }, now);
  return {
    generatedAt: new Date().toISOString(),
    guide: "docs/clip-farm.md in github.com/evanshattenkirk/personal-portal",
    // Feed these, best first. Never cut for a campaign that's ended or spent.
    campaigns: rankCampaigns(campaigns)
      .filter(
        (r) =>
          (r.campaign.status === "active" || r.campaign.status === "applied") &&
          budgetLeft(r.campaign) !== 0,
      )
      .map((r) => ({
        ...r.campaign,
        score: r.score,
        ...campaignRunway(r.campaign, history.campaignSnapshots, now),
      })),
    // Don't post past an account's daily cap; postsToday counts approved clips waiting too.
    accounts: accounts
      .filter((x) => x.status !== "killed")
      .map((x) => ({ ...x, dailyCap: dailyCap(x), postsToday: postsToday(x, clips, now) })),
    // Day-7 views ≈ views24h × projectionK (refit from Evan's own clips after 30).
    projectionK: projection.k,
    projectionFitted: projection.fitted,
    // Evan said yes: post these, then mark each posted with its URL.
    toPost: clips.filter((x) => x.status === "approved"),
    // Live posts to refresh stats for.
    toTrack: clips
      .filter((x) => x.status === "posted" || x.status === "submitted")
      .map((x) => ({ id: x.id, postUrl: x.postUrl, accountId: x.accountId, postedAt: x.postedAt })),
    // Never cut the same moment again.
    usedFingerprints: [...new Set(live.map((x) => x.fingerprint).filter(Boolean))],
    // Learn from these: why Evan said no.
    recentRejections: clips
      .filter((x) => x.status === "rejected")
      .slice(0, 30)
      .map((x) => ({ id: x.id, hook: x.hook, format: x.format, reason: x.rejectReason })),
    formatLeaderboard: formatLeaderboard(clips),
  };
}

const list = (body: Record<string, unknown>, key: string, max: number) => {
  const v = body[key] ?? [];
  if (!Array.isArray(v)) throw new AgentError(`${key} must be a list.`);
  if (v.length > max) throw new AgentError(`At most ${max} ${key} per request.`);
  return v as unknown[];
};

/** Adds clips to the queue and updates stats. Validates everything before writing anything. */
export async function clipFarmPost(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AgentError("Send a JSON object.");
  const body = input as Record<string, unknown>;
  const clipsIn = list(body, "clips", 100);
  const accountsIn = list(body, "accounts", 50);
  const campaignsIn = list(body, "campaigns", 50);
  const [k, a, c] = await Promise.all([
    load("clips"),
    load("accounts"),
    load("campaigns"),
  ]);
  const { db, uid } = k;
  const clips = new Map(k.rows.map((r) => [r.id as string, fromClipRow("clips", r)]));
  const byUrl = new Map(
    [...clips.values()].filter((x) => x.postUrl).map((x) => [x.postUrl as string, x]),
  );
  const accounts = new Map(a.rows.map((r) => [r.id as string, fromClipRow("accounts", r)]));
  const campaigns = new Map(c.rows.map((r) => [r.id as string, fromClipRow("campaigns", r)]));
  const campaignByUrl = new Map(
    [...campaigns.values()].filter((x) => x.url).map((x) => [x.url as string, x]),
  );
  // New rows are inserted; existing rows get only the columns that changed,
  // so an edit Evan makes mid-request is never overwritten with stale values.
  const clipWrites: Write[] = [];
  const accountWrites: Write[] = [];
  const campaignWrites: Write[] = [];
  const clipSnaps: ReturnType<typeof clipSnapshotRow>[] = [];
  const campaignSnaps: ReturnType<typeof campaignSnapshotRow>[] = [];
  let created = 0,
    updated = 0,
    campaignsCreated = 0,
    campaignsUpdated = 0;
  try {
    // Campaigns first, so clips in the same request can point at a new one.
    const seen = new Set<string>();
    for (const [i, item] of campaignsIn.entries()) {
      const raw = (item ?? {}) as Record<string, unknown>;
      let existing: ClipCampaign | null =
        (typeof raw.id === "string" && campaigns.get(raw.id)) || null;
      if (!existing && typeof raw.url === "string") {
        try {
          existing = campaignByUrl.get(new URL(raw.url).href) ?? null;
        } catch {
          existing = null;
        }
      }
      let merged: ClipCampaign;
      try {
        merged = mergePipelineCampaign(existing, existing ? { ...raw, id: existing.id } : raw);
      } catch (e) {
        throw new Error(`campaigns[${i}]: ${e instanceof Error ? e.message : "invalid."}`);
      }
      if (seen.has(merged.id)) throw new Error(`campaigns[${i}]: ${merged.id} is listed twice.`);
      seen.add(merged.id);
      if (existing) campaignsUpdated++;
      else campaignsCreated++;
      campaignSnaps.push(campaignSnapshotRow(existing, merged, uid));
      campaigns.set(merged.id, merged);
      campaignWrites.push(planWrite("campaigns", existing, merged, uid));
    }
    for (const [i, item] of clipsIn.entries()) {
      const raw = (item ?? {}) as Record<string, unknown>;
      const existing =
        (typeof raw.id === "string" && clips.get(raw.id)) ||
        (typeof raw.postUrl === "string" && byUrl.get(raw.postUrl)) ||
        null;
      const merged = mergePipelineClip(existing, existing ? { ...raw, id: existing.id } : raw);
      if (merged.campaignId && !campaigns.has(merged.campaignId))
        throw new Error(`clips[${i}]: unknown campaignId ${merged.campaignId}.`);
      if (merged.accountId && !accounts.has(merged.accountId))
        throw new Error(`clips[${i}]: unknown accountId ${merged.accountId}.`);
      if (existing) updated++;
      else created++;
      clipSnaps.push(clipSnapshotRow(existing, merged, uid));
      clipWrites.push(planWrite("clips", existing, merged, uid));
    }
    for (const [i, item] of accountsIn.entries()) {
      const raw = (item ?? {}) as Record<string, unknown>;
      const existing = typeof raw.id === "string" ? accounts.get(raw.id) : undefined;
      if (!existing) throw new Error(`accounts[${i}]: unknown id.`);
      const merged = mergePipelineAccount(existing, raw);
      accountWrites.push(planWrite("accounts", existing, merged, uid));
    }
  } catch (e) {
    throw new AgentError(e instanceof Error ? e.message : "Invalid input.");
  }
  await runWrites(db, uid, "campaigns", campaignWrites);
  await runWrites(db, uid, "clips", clipWrites);
  await runWrites(db, uid, "accounts", accountWrites);
  await Promise.all([
    insertSnapshots(db, "campaign_snapshots", campaignSnaps),
    insertSnapshots(db, "clip_snapshots", clipSnaps),
  ]);
  return {
    ok: true,
    created,
    updated,
    accounts: accountWrites.length,
    campaignsCreated,
    campaignsUpdated,
  };
}

type Write = { id: string; insert: boolean; row: Record<string, unknown> };

function planWrite<K extends ClipEntity>(
  entity: K,
  before: ClipEntityMap[K] | null | undefined,
  after: ClipEntityMap[K],
  uid: string,
): Write {
  const next = toClipRow(entity, after as unknown as Record<string, unknown>);
  if (!before) return { id: after.id, insert: true, row: { ...next, user_id: uid } };
  const prev = toClipRow(entity, before as unknown as Record<string, unknown>);
  const row = Object.fromEntries(
    Object.entries(next).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(prev[k])),
  );
  return { id: after.id, insert: false, row };
}

async function runWrites(
  db: ReturnType<typeof serviceClient>,
  uid: string,
  entity: ClipEntity,
  writes: Write[],
) {
  const table = clipTables[entity];
  const inserts = writes.filter((w) => w.insert).map((w) => w.row);
  const updates = writes.filter((w) => !w.insert && Object.keys(w.row).length);
  const fail = (code?: string) => {
    console.error("Clip Farm pipeline write failed", table, code);
    return new AgentError(`Could not save ${table}.`, 500);
  };
  if (inserts.length) {
    // ignoreDuplicates: a row Evan created a moment ago wins over the pipeline's copy.
    const { error } = await writeWithFallback(inserts, (rows) =>
      db.from(table).upsert(rows, { onConflict: "id", ignoreDuplicates: true }),
    );
    if (error) throw fail(error.code);
  }
  const results = await Promise.all(
    updates.map((w) =>
      writeWithFallback([w.row], (rows) =>
        db.from(table).update(rows[0]).eq("id", w.id).eq("user_id", uid),
      ),
    ),
  );
  const bad = results.find((r) => r.error);
  if (bad) throw fail(bad.error?.code);
}

// ---------- Preview hosting ----------

export const PREVIEW_BUCKET = "clip-previews";
// Supabase's default global upload limit is 50 MB, so stay under it.
export const MAX_PREVIEW_BYTES = 50 * 1024 * 1024;
const PREVIEW_KEEP_DAYS = 7;

/** The portal address the review card plays previews from. */
export function portalOrigin(request: Request) {
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return prod ? `https://${prod.replace(/^https?:\/\//, "")}` : new URL(request.url).origin;
}

export const previewPath = (uid: string, clipId: string) => `${uid}/${clipId}.mp4`;

/**
 * A signed upload URL for one clip's preview. The pipeline PUTs the MP4 to
 * uploadUrl, then sets previewUrl on the clip through POST /api/agent/clips.
 */
export async function clipFarmUpload(input: unknown, origin: string) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AgentError("Send a JSON object.");
  const { clipId, contentType, bytes } = input as Record<string, unknown>;
  if (typeof clipId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(clipId))
    throw new AgentError("clipId is required.");
  if (contentType !== "video/mp4") throw new AgentError("contentType must be video/mp4.");
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0)
    throw new AgentError("bytes must be the file size.");
  if (bytes > MAX_PREVIEW_BYTES)
    throw new AgentError("Previews can be at most 50 MB. Send a smaller proxy cut.", 413);
  const { db, uid, rows } = await load("clips");
  const clips = rows.map((r) => fromClipRow("clips", r));
  if (!clips.some((c) => c.id === clipId)) throw new AgentError("That clip wasn't found.", 404);
  const path = previewPath(uid, clipId);
  const { data, error } = await db.storage
    .from(PREVIEW_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data) {
    console.error("Clip preview upload URL failed", error?.message);
    throw new AgentError("Could not create an upload URL. Check that migration 0012 has run.", 503);
  }
  await cleanupPreviews(db, uid, clips);
  return {
    uploadUrl: data.signedUrl,
    uploadMethod: "PUT",
    uploadHeaders: { "content-type": "video/mp4", "x-upsert": "true" },
    previewUrl: `${origin}/api/clips/preview/${clipId}.mp4`,
  };
}

/** Removes previews of rejected, archived or deleted clips once they're a week old. Best effort. */
async function cleanupPreviews(db: ReturnType<typeof serviceClient>, uid: string, clips: Clip[]) {
  try {
    const keep = new Map(clips.map((c) => [c.id, c.status]));
    const { data } = await db.storage
      .from(PREVIEW_BUCKET)
      .list(uid, { limit: 1000, sortBy: { column: "created_at", order: "asc" } });
    const cutoff = Date.now() - PREVIEW_KEEP_DAYS * 86400000;
    const stale = (data ?? [])
      .filter((f) => {
        const id = f.name.replace(/\.mp4$/, "");
        const status = keep.get(id);
        const done = status === undefined || status === "rejected" || status === "archived";
        const at = Date.parse(f.updated_at ?? f.created_at ?? "");
        return done && Number.isFinite(at) && at < cutoff;
      })
      .map((f) => `${uid}/${f.name}`);
    if (stale.length) await db.storage.from(PREVIEW_BUCKET).remove(stale);
  } catch (e) {
    console.error("Clip preview cleanup failed", e);
  }
}
