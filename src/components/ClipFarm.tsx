"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  accountHealth,
  budgetLeft,
  budgetLeftPct,
  campaignFor,
  campaignRunway,
  cashNext7,
  clipLift,
  dailyCap,
  experimentResults,
  EXPERIMENT_RULE,
  fitProjectionK,
  postsToday,
  poolPace,
  projectionK,
  REFIT_MIN_CLIPS,
  speedStats,
  SUBMIT_LATE_MIN,
  canApprove,
  clipAlerts,
  clipCounts,
  clipFlags,
  earnWindow,
  estimatedEarnings,
  fmtNum,
  fmtUSD,
  formatLeaderboard,
  minClearRate,
  moneySummary,
  payoutEligibility,
  PLATFORM_LABEL,
  PLATFORMS,
  poolProgress,
  projected7d,
  rankCampaigns,
  REJECT_REASONS,
  viewsToCap,
  viewsToMinimum,
  type Clip,
  type ClipAccount,
  type ClipAlert,
  type ClipCampaign,
  type ClipFarmData,
  type ClipPayout,
} from "@/lib/clipfarm";
import {
  validateClipRecord,
  type ClipEntity,
  type ClipEntityMap,
} from "@/lib/clipfarm-records";
import {
  deleteClipRecord,
  reviewClip,
  saveClipRecord,
  updateClip,
} from "@/app/clip-actions";
import { Empty, RecordForm, SectionTitle, opts, type Field } from "./Kit";

const TABS = [
  ["today", "Today"],
  ["review", "Review"],
  ["pipeline", "Pipeline"],
  ["campaigns", "Campaigns"],
  ["accounts", "Accounts"],
  ["money", "Money"],
  ["formats", "Formats"],
] as const;
type Tab = (typeof TABS)[number][0];

const DEMO_KEY = "clipfarm-fictional-demo-v1";
const LAUNCH_KEY = "clipfarm-launch-mode";

export default function ClipFarm({ initial }: { initial: ClipFarmData }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>("today");
  const [launch, setLaunch] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [editing, setEditing] = useState<{
    entity: "campaigns" | "accounts" | "payouts";
    record: Record<string, unknown>;
  } | null>(null);

  useEffect(() => {
    // Per-viewer conveniences only; the page works without storage.
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLaunch(localStorage.getItem(LAUNCH_KEY) === "1");
      if (initial.demo) {
        const raw = localStorage.getItem(DEMO_KEY);
        if (raw) setData({ ...initial, ...JSON.parse(raw), demo: true, ready: true });
      }
    } catch {
      /* storage unavailable */
    }
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, [initial]);

  const commit = useCallback(
    (next: ClipFarmData) => {
      setData(next);
      if (next.demo)
        try {
          localStorage.setItem(DEMO_KEY, JSON.stringify(next));
        } catch {
          /* demo storage is optional */
        }
    },
    [],
  );

  const replace = useCallback(
    <K extends ClipEntity>(entity: K, record: ClipEntityMap[K], prev: ClipFarmData) => {
      const list = prev[entity] as unknown as ClipEntityMap[K][];
      const i = list.findIndex((r) => r.id === record.id);
      const next = i < 0 ? [record, ...list] : list.map((r, j) => (j === i ? record : r));
      return { ...prev, [entity]: next } as ClipFarmData;
    },
    [],
  );

  const save = useCallback(
    async <K extends ClipEntity>(entity: K, input: Record<string, unknown>) => {
      if (data.demo) {
        const record = validateClipRecord(entity, input);
        commit(replace(entity, record, data));
        return;
      }
      const res = await saveClipRecord(entity, input);
      if (res.error || !res.record) throw new Error(res.error ?? "Could not save.");
      commit(replace(entity, res.record as ClipEntityMap[K], data));
    },
    [data, commit, replace],
  );

  // Sends only the changed fields, so fresher pipeline stats survive.
  const patchClip = useCallback(
    async (clip: Clip, patch: Partial<Clip>) => {
      if (data.demo) {
        const record = validateClipRecord("clips", { ...clip, ...patch });
        commit(replace("clips", record, data));
        return;
      }
      const res = await updateClip(clip.id, patch as Record<string, unknown>);
      if (res.error || !res.record) throw new Error(res.error ?? "Could not save.");
      commit(replace("clips", res.record, data));
    },
    [data, commit, replace],
  );

  const remove = useCallback(
    async (entity: ClipEntity, id: string) => {
      if (!data.demo) {
        const res = await deleteClipRecord(entity, id);
        if (res.error) throw new Error(res.error);
      }
      commit({
        ...data,
        [entity]: (data[entity] as { id: string }[]).filter((r) => r.id !== id),
      } as ClipFarmData);
    },
    [data, commit],
  );

  const decide = useCallback(
    async (clip: Clip, decision: "approve" | "reject", reason?: string) => {
      if (data.demo) {
        const flags = clipFlags(clip, data);
        if (decision === "approve" && !canApprove(flags))
          throw new Error(flags.filter((f) => f.level === "block").map((f) => f.text).join(". "));
        commit(
          replace(
            "clips",
            {
              ...clip,
              status: decision === "approve" ? "approved" : "rejected",
              rejectReason: decision === "reject" ? (reason ?? null) : null,
            },
            data,
          ),
        );
        return;
      }
      const res = await reviewClip(clip.id, decision, {
        accountId: clip.accountId,
        reason: reason ?? null,
      });
      if (res.error || !res.record) throw new Error(res.error ?? "Could not save.");
      commit(replace("clips", res.record, data));
    },
    [data, commit, replace],
  );

  const alerts = useMemo(() => clipAlerts(data, now), [data, now]);
  const counts = clipCounts(data.clips);

  if (!data.ready)
    return (
      <>
        <Heading />
        <div className="notice warning">
          The Clip Farm tables aren&apos;t set up yet. Run{" "}
          <code>supabase/migrations/0011_clip_farm.sql</code> in the Supabase SQL
          editor, then reload. The rest of the portal is unaffected.
        </div>
      </>
    );

  return (
    <>
      <Heading
        right={
          <button
            className={`button small ${launch ? "is-on" : "secondary"}`}
            aria-pressed={launch}
            title="Launch mode sorts the queue by freshness and pauses format tests"
            onClick={() => {
              const v = !launch;
              setLaunch(v);
              try {
                localStorage.setItem(LAUNCH_KEY, v ? "1" : "0");
              } catch {
                /* optional */
              }
            }}
          >
            {launch ? "Launch mode on" : "Launch mode off"}
          </button>
        }
      />
      {data.demo && (
        <p className="notice" style={{ marginBottom: 16 }}>
          Demo: fictional campaigns, accounts and clips. Changes save in this browser only.
        </p>
      )}
      <div className="trip-tabs" role="tablist" aria-label="Clip Farm sections">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "review" && counts.review ? ` (${counts.review})` : ""}
          </button>
        ))}
      </div>
      {tab === "today" && (
        <Today data={data} alerts={alerts} now={now} go={setTab} counts={counts} />
      )}
      {tab === "review" && (
        <Review data={data} launch={launch} now={now} decide={decide} patch={patchClip} />
      )}
      {tab === "pipeline" && <Pipeline data={data} now={now} patch={patchClip} />}
      {tab === "campaigns" && (
        <Campaigns
          data={data}
          edit={(record) => setEditing({ entity: "campaigns", record })}
        />
      )}
      {tab === "accounts" && (
        <Accounts data={data} edit={(record) => setEditing({ entity: "accounts", record })} />
      )}
      {tab === "money" && (
        <Money
          data={data}
          now={now}
          edit={(record) => setEditing({ entity: "payouts", record })}
        />
      )}
      {tab === "formats" && <Formats data={data} launch={launch} />}
      {editing && (
        <RecordForm
          title={titles[editing.entity](editing.record)}
          fields={formFields(editing.entity, data)}
          initial={editing.record}
          onClose={() => setEditing(null)}
          onDelete={
            editing.record.__existing
              ? () => remove(editing.entity, String(editing.record.id))
              : undefined
          }
          onSave={async (r) => {
            const record = { ...r };
            if (editing.entity === "campaigns" && record.budgetUsed !== editing.record.budgetUsed)
              record.budgetCheckedAt = new Date().toISOString();
            if (editing.entity === "accounts")
              record.statsAsOf = new Date().toISOString();
            await save(editing.entity, record);
          }}
        />
      )}
    </>
  );
}

