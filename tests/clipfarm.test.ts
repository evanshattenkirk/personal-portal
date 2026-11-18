import test from "node:test";
import assert from "node:assert/strict";
import {
  accountHealth,
  campaignScore,
  canApprove,
  clipAlerts,
  clipFlags,
  clipPayout,
  earnWindow,
  minClearRate,
  moneySummary,
  payoutEligibility,
  poolProgress,
  rankCampaigns,
  viewsToCap,
  viewsToMinimum,
  type Clip,
  type ClipAccount,
  type ClipCampaign,
} from "../src/lib/clipfarm.ts";
import {
  mergePipelineAccount,
  mergePipelineClip,
  validateClipRecord,
} from "../src/lib/clipfarm-records.ts";
import { clipFarmDemo } from "../src/lib/clipfarm-demo.ts";

const tomo = {
  id: "tomo",
  name: "Tomo",
  source: "Content Rewards",
  kind: "cpm",
  status: "active",
  cpm: 2,
  minPayout: 4,
  maxPayout: 150,
  feePct: 10,
  budgetTotal: 1000,
  budgetUsed: 200,
  budgetCheckedAt: null,
  activeClippers: 10,
  poolViewsRequired: null,
  platforms: ["tiktok", "instagram", "youtube"],
  earnDays: 7,
  holdDays: 3,
  noAi: false,
  opensOn: null,
  endsOn: null,
  url: null,
  rules: null,
  sortOrder: 0,
} as ClipCampaign;

const account = {
  id: "a1",
  handle: "@me",
  platform: "tiktok",
  theme: "Moments",
  status: "active",
  followers: 0,
  views30d: 0,
  views90d: null,
  statsAsOf: null,
  url: null,
  notes: null,
  sortOrder: 0,
} as ClipAccount;

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: "c1",
  title: "Clip",
  hook: null,
  format: null,
  campaignId: "tomo",
  accountId: "a1",
  status: "review",
  verdict: "pass",
  checkNotes: null,
  sourceUrl: null,
  sourceAt: null,
  previewUrl: null,
  durationSec: 30,
  caption: null,
  fingerprint: null,
  postUrl: null,
  postedAt: null,
  submittedAt: null,
  review: "pending",
  approvedAt: null,
  views: 0,
  views24h: null,
  likes: 0,
  comments: 0,
  shares: 0,
  statsAsOf: null,
  createdAt: null,
  rejectReason: null,
  ...over,
});

test("per-clip payout honors the minimum, the cap and the fee", () => {
  assert.equal(clipPayout(1999, tomo), 0); // $3.998 gross is under the $4 minimum
  assert.equal(clipPayout(2000, tomo), 3.6); // $4 gross less 10%
  assert.equal(clipPayout(25000, tomo), 45);
  assert.equal(clipPayout(1_000_000, tomo), 135); // capped at $150 gross
  assert.equal(viewsToMinimum(tomo), 2000);
  assert.equal(viewsToCap(tomo), 75000);
  assert.equal(clipPayout(5000, { ...tomo, cpm: null }), 0);
});

test("campaigns rank by budget left per active clipper", () => {
  const fresh = { ...tomo, id: "fresh", budgetUsed: 0, activeClippers: 2 };
  const crowded = { ...tomo, id: "crowded", budgetTotal: 5000, budgetUsed: 0, activeClippers: 100 };
  const ended = { ...fresh, id: "ended", status: "ended" as const };
  assert.equal(campaignScore(fresh), 500);
  assert.equal(campaignScore(crowded), 50);
  assert.equal(campaignScore(ended), 0);
  assert.deepEqual(
    rankCampaigns([crowded, ended, fresh]).map((r) => r.campaign.id),
    ["fresh", "crowded", "ended"],
  );
});

