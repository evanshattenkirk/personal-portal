import type {
  Booking,
  CreditTracker,
  Deadline,
  PointsBalance,
  PortalLink,
  Suggestion,
  Trip,
} from "./types";

// Bundled seed data. This is the exact same dataset that supabase/seed.sql
// inserts into a real project. It powers demo mode (NEXT_PUBLIC_PORTAL_DEMO=1
// or a development server without Supabase env vars) and is the fallback
// whenever the live database is not configured.

export const seedTrips: Trip[] = [
  {
    id: "trip-seattle",
    slug: "seattle",
    name: "Seattle",
    destination: "Seattle, WA",
    startDate: "2027-03-19",
    endDate: "2027-03-22",
    dateLabel: "Mar 19 to 22, 2027",
    status: "booked",
    travelers: 2,
    notes:
      "Two hotel stays stacked: two nights at the Palladian on the Chase side, then one night at Lotte on the Amex FHR credit. Flights still to book.",
    sortOrder: 1,
  },
  {
    id: "trip-cancun",
    slug: "cancun",
    name: "Cancun",
    destination: "Cancun, Mexico",
    startDate: "2026-12-10",
    endDate: "2026-12-13",
    dateLabel: "Dec 10 to 13, 2026",
    status: "researching",
    travelers: 2,
    notes:
      "Lead option: Secrets Mirabel, 80,000 Hyatt points total for 3 nights. Do not transfer points until award space is re-confirmed.",
    sortOrder: 2,
  },
  {
    id: "trip-family",
    slug: "family-trip",
    name: "Family trip",
    destination: "TBD",
    startDate: null,
    endDate: null,
    dateLabel: "Late Mar to Apr 2027",
    status: "planning",
    travelers: 6,
    notes:
      "6 people. Comparing cruises, all-inclusives, and staffed villas. Budget around $500 per person per night.",
    sortOrder: 3,
  },
];

export const seedBookings: Booking[] = [
  {
    id: "booking-palladian",
    tripSlug: "seattle",
    kind: "hotel",
    name: "Kimpton Palladian",
    provider: "Chase Travel",
    startDate: "2027-03-19",
    endDate: "2027-03-21",
    details: "1 King Spa, 2 guests",
    confirmation: "Chase Travel Trip ID 1031707324",
    secondaryRef: "Stay ref 45357130-",
    costPaid: 760,
    costNet: 260,
    costNote: "Net after $500 in credits post",
    pointsCost: null,
    pointsProgram: null,
    cancelBy: "Mar 17, 2027, 12:00 am",
    notes: null,
    sortOrder: 1,
  },
  {
    id: "booking-lotte",
    tripSlug: "seattle",
    kind: "hotel",
    name: "Lotte Hotel Seattle",
    provider: "Amex Travel (FHR)",
    startDate: "2027-03-21",
    endDate: "2027-03-22",
    details: "Superior Room, 1 King, Bay View, 2 guests",
    confirmation: "Amex Travel trip ZO-AX1096-65735",
    secondaryRef: "Hotel conf 9106155895650",
    costPaid: 396.49,
    costNet: 96.49,
    costNote: "Net after the $300 FHR credit posts",
    pointsCost: null,
    pointsProgram: null,
    cancelBy: "Mar 20, 2027, 4:00 pm PT",
    notes:
      "Perks: $100 food and beverage credit, breakfast for two, guaranteed 4pm checkout.",
    sortOrder: 2,
  },
];

export const seedPoints: PointsBalance[] = [
  {
    id: "points-avios",
    program: "British Airways Avios",
    balance: 143000,
    owner: "Evan",
    approximate: false,
    asOf: "2026-10-06",
    sortOrder: 1,
  },
  {
    id: "points-aa",
    program: "American AAdvantage",
    balance: 90000,
    owner: "Jessica",
    approximate: true,
    asOf: "2026-10-06",
    sortOrder: 2,
  },
  {
    id: "points-amex",
    program: "Amex Membership Rewards",
    balance: 55000,
    owner: "Evan",
    approximate: true,
    asOf: "2026-10-06",
    sortOrder: 3,
  },
  {
    id: "points-chase",
    program: "Chase Ultimate Rewards",
    balance: 130000,
    owner: "Evan",
    approximate: true,
    asOf: "2026-10-06",
    sortOrder: 4,
  },
];

