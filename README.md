# Personal Portal

Evan's private, single-user home base: trips with their bookings, points
balances, watched deadlines, and links to his projects and ledgers. Built in
his usual stack: Next.js (App Router) + Supabase (Postgres with row-level
security) + TypeScript + Tailwind.

## Pages

| Route         | What it shows                                                        |
| ------------- | -------------------------------------------------------------------- |
| `/`           | Dashboard: next trip with bookings and net costs, points summary, next 5 deadlines, quick links |
| `/trips`      | All trips with status chips (booked, researching, planning)          |
| `/trips/[slug]` | Trip detail with a bookings table: provider, confirmations, dates, paid vs net cost, free-cancellation deadlines |
| `/points`     | Points balances by program with as-of dates, plus Amex Gold credit trackers ($10/mo dining, $7/mo Dunkin) and the Platinum Resy credit |
| `/deadlines`  | Watched deadlines table with due dates, countdowns, and status       |
| `/links`      | Project cards (Pastefront, AgentDesk, portfolio and private projects) |
| `/login`      | Email magic-link sign-in (Supabase Auth)                             |

## Run locally

```bash
npm install
npm run dev
```

### Demo mode (no backend)

With no Supabase env vars, the app runs on the bundled seed data in
`src/lib/seed.ts` (the same dataset as `supabase/seed.sql`), skips auth, and
shows a "Demo data" badge in the header. Demo mode is on when either:

- you are running the dev server (`npm run dev`), or
- `NEXT_PUBLIC_PORTAL_DEMO=1` is set.

This is a data-layer fallback for local development only. A production build
without Supabase env vars and without the demo flag renders a configuration
warning instead of content; it never serves the portal unauthenticated in
production.

### Live mode

Create `.env.local` (see `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

With those set, data comes from Supabase and every route except `/login` and
`/auth/callback` is protected by magic-link auth (see `src/proxy.ts`).

## Provisioning checklist (Evan)

1. **Create a Supabase project** at supabase.com (free tier is fine). Note the
   project URL and anon key from Settings > API.
2. **Run the migration**: paste `supabase/migrations/0001_init.sql` into the
   SQL editor and run it. This creates `trips`, `bookings`, `deadlines`,
   `points_balances`, and `links`, all with RLS enabled and single-user
   owner policies (`auth.uid() = user_id`).
3. **Seed your data**: sign in once via the portal's magic link, find your
   user id under Authentication > Users, replace the placeholder uuid in
   `supabase/seed.sql`, and run it in the SQL editor.
4. **Create a GitHub repo and push** (the Muse connector cannot create
   repos, so this step is manual):
   ```bash
   git init && git add -A && git commit -m "Personal portal v1"
   git remote add origin git@github.com:evanshattenkirk/personal-portal.git
   git push -u origin main
   ```
5. **Deploy on Vercel**: import the repo, set the env vars
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (leave
   `NEXT_PUBLIC_PORTAL_DEMO` unset), and deploy. Then add the Vercel domain
   to Supabase Auth > URL Configuration (Site URL and redirect URLs) so magic
   links land on the right host.

No secrets live in this repo. The anon key is safe to expose in the browser
because every table is locked down with RLS owner policies; there is no
service-role key anywhere in the codebase.

## Layout

- `src/lib/types.ts` and `src/lib/seed.ts`: data model and bundled seed data
- `src/lib/data.ts`: mode detection and queries (Supabase live, seed fallback)
- `src/lib/supabase/`: browser and server clients (`@supabase/ssr`)
- `src/proxy.ts`: session refresh and route protection (Next.js 16 proxy,
  formerly middleware)
- `supabase/migrations/0001_init.sql`, `supabase/seed.sql`: schema and seed