function Heading({ right }: { right?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">Clips, campaigns and payouts</span>
        <h1>Clip Farm.</h1>
        <p className="page-intro">
          Approve, post, submit, withdraw. Nothing posts until you say yes.
        </p>
      </div>
      {right}
    </div>
  );
}

// ---------- Today ----------

function Today({
  data,
  alerts,
  now,
  go,
  counts,
}: {
  data: ClipFarmData;
  alerts: ClipAlert[];
  now: Date;
  go: (t: Tab) => void;
  counts: ReturnType<typeof clipCounts>;
}) {
  const money = moneySummary(data, now);
  const rate = minClearRate(data.clips, data.campaigns, projectionK(data, now));
  const cash7 = cashNext7(data, now);
  const speed = speedStats(data, now);
  const top = rankCampaigns(data.campaigns)
    .filter((r) => r.score > 0)
    .slice(0, 3);
  return (
    <>
      <div className="metrics cf-metrics">
        <Metric label="Estimated earned (net)" value={fmtUSD(money.estimated)} />
        <Metric label="Still earning (7-day window)" value={fmtUSD(money.earning)} />
        <Metric label="In hold" value={fmtUSD(money.hold)} />
        <Metric label="Withdrawable" value={fmtUSD(money.withdrawable)} strong />
        <Metric label="Cash landing in 7 days" value={fmtUSD(cash7)} />
        <Metric label="Paid out" value={fmtUSD(money.paid)} />
        <Metric
          label="Min-clear rate (target 40%+)"
          value={rate == null ? "—" : `${Math.round(rate * 100)}%`}
          warn={rate != null && rate < 0.4}
        />
        <Metric
          label="Cut → post, median (7 days)"
          value={speed.cutToPostMin == null ? "—" : fmtMins(speed.cutToPostMin)}
          warn={speed.cutToPostMin != null && speed.cutToPostMin > 120}
        />
        <Metric
          label={`Post → submit, median (late after ${SUBMIT_LATE_MIN} min)`}
          value={speed.submitLagMin == null ? "—" : fmtMins(speed.submitLagMin)}
          warn={speed.submitLagMin != null && speed.submitLagMin > SUBMIT_LATE_MIN}
        />
        <Metric
          label="Late submissions (7 days)"
          value={String(speed.lateCount)}
          warn={speed.lateCount > 0}
        />
      </div>
      <div className="grid-two cf-today">
        <section className="card">
          <SectionTitle eyebrow="Do these first" title={alerts.length ? `${alerts.length} things need you` : "All clear"} />
          {counts.review > 0 && (
            <button className="cf-alert money" onClick={() => go("review")}>
              <span className="cf-dot" />
              {counts.review} clip{counts.review === 1 ? "" : "s"} waiting for your review
            </button>
          )}
          {alerts.map((a, i) => (
            <button
              key={i}
              className={`cf-alert ${a.level}`}
              onClick={() =>
                go(a.campaignId ? "campaigns" : a.accountId ? "accounts" : a.clipId ? "pipeline" : "money")
              }
            >
              <span className="cf-dot" />
              {a.text}
            </button>
          ))}
          {!alerts.length && !counts.review && (
            <p className="muted">Nothing is waiting. Check for new campaigns, then feed the pipeline.</p>
          )}
        </section>
        <section className="card">
          <SectionTitle
            eyebrow="Budget left per clipper"
            title="Feed these campaigns"
            action={
              <button className="text-link" onClick={() => go("campaigns")}>
                All campaigns →
              </button>
            }
          />
          {top.map(({ campaign: c, score }) => (
            <CampaignLine key={c.id} c={c} score={score} data={data} />
          ))}
          {!top.length && <p className="muted">Add campaigns with a budget to rank them.</p>}
          <p className="muted cf-small" style={{ marginTop: 12 }}>
            In the queue: {counts.review} to review · {counts.approved} approved · {counts.posted} posted, not submitted
          </p>
        </section>
      </div>
    </>
  );
}