export const seedDeadlines: Deadline[] = [
  {
    id: "deadline-znowski",
    title: "Mark Znowski coffee follow-up",
    dueDate: "2026-11-17",
    status: "open",
    notes: "He is back in Chicago around Nov 17. Evan promised coffee when he is back in town.",
    sortOrder: 1,
  },
  {
    id: "deadline-thetadata",
    title: "Thetadata subscription renewal ($80/mo)",
    dueDate: "2026-11-27",
    status: "open",
    notes: "Decision pending: cancel before the monthly plan renews.",
    sortOrder: 2,
  },
  {
    id: "deadline-lowes",
    title: "Lowes Amex Offer expires ($20 back on $100+)",
    dueDate: "2026-11-30",
    status: "open",
    notes: "Activate the offer before buying. Planned use: bathroom fixtures.",
    sortOrder: 3,
  },
  {
    id: "deadline-fhr",
    title: "Amex FHR 1-night eligibility ends",
    dueDate: "2027-01-01",
    status: "watching",
    notes:
      "From Jan 1, 2027 the FHR credit needs a 2-night minimum. The Seattle Lotte night is already booked under the old rules.",
    sortOrder: 4,
  },
];

export const seedLinks: PortalLink[] = [
  {
    id: "link-pastefront",
    name: "Pastefront",
    url: "https://pastefront.com",
    description:
      "His product: paste a supplier link, AI builds a full storefront. Live, operated under Shattenkirk Enterprises LLC.",
    category: "Projects",
    sortOrder: 1,
  },
  {
    id: "link-tap",
    name: "TAP Marine (TAP-EI)",
    url: null,
    description:
      "Engineering intelligence portal for The Adam Project: source-cited search and AI answers over vessel evidence and drawings. Private repo (TAPmarine).",
    category: "Projects",
    sortOrder: 2,
  },
  {
    id: "link-roomy",
    name: "Roomy",
    url: null,
    description:
      "Space planner app (spacePlanner): draw floor plans with walls and doors, shop furniture in context, share plans as images.",
    category: "Projects",
    sortOrder: 3,
  },
  {
    id: "link-agentdesk",
    name: "AgentDesk",
    url: "https://github.com/evanshattenkirk/Trading-Agent",
    description:
      "Automated 0DTE SPY call-trading engine on Robinhood's Agentic Trading MCP. Paper-only except a supervised live ladder.",
    category: "Projects",
    sortOrder: 4,
  },
  {
    id: "link-portfolio",
    name: "Portfolio site",
    url: null,
    description:
      "Personal portfolio site built from the Variant B resume. Pending: publish to GitHub Pages at evanshattenkirk.github.io once the repo exists.",
    category: "Projects",
    sortOrder: 5,
  },
  {
    id: "link-robinhood",
    name: "Robinhood ledger",
    url: null,
    description:
      "Brokerage ledger for the taxable account (the one tracked against the S&P 500 since 2019). Local file, no public URL.",
    category: "Ledgers",
    sortOrder: 6,
  },
  {
    id: "link-hardrock",
    name: "Hard Rock ledger",
    url: null,
    description:
      "Betting ledger. Local file, no public URL.",
    category: "Ledgers",
    sortOrder: 7,
  },
];

export const creditTrackers: CreditTracker[] = [
  {
    id: "tracker-dining",
    name: "Amex Gold dining credit",
    amountLabel: "$10/mo",
    cadence: "Monthly statement credit",
    detail:
      "Enrolled. Works at Grubhub (incl. Seamless), Buffalo Wild Wings, Five Guys, Cheesecake Factory, and Wonder.",
  },
  {
    id: "tracker-dunkin",
    name: "Amex Gold Dunkin credit",
    amountLabel: "$7/mo",
    cadence: "Monthly statement credit",
    detail:
      "Enrolled. US Dunkin locations and the Dunkin app.",
  },
  {
    id: "tracker-resy",
    name: "Amex Platinum Resy credit",
    amountLabel: "$100/quarter",
    cadence: "Quarterly statement credit",
    detail:
      "Used mainly for pickup dinner orders at Resy restaurants, paid with the Platinum.",
  },
];

// Suggestions live only in the database (written per trip from live
// research); demo mode simply shows none until some are added.
export const seedSuggestions: Suggestion[] = [];