test("approval is blocked for unpaid platforms, duplicates, failed checks and spent budgets", () => {
  const data = { campaigns: [tomo], accounts: [account], clips: [] as Clip[] };
  assert.ok(canApprove(clipFlags(clip(), data)));
  const yt = { ...account, id: "yt", platform: "youtube" as const };
  const songOnly = { ...tomo, platforms: ["tiktok" as const] };
  assert.ok(
    !canApprove(clipFlags(clip({ accountId: "yt" }), { ...data, campaigns: [songOnly], accounts: [yt] })),
  );
  const twin = clip({ id: "c0", fingerprint: "fp", status: "posted" });
  assert.ok(!canApprove(clipFlags(clip({ fingerprint: "fp" }), { ...data, clips: [twin] })));
  // A twin still in review only warns; a rejected one says nothing.
  assert.ok(canApprove(clipFlags(clip({ fingerprint: "fp" }), { ...data, clips: [{ ...twin, status: "review" }] })));
  assert.ok(canApprove(clipFlags(clip({ fingerprint: "fp" }), { ...data, clips: [{ ...twin, status: "rejected" }] })));
  assert.ok(!canApprove(clipFlags(clip({ verdict: "fail" }), data)));
  assert.ok(!canApprove(clipFlags(clip(), { ...data, campaigns: [{ ...tomo, budgetUsed: 1000 }] })));
  assert.ok(!canApprove(clipFlags(clip({ accountId: null }), data)));
  const low = clipFlags(clip(), { ...data, campaigns: [{ ...tomo, budgetUsed: 900 }] });
  assert.ok(canApprove(low) && low.some((f) => f.level === "warn"));
});

test("earn window runs 7 days from approval, then a 3-day hold, in Chicago dates", () => {
  const c = clip({ review: "accepted", approvedAt: "2026-11-20T03:00:00Z" }); // Nov 19 in Chicago
  const at = (iso: string) => earnWindow(c, tomo, new Date(iso));
  assert.deepEqual(
    { ...at("2026-11-20T18:00:00Z")! },
    { earnsUntil: "2026-11-26", withdrawableOn: "2026-11-29", phase: "earning", daysLeft: 6 },
  );
  assert.equal(at("2026-11-27T18:00:00Z")!.phase, "hold");
  assert.equal(at("2026-11-30T18:00:00Z")!.phase, "done");
  assert.equal(earnWindow(clip(), tomo), null);
});

test("pool progress counts only campaign-approved views", () => {
  const pool = { ...tomo, id: "pool", kind: "pool" as const, poolViewsRequired: 400000 };
  const clips = [
    clip({ id: "1", campaignId: "pool", review: "accepted", views: 300000 }),
    clip({ id: "2", campaignId: "pool", review: "pending", views: 500000 }),
    clip({ id: "3", campaignId: "pool", review: "accepted", views: 150000 }),
  ];
  const p = poolProgress(pool, clips);
  assert.equal(p.views, 450000);
  assert.ok(p.qualified);
});

test("platform payout eligibility needs both followers and views", () => {
  const e = payoutEligibility({ ...account, followers: 10_000, views30d: 50_000 })!;
  assert.equal(e.eligible, false);
  assert.equal(e.pct, 0.5);
  assert.ok(payoutEligibility({ ...account, followers: 12_000, views30d: 150_000 })!.eligible);
  assert.equal(payoutEligibility({ ...account, platform: "instagram" }), null);
});

test("an account with 10 flat posts is a kill candidate; two 50K clips say scale", () => {
  const flat = Array.from({ length: 10 }, (_, i) =>
    clip({ id: `f${i}`, status: "submitted", views: 300, postedAt: `2026-11-${10 + i}T12:00:00Z` }),
  );
  assert.ok(accountHealth(account, flat, [tomo]).killCandidate);
  const hits = [...flat.slice(0, 8), clip({ id: "h1", status: "submitted", views: 60000 }), clip({ id: "h2", status: "submitted", views: 51000 })];
  const h = accountHealth(account, hits, [tomo]);
  assert.ok(!h.killCandidate);
  assert.ok(h.scale);
});

test("alerts flag late submissions, low budgets and opening campaigns", () => {
  const now = new Date("2026-11-19T18:00:00Z");
  const data = {
    demo: false,
    ready: true,
    accounts: [account],
    payouts: [],
    campaigns: [
      { ...tomo, budgetUsed: 900 },
      { ...tomo, id: "soon", name: "Ruckus", status: "watching" as const, opensOn: "2026-11-20" },
    ],
    clips: [clip({ status: "posted", postedAt: "2026-11-19T17:20:00Z", title: "Late one" })],
  };
  const text = clipAlerts(data, now).map((a) => a.text).join("\n");
  assert.match(text, /Submit “Late one” to Tomo now/);
  assert.match(text, /Tomo has 10% of its budget left/);
  assert.match(text, /Ruckus opens tomorrow/);
  assert.equal(clipAlerts(data, now)[0].level, "urgent");
});

