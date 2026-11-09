# Trip assistant guide (for Claude, Muse, Duet, or any other AI)

Evan plans trips in this portal. Each trip has a **Brainstorm & notes** tab
where he writes notes for his AI, attaches screenshots, and fills in a short
brief of what the trip should feel like. This guide explains how an assistant
reads those notes, replies, and suggests changes.

**The one rule:** you never change Evan's plan directly. You reply in the trip
chat, and anything that would change the plan goes in a **proposal**. Evan
confirms or rejects it in the portal. Nothing in a proposal is saved until he
confirms. You never book, buy, cancel, or record a reservation.

## Connecting

The portal exposes two endpoints. Both need the shared token:

```
Authorization: Bearer $PORTAL_AGENT_TOKEN
```

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/agent/inbox` | Every active trip with its brief, open notes (with screenshot links), recent conversation, proposals, ideas, itinerary and bookings, plus the points and credits wallet. |
| GET | `/api/agent/screenshot?path=…` | One screenshot from a note. The inbox gives each screenshot's `url` as this path. |
| POST | `/api/agent/post` | Your chat replies, your proposals, and which of Evan's notes you handled. |

Base URL: `https://personal-portal-blond.vercel.app`. Screenshot `url`s in the
inbox are relative: prefix the base URL and send the same token.

If you can't reach the portal over HTTPS but you do have the portal's Supabase
project connected, you can read and write the same tables directly (see
"Tables" below). Write with the owner's `user_id`, and follow the same rules.

## Instant replies in the portal

When `ANTHROPIC_API_KEY` is set in Vercel, the portal replies to a note as soon
as Evan sends it (`src/lib/assistant.ts`), as author `claude` with source
`portal-chat` or `portal-research`. Everyday replies use Claude Haiku 5.5 with
thinking off. A note that asks for prices, events or deals, or a tap on
**Look it up**, goes to Claude Sonnet 5.5 with up to 4 web searches. Replies go
through the same `agentPost` checks as the API below, and there's a daily cap
(`ASSISTANT_DAILY_CAP`, default 60). Override models with
`ASSISTANT_CHAT_MODEL` / `ASSISTANT_RESEARCH_MODEL`.

The daily check below still runs and picks up any note left open, so
assistants should skip notes that already have a reply after them in
`recentConversation`.

## The daily check (notes)

Run once a day.

1. `GET /api/agent/inbox`.
2. For each trip, read `openNotes` (oldest first) and `recentConversation`.
   Open notes of kind `ask_ai` are requests. Kind `preference` is something to
   remember, not a task. Kind `note` is context. Look at every screenshot.
3. Reply in the trip chat like a helpful friend who did the homework: short,
   specific, with prices, dates and links where you have them. Answer each
   request and say which note it answers.
4. If something should change in the plan (new ideas, a different date, a task,
   an itinerary item), put it in a proposal with `changes` (format below).
5. Send everything in one `POST /api/agent/post`, and list the notes you fully
   answered in `handledNoteIds`. Leave a note open if you need something from
   Evan, and ask him in your reply.
6. If there's nothing new, post nothing. Don't send "no updates" messages.

### Avoiding duplicates

Before you propose anything, check the trip's `proposals` (pending ones are
still waiting on Evan) and `ideas`. Don't propose an idea the trip already
has: update the existing one instead (`op: "update"` with its `id`).

When Evan narrows down one of your pending proposals (say he picks one of two
dates), post the narrower proposal and withdraw the old one in the same
request with `withdrawProposalIds`. Don't leave both for him to sort out.

The API also guards against this. A proposal whose title matches one already
pending on the same trip is skipped. An idea whose title is already on the
trip is dropped from the proposal, both when you post it and again when Evan
confirms it. Anything skipped comes back in the response's `skipped` list.

Also read proposals that came back `rejected` with `feedback` since your last
run. Feedback also arrives as a new `ask_ai` note on that trip. Treat it as a
request to rework the idea.

## The weekly check (events, deals, bonuses, price drops)

Run once a week, for trips that aren't completed.

