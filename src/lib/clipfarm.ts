// Clip Farm: pure types and money math for the clipping dashboard.
// No I/O here, so every number on /clips can be unit tested.
import { TIMEZONE, todayISO } from "./model.ts";

export type Platform = "tiktok" | "instagram" | "youtube" | "facebook" | "x";
export const PLATFORMS: Platform[] = [
  "tiktok",
  "instagram",
  "youtube",
  "facebook",
  "x",
];
export const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YT Shorts",
  facebook: "Facebook",
  x: "X",
};

export type CampaignKind = "cpm" | "pool" | "platform";
export type CampaignStatus =
  | "watching"
  | "applied"
  | "active"
  | "paused"
  | "ended";

export interface ClipCampaign {
  id: string;
  name: string;
  source: string; // Content Rewards, Whop, TikTok Creator Rewards…
  kind: CampaignKind;
  status: CampaignStatus;
  cpm: number | null; // dollars per 1,000 views
  minPayout: number | null; // per clip
  maxPayout: number | null; // per clip
  feePct: number; // platform fee, e.g. 10
  budgetTotal: number | null;
  budgetUsed: number | null;
  budgetCheckedAt: string | null; // ISO timestamp
  activeClippers: number | null;
  poolViewsRequired: number | null;
  platforms: Platform[];
  earnDays: number; // days a clip earns after approval (7 on Content Rewards)
  holdDays: number; // hold before withdrawal (3 on Content Rewards)
  noAi: boolean; // campaign bans AI-generated video or voice
  opensOn: string | null;
  endsOn: string | null;
  url: string | null;
  rules: string | null;
  sortOrder: number;
}

export type AccountStatus = "warming" | "active" | "paused" | "killed";
export interface ClipAccount {
  id: string;
  handle: string;
  platform: Platform;
  theme: string;
  status: AccountStatus;
  followers: number | null;
  views30d: number | null; // platform-reported, for payout eligibility
  views90d: number | null;
  statsAsOf: string | null;
  url: string | null;
  notes: string | null;
  dailyCap: number | null; // posts per day; null = platform default
  sortOrder: number;
}

export type ClipStatus =
  | "review" // cut and checked, waiting for Evan
  | "approved" // Evan said yes, waiting to post
  | "posted" // live on the platform
  | "submitted" // submitted to the campaign
  | "rejected" // Evan said no
  | "archived";
export type CheckVerdict = "pass" | "warn" | "fail";
export type ReviewDecision = "pending" | "accepted" | "denied";

export interface Clip {
  id: string;
  title: string;
  hook: string | null; // on-screen first line
  format: string | null; // e.g. "streamer reaction", "hidden detail"
  campaignId: string | null;
  accountId: string | null;
  status: ClipStatus;
  verdict: CheckVerdict | null; // checker agent's answer
  checkNotes: string | null;
  sourceUrl: string | null; // stream VOD or capture
  sourceAt: string | null; // timestamp in the source, e.g. 01:12:40
  previewUrl: string | null; // https link to the cut file
  durationSec: number | null;
  caption: string | null;
  fingerprint: string | null; // perceptual hash from the pipeline, for duplicate checks
  postUrl: string | null;
  postedAt: string | null;
  submittedAt: string | null;
  review: ReviewDecision; // campaign's review of the submission
  approvedAt: string | null; // when the campaign approved it
  views: number;
  views24h: number | null; // views at 24h, the early signal for projections
  likes: number;
  comments: number;
  shares: number;
  statsAsOf: string | null;
  createdAt: string | null;
  rejectReason: string | null;
  experiment: string | null; // the one variable this clip tests, e.g. "First frame"
  variant: string | null; // its arm, e.g. "Facecam"
}

export interface ClipSnapshot {
  id: string;
  clipId: string;
  capturedAt: string;
  views: number;
}

export interface CampaignSnapshot {
  id: string;
  campaignId: string;
  capturedAt: string;
  budgetUsed: number;
  activeClippers: number | null;
}

export type PayoutStatus = "pending" | "hold" | "withdrawable" | "paid";
export interface ClipPayout {
  id: string;
  source: string;
  campaignId: string | null;
  amount: number;
  status: PayoutStatus;
  availableOn: string | null; // date it becomes withdrawable
  paidOn: string | null;
  note: string | null;
}

export interface ClipFarmData {
  demo: boolean;
  ready: boolean; // false until migration 0011 has been applied
  campaigns: ClipCampaign[];
  accounts: ClipAccount[];
  clips: Clip[];
  payouts: ClipPayout[];
  clipSnapshots: ClipSnapshot[];
  campaignSnapshots: CampaignSnapshot[];
  historyReady: boolean; // false until migration 0012 has been applied
}

