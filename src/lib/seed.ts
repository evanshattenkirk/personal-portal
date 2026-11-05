import type {
  Booking,
  CreditTracker,
  Deadline,
  Ledger,
  LedgerEntry,
  PointsBalance,
  PortalLink,
  PortalTask,
  Suggestion,
  Trip,
} from "./types";

// Bundled demo data. Every trip, booking, balance and deadline below is
// fictional: this repo is public, so real records live only in Supabase.
// It powers demo mode (NEXT_PUBLIC_PORTAL_DEMO=1 or a development server
// without Supabase env vars). supabase/seed.sql mirrors it for a fresh,
// empty project. Live mode never falls back to this file.

export const seedTrips: Trip[] = [
  {
    id: "demo-trip-lisbon",
    slug: "lisbon",
    name: "Lisbon",
    destination: "Lisbon, Portugal",
    startDate: "2027-05-06",
    endDate: "2027-05-10",
    dateLabel: "May 6 to 10, 2027",
    status: "booked",
    travelers: 2,
    notes:
      "Two hotel stays stacked: three nights in Alfama on a travel-portal credit, then one night near the coast on a hotel-program credit. Flights still to book.",
    sortOrder: 1,
  },
  {
    id: "demo-trip-kyoto",
    slug: "kyoto",
    name: "Kyoto",
    destination: "Kyoto, Japan",
    startDate: "2027-10-14",
    endDate: "2027-10-19",
    dateLabel: "Oct 14 to 19, 2027",
    status: "researching",
    travelers: 2,
    notes:
      "Lead option: a ryokan bookable on points. Do not transfer points until award space is confirmed.",
    sortOrder: 2,
  },
  {
    id: "demo-trip-group",
    slug: "group-trip",
    name: "Group trip",
    destination: "TBD",
    startDate: null,
    endDate: null,
    dateLabel: "Summer 2027",
    status: "planning",
    travelers: 6,
    notes:
      "6 people. Comparing a villa, an all-inclusive, and a short cruise on a per-person-per-night budget.",
    sortOrder: 3,
  },
];

export const seedBookings: Booking[] = [
  {
    id: "demo-booking-alfama",
    tripSlug: "lisbon",
    kind: "hotel",
    name: "Alfama boutique hotel",
    provider: "Travel portal",
    startDate: "2027-05-06",
    endDate: "2027-05-09",
    details: "1 King, 2 guests",
    confirmation: "DEMO-TRIP-0001",
    secondaryRef: "Hotel ref DEMO-A1",
    costPaid: 900,
    costNet: 400,
    costNote: "Net after a $500 portal credit posts",
    pointsCost: null,
    pointsProgram: null,
    cancelBy: "May 4, 2027, 11:59 pm",
    notes: null,
    sortOrder: 1,
  },
  {
    id: "demo-booking-coast",
    tripSlug: "lisbon",
    kind: "hotel",
    name: "Coastal resort",
    provider: "Hotel program",
    startDate: "2027-05-09",
    endDate: "2027-05-10",
    details: "Ocean View, 1 King, 2 guests",
    confirmation: "DEMO-TRIP-0002",
    secondaryRef: "Hotel ref DEMO-B2",
    costPaid: 350,
    costNet: 50,
    costNote: "Net after a $300 property credit posts",
    pointsCost: null,
    pointsProgram: null,
    cancelBy: "May 8, 2027, 4:00 pm local",
    notes: "Perks: breakfast for two, late checkout.",
    sortOrder: 2,
  },
];

export const seedPoints: PointsBalance[] = [
  {
    id: "demo-points-airline-a",
    program: "Airline program A",
    balance: 100000,
    owner: "Evan",
    approximate: false,
    asOf: "2026-11-01",
    sortOrder: 1,
  },
  {
    id: "demo-points-airline-b",
    program: "Airline program B",
    balance: 50000,
    owner: "Partner",
    approximate: true,
    asOf: "2026-11-01",
    sortOrder: 2,
  },
  {
    id: "demo-points-card-a",
    program: "Card rewards A",
    balance: 75000,
    owner: "Evan",
    approximate: true,
    asOf: "2026-11-01",
    sortOrder: 3,
  },
  {
    id: "demo-points-card-b",
    program: "Card rewards B",
    balance: 120000,
    owner: "Evan",
    approximate: true,
    asOf: "2026-11-01",
    sortOrder: 4,
  },
];

export const seedDeadlines: Deadline[] = [
  {
    id: "demo-deadline-coffee",
    title: "Coffee follow-up with a contact",
    dueDate: "2027-01-12",
    status: "open",
    notes: "Promised a coffee when they are back in town.",
    sortOrder: 1,
  },
  {
    id: "demo-deadline-subscription",
    title: "Data subscription renewal",
    dueDate: "2027-01-20",
    status: "open",
    notes: "Decide whether to cancel before the monthly plan renews.",
    sortOrder: 2,
  },
  {
    id: "demo-deadline-offer",
    title: "Card offer expires",
    dueDate: "2027-01-31",
    status: "open",
    notes: "Activate the offer before buying.",
    sortOrder: 3,
  },
  {
    id: "demo-deadline-credit-rules",
    title: "Hotel credit rules change",
    dueDate: "2027-03-01",
    status: "watching",
    notes: "New minimum-night rule starts; existing bookings keep the old terms.",
    sortOrder: 4,
  },
];

export const seedLinks: PortalLink[] = [
  {
    id: "demo-link-pastefront",
    name: "Pastefront",
    url: "https://pastefront.com",
    description:
      "AI store builder: paste a supplier link and AI builds a full storefront.",
    category: "Projects",
    sortOrder: 1,
  },
  {
    id: "demo-link-agentdesk",
    name: "AgentDesk",
    url: "https://github.com/evanshattenkirk/Trading-Agent",
    description:
      "Automated 0DTE SPY call-trading engine on Robinhood's Agentic Trading MCP. Paper-only except a supervised live ladder.",
    category: "Projects",
    sortOrder: 2,
  },
  {
    id: "demo-link-portfolio",
    name: "Portfolio site",
    url: "https://evanshattenkirk.github.io",
    description: "Personal portfolio site, live on GitHub Pages.",
    category: "Projects",
    sortOrder: 3,
  },
  {
    id: "demo-link-private",
    name: "Private project",
    url: null,
    description: "Cards without a URL point at private repos or local files.",
    category: "Projects",
    sortOrder: 4,
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

// Ledgers and tasks also live only in the database (ledgers are synced from
// the ledger documents Muse maintains; tasks mirror the Linear board).
export const seedLedgers: Ledger[] = [];
export const seedLedgerEntries: LedgerEntry[] = [];
export const seedTasks: PortalTask[] = [];