test("money buckets stay separate and min-clear rate uses projections", () => {
  const now = new Date("2026-11-22T18:00:00Z");
  const clips = [
    clip({ id: "1", status: "submitted", review: "accepted", approvedAt: "2026-11-20T18:00:00Z", views: 25000 }),
    clip({ id: "2", status: "submitted", review: "accepted", approvedAt: "2026-11-01T18:00:00Z", views: 2000 }),
    clip({ id: "3", status: "submitted", views: 500, views24h: 1000 }), // projects to 2,500
    clip({ id: "4", status: "submitted", views: 100 }),
  ];
  const m = moneySummary(
    { demo: false, ready: true, campaigns: [tomo], accounts: [account], clips, payouts: [
      { id: "p", source: "CR", campaignId: null, amount: 20, status: "withdrawable", availableOn: null, paidOn: null, note: null },
    ] },
    now,
  );
  assert.equal(m.earning, 45);
  assert.equal(m.withdrawable, 20);
  assert.equal(minClearRate(clips, [tomo]), 0.75);
});

test("records validate types, platforms and min/max", () => {
  const c = validateClipRecord("campaigns", { id: "x", name: "X", cpm: "$2", platforms: "TikTok, youtube" });
  assert.equal(c.cpm, 2);
  assert.deepEqual(c.platforms, ["tiktok", "youtube"]);
  assert.equal(c.earnDays, 7);
  assert.throws(() => validateClipRecord("campaigns", { id: "x", name: "X", platforms: "myspace" }), /platform/);
  assert.throws(() => validateClipRecord("campaigns", { id: "x", name: "X", minPayout: 10, maxPayout: 5 }), /minimum/);
  assert.throws(() => validateClipRecord("clips", { id: "bad id!", title: "t" }), /id/);
  assert.throws(() => validateClipRecord("clips", { id: "a", title: "t", previewUrl: "javascript:alert(1)" }), /web address/);
});

test("the pipeline can queue and post clips but never approve them", () => {
  const created = mergePipelineClip(null, { id: "n1", title: "New", status: "approved", review: "accepted" });
  assert.equal(created.status, "review");
  assert.equal(created.review, "pending");
  assert.throws(() => mergePipelineClip(created, { status: "posted", postUrl: "https://x.com/1" }), /isn't approved/);
  const approved = { ...created, status: "approved" as const };
  assert.throws(() => mergePipelineClip(approved, { status: "posted" }), /postUrl/);
  const posted = mergePipelineClip(approved, { status: "posted", postUrl: "https://x.com/1", views: 10 });
  assert.equal(posted.status, "posted");
  assert.ok(posted.postedAt);
  const stats = mergePipelineClip(posted, { views: 500, status: "submitted", review: "accepted" });
  assert.equal(stats.views, 500);
  assert.equal(stats.status, "posted");
  assert.equal(stats.review, "pending");
  const acc = mergePipelineAccount(account, { followers: 900, status: "killed", handle: "@other" });
  assert.equal(acc.followers, 900);
  assert.equal(acc.status, "active");
  assert.equal(acc.handle, "@me");
});

test("demo data is internally consistent", () => {
  const d = clipFarmDemo(new Date("2026-11-19T18:00:00Z"));
  for (const c of d.clips) {
    if (c.campaignId) assert.ok(d.campaigns.some((x) => x.id === c.campaignId), c.id);
    if (c.accountId) assert.ok(d.accounts.some((x) => x.id === c.accountId), c.id);
  }
  // The demo shows an unpaid-platform clip (blocked) and two cuts of one moment (warned).
  const blocked = d.clips.filter((c) => c.status === "review" && !canApprove(clipFlags(c, d)));
  assert.deepEqual(blocked.map((c) => c.id), ["demo-clip-2"]);
  assert.ok(clipFlags(d.clips[0], d).some((f) => /approve only one/.test(f.text)));
});
