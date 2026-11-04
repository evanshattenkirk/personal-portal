-- Personal Portal: add 'planning' to the trip_suggestions category check
-- so trip pages can carry a Trip Planning section (scenarios, options,
-- open checks) above the Flights / Eat & Drink / Things to Do sections.
-- Apply with the Supabase SQL editor or `supabase db push`.

alter table public.trip_suggestions
  drop constraint if exists trip_suggestions_category_check;

alter table public.trip_suggestions
  add constraint trip_suggestions_category_check
  check (category in ('flight', 'food', 'activity', 'stay', 'planning'));
