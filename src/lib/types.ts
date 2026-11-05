export type TripStatus = "booked" | "researching" | "planning" | "completed";

export interface Trip {
  selectedScenarioId?: string | null;
  id: string;
  slug: string;
  name: string;
  destination: string;
  startDate: string | null; // ISO date, null when not pinned down yet
  endDate: string | null;
  dateLabel: string; // human label, e.g. "Late Mar to Apr 2027"
  status: TripStatus;
  travelers: number | null;
  notes: string | null;
  sortOrder: number;
}

export type BookingKind = "hotel" | "flight" | "car" | "activity" | "other";

export interface Booking {
  status?: "needs_review" | "awaiting_confirmation" | "confirmed" | "cancelled";
  confirmationCheckedAt?: string | null;
  cancelAt?: string | null;
  creditsPosted?: number;
  sourceSuggestionId?: string | null;
  id: string;
  tripSlug: string;
  kind: BookingKind;
  name: string;
  provider: string; // who it was booked through
  startDate: string; // ISO date
  endDate: string; // ISO date
  details: string; // room type, guests, etc.
  confirmation: string | null; // primary confirmation reference
  secondaryRef: string | null; // second reference (hotel conf, stay ref, ...)
  costPaid: number | null; // USD actually charged
  costNet: number | null; // USD after credits post
  costNote: string | null; // explanation of credits / points used
  pointsCost: number | null; // points spent, if any
  pointsProgram: string | null;
  cancelBy: string | null; // free cancellation deadline, human readable
  notes: string | null;
  sortOrder: number;
}

export interface PointsBalance {
  earmarked?: number;
  tripSlug?: string | null;
  id: string;
  program: string;
  balance: number;
  owner: string; // whose account
  approximate: boolean;
  asOf: string; // ISO date the balance was recorded
  sortOrder: number;
}

export type DeadlineStatus = "open" | "done" | "watching";

export interface Deadline {
  snoozedUntil?: string | null;
  tripSlug?: string | null;
  id: string;
  title: string;
  dueDate: string; // ISO date
  status: DeadlineStatus;
  notes: string | null;
  sortOrder: number;
}

export interface PortalLink {
  pinned?: boolean;
  location?: string | null;
  id: string;
  name: string;
  url: string | null; // null means no public URL yet
  description: string;
  category: string;
  sortOrder: number;
}

export type SuggestionCategory =
  "planning" | "flight" | "food" | "activity" | "stay";

export type SuggestionStatus = "suggested" | "saved" | "booked" | "dismissed";

export interface Suggestion {
  scenarioId?: string | null;
  itemType?: "idea" | "task" | "reference";
  verification?: "modeled" | "needs_recheck" | "checked";
  checkedAt?: string | null;
  id: string;
  tripSlug: string;
  category: SuggestionCategory;
  title: string;
  subtitle: string | null; // route/times line, or neighborhood + rating
  detail: string | null; // why this pick, terms, book-ahead warnings
  priceLabel: string | null; // "$412 for two", "$$", "80,000 pts"
  url: string | null; // booking / info link
  source: string | null; // where the pick came from (Duffel, Places, ...)
  status: SuggestionStatus;
  sortOrder: number;
  tags?: string | null; // comma-separated, e.g. "cruise, all-inclusive"
}

export interface CreditTracker {
  id: string;
  name: string;
  amountLabel: string;
  cadence: string;
  detail: string;
}

export interface Task {
  id: string;
  title: string;
  tripSlug: string | null;
  bookingId: string | null;
  dueDate: string | null;
  status: "todo" | "waiting" | "done";
  notes: string | null;
  snoozedUntil: string | null;
}
export interface Scenario {
  id: string;
  tripSlug: string;
  title: string;
  destination: string;
  startDate: string | null;
  endDate: string | null;
  summary: string | null;
  pointsEstimate: string | null;
  cashEstimate: string | null;
  availability: "modeled" | "needs_recheck" | "checked";
  checkedAt: string | null;
  notes: string | null;
  status: "considering" | "selected" | "ruled_out";
}
export interface ItineraryItem {
  id: string;
  tripSlug: string;
  date: string;
  time: string | null;
  title: string;
  location: string | null;
  notes: string | null;
  bookingId: string | null;
  kind: "plan" | "reservation";
  status: "planned" | "removed";
}
export interface CreditPeriod {
  id: string;
  name: string;
  period: string;
  limit: number;
  used: number;
  posted: number;
  resetDate: string;
  notes: string | null;
}
// Free-form notes Evan writes for his AI assistant to read and act on.
export interface TripNote {
  id: string;
  tripSlug: string;
  body: string;
  kind: "note" | "ask_ai" | "preference";
  status: "open" | "done";
  aiReply: string | null; // what the AI did or answered, pasted back
  createdAt: string | null; // ISO timestamp
}
// One per trip: what the trip should feel like, so brainstorming stays on target.
export interface TripBrief {
  id: string;
  tripSlug: string;
  window: string | null; // "Mid April 2027"
  nights: string | null; // "4-5"
  styles: string | null; // comma-separated trip styles to explore
  vibes: string | null; // comma-separated things we want
  avoid: string | null; // comma-separated things to skip
  budget: string | null;
  origin: string | null; // where everyone leaves from
  who: string | null; // who's coming
  mustHaves: string | null;
}
export interface EntityMap {
  trips: Trip;
  bookings: Booking;
  suggestions: Suggestion;
  deadlines: Deadline;
  points: PointsBalance;
  links: PortalLink;
  tasks: Task;
  scenarios: Scenario;
  itinerary: ItineraryItem;
  credits: CreditPeriod;
  notes: TripNote;
  briefs: TripBrief;
}
export type EntityName = keyof EntityMap;
export type PortalData = { [K in EntityName]: EntityMap[K][] } & {
  demo: boolean;
  trekUrl?: string | null;
  // False when the brainstorm migration (0007) hasn't been run yet.
  brainstormReady?: boolean;
  ledgers: Ledger[];
  ledgerEntries: LedgerEntry[];
  externalTasks: PortalTask[];
};

export interface Ledger {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  totalIn: number | null;
  totalOut: number | null;
  net: number | null;
  netLabel: string | null;
  balanceLabel: string | null;
  balanceValue: number | null;
  entriesCount: number | null;
  asOf: string | null;
  summary: string | null;
  sortOrder: number;
}

export interface LedgerEntry {
  id: string;
  ledgerSlug: string;
  entryDate: string; // ISO date
  direction: "in" | "out";
  amount: number;
  fee: number | null;
  note: string | null;
  sortOrder: number;
}

export interface PortalTask {
  id: string;
  externalId: string; // e.g. KIR-6
  title: string;
  status: string; // Linear status name, e.g. "In Progress"
  statusType: string | null;
  ownerLabel: string | null; // owner:evan / owner:muse / owner:claude
  needsEvan: boolean;
  actionNote: string | null; // what Evan personally has to do
  dueDate: string | null;
  url: string | null;
  sortOrder: number;
}
