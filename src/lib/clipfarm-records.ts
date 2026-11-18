// Clip Farm records: allowed fields, validation and row mapping. Shared by
// the signed-in server actions, the pipeline API and the demo, so all three
// accept exactly the same shapes.
import {
  PLATFORMS,
  type Clip,
  type ClipAccount,
  type ClipCampaign,
  type ClipPayout,
} from "./clipfarm.ts";

export interface ClipEntityMap {
  campaigns: ClipCampaign;
  accounts: ClipAccount;
  clips: Clip;
  payouts: ClipPayout;
}
export type ClipEntity = keyof ClipEntityMap;

export const clipTables: Record<ClipEntity, string> = {
  campaigns: "clip_campaigns",
  accounts: "clip_accounts",
  clips: "clips",
  payouts: "clip_payouts",
};

type Kind =
  | "text"
  | "longtext"
  | "url"
  | "num"
  | "int"
  | "bool"
  | "date"
  | "ts"
  | "platforms"
  | { oneOf: readonly string[] };

const CAMPAIGN_STATUS = ["watching", "applied", "active", "paused", "ended"] as const;
const ACCOUNT_STATUS = ["warming", "active", "paused", "killed"] as const;
const CLIP_STATUS = ["review", "approved", "posted", "submitted", "rejected", "archived"] as const;
const PAYOUT_STATUS = ["pending", "hold", "withdrawable", "paid"] as const;

export const clipSchema: Record<ClipEntity, Record<string, Kind>> = {
  campaigns: {
    id: "text",
    name: "text",
    source: "text",
    kind: { oneOf: ["cpm", "pool", "platform"] },
    status: { oneOf: CAMPAIGN_STATUS },
    cpm: "num",
    minPayout: "num",
    maxPayout: "num",
    feePct: "num",
    budgetTotal: "num",
    budgetUsed: "num",
    budgetCheckedAt: "ts",
    activeClippers: "int",
    poolViewsRequired: "int",
    platforms: "platforms",
    earnDays: "int",
    holdDays: "int",
    noAi: "bool",
    opensOn: "date",
    endsOn: "date",
    url: "url",
    rules: "longtext",
    sortOrder: "int",
  },
  accounts: {
    id: "text",
    handle: "text",
    platform: { oneOf: PLATFORMS },
    theme: "text",
    status: { oneOf: ACCOUNT_STATUS },
    followers: "int",
    views30d: "int",
    views90d: "int",
    statsAsOf: "ts",
    url: "url",
    notes: "longtext",
    dailyCap: "int",
    sortOrder: "int",
  },
  clips: {
    id: "text",
    title: "text",
    hook: "text",
    format: "text",
    campaignId: "text",
    accountId: "text",
    status: { oneOf: CLIP_STATUS },
    verdict: { oneOf: ["pass", "warn", "fail"] },
    checkNotes: "longtext",
    sourceUrl: "url",
    sourceAt: "text",
    previewUrl: "url",
    durationSec: "int",
    caption: "longtext",
    fingerprint: "text",
    postUrl: "url",
    postedAt: "ts",
    submittedAt: "ts",
    review: { oneOf: ["pending", "accepted", "denied"] },
    approvedAt: "ts",
    views: "int",
    views24h: "int",
    likes: "int",
    comments: "int",
    shares: "int",
    statsAsOf: "ts",
    createdAt: "ts",
    rejectReason: "text",
    experiment: "text",
    variant: "text",
  },
  payouts: {
    id: "text",
    source: "text",
    campaignId: "text",
    amount: "num",
    status: { oneOf: PAYOUT_STATUS },
    availableOn: "date",
    paidOn: "date",
    note: "longtext",
  },
};

/** Columns that only exist after migration 0012. Saves retry without them before it runs. */
export const V11_COLUMNS = ["experiment", "variant", "daily_cap"] as const;

export function withoutV11Columns(row: Record<string, unknown>) {
  const out = { ...row };
  for (const c of V11_COLUMNS) delete out[c];
  return out;
}

/** Postgres/PostgREST codes for "that column doesn't exist". */
export const isMissingColumn = (code?: string) => code === "42703" || code === "PGRST204";

const required: Record<ClipEntity, string[]> = {
  campaigns: ["id", "name"],
  accounts: ["id", "handle", "platform"],
  clips: ["id", "title"],
  payouts: ["id", "amount"],
};

