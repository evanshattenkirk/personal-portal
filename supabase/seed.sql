-- Personal Portal: seed data (mirrors src/lib/seed.ts).
--
-- HOW TO USE
-- 1. Sign in to the portal once with your magic link so your auth user exists.
-- 2. Find your user id in Supabase: Authentication > Users (or run
--    `select id, email from auth.users;`).
-- 3. Replace the placeholder below with your uuid, then run this file in the
--    SQL editor. Inserts are upserts, so re-running is safe.

-- << SET YOUR USER ID HERE: replace 00000000-0000-0000-0000-000000000000 >>
-- \set user_id '00000000-0000-0000-0000-000000000000'  (psql only; for the SQL
-- editor, just find-and-replace the placeholder string.)

insert into public.trips (id, user_id, slug, name, destination, start_date, end_date, date_label, status, travelers, notes, sort_order) values
  ('trip-seattle', '00000000-0000-0000-0000-000000000000', 'seattle', 'Seattle', 'Seattle, WA', '2027-03-19', '2027-03-22', 'Mar 19 to 22, 2027', 'booked', 2,
   'Two hotel stays stacked: two nights at the Palladian on the Chase side, then one night at Lotte on the Amex FHR credit. Flights still to book.', 1),
  ('trip-cancun', '00000000-0000-0000-0000-000000000000', 'cancun', 'Cancun', 'Cancun, Mexico', '2026-12-10', '2026-12-13', 'Dec 10 to 13, 2026', 'researching', 2,
   'Lead option: Secrets Mirabel, 80,000 Hyatt points total for 3 nights. Do not transfer points until award space is re-confirmed.', 2),
  ('trip-family', '00000000-0000-0000-0000-000000000000', 'family-trip', 'Family trip', 'TBD', null, null, 'Late Mar to Apr 2027', 'planning', 6,
   '6 people. Comparing cruises, all-inclusives, and staffed villas. Budget around $500 per person per night.', 3)
on conflict (id) do update set
  slug = excluded.slug, name = excluded.name, destination = excluded.destination,
  start_date = excluded.start_date, end_date = excluded.end_date,
  date_label = excluded.date_label, status = excluded.status,
  travelers = excluded.travelers, notes = excluded.notes,
  sort_order = excluded.sort_order;

insert into public.bookings (id, user_id, trip_slug, kind, name, provider, start_date, end_date, details, confirmation, secondary_ref, cost_paid, cost_net, cost_note, points_cost, points_program, cancel_by, notes, sort_order) values
  ('booking-palladian', '00000000-0000-0000-0000-000000000000', 'seattle', 'hotel', 'Kimpton Palladian', 'Chase Travel', '2027-03-19', '2027-03-21',
   '1 King Spa, 2 guests', 'Chase Travel Trip ID 1031707324', 'Stay ref 45357130-', 760, 260, 'Net after $500 in credits post', null, null,
   'Mar 17, 2027, 12:00 am', null, 1),
  ('booking-lotte', '00000000-0000-0000-0000-000000000000', 'seattle', 'hotel', 'Lotte Hotel Seattle', 'Amex Travel (FHR)', '2027-03-21', '2027-03-22',
   'Superior Room, 1 King, Bay View, 2 guests', 'Amex Travel trip ZO-AX1096-65735', 'Hotel conf 9106155895650', 396.49, 96.49, 'Net after the $300 FHR credit posts', null, null,
   'Mar 20, 2027, 4:00 pm PT', 'Perks: $100 food and beverage credit, breakfast for two, guaranteed 4pm checkout.', 2)
on conflict (id) do update set
  trip_slug = excluded.trip_slug, kind = excluded.kind, name = excluded.name,
  provider = excluded.provider, start_date = excluded.start_date,
  end_date = excluded.end_date, details = excluded.details,
  confirmation = excluded.confirmation, secondary_ref = excluded.secondary_ref,
  cost_paid = excluded.cost_paid, cost_net = excluded.cost_net,
  cost_note = excluded.cost_note, points_cost = excluded.points_cost,
  points_program = excluded.points_program, cancel_by = excluded.cancel_by,
  notes = excluded.notes, sort_order = excluded.sort_order;

