-- Personal Portal: DEMO seed data (mirrors src/lib/seed.ts).
--
-- Everything in this file is fictional. This repo is public, so real trips,
-- bookings, balances and deadlines live only in Supabase and never in git.
-- Do not paste real confirmation numbers or balances into this file.
--
-- HOW TO USE (fresh, empty project only)
-- 1. Create your auth user in Supabase (Authentication > Users > Add user).
--    The portal's login form never creates accounts.
-- 2. Find your user id in Supabase: Authentication > Users (or run
--    `select id, email from auth.users;`).
-- 3. Replace the placeholder below with your uuid, then run this file in the
--    SQL editor. Ids are prefixed demo- so they never overwrite real rows.

-- << SET YOUR USER ID HERE: replace 00000000-0000-0000-0000-000000000000 >>

insert into public.trips (id, user_id, slug, name, destination, start_date, end_date, date_label, status, travelers, notes, sort_order) values
  ('demo-trip-lisbon', '00000000-0000-0000-0000-000000000000', 'lisbon', 'Lisbon', 'Lisbon, Portugal', '2027-05-06', '2027-05-10', 'May 6 to 10, 2027', 'booked', 2, 'Two hotel stays stacked: three nights in Alfama on a travel-portal credit, then one night near the coast on a hotel-program credit. Flights still to book.', 1),
  ('demo-trip-kyoto', '00000000-0000-0000-0000-000000000000', 'kyoto', 'Kyoto', 'Kyoto, Japan', '2027-10-14', '2027-10-19', 'Oct 14 to 19, 2027', 'researching', 2, 'Lead option: a ryokan bookable on points. Do not transfer points until award space is confirmed.', 2),
  ('demo-trip-group', '00000000-0000-0000-0000-000000000000', 'group-trip', 'Group trip', 'TBD', null, null, 'Summer 2027', 'planning', 6, '6 people. Comparing a villa, an all-inclusive, and a short cruise on a per-person-per-night budget.', 3)
on conflict (id) do update set
  slug = excluded.slug, name = excluded.name, destination = excluded.destination,
  start_date = excluded.start_date, end_date = excluded.end_date,
  date_label = excluded.date_label, status = excluded.status,
  travelers = excluded.travelers, notes = excluded.notes,
  sort_order = excluded.sort_order;

insert into public.bookings (id, user_id, trip_slug, kind, name, provider, start_date, end_date, details, confirmation, secondary_ref, cost_paid, cost_net, cost_note, points_cost, points_program, cancel_by, notes, sort_order) values
  ('demo-booking-alfama', '00000000-0000-0000-0000-000000000000', 'lisbon', 'hotel', 'Alfama boutique hotel', 'Travel portal', '2027-05-06', '2027-05-09', '1 King, 2 guests', 'DEMO-TRIP-0001', 'Hotel ref DEMO-A1', 900, 400, 'Net after a $500 portal credit posts', null, null, 'May 4, 2027, 11:59 pm', null, 1),
  ('demo-booking-coast', '00000000-0000-0000-0000-000000000000', 'lisbon', 'hotel', 'Coastal resort', 'Hotel program', '2027-05-09', '2027-05-10', 'Ocean View, 1 King, 2 guests', 'DEMO-TRIP-0002', 'Hotel ref DEMO-B2', 350, 50, 'Net after a $300 property credit posts', null, null, 'May 8, 2027, 4:00 pm local', 'Perks: breakfast for two, late checkout.', 2)
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
  ('demo-points-airline-a', '00000000-0000-0000-0000-000000000000', 'Airline program A', 100000, 'Evan', false, '2026-11-01', 1),
  ('demo-points-airline-b', '00000000-0000-0000-0000-000000000000', 'Airline program B', 50000, 'Partner', true, '2026-11-01', 2),
  ('demo-points-card-a', '00000000-0000-0000-0000-000000000000', 'Card rewards A', 75000, 'Evan', true, '2026-11-01', 3),
  ('demo-points-card-b', '00000000-0000-0000-0000-000000000000', 'Card rewards B', 120000, 'Evan', true, '2026-11-01', 4)
on conflict (id) do update set
  program = excluded.program, balance = excluded.balance, owner = excluded.owner,
  approximate = excluded.approximate, as_of = excluded.as_of,
  sort_order = excluded.sort_order;

insert into public.deadlines (id, user_id, title, due_date, status, notes, sort_order) values
  ('demo-deadline-coffee', '00000000-0000-0000-0000-000000000000', 'Coffee follow-up with a contact', '2027-01-12', 'open', 'Promised a coffee when they are back in town.', 1),
  ('demo-deadline-subscription', '00000000-0000-0000-0000-000000000000', 'Data subscription renewal', '2027-01-20', 'open', 'Decide whether to cancel before the monthly plan renews.', 2),
  ('demo-deadline-offer', '00000000-0000-0000-0000-000000000000', 'Card offer expires', '2027-01-31', 'open', 'Activate the offer before buying.', 3),
  ('demo-deadline-credit-rules', '00000000-0000-0000-0000-000000000000', 'Hotel credit rules change', '2027-03-01', 'watching', 'New minimum-night rule starts; existing bookings keep the old terms.', 4)
on conflict (id) do update set
  title = excluded.title, due_date = excluded.due_date, status = excluded.status,
  notes = excluded.notes, sort_order = excluded.sort_order;

insert into public.links (id, user_id, name, url, description, category, sort_order) values
  ('demo-link-pastefront', '00000000-0000-0000-0000-000000000000', 'Pastefront', 'https://pastefront.com', 'AI store builder: paste a supplier link and AI builds a full storefront.', 'Projects', 1),
  ('demo-link-agentdesk', '00000000-0000-0000-0000-000000000000', 'AgentDesk', 'https://github.com/evanshattenkirk/Trading-Agent', 'Automated 0DTE SPY call-trading engine on Robinhood''s Agentic Trading MCP. Paper-only except a supervised live ladder.', 'Projects', 2),
  ('demo-link-portfolio', '00000000-0000-0000-0000-000000000000', 'Portfolio site', 'https://evanshattenkirk.github.io', 'Personal portfolio site, live on GitHub Pages.', 'Projects', 3),
  ('demo-link-private', '00000000-0000-0000-0000-000000000000', 'Private project', null, 'Cards without a URL point at private repos or local files.', 'Projects', 4)
on conflict (id) do update set
  name = excluded.name, url = excluded.url, description = excluded.description,
  category = excluded.category, sort_order = excluded.sort_order;
