# Clip Farm (/clips)

A private dashboard for the clipping business: review queue, campaign ranking,
account health and payout timeline. The full spec lives in Evan's Claude Doc
"Clip Farm Dashboard Spec". This file is the technical guide.

## Setup

1. Run `supabase/migrations/0011_clip_farm.sql` in the Supabase SQL editor.
   Until it runs, `/clips` shows a notice and the rest of the portal is unaffected.
2. Run `supabase/migrations/0012_clip_farm_history.sql` (v1.1). It adds stats
   history, experiments, posting caps and the private `clip-previews` bucket.
   Before it runs, `/clips` still works and simply shows no runway, pace or
   refit numbers, and saves skip the new fields.
3. Add `CLIPFARM_AGENT_TOKEN` (32+ characters) in Vercel for the clipping
   pipeline. The clip routes also accept `PORTAL_AGENT_TOKEN`, but a separate
   token lets you revoke the pipeline without breaking the trip assistant.
   `SUPABASE_SERVICE_ROLE_KEY` must be set (it already is if the trip assistant works).

## Code map

- `src/lib/clipfarm.ts`: pure money math, guards and alerts (unit tested in
  `tests/clipfarm.test.ts`). The review card and the server both call
  `clipFlags`, so they agree on what blocks an approval.
- `src/lib/clipfarm-records.ts`: field lists, validation, row mapping, and what
  the pipeline may change (`mergePipelineClip`, `mergePipelineAccount`).
- `src/app/clip-actions.ts`: signed-in server actions. `reviewClip` re-checks
  the guards on fresh data before approving.
- `src/lib/clipfarm-history.ts`: snapshot reads and writes, and the fallback
  that keeps saves working before migration 0012.
- `src/lib/clipfarm-agent.ts` + `src/app/api/agent/clips/route.ts` and
  `.../clips/upload/route.ts`: the pipeline's API.
- `src/app/api/clips/preview/[file]/route.ts`: plays a preview for the
  signed-in owner by redirecting to a 30-minute signed URL.
- `src/components/ClipFarm.tsx`: the page. Demo mode uses fictional fixtures
  from `src/lib/clipfarm-demo.ts`.

## Pipeline API

Every request needs `Authorization: Bearer $CLIPFARM_AGENT_TOKEN` (or `$PORTAL_AGENT_TOKEN`).

### GET /api/agent/clips

Returns:

- `campaigns`: active or applied campaigns, best first, with `score`
  (budget left per active clipper). Cut for these.
- `campaigns[].burnPerDay` / `runwayDays`: budget burn from the last 48 h of
  budget checks. Skip campaigns about to run dry.
- `accounts`: accounts that aren't killed, with `dailyCap` (Evan's setting or
  the platform default: TikTok 4, Instagram 3, YouTube 3, Facebook 3, X 6) and
  `postsToday` (posted today in Chicago plus approved and waiting). Don't
  queue a clip for an account at its cap.
- `projectionK`, `projectionFitted`: day-7 views ≈ views24h × projectionK. It
  starts at 2.5 and refits from Evan's own clips once 30 have day-7 numbers.
- `toPost`: clips Evan approved. Post each one, then mark it posted.
- `toTrack`: live posts to refresh stats for.
- `usedFingerprints`: never cut a moment that matches one of these.
- `recentRejections`: Evan's reasons ("Weak hook", "Breaks a rule",
  "Duplicate", "Stale moment", "Low payout"). Learn from them.
- `formatLeaderboard`: median views per format.

### POST /api/agent/clips

```json
{
  "clips": [
    {
      "id": "c-20261119-0142",
      "title": "Streamer loses it at the first police chase",
      "hook": "He did NOT expect the cops to do this",
      "format": "Reaction first",
      "campaignId": "tomo",
      "accountId": "acc-tt-moments",
      "verdict": "pass",
      "checkNotes": "Ad label set. Facecam on top.",
      "sourceUrl": "https://…/vod",
      "sourceAt": "01:12:40",
      "previewUrl": "https://…/cut.mp4",
      "durationSec": 34,
      "caption": "#ad …",
      "fingerprint": "phash:…",
      "experiment": "First frame",
      "variant": "Facecam"
    },
    { "id": "c-20261118-0090", "status": "posted", "postUrl": "https://www.tiktok.com/@…/video/…" },
    { "postUrl": "https://www.tiktok.com/@…/video/…", "views": 18400, "views24h": 9100, "likes": 900 }
  ],
  "accounts": [{ "id": "acc-tt-moments", "followers": 2140, "views30d": 88000 }],
  "campaigns": [
    { "id": "cr-streamer-b", "name": "Streamer B highlights", "url": "https://…", "cpm": 1, "minPayout": 10, "maxPayout": 100, "budgetTotal": 1000, "budgetUsed": 0, "activeClippers": 4, "platforms": ["tiktok", "youtube"], "rules": "…" },
    { "id": "tomo", "budgetUsed": 840, "activeClippers": 22 }
  ]
}
```

Rules, enforced on the server:

- A new clip always lands in review. The pipeline can't approve, reject or
  submit, or change the campaign's review of a clip.
- `"status": "posted"` works only on a clip Evan approved, and needs `postUrl`.
- A clip can be matched by `id` or by `postUrl` (handy for stats updates).
- Accounts: only `followers`, `views30d`, `views90d` and `statsAsOf` change.
- Campaigns (from the morning scout): a new one is always created as
  `watching`; Evan moves it to applied or active. On an existing campaign
  (matched by `id`, or by `url`) only `budgetUsed`, `budgetTotal`,
  `activeClippers`, `budgetCheckedAt`, `endsOn`, `platforms` and `rules`
  change. `budgetCheckedAt` defaults to now when a budget field is sent.
  Campaigns are saved first, so clips in the same request can use a new one.
- `experiment` and `variant` tag a clip for a format test, one variable at a
  time. The Formats tab calls a winner at 10+ clips per arm and 1.3× lift
  (24h views over the account's usual), or a tie after 14 days.
- Each change to a live clip's `views` and each change to a campaign's
  `budgetUsed` or `activeClippers` is kept as a snapshot. Snapshots feed the
  day-7 refit, runway and pool pace, so send stats at least daily, ideally
  around 24 h and 7 days after posting.
- Up to 100 clips, 50 accounts and 50 campaigns per request; everything is
  validated before anything is written.

### POST /api/agent/clips/upload

Hosts a preview so the review card plays it on Evan's phone.

```json
{ "clipId": "c-20261119-0142", "contentType": "video/mp4", "bytes": 18234567 }
```

Returns `{ uploadUrl, uploadMethod: "PUT", uploadHeaders, previewUrl }`. PUT the
MP4 to `uploadUrl` with `uploadHeaders`, then send `previewUrl` on the clip
through POST /api/agent/clips. The clip must already exist (queue it first).
Files are at most 50 MB (Supabase's default upload limit), live in the private `clip-previews` bucket, and play
only for the signed-in owner. Uploading again replaces the file. Previews of
rejected, archived or deleted clips are removed once the file is 7 days old
(checked on each upload).

Stats come from Upload-Post's analytics endpoints (`/api/uploadposts/history`
for post URLs, `/post-analytics` for views). Content Rewards has no API, so
Evan records campaign approvals and payouts on the page.
