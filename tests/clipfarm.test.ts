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
  campaignRunway,
  cashNext7,
  emptyClipFarm,
  experimentResults,
  fitProjectionK,
  isLate,
  poolPace,
  postsToday,
  queuedPayouts,
  speedStats,
  type Clip,
  type ClipAccount,
  type ClipCampaign,
} from "../src/lib/clipfarm.ts";
import {
  mergePipelineAccount,
  mergePipelineCampaign,
  mergePipelineClip,
  validateClipRecord,
  withoutV11Columns,
} from "../src/lib/clipfarm-records.ts";
import { campaignSnapshotRow, clipSnapshotRow } from "../src/lib/clipfarm-history.ts";
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
  dailyCap: null,
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
  experiment: null,
  variant: null,
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
    historyReady: true,
    clipSnapshots: [],
    campaignSnapshots: [],
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
    { demo: false, ready: true, historyReady: true, clipSnapshots: [], campaignSnapshots: [], campaigns: [tomo], accounts: [account], clips, payouts: [
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

// ---------- v1.1: history, runway, pace, speed, caps, experiments ----------

const H = 3.6e6;
const at = (base: Date, hours: number) => new Date(base.getTime() + hours * H).toISOString();
const farm = (over: Partial<ReturnType<typeof emptyClipFarm>> = {}) => ({
  ...emptyClipFarm(),
  campaigns: [tomo],
  accounts: [account],
  ...over,
});

test("the day-7 projection stays at 2.5 until 30 clips have day-7 snapshots, then refits", () => {
  const now = new Date("2026-12-30T18:00:00Z");
  const mk = (n: number) => {
    const clips: Clip[] = [];
    const clipSnapshots = [];
    for (let i = 0; i < n; i++) {
      const posted = new Date(now.getTime() - (10 + i) * 24 * H);
      clips.push(clip({ id: `k${i}`, status: "submitted", postedAt: posted.toISOString(), views24h: 1000 }));
      clipSnapshots.push({ id: `s${i}`, clipId: `k${i}`, capturedAt: at(posted, 168), views: 3000 });
    }
    return { clips, clipSnapshots };
  };
  assert.deepEqual(fitProjectionK(mk(29), now), { k: 2.5, n: 29, fitted: false });
  assert.deepEqual(fitProjectionK(mk(30), now), { k: 3, n: 30, fitted: true });
});

test("runway comes from the last two days of budget checks and raises an alert under 1.5 days", () => {
  const now = new Date("2026-11-22T18:00:00Z");
  const c = { ...tomo, budgetUsed: 840 };
  const snaps = [
    { id: "a", campaignId: "tomo", capturedAt: at(now, -24), budgetUsed: 700, activeClippers: 10 },
    { id: "b", campaignId: "tomo", capturedAt: at(now, -1), budgetUsed: 840, activeClippers: 12 },
    { id: "old", campaignId: "tomo", capturedAt: at(now, -100), budgetUsed: 0, activeClippers: 1 },
  ];
  const r = campaignRunway(c, snaps, now);
  assert.equal(r.burnPerDay, 146.09); // $140 over 23 h
  assert.equal(r.runwayDays, 1.1);
  const text = clipAlerts(farm({ campaigns: [c], campaignSnapshots: snaps }), now).map((a) => a.text).join("\n");
  assert.match(text, /Tomo runs dry in about 1.1 days/);
  assert.deepEqual(campaignRunway(c, snaps.slice(1), now), { burnPerDay: null, runwayDays: null });
});

test("pool pace compares views needed per day with the last 3 days", () => {
  const now = new Date("2026-11-22T18:00:00Z");
  const pool = { ...tomo, id: "pool", kind: "pool" as const, cpm: null, poolViewsRequired: 100000, endsOn: "2026-11-27" };
  const clips = [
    clip({ id: "p1", campaignId: "pool", status: "submitted", review: "accepted", postedAt: at(now, -200), views: 20000 }),
    clip({ id: "p2", campaignId: "pool", status: "submitted", review: "accepted", postedAt: at(now, -10), views: 3000 }),
  ];
  const clipSnapshots = [{ id: "s", clipId: "p1", capturedAt: at(now, -80), views: 14000 }];
  const pace = poolPace(pool, { clips, clipSnapshots }, now)!;
  assert.equal(pace.daysLeft, 5);
  assert.equal(pace.needPerDay, 15400); // 77K short over 5 days
  assert.equal(pace.avgPerDay, 3000); // (6K + 3K) / 3
  assert.equal(pace.onPace, false);
  const text = clipAlerts(farm({ campaigns: [pool], clips, clipSnapshots }), now).map((a) => a.text).join("\n");
  assert.match(text, /off pace/);
});

test("speed stats and late submissions use the 30-minute window", () => {
  const now = new Date("2026-11-22T18:00:00Z");
  const clips = [
    clip({ id: "f", status: "submitted", createdAt: at(now, -3), postedAt: at(now, -2), submittedAt: at(now, -1.9) }),
    clip({ id: "l", status: "submitted", createdAt: at(now, -5), postedAt: at(now, -4), submittedAt: at(now, -3) }),
    clip({ id: "p", status: "posted", createdAt: at(now, -2), postedAt: at(now, -1) }),
  ];
  const s = speedStats(farm({ clips }), now);
  assert.equal(s.cutToPostMin, 60);
  assert.equal(s.submitLagMin, 33); // median of 6 and 60
  assert.deepEqual(s.lateIds, ["l", "p"]);
  assert.equal(isLate(clips[0], [tomo], now), false);
});

test("posting caps count today's posts plus approved clips and warn in review", () => {
  const now = new Date();
  const clips = [
    clip({ id: "1", status: "posted", postedAt: now.toISOString() }),
    clip({ id: "2", status: "approved" }),
    clip({ id: "3", status: "approved" }),
    clip({ id: "4", status: "submitted", postedAt: now.toISOString() }),
    clip({ id: "q", status: "review" }),
  ];
  const a = { ...account, dailyCap: null };
  assert.equal(postsToday(a, clips, now), 4);
  const flags = clipFlags(clips[4], { campaigns: [tomo], accounts: [a], clips });
  assert.ok(flags.some((f) => f.level === "warn" && /daily cap \(4 of 4\)/.test(f.text)));
  assert.ok(canApprove(flags)); // a cap only warns
  assert.ok(!clipFlags(clips[4], { campaigns: [tomo], accounts: [{ ...a, dailyCap: 6 }], clips }).some((f) => /cap/.test(f.text)));
});

test("experiments call a winner only with 10+ clips per arm and 1.3x lift", () => {
  const now = new Date("2026-11-22T18:00:00Z");
  const arm = (variant: string, views: number, n: number) =>
    Array.from({ length: n }, (_, i) =>
      clip({ id: `${variant}${i}`, status: "submitted", postedAt: at(now, -48), views24h: views, experiment: "First frame", variant }),
    );
  const base = arm("Gameplay", 1000, 10);
  const running = experimentResults({ clips: [...base, ...arm("Facecam", 2000, 9)], clipSnapshots: [] }, now)[0];
  assert.equal(running.verdict, "running");
  const done = experimentResults({ clips: [...base, ...arm("Facecam", 2000, 10)], clipSnapshots: [] }, now)[0];
  assert.equal(done.verdict, "winner");
  assert.equal(done.winner, "Facecam");
  assert.ok(done.arms[0].medianLift > done.arms[1].medianLift * 1.3);
});

test("queued payouts over budget left raise an alert, and cash landing counts payouts due", () => {
  const now = new Date("2026-11-22T18:00:00Z");
  const c = { ...tomo, budgetUsed: 950 }; // $50 left
  const clips = [
    clip({ id: "a", status: "submitted", review: "accepted", approvedAt: at(now, -24), views: 25000 }),
    clip({ id: "b", status: "submitted", review: "accepted", approvedAt: at(now, -24), views: 25000 }),
  ];
  assert.equal(queuedPayouts(c, farm({ campaigns: [c], clips }), now), 90);
  const text = clipAlerts(farm({ campaigns: [c], clips }), now).map((a) => a.text).join("\n");
  assert.match(text, /more than its \$50.00 left/);
  const cash = cashNext7(
    farm({
      payouts: [
        { id: "w", source: "CR", campaignId: null, amount: 10, status: "withdrawable", availableOn: null, paidOn: null, note: null },
        { id: "h", source: "CR", campaignId: null, amount: 5, status: "hold", availableOn: "2026-11-25", paidOn: null, note: null },
        { id: "late", source: "CR", campaignId: null, amount: 99, status: "hold", availableOn: "2026-12-30", paidOn: null, note: null },
      ],
    }),
    now,
  );
  assert.equal(cash, 15);
});

test("the scout creates campaigns only as watching and changes only budget fields after", () => {
  const created = mergePipelineCampaign(null, { id: "new", name: "New", status: "active", cpm: 1.5, budgetUsed: 10 });
  assert.equal(created.status, "watching");
  assert.ok(created.budgetCheckedAt);
  const next = mergePipelineCampaign(tomo, {
    id: "tomo",
    status: "ended",
    cpm: 99,
    name: "Hacked",
    budgetUsed: 300,
    activeClippers: 14,
    rules: "New rule",
  });
  assert.equal(next.status, "active");
  assert.equal(next.cpm, 2);
  assert.equal(next.name, "Tomo");
  assert.equal(next.budgetUsed, 300);
  assert.equal(next.activeClippers, 14);
  assert.equal(next.rules, "New rule");
  assert.ok(next.budgetCheckedAt);
  assert.throws(() => mergePipelineCampaign(null, { id: "x" }), /name is required/);
});

test("snapshots are written only when the numbers change, and 0012 columns can be dropped", () => {
  const live = clip({ id: "s", postedAt: "2026-11-20T00:00:00Z", views: 500 });
  assert.equal(clipSnapshotRow({ views: 500 }, live, "u"), null);
  assert.equal(clipSnapshotRow({ views: 400 }, live, "u")?.views, 500);
  assert.equal(clipSnapshotRow(null, { ...live, postedAt: null }, "u"), null);
  assert.equal(campaignSnapshotRow({ budgetUsed: 200, activeClippers: 10 }, tomo, "u"), null);
  assert.equal(campaignSnapshotRow({ budgetUsed: 100, activeClippers: 10 }, tomo, "u")?.budget_used, 200);
  // A stale stamp isn't reused: the snapshot is dated now.
  const stale = clipSnapshotRow({ views: 400, statsAsOf: "2026-11-20T01:00:00Z" }, { ...live, statsAsOf: "2026-11-20T01:00:00Z" }, "u")!;
  assert.ok(Date.now() - Date.parse(stale.captured_at) < 60000);
  const fresh = clipSnapshotRow({ views: 400, statsAsOf: "2026-11-10T01:00:00Z" }, { ...live, statsAsOf: "2026-11-11T01:00:00Z" }, "u")!;
  assert.equal(fresh.captured_at, "2026-11-11T01:00:00.000Z");
  const posted = { ...live, status: "posted" as const, statsAsOf: "2026-11-10T01:00:00Z" };
  assert.ok(Date.parse(mergePipelineClip(posted, { id: "s", views: 900 }).statsAsOf!) > Date.parse("2026-11-11T00:00:00Z"));
  assert.deepEqual(withoutV11Columns({ id: "x", experiment: "a", variant: "b", daily_cap: 3 }), { id: "x" });
});

test("pipeline account updates can't change the daily cap", () => {
  const next = mergePipelineAccount({ ...account, dailyCap: 2 }, { id: "a1", dailyCap: 50, followers: 10 });
  assert.equal(next.dailyCap, 2);
  assert.equal(next.followers, 10);
});

test("demo history drives runway and an experiment", () => {
  const now = new Date();
  const d = clipFarmDemo(now);
  assert.ok(d.historyReady);
  assert.ok(campaignRunway(d.campaigns[0], d.campaignSnapshots, now).burnPerDay! > 0);
  assert.equal(experimentResults(d, now)[0].experiment, "First frame");
});