const defaults: Record<ClipEntity, Record<string, unknown>> = {
  campaigns: {
    source: "Content Rewards",
    kind: "cpm",
    status: "watching",
    feePct: 10,
    platforms: [],
    earnDays: 7,
    holdDays: 3,
    noAi: false,
    sortOrder: 0,
  },
  accounts: { theme: "", status: "warming", sortOrder: 0 },
  clips: {
    status: "review",
    review: "pending",
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
  },
  payouts: { source: "Content Rewards", status: "pending" },
};

const LIMITS = { text: 200, longtext: 4000 };

function coerce(key: string, kind: Kind, v: unknown): unknown {
  if (v === undefined || v === null || v === "") return null;
  if (typeof kind === "object") {
    const s = String(v);
    if (!kind.oneOf.includes(s))
      throw new Error(`${key} must be one of: ${kind.oneOf.join(", ")}.`);
    return s;
  }
  switch (kind) {
    case "text":
    case "longtext": {
      if (typeof v !== "string" && typeof v !== "number")
        throw new Error(`${key} must be text.`);
      return String(v).trim().slice(0, LIMITS[kind]) || null;
    }
    case "url": {
      const s = String(v).trim();
      try {
        const u = new URL(s);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw 0;
        return u.href;
      } catch {
        throw new Error(`${key} must be a web address.`);
      }
    }
    case "num":
    case "int": {
      const n = typeof v === "number" ? v : Number(String(v).replace(/[$,\s]/g, ""));
      if (!Number.isFinite(n) || n < 0) throw new Error(`${key} must be a number of 0 or more.`);
      return kind === "int" ? Math.round(n) : n;
    }
    case "bool":
      return v === true || v === "true" || v === "on" || v === "1";
    case "date": {
      const s = String(v).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)))
        throw new Error(`${key} must be a date.`);
      return s;
    }
    case "ts": {
      const t = Date.parse(String(v));
      if (Number.isNaN(t)) throw new Error(`${key} must be a date and time.`);
      return new Date(t).toISOString();
    }
    case "platforms": {
      const list = Array.isArray(v) ? v : String(v).split(/[\s,]+/);
      const out = [...new Set(list.map((p) => String(p).trim().toLowerCase()).filter(Boolean))];
      for (const p of out)
        if (!(PLATFORMS as string[]).includes(p))
          throw new Error(`${p} isn't a supported platform.`);
      return out;
    }
  }
}

/** Keeps only known fields, coerces types, fills defaults, and checks required fields. */
export function validateClipRecord<K extends ClipEntity>(
  entity: K,
  input: unknown,
  { partial = false } = {},
): ClipEntityMap[K] {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Send a record object.");
  const raw = input as Record<string, unknown>;
  const out: Record<string, unknown> = partial ? {} : { ...defaults[entity] };
  for (const [key, kind] of Object.entries(clipSchema[entity])) {
    if (!(key in raw)) continue;
    const value = coerce(key, kind, raw[key]);
    if (value === null && key in defaults[entity] && !partial) continue;
    out[key] = value;
  }
  for (const key of required[entity])
    if (!partial || key === "id")
      if (out[key] == null || out[key] === "")
        throw new Error(`${key} is required.`);
  if (typeof out.id === "string" && !/^[A-Za-z0-9_-]{1,80}$/.test(out.id))
    throw new Error("id may use letters, numbers, - and _ only.");
  if (entity === "campaigns") {
    const min = out.minPayout as number | null | undefined,
      max = out.maxPayout as number | null | undefined;
    if (min != null && max != null && min > max)
      throw new Error("The per-clip minimum can't be above the cap.");
    if ((out.feePct as number | undefined) != null && (out.feePct as number) > 100)
      throw new Error("Fee must be a percent from 0 to 100.");
  }
  return out as unknown as ClipEntityMap[K];
}

const snake = (s: string) => s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());

export function toClipRow(entity: ClipEntity, record: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const key of Object.keys(clipSchema[entity]))
    if (key in record) row[snake(key)] = record[key];
  return row;
}

export function fromClipRow<K extends ClipEntity>(
  entity: K,
  row: Record<string, unknown>,
): ClipEntityMap[K] {
  const out: Record<string, unknown> = {};
  for (const [key, kind] of Object.entries(clipSchema[entity])) {
    let v = row[snake(key)];
    if (v === undefined) v = null;
    if ((kind === "num" || kind === "int") && v != null) v = Number(v);
    if (kind === "platforms") v = Array.isArray(v) ? v : [];
    out[key] = v;
  }
  for (const [k, v] of Object.entries(defaults[entity]))
    if (out[k] == null) out[k] = v;
  return out as unknown as ClipEntityMap[K];
}

