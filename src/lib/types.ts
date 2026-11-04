export type TripStatus = "booked" | "researching" | "planning" | "completed";

export interface Trip {
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
  id: string;
  title: string;
  dueDate: string; // ISO date
  status: DeadlineStatus;
  notes: string | null;
  sortOrder: number;
}

export interface PortalLink {
  id: string;
  name: string;
  url: string | null; // null means no public URL yet
  description: string;
  category: string;
  sortOrder: number;
}

export interface CreditTracker {
  id: string;
  name: string;
  amountLabel: string;
  cadence: string;
  detail: string;
}