export function emptyClipFarm(demo = false, ready = true): ClipFarmData {
  return {
    demo,
    ready,
    campaigns: [],
    accounts: [],
    clips: [],
    payouts: [],
    clipSnapshots: [],
    campaignSnapshots: [],
    historyReady: ready,
  };
}

// ---------- Money ----------

/** What one clip earns on a CPM campaign, after the per-clip min/max and fee. */
export function clipPayout(
  views: number,
  c: Pick<ClipCampaign, "cpm" | "minPayout" | "maxPayout" | "feePct">,
) {
  if (!c.cpm || views <= 0) return 0;
  const gross = (views / 1000) * c.cpm;
  if (c.minPayout != null && gross < c.minPayout) return 0;
  const capped = c.maxPayout != null ? Math.min(gross, c.maxPayout) : gross;
  return round2(capped * (1 - (c.feePct ?? 0) / 100));
}

/** Views a clip needs before it earns anything on a campaign. */
export function viewsToMinimum(c: Pick<ClipCampaign, "cpm" | "minPayout">) {
  if (!c.cpm || !c.minPayout) return 0;
  return Math.ceil((c.minPayout / c.cpm) * 1000);
}

/** Views at which the per-clip cap is reached; past this, a new clip beats more views. */
export function viewsToCap(c: Pick<ClipCampaign, "cpm" | "maxPayout">) {
  if (!c.cpm || !c.maxPayout) return null;
  return Math.ceil((c.maxPayout / c.cpm) * 1000);
}

export function budgetLeft(c: ClipCampaign) {
  if (c.budgetTotal == null) return null;
  return Math.max(0, c.budgetTotal - (c.budgetUsed ?? 0));
}

export function budgetLeftPct(c: ClipCampaign) {
  const left = budgetLeft(c);
  if (left == null || !c.budgetTotal) return null;
  return left / c.budgetTotal;
}

/**
 * Morning ranking: budget left per active clipper, so a big budget with a
 * crowd doesn't outrank a fresh small one. Pools rank by pool size per
 * clipper. Ended or paused campaigns score 0.
 */
export function campaignScore(c: ClipCampaign) {
  if (c.status === "ended" || c.status === "paused") return 0;
  if (c.kind === "platform") return 0;
  const left = budgetLeft(c);
  if (left == null) return 0;
  return round2(left / Math.max(1, c.activeClippers ?? 1));
}

export function rankCampaigns(campaigns: ClipCampaign[]) {
  return campaigns
    .filter((c) => c.kind !== "platform")
    .map((c) => ({ campaign: c, score: campaignScore(c) }))
    .sort((a, b) => b.score - a.score);
}

// ---------- Dates ----------

export function addDaysISO(iso: string, days: number) {
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string) {
  return Math.round(
    (Date.parse(a.slice(0, 10) + "T00:00:00Z") -
      Date.parse(b.slice(0, 10) + "T00:00:00Z")) /
      86400000,
  );
}

/** Calendar date in Chicago for an ISO timestamp. */
export function localDate(ts: string) {
  return todayISO(new Date(ts));
}

/** Where a submitted clip is in the campaign's earn → hold → withdraw cycle. */
export function earnWindow(
  clip: Pick<Clip, "approvedAt" | "review">,
  c: Pick<ClipCampaign, "earnDays" | "holdDays">,
  now = new Date(),
) {
  if (clip.review !== "accepted" || !clip.approvedAt) return null;
  const start = localDate(clip.approvedAt);
  const earnsUntil = addDaysISO(start, c.earnDays);
  const withdrawableOn = addDaysISO(earnsUntil, c.holdDays);
  const today = todayISO(now);
  const phase =
    today < earnsUntil ? "earning" : today < withdrawableOn ? "hold" : "done";
  return {
    earnsUntil,
    withdrawableOn,
    phase,
    daysLeft: Math.max(0, dayDiff(earnsUntil, today)),
  } as const;
}

// ---------- Rollups ----------

export function campaignFor(clip: Clip, campaigns: ClipCampaign[]) {
  return campaigns.find((c) => c.id === clip.campaignId) ?? null;
}

export function estimatedEarnings(
  clip: Clip,
  campaigns: ClipCampaign[],
  k = PROJECTION_K,
) {
  const c = campaignFor(clip, campaigns);
  if (!c || c.kind !== "cpm") return 0;
  if (clip.review === "denied") return 0;
  return clipPayout(Math.max(clip.views, projected7d(clip, k)), c);
}