insert into public.points_balances (id, user_id, program, balance, owner, approximate, as_of, sort_order) values
  ('points-avios', '00000000-0000-0000-0000-000000000000', 'British Airways Avios', 143000, 'Evan', false, '2026-10-06', 1),
  ('points-aa', '00000000-0000-0000-0000-000000000000', 'American AAdvantage', 90000, 'Jessica', true, '2026-10-06', 2),
  ('points-amex', '00000000-0000-0000-0000-000000000000', 'Amex Membership Rewards', 55000, 'Evan', true, '2026-10-06', 3),
  ('points-chase', '00000000-0000-0000-0000-000000000000', 'Chase Ultimate Rewards', 130000, 'Evan', true, '2026-10-06', 4)
on conflict (id) do update set
  program = excluded.program, balance = excluded.balance, owner = excluded.owner,
  approximate = excluded.approximate, as_of = excluded.as_of,
  sort_order = excluded.sort_order;

insert into public.deadlines (id, user_id, title, due_date, status, notes, sort_order) values
  ('deadline-znowski', '00000000-0000-0000-0000-000000000000', 'Mark Znowski coffee follow-up', '2026-11-17', 'open',
   'He is back in Chicago around Nov 17. Evan promised coffee when he is back in town.', 1),
  ('deadline-thetadata', '00000000-0000-0000-0000-000000000000', 'Thetadata subscription renewal ($80/mo)', '2026-11-27', 'open',
   'Decision pending: cancel before the monthly plan renews.', 2),
  ('deadline-lowes', '00000000-0000-0000-0000-000000000000', 'Lowes Amex Offer expires ($20 back on $100+)', '2026-11-30', 'open',
   'Activate the offer before buying. Planned use: bathroom fixtures.', 3),
  ('deadline-fhr', '00000000-0000-0000-0000-000000000000', 'Amex FHR 1-night eligibility ends', '2027-01-01', 'watching',
   'From Jan 1, 2027 the FHR credit needs a 2-night minimum. The Seattle Lotte night is already booked under the old rules.', 4)
on conflict (id) do update set
  title = excluded.title, due_date = excluded.due_date, status = excluded.status,
  notes = excluded.notes, sort_order = excluded.sort_order;

insert into public.links (id, user_id, name, url, description, category, sort_order) values
  ('link-pastefront', '00000000-0000-0000-0000-000000000000', 'Pastefront', 'https://pastefront.com',
   'His product: paste a supplier link, AI builds a full storefront. Live, operated under Shattenkirk Enterprises LLC.', 'Projects', 1),
  ('link-tap', '00000000-0000-0000-0000-000000000000', 'TAP Marine (TAP-EI)', null,
   'Engineering intelligence portal for The Adam Project: source-cited search and AI answers over vessel evidence and drawings. Private repo (TAPmarine).', 'Projects', 2),
  ('link-roomy', '00000000-0000-0000-0000-000000000000', 'Roomy', null,
   'Space planner app (spacePlanner): draw floor plans with walls and doors, shop furniture in context, share plans as images.', 'Projects', 3),
  ('link-agentdesk', '00000000-0000-0000-0000-000000000000', 'AgentDesk', 'https://github.com/evanshattenkirk/Trading-Agent',
   'Automated 0DTE SPY call-trading engine on Robinhood''s Agentic Trading MCP. Paper-only except a supervised live ladder.', 'Projects', 4),
  ('link-portfolio', '00000000-0000-0000-0000-000000000000', 'Portfolio site', null,
   'Personal portfolio site built from the Variant B resume. Pending: publish to GitHub Pages at evanshattenkirk.github.io once the repo exists.', 'Projects', 5),
  ('link-robinhood', '00000000-0000-0000-0000-000000000000', 'Robinhood ledger', null,
   'Brokerage ledger for the taxable account (the one tracked against the S&P 500 since 2019). Local file, no public URL.', 'Ledgers', 6),
  ('link-hardrock', '00000000-0000-0000-0000-000000000000', 'Hard Rock ledger', null,
   'Betting ledger. Local file, no public URL.', 'Ledgers', 7)
on conflict (id) do update set
  name = excluded.name, url = excluded.url, description = excluded.description,
  category = excluded.category, sort_order = excluded.sort_order;
