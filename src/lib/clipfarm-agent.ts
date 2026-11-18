import "server-only";
import { AgentError, ownerId, serviceClient } from "./agent";
import { formatLeaderboard, rankCampaigns } from "./clipfarm";
import {
  clipTables,
  fromClipRow,
  mergePipelineAccount,
  mergePipelineClip,
  toClipRow,
  type ClipEntity,
} from "./clipfarm-records";

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
  const live = clips.filter((x) => x.status !== "rejected" && x.status !== "archived");
  return {
    generatedAt: new Date().toISOString(),
    guide: "docs/clip-farm.md in github.com/evanshattenkirk/personal-portal",
    // Feed these, best first. Never cut for a campaign that's ended or spent.
    campaigns: rankCampaigns(campaigns)
      .filter((r) => r.campaign.status === "active" || r.campaign.status === "applied")
      .map((r) => ({ ...r.campaign, score: r.score })),
    accounts: accounts.filter((x) => x.status !== "killed"),
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
  const campaignIds = new Set(c.rows.map((r) => r.id as string));
  const clipWrites: Record<string, unknown>[] = [];
  const accountWrites: Record<string, unknown>[] = [];
  let created = 0,
    updated = 0;
  try {
    for (const [i, item] of clipsIn.entries()) {
      const raw = (item ?? {}) as Record<string, unknown>;
      const existing =
        (typeof raw.id === "string" && clips.get(raw.id)) ||
        (typeof raw.postUrl === "string" && byUrl.get(raw.postUrl)) ||
        null;
      const merged = mergePipelineClip(existing, existing ? { ...raw, id: existing.id } : raw);
      if (merged.campaignId && !campaignIds.has(merged.campaignId))
        throw new Error(`clips[${i}]: unknown campaignId ${merged.campaignId}.`);
      if (merged.accountId && !accounts.has(merged.accountId))
        throw new Error(`clips[${i}]: unknown accountId ${merged.accountId}.`);
      if (existing) updated++;
      else created++;
      clipWrites.push({ ...toClipRow("clips", merged as unknown as Record<string, unknown>), user_id: uid });
    }
    for (const [i, item] of accountsIn.entries()) {
      const raw = (item ?? {}) as Record<string, unknown>;
      const existing = typeof raw.id === "string" ? accounts.get(raw.id) : undefined;
      if (!existing) throw new Error(`accounts[${i}]: unknown id.`);
      const merged = mergePipelineAccount(existing, raw);
      accountWrites.push({ ...toClipRow("accounts", merged as unknown as Record<string, unknown>), user_id: uid });
    }
  } catch (e) {
    throw new AgentError(e instanceof Error ? e.message : "Invalid input.");
  }
  if (clipWrites.length) {
    const { error } = await db.from("clips").upsert(clipWrites);
    if (error) throw new AgentError("Could not save clips.", 500);
  }
  if (accountWrites.length) {
    const { error } = await db.from("clip_accounts").upsert(accountWrites);
    if (error) throw new AgentError("Could not save accounts.", 500);
  }
  return { ok: true, created, updated, accounts: accountWrites.length };
}