/** Day-7 view projection from the 24h count. k = 2.5 until there is enough of Evan's own decay data. */
export const PROJECTION_K = 2.5;
export function projected7d(
  clip: Pick<Clip, "views" | "views24h">,
  k = PROJECTION_K,
) {
  return clip.views24h ? Math.round(clip.views24h * k) : clip.views;
}

/** Share of submitted CPM clips that cleared the campaign minimum: the best single predictor of income. */
export function minClearRate(
  clips: Clip[],
  campaigns: ClipCampaign[],
  k = PROJECTION_K,
) {
  const judged = clips.filter((x) => {
    const c = campaignFor(x, campaigns);
    return x.status === "submitted" && c?.kind === "cpm" && c.minPayout;
  });
  if (!judged.length) return null;
  const cleared = judged.filter(
    (x) => Math.max(x.views, projected7d(x, k)) >= viewsToMinimum(campaignFor(x, campaigns)!),
  );
  return cleared.length / judged.length;
}

/** Pool qualification: approved views on the campaign vs the required total. */
export function poolProgress(c: ClipCampaign, clips: Clip[]) {
  const views = clips
    .filter((x) => x.campaignId === c.id && x.review === "accepted")
    .reduce((s, x) => s + x.views, 0);
  const required = c.poolViewsRequired ?? 0;
  return {
    views,
    required,
    pct: required ? Math.min(1, views / required) : 0,
    qualified: required > 0 && views >= required,
  };
}

export const PAYOUT_RULES = {
  tiktok: { followers: 10_000, views: 100_000, windowDays: 30, label: "TikTok Creator Rewards" },
  youtube: { followers: 1_000, views: 10_000_000, windowDays: 90, label: "YouTube Partner Program (Shorts)" },
} as const;

/** Progress toward platform payout eligibility for one account. */
export function payoutEligibility(a: ClipAccount) {
  if (a.platform !== "tiktok" && a.platform !== "youtube") return null;
  const rule = PAYOUT_RULES[a.platform];
  const views = a.platform === "tiktok" ? a.views30d : a.views90d;
  const f = Math.min(1, (a.followers ?? 0) / rule.followers);
  const v = Math.min(1, (views ?? 0) / rule.views);
  return {
    label: rule.label,
    followers: a.followers ?? 0,
    followersNeeded: rule.followers,
    views: views ?? 0,
    viewsNeeded: rule.views,
    windowDays: rule.windowDays,
    pct: Math.min(f, v),
    eligible: f >= 1 && v >= 1,
  };
}

export const KILL_RULE = { minPosts: 10, breakoutViews: 10_000, maxMedian: 500 };

/** Per-account health: posts, best clip, earnings, and whether to kill the theme. */
export function accountHealth(
  a: ClipAccount,
  clips: Clip[],
  campaigns: ClipCampaign[],
  k = PROJECTION_K,
) {
  const live = clips.filter(
    (c) => c.accountId === a.id && (c.status === "posted" || c.status === "submitted"),
  );
  const views = live.reduce((s, c) => s + c.views, 0);
  const best = live.reduce((m, c) => Math.max(m, c.views), 0);
  const earned = live.reduce((s, c) => s + estimatedEarnings(c, campaigns, k), 0);
  const median = medianOf(live.map((c) => c.views));
  // A run of the last 5 clips all under 30% of the account's median reads as a reach drop.
  const recent = [...live]
    .sort((x, y) => (y.postedAt ?? "").localeCompare(x.postedAt ?? ""))
    .slice(0, 5);
  const reachDrop =
    live.length >= 10 &&
    recent.length === 5 &&
    median > 0 &&
    recent.every((c) => c.views < median * 0.3);
  const killCandidate =
    a.status !== "killed" &&
    live.length >= KILL_RULE.minPosts &&
    best < KILL_RULE.breakoutViews &&
    median < KILL_RULE.maxMedian;
  const scale = live.filter((c) => c.views >= 50_000).length >= 2;
  return {
    posts: live.length,
    views,
    best,
    median,
    earned: round2(earned),
    reachDrop,
    killCandidate,
    scale,
  };
}

// ---------- Guards ----------

export interface ClipFlag {
  level: "block" | "warn";
  text: string;
}