- **Events**: concerts, festivals, food events, games or shows at each trip's
  destination during its dates (or its `brief.window` if dates aren't set).
  Fit the brief: Evan likes food, drinks, live music, having fun, and exploring.
  He doesn't want hiking or skiing. Use `kind: "event"`.
- **Price drops**: for each booking, compare today's price to `costPaid`. Only
  propose if the drop is real, the booking is still cancellable (`cancelBy`,
  `cancelAt`), and the saving beats any fee. Say exactly how to rebook or reprice.
  Use `kind: "price_drop"`. You can't change a booking: explain what Evan should
  do, and add a task if it helps.
- **Deals**: fares, packages, cruise or all-inclusive sales that fit an open
  trip's brief. Use `kind: "deal"`.
- **Bonuses**: transfer bonuses, airline or hotel promos, and card offers that
  matter for the programs in `wallet.points` and `wallet.credits`. These aren't
  tied to one trip, so use `tripSlug: null` and `kind: "bonus"`.

Always include a `url` to the source and the date you checked. If a price is an
estimate, say so. Don't repeat a find that's already in `proposals`.

## POST body

```json
{
  "author": "claude",
  "source": "daily-check",
  "messages": [
    { "tripSlug": "family-trip", "body": "Re #1: here are three cruises that fit…" }
  ],
  "proposals": [
    {
      "tripSlug": "family-trip",
      "kind": "idea",
      "title": "Three cruise options for mid April",
      "body": "Why these fit, what each costs, and what to watch for.",
      "url": "https://example.com/source",
      "changes": [
        {
          "op": "create",
          "entity": "suggestions",
          "record": {
            "title": "Carnival 4-night Bahamas from Miami",
            "category": "stay",
            "subtitle": "Apr 15-19 · Nassau + Half Moon Cay",
            "priceLabel": "~$650 per person",
            "tags": "Cruise",
            "detail": "Why it fits, inclusions, booking notes",
            "url": "https://example.com"
          }
        }
      ]
    },
    {
      "tripSlug": null,
      "kind": "bonus",
      "title": "30% Amex to Virgin transfer bonus through Dec 1",
      "body": "Matters because…",
      "url": "https://example.com"
    }
  ],
  "handledNoteIds": ["<id of a note you answered>"],
  "withdrawProposalIds": ["<id of your own pending proposal this replaces>"]
}
```

- `author`: your name in lowercase (`claude`, `muse`, `duet`). It shows in the chat.
- `source`: `daily-check`, `weekly-check`, or anything short that says why you ran.
- `messages`: chat replies, max 40 per request, 8,000 characters each.
- `proposals`: max 40 per request. `kind` is one of `plan_change`, `idea`,
  `event`, `deal`, `price_drop`, `bonus`, `info`. `changes` is optional; a
  proposal without changes is a heads-up Evan can acknowledge.
- `withdrawProposalIds`: max 40. Deletes proposals that an assistant wrote
  and Evan hasn't decided yet. Accepted or rejected ones, and anything Evan
  wrote, are left alone. Use it when a new proposal replaces an old one, or
  when Evan asks you to remove one.
- The response lists `withdrawnProposalIds` and `skipped` (duplicates that
  weren't saved, with the reason).
- The request is checked as a whole: if anything is invalid, nothing is saved
  and the error says which item failed.

### Proposal changes

Each change is either a create or a partial update:

```json
{ "op": "create", "entity": "itinerary", "record": { "date": "2027-04-16", "time": "19:30", "title": "Dinner at …", "location": "…" } }
{ "op": "update", "entity": "trips", "id": "<trip id>", "patch": { "startDate": "2027-04-15", "endDate": "2027-04-19", "dateLabel": "Apr 15-19, 2027" } }
```

| Entity | Allowed | Notes |
| --- | --- | --- |
| `trips` | update | Never change `slug`. |
| `briefs` | create, update | One per trip, id `brief-<tripSlug>`. |
| `suggestions` | create, update | Ideas. `category`: stay, flight, food, activity, planning. Can't be marked booked. |
| `scenarios` | create, update | Options to compare (destination + dates + estimates). |
| `itinerary` | create, update | `date` YYYY-MM-DD, `time` HH:MM local. |
| `tasks` | create, update | To-dos for Evan. |
| `deadlines` | create, update | Real deadlines, like a cancellation cutoff. |

Bookings, points and credits can't be changed by a proposal. Field names are
the camelCase names in `src/lib/types.ts`. A created record's `tripSlug`
defaults to the proposal's trip and its `id` is generated for you. Every
change goes through the same validation as an edit Evan makes, and if any
change fails, none of them are saved.

## Tables

For assistants working directly in Supabase (snake_case columns, all with `user_id`):

- `trip_notes`: `id, trip_slug, body, kind (note|ask_ai|preference), status (open|done), ai_reply, created_at, author ('evan' or the assistant), attachments (newline-separated paths in the private trip-notes bucket), source`. Assistant replies are rows with your `author` and `status = 'open'` (unread).
- `trip_proposals`: `id, trip_slug (nullable), title, body, kind, changes (JSON text), status (pending|accepted|rejected), author, url, created_at, decided_at, feedback`. Insert with `status = 'pending'`.
- `trip_briefs`: `trip_slug, window, nights, styles, vibes, avoid, budget, origin, who, must_haves`.
- Context: `trips`, `trip_suggestions`, `trip_scenarios`, `itinerary_items`, `bookings`, `points_balances`, `credit_periods`.

## Setup (for Evan)

Set these in Vercel (Project → Settings → Environment Variables, Production), then redeploy:

- `PORTAL_AGENT_TOKEN`: a long random string (at least 32 characters). Give it only to assistants you trust. Changing it cuts them all off.
- `SUPABASE_SERVICE_ROLE_KEY`: from Supabase → Project Settings → API. Server-only; never put it in a `NEXT_PUBLIC_` variable.
- Optional `PORTAL_OWNER_USER_ID`: your Supabase user id, to skip looking it up by email.

Run `supabase/migrations/0007_trip_brainstorm.sql` and `0008_trip_assistant.sql` first.