// ---------- What the pipeline may change ----------

const CLIP_STATS = ["views", "views24h", "likes", "comments", "shares"] as const;
const PIPELINE_LOCKED = ["status", "review", "approvedAt", "rejectReason", "submittedAt"] as const;

/**
 * Merges a pipeline write into a clip. New clips always start in review.
 * The pipeline can never approve, reject or submit; it may only mark an
 * approved clip as posted (with its URL) and keep stats current.
 */
export function mergePipelineClip(existing: Clip | null, input: unknown): Clip {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Each clip must be an object.");
  const raw = { ...(input as Record<string, unknown>) };
  const wantsPosted = raw.status === "posted";
  for (const k of PIPELINE_LOCKED) delete raw[k];
  if (!existing) {
    const created = validateClipRecord("clips", {
      createdAt: new Date().toISOString(),
      ...raw,
      status: "review",
      review: "pending",
    });
    return created;
  }
  const patch = validateClipRecord("clips", { ...raw, id: existing.id }, { partial: true });
  const next: Clip = { ...existing, ...patch };
  // Stats without a time were read just now.
  if (CLIP_STATS.some((k) => k in raw) && !raw.statsAsOf) next.statsAsOf = new Date().toISOString();
  if (wantsPosted) {
    if (existing.status !== "approved" && existing.status !== "posted")
      throw new Error(`${existing.id} isn't approved, so it can't be marked posted.`);
    if (!next.postUrl) throw new Error(`${existing.id}: postUrl is required to mark it posted.`);
    next.status = "posted";
    next.postedAt = next.postedAt ?? new Date().toISOString();
  }
  return next;
}

const ACCOUNT_STATS = ["followers", "views30d", "views90d", "statsAsOf"] as const;

/** The pipeline may refresh an account's numbers, nothing else. */
export function mergePipelineAccount(existing: ClipAccount, input: unknown): ClipAccount {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Each account update must be an object.");
  const raw = input as Record<string, unknown>;
  const picked: Record<string, unknown> = { id: existing.id };
  for (const k of ACCOUNT_STATS) if (k in raw) picked[k] = raw[k];
  const patch = validateClipRecord("accounts", picked, { partial: true });
  return { ...existing, ...patch, statsAsOf: patch.statsAsOf ?? new Date().toISOString() };
}

const CAMPAIGN_SCOUT_FIELDS = [
  "budgetUsed",
  "budgetTotal",
  "activeClippers",
  "budgetCheckedAt",
  "endsOn",
  "platforms",
  "rules",
] as const;

/**
 * Merges a campaign the morning scout read from a listing. New campaigns
 * always start as "watching"; Evan moves them to applied or active himself.
 * On an existing campaign the scout may refresh only budget, clippers, end
 * date, platforms and rules.
 */
export function mergePipelineCampaign(
  existing: ClipCampaign | null,
  input: unknown,
): ClipCampaign {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Each campaign must be an object.");
  const raw = { ...(input as Record<string, unknown>) };
  const touchesBudget = "budgetUsed" in raw || "activeClippers" in raw || "budgetTotal" in raw;
  if (!existing) {
    delete raw.sortOrder;
    const created = validateClipRecord("campaigns", { ...raw, status: "watching" });
    if (touchesBudget && !created.budgetCheckedAt) created.budgetCheckedAt = new Date().toISOString();
    return created;
  }
  const picked: Record<string, unknown> = { id: existing.id };
  for (const k of CAMPAIGN_SCOUT_FIELDS) if (k in raw) picked[k] = raw[k];
  const patch = validateClipRecord("campaigns", picked, { partial: true });
  // A field sent as null clears it, except platforms which stays a list.
  if (patch.platforms == null) delete (patch as Partial<ClipCampaign>).platforms;
  const next: ClipCampaign = { ...existing, ...patch };
  if (touchesBudget && !("budgetCheckedAt" in raw)) next.budgetCheckedAt = new Date().toISOString();
  const min = next.minPayout, max = next.maxPayout;
  if (min != null && max != null && min > max)
    throw new Error("The per-clip minimum can't be above the cap.");
  return next;
}