const fmtMins = (m: number) => (m < 90 ? `${m} min` : `${Math.round(m / 6) / 10} h`);

function Metric({
  label,
  value,
  strong,
  warn,
}: {
  label: string;
  value: string;
  strong?: boolean;
  warn?: boolean;
}) {
  return (
    <div className={`metric ${strong ? "cf-strong" : ""} ${warn ? "cf-warn" : ""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function CampaignLine({ c, score, data }: { c: ClipCampaign; score: number; data: ClipFarmData }) {
  const left = budgetLeft(c),
    pct = budgetLeftPct(c);
  const pool = c.kind === "pool" ? poolProgress(c, data.clips) : null;
  const now = new Date();
  const run = campaignRunway(c, data.campaignSnapshots, now);
  const pace = c.kind === "pool" ? poolPace(c, data, now) : null;
  return (
    <div className="cf-campaign-line">
      <div>
        <strong>{c.name}</strong>{" "}
        <span className="badge neutral">{c.status}</span>
        <div className="muted cf-small">
          {c.kind === "cpm" && c.cpm != null
            ? `$${c.cpm}/1K · earns at ${fmtNum(viewsToMinimum(c))} · caps at ${viewsToCap(c) ? fmtNum(viewsToCap(c)!) : "none"}`
            : c.kind === "pool"
              ? `Pool · ${fmtNum(pool!.views)} of ${fmtNum(pool!.required)} views`
              : "Platform payout"}
          {" · "}
          {c.platforms.map((p) => PLATFORM_LABEL[p]).join(", ") || "platforms not set"}
        </div>
        {run.burnPerDay != null && (
          <div className={`cf-small ${run.runwayDays != null && run.runwayDays < 1.5 ? "cf-bad" : "muted"}`}>
            Burning {fmtUSD(run.burnPerDay)}/day
            {run.runwayDays != null ? ` · about ${run.runwayDays} days left` : ""}
          </div>
        )}
        {pace && pace.needPerDay != null && (
          <div className={`cf-small ${pace.onPace === false ? "cf-bad" : "muted"}`}>
            Needs {fmtNum(pace.needPerDay)} views/day for {pace.daysLeft} days · averaging {fmtNum(pace.avgPerDay)}
            {pace.onPace === false ? " (off pace)" : ""}
          </div>
        )}
        {pct != null && (
          <div className="progress-track" title={`${Math.round(pct * 100)}% of budget left`}>
            <span
              style={{ width: `${Math.round(pct * 100)}%` }}
              className={pct < 0.2 ? "cf-low" : ""}
            />
          </div>
        )}
      </div>
      <div className="cf-score">
        <strong>{fmtUSD(score)}</strong>
        <small>{left != null ? `${fmtUSD(left)} left` : "budget ?"}</small>
      </div>
    </div>
  );
}

// ---------- Review ----------

function Review({
  data,
  launch,
  now,
  decide,
  patch,
}: {
  data: ClipFarmData;
  launch: boolean;
  now: Date;
  decide: (clip: Clip, d: "approve" | "reject", reason?: string) => Promise<void>;
  patch: (clip: Clip, p: Partial<Clip>) => Promise<void>;
}) {
  const queue = useMemo(() => {
    const list = data.clips.filter((c) => c.status === "review");
    const payoutAtCap = (c: Clip) => {
      const camp = campaignFor(c, data.campaigns);
      return camp?.maxPayout ?? 0;
    };
    return launch
      ? list.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
      : list.sort(
          (a, b) =>
            Number(canApprove(clipFlags(b, data))) - Number(canApprove(clipFlags(a, data))) ||
            payoutAtCap(b) - payoutAtCap(a) ||
            (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
        );
  }, [data, launch]);
  const [index, setIndex] = useState(0);
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const clip = queue[Math.min(index, queue.length - 1)] ?? null;
  const flags = clip ? clipFlags(clip, data) : [];
  const approvable = canApprove(flags);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError("");
      try {
        await fn();
        setRejecting(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save.");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!clip) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (busy || ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName) || e.metaKey || e.ctrlKey) return;
      const k = e.key.toLowerCase();
      if (k === "a" && approvable) run(() => decide(clip, "approve"));
      else if (k === "r") setRejecting(true);
      else if (k === "j" || k === "arrowright") setIndex((i) => Math.min(queue.length - 1, i + 1));
      else if (k === "k" || k === "arrowleft") setIndex((i) => Math.max(0, i - 1));
      else if (k === "escape") setRejecting(false);
      else if (rejecting && /^[1-5]$/.test(k))
        run(() => decide(clip, "reject", REJECT_REASONS[Number(k) - 1]));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clip, approvable, rejecting, busy, queue.length, decide, run]);

  if (!clip)
    return (
      <Empty title="The review queue is empty">
        New cuts from the pipeline land here. Nothing posts until you approve it.
      </Empty>
    );
  const c = campaignFor(clip, data.campaigns);
  const account = data.accounts.find((a) => a.id === clip.accountId) ?? null;
  const age = clip.createdAt ? (now.getTime() - Date.parse(clip.createdAt)) / 60000 : null;
  return (
    <>
      <div className="cf-review-top">
        <span className="muted">
          Clip {Math.min(index, queue.length - 1) + 1} of {queue.length} ·{" "}
          {launch ? "freshest first (launch mode)" : "approvable, highest cap first"}
        </span>
        <span className="muted cf-small">
          Keys: <kbd>A</kbd> approve · <kbd>R</kbd> reject · <kbd>J</kbd>/<kbd>K</kbd> next/previous
        </span>
      </div>
      <article className="card cf-review">
        <div className="cf-preview">
          {clip.previewUrl && /\.(mp4|webm|mov)(\?|$)/i.test(clip.previewUrl) ? (
            <video src={clip.previewUrl} controls muted autoPlay playsInline loop preload="metadata" />
          ) : clip.previewUrl ? (
            <a className="cf-preview-empty" href={clip.previewUrl} target="_blank" rel="noreferrer">
              Open the cut ↗
            </a>
          ) : (
            <div className="cf-preview-empty">No preview link from the pipeline</div>
          )}
          {clip.hook && <div className="cf-hook">{clip.hook}</div>}
        </div>
        <div className="cf-review-body">
          <span className="eyebrow">
            {clip.format ?? "Untagged format"}
            {clip.durationSec ? ` · ${clip.durationSec}s` : ""}
            {age != null ? ` · cut ${age < 90 ? `${Math.round(age)} min` : `${Math.round(age / 60)} h`} ago` : ""}
          </span>
          <h2>{clip.title}</h2>
          {clip.experiment && (
            <p className="cf-small">
              <span className="badge neutral">
                Test: {clip.experiment}
                {clip.variant ? ` · ${clip.variant}` : ""}
              </span>
            </p>
          )}
          {clip.sourceUrl && (
            <p className="muted cf-small">
              Source:{" "}
              <a className="text-link" href={clip.sourceUrl} target="_blank" rel="noreferrer">
                VOD{clip.sourceAt ? ` at ${clip.sourceAt}` : ""} ↗
              </a>
            </p>
          )}
          <div className="cf-facts">
            <div>
              <small>Campaign</small>
              <strong>{c ? c.name : "Platform payout / none"}</strong>
              {c?.kind === "cpm" && (
                <span className="muted cf-small">
                  ${c.cpm}/1K · earns from {fmtNum(viewsToMinimum(c))} views · ${c.maxPayout} cap at{" "}
                  {viewsToCap(c) ? fmtNum(viewsToCap(c)!) : "—"}
                </span>
              )}
              {c && budgetLeftPct(c) != null && (
                <span className="muted cf-small">
                  {Math.round((budgetLeftPct(c) ?? 0) * 100)}% budget left · pays{" "}
                  {c.platforms.map((p) => PLATFORM_LABEL[p]).join(", ")}
                </span>
              )}
            </div>
            <label>
              <small>Post to</small>
              <select
                value={clip.accountId ?? ""}
                disabled={busy}
                onChange={(e) =>
                  run(() => patch(clip, { accountId: e.target.value || null }))
                }
              >
                <option value="">Pick an account</option>
                {data.accounts
                  .filter((a) => a.status !== "killed")
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.handle} · {PLATFORM_LABEL[a.platform]} · {a.theme}
                    </option>
                  ))}
              </select>
              {account && <span className="muted cf-small">{account.theme}</span>}
            </label>
            <div>
              <small>Checker</small>
              <strong>
                <span
                  className={`badge ${clip.verdict === "pass" ? "success" : clip.verdict === "fail" ? "coral" : "warning"}`}
                >
                  {clip.verdict ? clip.verdict.toUpperCase() : "NOT CHECKED"}
                </span>
              </strong>
              {clip.checkNotes && <span className="muted cf-small">{clip.checkNotes}</span>}
            </div>
          </div>
          {flags.length > 0 && (
            <ul className="cf-flags">
              {flags.map((f) => (
                <li key={f.text} className={f.level}>
                  {f.level === "block" ? "Blocked: " : "Heads up: "}
                  {f.text}
                </li>
              ))}
            </ul>
          )}
          {clip.caption && (
            <p className="cf-caption">
              <small>Caption</small> {clip.caption}
            </p>
          )}
          {error && (
            <p role="alert" className="error-inline">
              {error}
            </p>
          )}
          {!rejecting ? (
            <div className="card-actions cf-actions">
              <button
                className="button"
                disabled={busy || !approvable}
                title={approvable ? "Approve (A)" : "Fix the blocked items first"}
                onClick={() => run(() => decide(clip, "approve"))}
              >
                {busy ? "Saving…" : "Approve"}
              </button>
              <button className="button secondary" disabled={busy} onClick={() => setRejecting(true)}>
                Reject
              </button>
              <button
                className="button ghost"
                disabled={index >= queue.length - 1}
                onClick={() => setIndex((i) => i + 1)}
              >
                Skip →
              </button>
            </div>
          ) : (
            <div className="cf-reasons" role="group" aria-label="Why reject?">
              {REJECT_REASONS.map((r, i) => (
                <button
                  key={r}
                  className="pill"
                  disabled={busy}
                  onClick={() => run(() => decide(clip, "reject", r))}
                >
                  <kbd>{i + 1}</kbd> {r}
                </button>
              ))}
              <button className="button ghost small" onClick={() => setRejecting(false)}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </article>
    </>
  );
}

// ---------- Pipeline ----------

function Pipeline({
  data,
  now,
  patch,
}: {
  data: ClipFarmData;
  now: Date;
  patch: (clip: Clip, p: Partial<Clip>) => Promise<void>;
}) {
  const [filter, setFilter] = useState<"live" | "approved" | "rejected">("live");
  const rows = data.clips.filter((c) =>
    filter === "live"
      ? c.status === "posted" || c.status === "submitted"
      : filter === "approved"
        ? c.status === "approved"
        : c.status === "rejected",
  );
  return (
    <>
      <div className="toolbar">
        {(
          [
            ["approved", "Approved, waiting to post"],
            ["live", "Posted and submitted"],
            ["rejected", "Rejected"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`pill ${filter === id ? "active" : ""}`} onClick={() => setFilter(id)}>
            {label} ({data.clips.filter((c) => (id === "live" ? c.status === "posted" || c.status === "submitted" : c.status === id)).length})
          </button>
        ))}
      </div>
      {filter === "approved" && rows.length > 0 && (
        <p className="notice" style={{ marginBottom: 16 }}>
          The pipeline posts these and marks them posted with the link. You can also mark one posted by hand.
        </p>
      )}
      <div className="cf-list">
        {rows.map((clip) => (
          <PipelineRow key={clip.id} clip={clip} data={data} now={now} patch={patch} />
        ))}
      </div>
      {!rows.length && <Empty title="Nothing here yet" />}
    </>
  );
}

function PipelineRow({
  clip,
  data,
  now,
  patch,
}: {
  clip: Clip;
  data: ClipFarmData;
  now: Date;
  patch: (clip: Clip, p: Partial<Clip>) => Promise<void>;
}) {
  const c = campaignFor(clip, data.campaigns);
  const account = data.accounts.find((a) => a.id === clip.accountId);
  const [form, setForm] = useState<null | "post" | "stats">(null);
  const [url, setUrl] = useState(clip.postUrl ?? "");
  const [views, setViews] = useState(String(clip.views || ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const w = c ? earnWindow(clip, c, now) : null;
  const mins = clip.postedAt ? (now.getTime() - Date.parse(clip.postedAt)) / 60000 : null;
  const k = projectionK(data);
  const est = estimatedEarnings(clip, data.campaigns, k);
  const need = c?.kind === "cpm" ? viewsToMinimum(c) : 0;
  const act = async (changes: Partial<Clip>) => {
    setBusy(true);
    setError("");
    try {
      await patch(clip, changes);
      setForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card cf-row">
      <div className="cf-row-main">
        <strong>{clip.title}</strong>
        <div className="muted cf-small">
          {account ? `${account.handle} · ${PLATFORM_LABEL[account.platform]}` : "No account"} ·{" "}
          {c?.name ?? "No campaign"}
          {clip.rejectReason ? ` · Rejected: ${clip.rejectReason}` : ""}
        </div>
        <div className="cf-tags">
          {clip.status === "posted" && c && c.kind !== "platform" && mins != null && (
            <span className={`badge ${mins > 30 ? "coral" : mins > 20 ? "warning" : "success"}`}>
              {mins > 30 ? `Submit now: ${Math.round(mins)} min since posting` : `Submit within ${Math.max(1, Math.round(30 - mins))} min`}
            </span>
          )}
          {clip.status === "submitted" && clip.review === "pending" && (
            <span className="badge neutral">Waiting for campaign approval</span>
          )}
          {clip.review === "denied" && <span className="badge coral">Campaign rejected it</span>}
          {w && (
            <span className={`badge ${w.phase === "earning" ? "success" : "neutral"}`}>
              {w.phase === "earning"
                ? `Earning: ${w.daysLeft} day${w.daysLeft === 1 ? "" : "s"} left`
                : w.phase === "hold"
                  ? `In hold until ${w.withdrawableOn}`
                  : "Window closed"}
            </span>
          )}
          {need > 0 && clip.views < need && clip.status === "submitted" && (
            <span className="badge warning">{fmtNum(need - clip.views)} views to minimum</span>
          )}
        </div>
      </div>
      <div className="cf-row-nums">
        <span>
          <strong>{fmtNum(clip.views)}</strong>
          <small>views{clip.views24h ? ` · day 7 ≈ ${fmtNum(projected7d(clip, k))}` : ""}</small>
        </span>
        <span>
          <strong>{fmtUSD(est)}</strong>
          <small>est. net</small>
        </span>
      </div>
      <div className="cf-row-actions">
        {clip.postUrl && (
          <a className="button ghost small" href={clip.postUrl} target="_blank" rel="noreferrer">
            Post ↗
          </a>
        )}
        {clip.status === "approved" && (
          <button className="button small" disabled={busy} onClick={() => setForm("post")}>
            Mark posted
          </button>
        )}
        {clip.status === "posted" && c && c.kind !== "platform" && (
          <>
            {c.url && (
              <a className="button secondary small" href={c.url} target="_blank" rel="noreferrer">
                Open campaign ↗
              </a>
            )}
            <button
              className="button small"
              disabled={busy}
              onClick={() => act({ status: "submitted", submittedAt: new Date().toISOString() })}
            >
              Mark submitted
            </button>
          </>
        )}
        {clip.status === "submitted" && clip.review === "pending" && (
          <>
            <button
              className="button small"
              disabled={busy}
              onClick={() => act({ review: "accepted", approvedAt: new Date().toISOString() })}
            >
              Campaign approved
            </button>
            <button className="button ghost small" disabled={busy} onClick={() => act({ review: "denied" })}>
              Denied
            </button>
          </>
        )}
        {(clip.status === "posted" || clip.status === "submitted") && (
          <button className="button ghost small" disabled={busy} onClick={() => setForm("stats")}>
            Update views
          </button>
        )}
        {clip.status === "rejected" && (
          <button className="button ghost small" disabled={busy} onClick={() => act({ status: "review", rejectReason: null })}>
            Back to review
          </button>
        )}
      </div>
      {form && (
        <form
          className="cf-inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (form === "post")
              act({ status: "posted", postUrl: url, postedAt: new Date().toISOString() });
            else act({ views: Number(views) || 0, statsAsOf: new Date().toISOString() });
          }}
        >
          {form === "post" ? (
            <input
              type="url"
              required
              placeholder="https://www.tiktok.com/@…/video/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-label="Post link"
            />
          ) : (
            <input
              type="number"
              min={0}
              required
              value={views}
              onChange={(e) => setViews(e.target.value)}
              aria-label="Views"
            />
          )}
          <button className="button small" disabled={busy}>
            Save
          </button>
          <button type="button" className="button ghost small" onClick={() => setForm(null)}>
            Cancel
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="error-inline">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------- Campaigns ----------

function Campaigns({
  data,
  edit,
}: {
  data: ClipFarmData;
  edit: (r: Record<string, unknown>) => void;
}) {
  const ranked = rankCampaigns(data.campaigns);
  const platform = data.campaigns.filter((c) => c.kind === "platform");
  return (
    <>
      <SectionTitle
        eyebrow="Ranked by budget left ÷ active clippers"
        title="Campaigns"
        action={
          <button className="button small" onClick={() => edit(blank.campaigns())}>
            Add campaign
          </button>
        }
      />
      <p className="muted cf-small" style={{ marginBottom: 14 }}>
        Update “budget used” and “active clippers” each morning. A clip posted when a campaign has under 20% left can&apos;t earn its full 7 days.
      </p>
      <div className="cf-list">
        {[...ranked.map((r) => r.campaign), ...platform].map((c) => (
          <button key={c.id} className="card cf-campaign" onClick={() => edit({ ...c, platforms: c.platforms.join(", "), __existing: true })}>
            <CampaignLine c={c} score={c.kind === "platform" ? 0 : ranked.find((r) => r.campaign.id === c.id)?.score ?? 0} data={data} />
            <div className="cf-tags">
              {c.noAi && <span className="badge coral">No AI video</span>}
              {c.opensOn && <span className="badge neutral">Opens {c.opensOn}</span>}
              {c.endsOn && <span className="badge neutral">Ends {c.endsOn}</span>}
              {c.activeClippers != null && <span className="badge neutral">{c.activeClippers} clippers</span>}
              {c.budgetCheckedAt && (
                <span className="badge neutral">Budget checked {new Date(c.budgetCheckedAt).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              )}
            </div>
            {c.rules && <p className="muted cf-small">{c.rules}</p>}
          </button>
        ))}
      </div>
      {!data.campaigns.length && (
        <Empty title="No campaigns yet">Add the campaigns you&apos;ve applied to, with their budget and per-clip terms.</Empty>
      )}
    </>
  );
}

// ---------- Accounts ----------

function Accounts({
  data,
  edit,
}: {
  data: ClipFarmData;
  edit: (r: Record<string, unknown>) => void;
}) {
  return (
    <>
      <SectionTitle
        eyebrow="Kill what doesn't break out, scale what does"
        title="Accounts"
        action={
          <button className="button small" onClick={() => edit(blank.accounts())}>
            Add account
          </button>
        }
      />
      <div className="grid-two">
        {data.accounts.map((a) => (
          <AccountCard key={a.id} a={a} data={data} edit={edit} />
        ))}
      </div>
      {!data.accounts.length && (
        <Empty title="No accounts yet">
          Add each account you signed up for: handle, platform and theme.
        </Empty>
      )}
    </>
  );
}

function AccountCard({
  a,
  data,
  edit,
}: {
  a: ClipAccount;
  data: ClipFarmData;
  edit: (r: Record<string, unknown>) => void;
}) {
  const h = accountHealth(a, data.clips, data.campaigns, projectionK(data));
  const e = payoutEligibility(a);
  const used = postsToday(a, data.clips),
    cap = dailyCap(a);
  return (
    <button className="card cf-account" onClick={() => edit({ ...a, __existing: true })}>
      <div className="card-header">
        <div>
          <span className="eyebrow">
            {PLATFORM_LABEL[a.platform]} · {a.theme || "No theme"}
          </span>
          <h3>{a.handle}</h3>
        </div>
        <span className={`badge ${a.status === "active" ? "success" : a.status === "killed" ? "coral" : "neutral"}`}>
          {a.status}
        </span>
      </div>
      <div className="cf-account-nums">
        <span><strong>{h.posts}</strong><small>posts</small></span>
        <span><strong>{fmtNum(h.median)}</strong><small>median views</small></span>
        <span><strong>{fmtNum(h.best)}</strong><small>best</small></span>
        <span><strong>{fmtUSD(h.earned)}</strong><small>est. net</small></span>
        <span className={used >= cap ? "cf-bad" : ""}>
          <strong>{used}/{cap}</strong>
          <small>posts today</small>
        </span>
      </div>
      <div className="cf-tags">
        {h.killCandidate && <span className="badge coral">Kill or re-theme</span>}
        {h.reachDrop && <span className="badge coral">Reach drop: pause 48 h</span>}
        {h.scale && a.status === "active" && <span className="badge success">Scale: +1 post a day</span>}
      </div>
      {e && (
        <div className="cf-elig">
          <small>
            {e.label}: {fmtNum(e.followers)}/{fmtNum(e.followersNeeded)} followers ·{" "}
            {fmtNum(e.views)}/{fmtNum(e.viewsNeeded)} views in {e.windowDays} days
          </small>
          <div className="progress-track">
            <span style={{ width: `${Math.round(e.pct * 100)}%` }} />
          </div>
          {e.eligible && <span className="badge success">Eligible: apply now</span>}
        </div>
      )}
      {a.notes && <p className="muted cf-small">{a.notes}</p>}
    </button>
  );
}

// ---------- Money ----------

function Money({
  data,
  now,
  edit,
}: {
  data: ClipFarmData;
  now: Date;
  edit: (r: Record<string, unknown>) => void;
}) {
  const m = moneySummary(data, now);
  const byCampaign = data.campaigns
    .filter((c) => c.kind === "cpm")
    .map((c) => {
      const clips = data.clips.filter((x) => x.campaignId === c.id);
      const est = clips.reduce((s, x) => s + estimatedEarnings(x, data.campaigns, projectionK(data)), 0);
      const actual = data.payouts
        .filter((p) => p.campaignId === c.id)
        .reduce((s, p) => s + p.amount, 0);
      return { c, clips: clips.length, est, actual };
    })
    .filter((r) => r.clips || r.actual);
  const order: ClipPayout["status"][] = ["withdrawable", "hold", "pending", "paid"];
  return (
    <>
      <div className="metrics cf-metrics">
        <Metric label="Still earning" value={fmtUSD(m.earning)} />
        <Metric label="In hold (estimated)" value={fmtUSD(m.hold)} />
        <Metric label="Recorded pending" value={fmtUSD(m.pending)} />
        <Metric label="Withdrawable" value={fmtUSD(m.withdrawable)} strong />
        <Metric label="Paid out" value={fmtUSD(m.paid)} />
      </div>
      <p className="muted cf-small" style={{ marginBottom: 18 }}>
        Each clip earns for 7 days after the campaign approves it, then sits in a 3-day hold. These buckets are never added together.
      </p>
      <SectionTitle
        title="Payouts"
        action={
          <button className="button small" onClick={() => edit(blank.payouts())}>
            Add payout
          </button>
        }
      />
      <div className="card table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Amount</th>
              <th>Campaign</th>
              <th>Available</th>
              <th>Paid</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {[...data.payouts]
              .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
              .map((p) => (
                <tr key={p.id} className="cf-click" onClick={() => edit({ ...p, __existing: true })}>
                  <td>
                    <span className={`badge ${p.status === "withdrawable" ? "success" : p.status === "paid" ? "neutral" : "warning"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td>{fmtUSD(p.amount)}</td>
                  <td>{data.campaigns.find((c) => c.id === p.campaignId)?.name ?? p.source}</td>
                  <td>{p.availableOn ?? "—"}</td>
                  <td>{p.paidOn ?? "—"}</td>
                  <td>{p.note ?? "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {!data.payouts.length && <Empty title="No payouts recorded yet" />}
      </div>
      <SectionTitle title="Estimated vs recorded, by campaign" />
      <div className="card table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Clips</th>
              <th>Estimated net</th>
              <th>Recorded payouts</th>
            </tr>
          </thead>
          <tbody>
            {byCampaign.map((r) => (
              <tr key={r.c.id}>
                <td>{r.c.name}</td>
                <td>{r.clips}</td>
                <td>{fmtUSD(r.est)}</td>
                <td>{fmtUSD(r.actual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!byCampaign.length && <Empty title="No campaign earnings yet" />}
      </div>
    </>
  );
}

// ---------- Formats ----------

function Formats({ data, launch }: { data: ClipFarmData; launch: boolean }) {
  const rows = formatLeaderboard(data.clips);
  const projection = fitProjectionK(data);
  const experiments = experimentResults(data);
  const liftOf = (format: string) => {
    const lifts = data.clips
      .filter((c) => (c.format?.trim() || "Untagged") === format)
      .map((c) => clipLift(c, data))
      .filter((x): x is number => x != null)
      .sort((a, b) => a - b);
    if (!lifts.length) return null;
    const m = Math.floor(lifts.length / 2);
    return lifts.length % 2 ? lifts[m] : (lifts[m - 1] + lifts[m]) / 2;
  };
  const rejects = REJECT_REASONS.map((r) => ({
    r,
    n: data.clips.filter((c) => c.rejectReason === r).length,
  })).filter((x) => x.n);
  return (
    <>
      {launch && (
        <p className="notice warning" style={{ marginBottom: 16 }}>
          Launch mode is on: run proven formats and skip experiments this week. Speed matters more than format.
        </p>
      )}
      <SectionTitle eyebrow="Median views, posted clips" title="Which formats win" />
      <p className="muted cf-small" style={{ marginBottom: 14 }}>
        Call a winner only with 10+ clips per format and a median at least 1.3× the other. Drop the bottom formats from the pipeline&apos;s defaults.
      </p>
      <div className="card table-scroll">
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Format</th>
              <th>Clips</th>
              <th>Median views</th>
              <th>Best</th>
              <th title="24h views over the account's usual 24h views">Lift</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.format}>
                <td>
                  {r.format} {r.clips < 10 && <span className="badge neutral">too few to call</span>}
                </td>
                <td>{r.clips}</td>
                <td>{fmtNum(r.median)}</td>
                <td>{fmtNum(r.best)}</td>
                <td>{(() => { const l = liftOf(r.format); return l == null ? "—" : `${l.toFixed(2)}×`; })()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty title="No posted clips yet" />}
      </div>
      <SectionTitle eyebrow="One variable at a time" title="Experiments" />
      <p className="muted cf-small" style={{ marginBottom: 14 }}>
        The pipeline tags clips with an experiment and a variant. Lift compares each clip&apos;s 24h views with its account&apos;s usual, so big and small accounts count the same. A winner needs {EXPERIMENT_RULE.minPerArm}+ clips per arm and {EXPERIMENT_RULE.minLift}× the runner-up; after {EXPERIMENT_RULE.maxDays} days without one it&apos;s a tie.
      </p>
      <div className="cf-list">
        {experiments.map((x) => (
          <div key={x.experiment} className="card">
            <div className="card-header">
              <h3>{x.experiment}</h3>
              <span className={`badge ${x.verdict === "winner" ? "success" : "neutral"}`}>
                {x.verdict === "winner" ? `Winner: ${x.winner}` : x.verdict === "tie" ? "Tie: keep either" : `Running · day ${x.ageDays}`}
              </span>
            </div>
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Variant</th>
                  <th>Clips</th>
                  <th>Median lift</th>
                </tr>
              </thead>
              <tbody>
                {x.arms.map((arm) => (
                  <tr key={arm.variant}>
                    <td>{arm.variant}</td>
                    <td>
                      {arm.clips}
                      {arm.clips < EXPERIMENT_RULE.minPerArm && <span className="muted"> / {EXPERIMENT_RULE.minPerArm}</span>}
                    </td>
                    <td>{arm.medianLift.toFixed(2)}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {!experiments.length && (
          <Empty title="No experiments yet">
            When the pipeline sends clips with an experiment and variant (for example “First frame”: Facecam vs Gameplay), results show here.
          </Empty>
        )}
      </div>
      <p className="muted cf-small" style={{ marginTop: 14 }}>
        Day-7 projection: 24h views × {projection.k}
        {projection.fitted
          ? `, fitted from your last ${projection.n} clips.`
          : ` (default). It refits from your own clips once ${REFIT_MIN_CLIPS} have day-7 numbers (${projection.n} so far).`}
        {!data.historyReady && !data.demo && " Run migration 0012 to start keeping stats history."}
      </p>
      {rejects.length > 0 && (
        <>
          <SectionTitle title="Why you rejected clips" />
          <div className="cf-tags">
            {rejects.map((x) => (
              <span key={x.r} className="badge neutral">
                {x.r}: {x.n}
              </span>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ---------- Forms ----------

const newId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;

const blank = {
  campaigns: () => ({
    id: newId("cmp"),
    name: "",
    source: "Content Rewards",
    kind: "cpm",
    status: "applied",
    feePct: 10,
    earnDays: 7,
    holdDays: 3,
    platforms: "tiktok, instagram, youtube",
    sortOrder: 0,
  }),
  accounts: () => ({
    id: newId("acc"),
    handle: "@",
    platform: "tiktok",
    theme: "",
    status: "warming",
    sortOrder: 0,
  }),
  payouts: () => ({
    id: newId("pay"),
    source: "Content Rewards",
    status: "pending",
    amount: null,
  }),
};

const titles = {
  campaigns: (r: Record<string, unknown>) => (r.__existing ? `Edit ${r.name}` : "Add a campaign"),
  accounts: (r: Record<string, unknown>) => (r.__existing ? `Edit ${r.handle}` : "Add an account"),
  payouts: (r: Record<string, unknown>) => (r.__existing ? "Edit payout" : "Add a payout"),
};

function formFields(entity: "campaigns" | "accounts" | "payouts", data: ClipFarmData): Field[] {
  if (entity === "campaigns")
    return [
      { key: "name", label: "Name", required: true },
      { key: "source", label: "Where it runs", hint: "Content Rewards, Whop…" },
      { key: "kind", label: "Kind", required: true, options: [
        { value: "cpm", label: "Pay per 1K views" },
        { value: "pool", label: "Prize pool" },
        { value: "platform", label: "Platform payout (TikTok, YouTube)" },
      ] },
      { key: "status", label: "Status", required: true, options: opts(["watching", "applied", "active", "paused", "ended"]) },
      { key: "cpm", label: "$ per 1,000 views", type: "number" },
      { key: "feePct", label: "Platform fee %", type: "number", max: 100 },
      { key: "minPayout", label: "Per-clip minimum $", type: "number" },
      { key: "maxPayout", label: "Per-clip cap $", type: "number" },
      { key: "budgetTotal", label: "Total budget $", type: "number" },
      { key: "budgetUsed", label: "Budget used $", type: "number", hint: "Update each morning" },
      { key: "activeClippers", label: "Active clippers", type: "number" },
      { key: "poolViewsRequired", label: "Pool: views to qualify", type: "number" },
      { key: "platforms", label: "Platforms it pays", hint: `Comma-separated: ${PLATFORMS.join(", ")}` },
      { key: "url", label: "Campaign link", type: "url" },
      { key: "opensOn", label: "Opens", type: "date" },
      { key: "endsOn", label: "Ends", type: "date" },
      { key: "earnDays", label: "Days a clip earns", type: "number" },
      { key: "holdDays", label: "Hold days", type: "number" },
      { key: "noAi", label: "Bans AI video or voice", type: "checkbox" },
      { key: "rules", label: "Rules for the checker", type: "textarea" },
    ];
  if (entity === "accounts")
    return [
      { key: "handle", label: "Handle", required: true },
      { key: "platform", label: "Platform", required: true, options: PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABEL[p] })) },
      { key: "theme", label: "Theme", hint: "e.g. Streamer moments, Chaos + physics (original)" },
      { key: "status", label: "Status", required: true, options: opts(["warming", "active", "paused", "killed"]) },
      { key: "followers", label: "Followers / subscribers", type: "number" },
      { key: "views30d", label: "Views, last 30 days", type: "number", hint: "TikTok payout check" },
      { key: "views90d", label: "Views, last 90 days", type: "number", hint: "YouTube payout check" },
      { key: "dailyCap", label: "Posts per day cap", type: "number", hint: "Blank uses the default: TikTok 4, Instagram 3, YouTube 3, X 6" },
      { key: "url", label: "Profile link", type: "url" },
      { key: "notes", label: "Notes", type: "textarea" },
    ];
  return [
    { key: "amount", label: "Amount $ (net)", type: "number", required: true },
    { key: "status", label: "Status", required: true, options: opts(["pending", "hold", "withdrawable", "paid"]) },
    { key: "campaignId", label: "Campaign", options: data.campaigns.map((c) => ({ value: c.id, label: c.name })) },
    { key: "source", label: "Source" },
    { key: "availableOn", label: "Withdrawable on", type: "date" },
    { key: "paidOn", label: "Paid on", type: "date" },
    { key: "note", label: "Note", type: "textarea" },
  ];
}