/** Problems that should stop or slow an approval. Pure, so the card and the server agree. */
export function clipFlags(
  clip: Clip,
  data: Pick<ClipFarmData, "campaigns" | "accounts" | "clips">,
): ClipFlag[] {
  const flags: ClipFlag[] = [];
  const c = campaignFor(clip, data.campaigns);
  const a = data.accounts.find((x) => x.id === clip.accountId) ?? null;
  if (clip.verdict === "fail")
    flags.push({ level: "block", text: "Checker failed this clip" });
  if (!a) flags.push({ level: "block", text: "No account picked" });
  if (a && a.status === "killed")
    flags.push({ level: "block", text: "Account is killed" });
  if (c && a && c.platforms.length && !c.platforms.includes(a.platform))
    flags.push({
      level: "block",
      text: `${c.name} doesn't pay ${PLATFORM_LABEL[a.platform]}`,
    });
  if (c && c.status === "ended")
    flags.push({ level: "block", text: "Campaign has ended" });
  const left = c ? budgetLeftPct(c) : null;
  if (c && left != null && left <= 0)
    flags.push({ level: "block", text: "Campaign budget is spent" });
  else if (c && left != null && left < 0.2)
    flags.push({ level: "warn", text: `Only ${Math.round(left * 100)}% of budget left` });
  if (clip.fingerprint) {
    const twins = data.clips.filter(
      (o) => o.id !== clip.id && o.fingerprint === clip.fingerprint,
    );
    const live = twins.find((o) =>
      ["approved", "posted", "submitted"].includes(o.status),
    );
    const queued = twins.find((o) => o.status === "review");
    if (live)
      flags.push({ level: "block", text: `Duplicate of “${live.title}”, already approved` });
    else if (queued)
      flags.push({ level: "warn", text: `Same moment as “${queued.title}” in the queue: approve only one` });
  }
  if (
    a?.platform === "tiktok" &&
    c?.kind === "platform" &&
    (clip.durationSec ?? 0) < 60
  )
    flags.push({ level: "warn", text: "Under 60s: TikTok won't pay for it" });
  if (clip.verdict === "warn")
    flags.push({ level: "warn", text: "Checker raised a warning" });
  if (a && clip.status === "review") {
    const used = postsToday(a, data.clips),
      cap = dailyCap(a);
    if (used >= cap)
      flags.push({
        level: "warn",
        text: `${a.handle} is at its daily cap (${used} of ${cap}). Pick another account or it posts tomorrow`,
      });
  }
  return flags;
}

export const REJECT_REASONS = [
  "Weak hook",
  "Breaks a rule",
  "Duplicate",
  "Stale moment",
  "Low payout",
] as const;

export const canApprove = (flags: ClipFlag[]) =>
  !flags.some((f) => f.level === "block");

// ---------- Today ----------

export interface ClipAlert {
  level: "urgent" | "money" | "info";
  text: string;
  clipId?: string;
  campaignId?: string;
  accountId?: string;
}

const SUBMIT_WINDOW_MIN = 30;
const SUBMIT_AMBER_MIN = 20;

