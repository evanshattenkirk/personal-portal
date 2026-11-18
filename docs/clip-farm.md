# Clip Farm (/clips)

A private dashboard for the clipping business: review queue, campaign ranking,
account health and payout timeline. The full spec lives in Evan's Claude Doc
"Clip Farm Dashboard Spec". This file is the technical guide.

## Setup

1. Run `supabase/migrations/0011_clip_farm.sql` in the Supabase SQL editor.
   Until it runs, `/clips` shows a notice and the rest of the portal is unaffected.
2. The pipeline API reuses `PORTAL_AGENT_TOKEN` and `SUPABASE_SERVICE_ROLE_KEY`
   (already set if the trip assistant works).

## Code map

- `src/lib/clipfarm.ts`: pure money math, guards and alerts (unit tested in
  `tests/clipfarm.test.ts`). The review card and the server both call
  `clipFlags`, so they agree on what blocks an approval.
- `src/lib/clipfarm-records.ts`: field lists, validation, row mapping, and what
  the pipeline may change (`mergePipelineClip`, `mergePipelineAccount`).
- `src/app/clip-actions.ts`: signed-in server actions. `reviewClip` re-checks
  the guards on fresh data before approving.
- `src/lib/clipfarm-agent.ts` + `src/app/api/agent/clips/route.ts`: the
  pipeline's API.
- `src/components/ClipFarm.tsx`: the page. Demo mode uses fictional fixtures
  from `src/lib/clipfarm-demo.ts`.

## Pipeline API

Every request needs `Authorization: Bearer $PORTAL_AGENT_TOKEN`.

### GET /api/agent/clips

Returns:

- `campaigns`: active or applied campaigns, best first, with `score`
  (budget left per active clipper). Cut for these.
- `accounts`: accounts that aren't killed.
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
      "fingerprint": "phash:…"
    },
    { "id": "c-20261118-0090", "status": "posted", "postUrl": "https://www.tiktok.com/@…/video/…" },
    { "postUrl": "https://www.tiktok.com/@…/video/…", "views": 18400, "views24h": 9100, "likes": 900 }
  ],
  "accounts": [{ "id": "acc-tt-moments", "followers": 2140, "views30d": 88000 }]
}
```

Rules, enforced on the server:

- A new clip always lands in review. The pipeline can't approve, reject or
  submit, or change the campaign's review of a clip.
- `"status": "posted"` works only on a clip Evan approved, and needs `postUrl`.
- A clip can be matched by `id` or by `postUrl` (handy for stats updates).
- Accounts: only `followers`, `views30d`, `views90d` and `statsAsOf` change.
- Up to 100 clips and 50 accounts per request; everything is validated before
  anything is written.

Stats come from Upload-Post's analytics endpoints (`/api/uploadposts/history`
for post URLs, `/post-analytics` for views). Content Rewards has no API, so
Evan records campaign approvals and payouts on the page.
