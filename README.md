# Evan’s Fieldbook

A private personal portal for travel decisions, reservations, daily plans, points, credits, deadlines, and resources. Existing URLs are preserved on Next.js + Supabase + Vercel.

## Development

```sh
npm ci
npm run dev
npm test
npm run build
```

Node 22.6+ is required for the dependency-free TypeScript test runner. Without Supabase variables, development uses an explicitly labeled demo that saves to this browser’s local storage. Production never silently falls back to sample data. `NEXT_PUBLIC_PORTAL_DEMO=1` enables an intentional deployed demo only when Supabase is absent.

Live mode uses the existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Authentication and owner row-level security remain enabled. Do not use a service-role key in the frontend.

## Database rollout

Apply migrations in order. For an existing v1 portal, apply `0004_ledgers_tasks.sql` and then `0005_fieldbook.sql` **before** deploying the new frontend. They are additive and preserve existing bookings and research. The new tables are `portal_tasks`, `trip_scenarios`, `itinerary_items`, and `credit_periods`, with owner-only RLS. Migration 0005 adds explicit states; personal scenario content stays in the database. Existing bookings default to `needs_review`; no reservation is automatically confirmed.

## What works

- Home prioritizes the next active trip by date, shared tasks, deadlines, and pinned resources.
- Trips support creating/editing plans, comparing scenarios, selecting a direction, shortlisting research, and preserving dismissed or ruled-out options.
- A native itinerary supports local destination times, map links, reversible removal, calendar export, and printing. Calendar times are floating; check the intended timezone in the calendar app.
- Reservations store references, verification dates, cancellation terms and exact cutoff timestamps, cash, points, and credits. Confirmation requires both a reference and a verification date. The portal records provider transactions; it does not make bookings or cancellations.
- Tasks and deadlines support completion, reopening, waiting, and reminder snoozing. Snoozing never changes the original deadline or hides a cancellation cutoff.
- Wallet balances stay separate by program/owner, with freshness and trip allocation. Credits track each period’s allowance, submitted usage, pending amount, and posted credit.
- Library supports search, categories, pins, private web destinations, and local access instructions. Local paths are copyable references, not browser-accessible file links.

## Architecture

`src/lib/types.ts` defines records; `records.ts` validates and maps explicit allowed fields; `model.ts` contains pure date/status/money logic. `data.ts` reads authenticated Supabase data and surfaces errors. Server actions independently authenticate, check related record ownership, and persist with RLS. `PortalProvider` keeps all views consistent after successful writes, while demo mode writes only to namespaced local storage. Existing content remains in its original database tables. No email, travel provider, or credit account integrations are fabricated.

The route group `(portal)` loads one authenticated snapshot under Suspense, required by this version’s Cache Components. The root login shell does not fetch private data. CSS is plain and responsive, with native dialog forms, keyboard focus, reduced-motion support, and print styles.

## Verification

`npm test` covers Chicago midnight/DST dates, truthful booking states, pending versus posted credits, chronological trips, input validation, and calendar escaping. `npm run build` includes TypeScript and Next.js prerender validation. Browser QA should additionally cover live save/reload persistence, shortlist changes, modal validation, itinerary restoration, and a narrow viewport.

Destination cover photographs are bundled from Unsplash (`photo-1507525428034-b723cf961d3e`, `photo-1438401171849-74ac270044ee`, `photo-1470770841072-f978cf4d019e`) as mood imagery rather than photographs of a booked property.

## Public code and the latest portal additions

Real trips, balances, confirmations, and deadlines live only in Supabase. All bundled demo records are fictional. The login form has `shouldCreateUser: false`; preserve disabled signups in Supabase Auth. Set the server-only `PORTAL_OWNER_EMAIL` allowlist. The proxy, data loader, and every write action enforce it when configured. Authentication callbacks only accept safe same-origin redirects.

The existing Ledgers (`/ledgers`) and Linear-backed Your List (`/todo`) are retained. These are read-only mirrors of their existing sources; the redesign never marks a Linear issue completed locally. Your own trip actions are separate records, shown alongside this work on Home. Ledger totals remain the recorded reconciled figures, without assuming that itemized entries are complete.

For an existing portal with `0004_ledgers_tasks.sql`, the next schema migration is `0005_fieldbook.sql`. Backfill of private planning content, if needed, belongs in the authenticated database rather than a public migration or fixture.

The optional server-only `TREK_URL` setting from the TREK-link branch is preserved. It adds an HTTPS link inside the authenticated Trips page without publishing the private hostname in source. The native itinerary and external TREK instance are not automatically synchronized.