/** The short list on top of /clips: what to do now, ordered by money at stake. */
export function clipAlerts(data: ClipFarmData, now = new Date()): ClipAlert[] {
  const out: ClipAlert[] = [];
  const today = todayISO(now);
  for (const clip of data.clips) {
    const c = campaignFor(clip, data.campaigns);
    if (clip.status === "posted" && c && c.kind !== "platform" && clip.postedAt) {
      const mins = (now.getTime() - Date.parse(clip.postedAt)) / 60000;
      out.push({
        level: mins > SUBMIT_AMBER_MIN ? "urgent" : "money",
        text:
          mins > SUBMIT_WINDOW_MIN
            ? `Submit “${clip.title}” to ${c.name} now: posted ${fmtAgo(mins)} ago, past the 30-min window`
            : `Submit “${clip.title}” to ${c.name} in the next ${Math.max(1, Math.round(SUBMIT_WINDOW_MIN - mins))} min`,
        clipId: clip.id,
      });
    }
    if (clip.status === "approved" && clip.createdAt) {
      const hrs = (now.getTime() - Date.parse(clip.createdAt)) / 3.6e6;
      if (hrs > 4)
        out.push({
          level: "urgent",
          text: `“${clip.title}” was approved but hasn't posted in ${Math.round(hrs)} h. It's going stale.`,
          clipId: clip.id,
        });
    }
    if (clip.status === "submitted" && c?.kind === "cpm" && clip.postedAt) {
      const age = dayDiff(today, localDate(clip.postedAt));
      const need = viewsToMinimum(c);
      if (age >= 3 && need && clip.views < need)
        out.push({
          level: "info",
          text: `“${clip.title}” is at ${fmtNum(clip.views)} views on day ${age}, under the ${fmtNum(need)} minimum. Don't repeat its hook.`,
          clipId: clip.id,
        });
    }
  }
  for (const c of data.campaigns) {
    if (c.status !== "active" && c.status !== "applied") continue;
    const left = budgetLeftPct(c);
    if (left != null && left > 0 && left < 0.2)
      out.push({
        level: "urgent",
        text: `${c.name} has ${Math.round(left * 100)}% of its budget left. Post its best clips today, then move on.`,
        campaignId: c.id,
      });
    if (left === 0)
      out.push({
        level: "info",
        text: `${c.name}'s budget is spent. Stop cutting for it.`,
        campaignId: c.id,
      });
    if (c.budgetCheckedAt && (now.getTime() - Date.parse(c.budgetCheckedAt)) / 3.6e6 > 24)
      out.push({
        level: "info",
        text: `${c.name}'s budget was last checked over a day ago.`,
        campaignId: c.id,
      });
    if (c.kind === "pool" && c.poolViewsRequired) {
      const p = poolProgress(c, data.clips);
      const pace = poolPace(c, data, now);
      if (!p.qualified)
        out.push({
          level: pace?.onPace === false ? "urgent" : "money",
          text:
            pace?.onPace === false
              ? `${c.name} is off pace: needs ${fmtNum(pace.needPerDay ?? 0)} approved views a day for ${pace.daysLeft} days, averaging ${fmtNum(pace.avgPerDay)}. Push more clips there or drop it.`
              : `${c.name}: ${fmtNum(p.views)} of ${fmtNum(p.required)} approved views to qualify (${Math.round(p.pct * 100)}%).`,
          campaignId: c.id,
        });
    }
    const run = campaignRunway(c, data.campaignSnapshots, now);
    if (left != null && left > 0 && run.runwayDays != null && run.runwayDays < 1.5)
      out.push({
        level: "urgent",
        text: `${c.name} runs dry in about ${run.runwayDays < 1 ? `${Math.max(1, Math.round(run.runwayDays * 24))} h` : `${run.runwayDays} days`} at ${fmtUSD(run.burnPerDay ?? 0)}/day. Post for it now or not at all.`,
        campaignId: c.id,
      });
    const owed = queuedPayouts(c, data, now);
    const budget = budgetLeft(c);
    if (budget != null && budget > 0 && owed > budget)
      out.push({
        level: "info",
        text: `Clips still earning on ${c.name} project ${fmtUSD(owed)}, more than its ${fmtUSD(budget)} left. Some won't be paid: cut for another campaign.`,
        campaignId: c.id,
      });
  }
  for (const c of data.campaigns)
    if (c.status === "watching" && c.opensOn && c.opensOn <= addDaysISO(today, 1))
      out.push({
        level: "money",
        text: `${c.name} opens ${c.opensOn === today ? "today" : c.opensOn < today ? "now" : "tomorrow"}. Apply first thing.`,
        campaignId: c.id,
      });
  for (const a of data.accounts) {
    const h = accountHealth(a, data.clips, data.campaigns, projectionK(data, now));
    if (h.killCandidate)
      out.push({
        level: "info",
        text: `${a.handle}: ${h.posts} posts, none over ${fmtNum(KILL_RULE.breakoutViews)} and a median of ${fmtNum(h.median)}. Kill or re-theme it.`,
        accountId: a.id,
      });
    if (h.scale && a.status === "active")
      out.push({
        level: "money",
        text: `${a.handle} has 2+ clips over 50K. Add one more post a day there.`,
        accountId: a.id,
      });
    if (h.reachDrop)
      out.push({
        level: "urgent",
        text: `${a.handle}: last 5 clips are under 30% of its usual views. Possible reach limit: pause 48 h and check for notices. Don't mass-delete.`,
        accountId: a.id,
      });
  }
  for (const a of data.accounts) {
    if (a.status === "killed" || a.status === "paused") continue;
    const used = postsToday(a, data.clips, now),
      cap = dailyCap(a);
    if (used > cap)
      out.push({
        level: "info",
        text: `${a.handle} has ${used} posts today or approved, over its cap of ${cap}. Hold the extras for tomorrow.`,
        accountId: a.id,
      });
  }
  const withdrawable = data.payouts
    .filter((p) => p.status === "withdrawable")
    .reduce((t, p) => t + p.amount, 0);
  if (withdrawable >= 50)
    out.push({ level: "money", text: `${fmtUSD(withdrawable)} is withdrawable. Cash it out.` });
  const order = { urgent: 0, money: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** Money picture: estimated, in hold, withdrawable, paid. */
export function moneySummary(data: ClipFarmData, now = new Date()) {
  const k = projectionK(data, now);
  let earning = 0,
    hold = 0,
    estimated = 0;
  for (const clip of data.clips) {
    const c = campaignFor(clip, data.campaigns);
    if (!c || c.kind !== "cpm") continue;
    const amount = estimatedEarnings(clip, data.campaigns, k);
    estimated += amount;
    const w = earnWindow(clip, c, now);
    if (w?.phase === "earning") earning += amount;
    else if (w?.phase === "hold") hold += amount;
  }
  const sum = (s: PayoutStatus) =>
    round2(data.payouts.filter((p) => p.status === s).reduce((t, p) => t + p.amount, 0));
  return {
    estimated: round2(estimated),
    earning: round2(earning),
    hold: round2(hold),
    withdrawable: sum("withdrawable"),
    paid: sum("paid"),
    pending: sum("pending") + sum("hold"),
  };
}

export function clipCounts(clips: Clip[]) {
  const n = (s: ClipStatus) => clips.filter((c) => c.status === s).length;
  return {
    review: n("review"),
    approved: n("approved"),
    posted: n("posted"),
    submitted: n("submitted"),
  };
}

/** Which hooks/formats are winning: median views per format, posted clips only. */
export function formatLeaderboard(clips: Clip[]) {
  const groups = new Map<string, number[]>();
  for (const c of clips) {
    if (c.status !== "posted" && c.status !== "submitted") continue;
    const key = c.format?.trim() || "Untagged";
    groups.set(key, [...(groups.get(key) ?? []), c.views]);
  }
  return [...groups.entries()]
    .map(([format, views]) => ({
      format,
      clips: views.length,
      median: medianOf(views),
      best: Math.max(...views),
    }))
    .sort((a, b) => b.median - a.median);
}

// ---------- History: refit, runway, pace ----------

const HOUR = 3.6e6;
const DAY = 24 * HOUR;
const isLive = (c: Clip) => c.status === "posted" || c.status === "submitted";

function snapshotsFor(clipId: string, snaps: ClipSnapshot[]) {
  return snaps
    .filter((s) => s.clipId === clipId)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

/** Views closest to `hours` after posting, from snapshots (within ±25%). */
export function viewsAt(clip: Clip, snaps: ClipSnapshot[], hours: number) {
  if (!clip.postedAt) return null;
  const target = Date.parse(clip.postedAt) + hours * HOUR;
  let best: ClipSnapshot | null = null;
  for (const s of snapshotsFor(clip.id, snaps)) {
    const d = Math.abs(Date.parse(s.capturedAt) - target);
    if (d <= hours * HOUR * 0.25 && (!best || d < Math.abs(Date.parse(best.capturedAt) - target)))
      best = s;
  }
  return best?.views ?? null;
}

export const REFIT_MIN_CLIPS = 30;

/**
 * Day-7 projection multiplier. Starts at 2.5 and switches to the median of
 * Evan's own day-7 ÷ 24h ratio once 30 clips have both numbers.
 */
export function fitProjectionK(
  data: Pick<ClipFarmData, "clips" | "clipSnapshots">,
  now = new Date(),
) {
  const ratios: number[] = [];
  for (const c of data.clips) {
    if (!c.postedAt || now.getTime() - Date.parse(c.postedAt) < 7 * DAY) continue;
    const v24 = c.views24h ?? viewsAt(c, data.clipSnapshots, 24);
    const v7 = viewsAt(c, data.clipSnapshots, 168);
    if (v24 && v24 > 0 && v7 != null && v7 >= v24) ratios.push(v7 / v24);
  }
  if (ratios.length < REFIT_MIN_CLIPS)
    return { k: PROJECTION_K, n: ratios.length, fitted: false };
  return { k: round2(medianOf(ratios)), n: ratios.length, fitted: true };
}

const kCache = new WeakMap<Clip[], { snaps: ClipSnapshot[]; day: string; k: number }>();

/** The fitted day-7 multiplier for this data, cached so every view uses the same one cheaply. */
export function projectionK(
  data: Pick<ClipFarmData, "clips" | "clipSnapshots">,
  now = new Date(),
) {
  const day = now.toISOString().slice(0, 13);
  const hit = kCache.get(data.clips);
  if (hit && hit.snaps === data.clipSnapshots && hit.day === day) return hit.k;
  const k: number = fitProjectionK(data, now).k;
  kCache.set(data.clips, { snaps: data.clipSnapshots, day, k });
  return k;
}

/** Budget burn per day from the last ~24–48 h of budget checks, and days left. */
export function campaignRunway(
  c: ClipCampaign,
  snaps: CampaignSnapshot[],
  now = new Date(),
) {
  const left = budgetLeft(c);
  const mine = snaps
    .filter((s) => s.campaignId === c.id && now.getTime() - Date.parse(s.capturedAt) <= 2 * DAY)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  if (left == null || mine.length < 2) return { burnPerDay: null, runwayDays: null };
  const first = mine[0],
    last = mine[mine.length - 1];
  const days = (Date.parse(last.capturedAt) - Date.parse(first.capturedAt)) / DAY;
  if (days < 0.25) return { burnPerDay: null, runwayDays: null };
  const burn = Math.max(0, (last.budgetUsed - first.budgetUsed) / days);
  return {
    burnPerDay: round2(burn),
    runwayDays: burn > 0 ? Math.round((left / burn) * 10) / 10 : null,
  };
}

/** Pool pace: views/day still needed by the end date vs the last 3 days' average. */
export function poolPace(
  c: ClipCampaign,
  data: Pick<ClipFarmData, "clips" | "clipSnapshots">,
  now = new Date(),
) {
  const p = poolProgress(c, data.clips);
  if (c.kind !== "pool" || !c.poolViewsRequired || p.qualified) return null;
  const daysLeft = c.endsOn ? Math.max(0, dayDiff(c.endsOn, todayISO(now))) : null;
  const needPerDay = daysLeft ? Math.ceil((p.required - p.views) / daysLeft) : null;
  const since = now.getTime() - 3 * DAY;
  let gained = 0;
  for (const clip of data.clips) {
    if (clip.campaignId !== c.id || clip.review !== "accepted") continue;
    const snaps = snapshotsFor(clip.id, data.clipSnapshots);
    const before = [...snaps].reverse().find((s) => Date.parse(s.capturedAt) <= since);
    const postedInWindow = clip.postedAt && Date.parse(clip.postedAt) > since;
    gained += Math.max(0, clip.views - (before?.views ?? (postedInWindow ? 0 : clip.views)));
  }
  const avgPerDay = Math.round(gained / 3);
  return {
    daysLeft,
    needPerDay,
    avgPerDay,
    onPace: needPerDay == null ? null : avgPerDay >= needPerDay,
  };
}

/** Projected payouts of clips still inside a campaign's earn window. */
export function queuedPayouts(c: ClipCampaign, data: ClipFarmData, now = new Date()) {
  if (c.kind !== "cpm") return 0;
  const k = projectionK(data, now);
  let total = 0;
  for (const clip of data.clips) {
    if (clip.campaignId !== c.id) continue;
    if (earnWindow(clip, c, now)?.phase === "earning")
      total += estimatedEarnings(clip, data.campaigns, k);
  }
  return round2(total);
}

/**
 * Money expected to become withdrawable in the next 7 days, plus what already
 * is. Where Evan has recorded a pending or held payout for a campaign, that
 * recorded amount stands in for the clip estimates it covers (the larger of
 * the two counts), so nothing is counted twice.
 */
export function cashNext7(data: ClipFarmData, now = new Date()) {
  const k = projectionK(data, now);
  const horizon = addDaysISO(todayISO(now), 7);
  const estimated = new Map<string, number>();
  for (const clip of data.clips) {
    const c = campaignFor(clip, data.campaigns);
    if (!c || c.kind !== "cpm") continue;
    const w = earnWindow(clip, c, now);
    if (w && w.phase !== "done" && w.withdrawableOn <= horizon)
      estimated.set(c.id, (estimated.get(c.id) ?? 0) + estimatedEarnings(clip, data.campaigns, k));
  }
  const recorded = new Map<string, number>();
  let total = 0;
  for (const p of data.payouts) {
    if (p.status === "withdrawable") total += p.amount;
    else if (
      (p.status === "pending" || p.status === "hold") &&
      p.availableOn != null &&
      p.availableOn <= horizon
    ) {
      if (p.campaignId) recorded.set(p.campaignId, (recorded.get(p.campaignId) ?? 0) + p.amount);
      else total += p.amount;
    }
  }
  for (const id of new Set([...estimated.keys(), ...recorded.keys()]))
    total += Math.max(estimated.get(id) ?? 0, recorded.get(id) ?? 0);
  return round2(total);
}

// ---------- Speed ----------

export const SUBMIT_LATE_MIN = 30;

/** Was this clip submitted late (or is it posted and still unsubmitted past the window)? */
export function isLate(clip: Clip, campaigns: ClipCampaign[], now = new Date()) {
  const c = campaignFor(clip, campaigns);
  if (!c || c.kind === "platform" || !clip.postedAt) return false;
  const end = clip.submittedAt ? Date.parse(clip.submittedAt) : clip.status === "posted" ? now.getTime() : null;
  return end != null && (end - Date.parse(clip.postedAt)) / 60000 > SUBMIT_LATE_MIN;
}

/** Launch-week speed: minutes from cut to post, and from post to submission (last 7 days). */
export function speedStats(data: ClipFarmData, now = new Date()) {
  const recent = data.clips.filter(
    (c) => c.postedAt && now.getTime() - Date.parse(c.postedAt) <= 7 * DAY,
  );
  const mins = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60000;
  const cutToPost = recent
    .filter((c) => c.createdAt && Date.parse(c.createdAt) <= Date.parse(c.postedAt!))
    .map((c) => mins(c.createdAt!, c.postedAt!));
  const submitLag = recent
    .filter((c) => c.submittedAt)
    .map((c) => mins(c.postedAt!, c.submittedAt!));
  const late = recent.filter((c) => isLate(c, data.campaigns, now));
  return {
    cutToPostMin: cutToPost.length ? Math.round(medianOf(cutToPost)) : null,
    submitLagMin: submitLag.length ? Math.round(medianOf(submitLag)) : null,
    lateCount: late.length,
    lateIds: late.map((c) => c.id),
  };
}

// ---------- Cadence ----------

export const DEFAULT_DAILY_CAP: Record<Platform, number> = {
  tiktok: 4,
  instagram: 3,
  youtube: 3,
  facebook: 3,
  x: 6,
};

export function dailyCap(a: ClipAccount) {
  return a.dailyCap ?? DEFAULT_DAILY_CAP[a.platform];
}

/** Posts today (Chicago) plus approved clips still waiting to post on this account. */
export function postsToday(a: ClipAccount, clips: Clip[], now = new Date()) {
  const today = todayISO(now);
  return clips.filter(
    (c) =>
      c.accountId === a.id &&
      (c.status === "approved" || (isLive(c) && c.postedAt && localDate(c.postedAt) === today)),
  ).length;
}

// ---------- Experiments ----------

/** A clip's 24h views over its account's median 24h views: removes account-size noise. */
export function clipLift(clip: Clip, data: Pick<ClipFarmData, "clips" | "clipSnapshots">) {
  const v = clip.views24h ?? viewsAt(clip, data.clipSnapshots, 24);
  if (v == null || !clip.accountId) return null;
  const peers = data.clips
    .filter((c) => c.accountId === clip.accountId && isLive(c))
    .map((c) => c.views24h ?? viewsAt(c, data.clipSnapshots, 24))
    .filter((x): x is number => x != null);
  const median = medianOf(peers);
  return median > 0 ? v / median : null;
}

export const EXPERIMENT_RULE = { minPerArm: 10, minLift: 1.3, maxDays: 14 };

/** Each experiment's arms with median lift, and a call once the rule is met. */
export function experimentResults(
  data: Pick<ClipFarmData, "clips" | "clipSnapshots">,
  now = new Date(),
) {
  const byExp = new Map<string, Clip[]>();
  for (const c of data.clips) {
    if (!c.experiment?.trim() || !c.variant?.trim() || !isLive(c)) continue;
    const key = c.experiment.trim();
    byExp.set(key, [...(byExp.get(key) ?? []), c]);
  }
  return [...byExp.entries()].map(([experiment, clips]) => {
    // Every variant that has a live clip counts as an arm, measured or not,
    // so an arm still short of data can't be skipped when calling a winner.
    const arms = new Map<string, number[]>();
    for (const c of clips) {
      const v = c.variant!.trim();
      if (!arms.has(v)) arms.set(v, []);
      const lift = clipLift(c, data);
      if (lift != null) arms.get(v)!.push(lift);
    }
    const rows = [...arms.entries()]
      .map(([variant, lifts]) => ({ variant, clips: lifts.length, medianLift: round2(medianOf(lifts)) }))
      .sort((a, b) => b.medianLift - a.medianLift);
    const started = clips.reduce(
      (m, c) => Math.min(m, Date.parse(c.postedAt ?? c.createdAt ?? now.toISOString())),
      now.getTime(),
    );
    const ageDays = Math.floor((now.getTime() - started) / DAY);
    const enough = rows.length >= 2 && rows.every((r) => r.clips >= EXPERIMENT_RULE.minPerArm);
    let verdict: "running" | "winner" | "tie" = "running";
    if (enough && rows[1].medianLift > 0 && rows[0].medianLift / rows[1].medianLift >= EXPERIMENT_RULE.minLift)
      verdict = "winner";
    else if (ageDays >= EXPERIMENT_RULE.maxDays) verdict = "tie";
    return { experiment, arms: rows, ageDays, verdict, winner: verdict === "winner" ? rows[0].variant : null };
  });
}

// ---------- Formatting ----------

export function fmtNum(n: number) {
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${trim(n / 1000)}K`;
  return String(Math.round(n));
}
function trim(n: number) {
  return n.toFixed(1).replace(/\.0$/, "");
}
function fmtAgo(mins: number) {
  if (mins < 90) return `${Math.round(mins)} min`;
  return `${Math.round(mins / 60)} h`;
}
export function fmtUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 100 ? 0 : 2,
  }).format(n);
}
function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function medianOf(list: number[]) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export { TIMEZONE };
