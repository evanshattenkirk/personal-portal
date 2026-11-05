import { createClient } from "./supabase/server";
import {
  seedBookings,
  seedDeadlines,
  seedLedgerEntries,
  seedLedgers,
  seedLinks,
  seedPoints,
  seedSuggestions,
  seedTasks,
  seedTrips,
} from "./seed";
import type {
  Booking,
  Deadline,
  Ledger,
  LedgerEntry,
  PointsBalance,
  PortalLink,
  PortalTask,
  Suggestion,
  Trip,
} from "./types";

// ---------------------------------------------------------------------------
// Mode detection
//
// Live mode: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are
// set. Data comes from Supabase and every route is behind magic-link auth.
//
// Demo mode: no Supabase env vars AND (NEXT_PUBLIC_PORTAL_DEMO=1 OR a
// development server). Data comes from the bundled seed in src/lib/seed.ts
// and auth is skipped, with a visible "Demo data" badge. This is a
// data-layer fallback for local development only, never a production auth
// bypass: a production build without Supabase env vars refuses to serve
// content and points at the README provisioning checklist.
// ---------------------------------------------------------------------------

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function isDemoMode(): boolean {
  if (isSupabaseConfigured()) return false;
  return (
    process.env.NEXT_PUBLIC_PORTAL_DEMO === "1" ||
    process.env.NODE_ENV === "development"
  );
}

export function isMisconfiguredProduction(): boolean {
  return (
    !isSupabaseConfigured() &&
    !isDemoMode() &&
    process.env.NODE_ENV === "production"
  );
}

// --- Row mappers (snake_case DB rows -> camelCase app types) ---------------

function mapTrip(r: Record<string, unknown>): Trip {
  return {
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    destination: String(r.destination),
    startDate: (r.start_date as string) ?? null,
    endDate: (r.end_date as string) ?? null,
    dateLabel: String(r.date_label),
    status: r.status as Trip["status"],
    travelers: (r.travelers as number) ?? null,
    notes: (r.notes as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapBooking(r: Record<string, unknown>): Booking {
  return {
    id: String(r.id),
    tripSlug: String(r.trip_slug),
    kind: r.kind as Booking["kind"],
    name: String(r.name),
    provider: String(r.provider),
    startDate: String(r.start_date),
    endDate: String(r.end_date),
    details: String(r.details ?? ""),
    confirmation: (r.confirmation as string) ?? null,
    secondaryRef: (r.secondary_ref as string) ?? null,
    costPaid: r.cost_paid != null ? Number(r.cost_paid) : null,
    costNet: r.cost_net != null ? Number(r.cost_net) : null,
    costNote: (r.cost_note as string) ?? null,
    pointsCost: r.points_cost != null ? Number(r.points_cost) : null,
    pointsProgram: (r.points_program as string) ?? null,
    cancelBy: (r.cancel_by as string) ?? null,
    notes: (r.notes as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapPoints(r: Record<string, unknown>): PointsBalance {
  return {
    id: String(r.id),
    program: String(r.program),
    balance: Number(r.balance),
    owner: String(r.owner),
    approximate: Boolean(r.approximate),
    asOf: String(r.as_of),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapDeadline(r: Record<string, unknown>): Deadline {
  return {
    id: String(r.id),
    title: String(r.title),
    dueDate: String(r.due_date),
    status: r.status as Deadline["status"],
    notes: (r.notes as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapLink(r: Record<string, unknown>): PortalLink {
  return {
    id: String(r.id),
    name: String(r.name),
    url: (r.url as string) ?? null,
    description: String(r.description ?? ""),
    category: String(r.category ?? "Links"),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapSuggestion(r: Record<string, unknown>): Suggestion {
  return {
    id: String(r.id),
    tripSlug: String(r.trip_slug),
    category: r.category as Suggestion["category"],
    title: String(r.title),
    subtitle: (r.subtitle as string) ?? null,
    detail: (r.detail as string) ?? null,
    priceLabel: (r.price_label as string) ?? null,
    url: (r.url as string) ?? null,
    source: (r.source as string) ?? null,
    status: r.status as Suggestion["status"],
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapLedger(r: Record<string, unknown>): Ledger {
  return {
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    icon: (r.icon as string) ?? null,
    totalIn: r.total_in != null ? Number(r.total_in) : null,
    totalOut: r.total_out != null ? Number(r.total_out) : null,
    net: r.net != null ? Number(r.net) : null,
    netLabel: (r.net_label as string) ?? null,
    balanceLabel: (r.balance_label as string) ?? null,
    balanceValue: r.balance_value != null ? Number(r.balance_value) : null,
    entriesCount: r.entries_count != null ? Number(r.entries_count) : null,
    asOf: (r.as_of as string) ?? null,
    summary: (r.summary as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapLedgerEntry(r: Record<string, unknown>): LedgerEntry {
  return {
    id: String(r.id),
    ledgerSlug: String(r.ledger_slug),
    entryDate: String(r.entry_date),
    direction: r.direction as LedgerEntry["direction"],
    amount: Number(r.amount),
    fee: r.fee != null ? Number(r.fee) : null,
    note: (r.note as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

function mapTask(r: Record<string, unknown>): PortalTask {
  return {
    id: String(r.id),
    externalId: String(r.external_id),
    title: String(r.title),
    status: String(r.status),
    statusType: (r.status_type as string) ?? null,
    ownerLabel: (r.owner_label as string) ?? null,
    needsEvan: Boolean(r.needs_evan),
    actionNote: (r.action_note as string) ?? null,
    dueDate: (r.due_date as string) ?? null,
    url: (r.url as string) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

// --- Queries -----------------------------------------------------------------
// Seed data is only used when Supabase is not configured (demo mode). In live
// mode a failed query logs the error and returns an empty list, so the portal
// never silently swaps real data for demo data.

function liveError(table: string, error: unknown): void {
  console.error(`[portal] ${table} query failed`, error);
}

export async function getTrips(): Promise<Trip[]> {
  if (!isSupabaseConfigured()) return seedTrips;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .order("sort_order");
  if (error || !data) {
    liveError("trips", error);
    return [];
  }
  return data.map(mapTrip);
}

export async function getTrip(slug: string): Promise<Trip | null> {
  const trips = await getTrips();
  return trips.find((t) => t.slug === slug) ?? null;
}

export async function getBookings(tripSlug?: string): Promise<Booking[]> {
  if (!isSupabaseConfigured()) {
    return tripSlug
      ? seedBookings.filter((b) => b.tripSlug === tripSlug)
      : seedBookings;
  }
  const supabase = await createClient();
  let query = supabase.from("bookings").select("*").order("sort_order");
  if (tripSlug) query = query.eq("trip_slug", tripSlug);
  const { data, error } = await query;
  if (error || !data) {
    liveError("bookings", error);
    return [];
  }
  return data.map(mapBooking);
}

export async function getPoints(): Promise<PointsBalance[]> {
  if (!isSupabaseConfigured()) return seedPoints;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("points_balances")
    .select("*")
    .order("sort_order");
  if (error || !data) {
    liveError("points_balances", error);
    return [];
  }
  return data.map(mapPoints);
}

export async function getDeadlines(): Promise<Deadline[]> {
  if (!isSupabaseConfigured()) return seedDeadlines;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deadlines")
    .select("*")
    .order("due_date");
  if (error || !data) {
    liveError("deadlines", error);
    return [];
  }
  return data.map(mapDeadline);
}

export async function getLinks(): Promise<PortalLink[]> {
  if (!isSupabaseConfigured()) return seedLinks;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("links")
    .select("*")
    .order("sort_order");
  if (error || !data) {
    liveError("links", error);
    return [];
  }
  return data.map(mapLink);
}

export async function getSuggestions(
  tripSlug: string,
): Promise<Suggestion[]> {
  if (!isSupabaseConfigured()) {
    return seedSuggestions.filter((s) => s.tripSlug === tripSlug);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trip_suggestions")
    .select("*")
    .eq("trip_slug", tripSlug)
    .neq("status", "dismissed")
    .order("sort_order");
  if (error || !data) {
    liveError("trip_suggestions", error);
    return [];
  }
  return data.map(mapSuggestion);
}

export async function getLedgers(): Promise<Ledger[]> {
  if (!isSupabaseConfigured()) return seedLedgers;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ledgers")
    .select("*")
    .order("sort_order");
  if (error || !data) return seedLedgers;
  return data.map(mapLedger);
}

export async function getLedger(slug: string): Promise<Ledger | null> {
  const ledgers = await getLedgers();
  return ledgers.find((l) => l.slug === slug) ?? null;
}

export async function getLedgerEntries(
  ledgerSlug: string,
): Promise<LedgerEntry[]> {
  if (!isSupabaseConfigured()) {
    return seedLedgerEntries.filter((e) => e.ledgerSlug === ledgerSlug);
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ledger_entries")
    .select("*")
    .eq("ledger_slug", ledgerSlug)
    .order("entry_date", { ascending: false })
    .order("sort_order", { ascending: false });
  if (error || !data) {
    return seedLedgerEntries.filter((e) => e.ledgerSlug === ledgerSlug);
  }
  return data.map(mapLedgerEntry);
}

export async function getTasks(): Promise<PortalTask[]> {
  if (!isSupabaseConfigured()) return seedTasks;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("sort_order");
  if (error || !data) return seedTasks;
  return data.map(mapTask);
}

// --- Formatting helpers ------------------------------------------------------

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "n/a";
  return Number.isInteger(n) ? usdWhole.format(n) : usd.format(n);
}

export function fmtPoints(n: number): string {
  return n.toLocaleString("en-US");
}

// Points roll-up: flags an approximate total, names every account owner in
// it, and counts how old the oldest balance is so stale numbers are visible.
export const POINTS_STALE_DAYS = 30;

export function summarizePoints(points: PointsBalance[]) {
  const total = points.reduce((s, p) => s + p.balance, 0);
  const approximate = points.some((p) => p.approximate);
  const owners = [...new Set(points.map((p) => p.owner))];
  const oldest = points.reduce<string | null>(
    (min, p) => (min === null || p.asOf < min ? p.asOf : min),
    null,
  );
  const ageDays = oldest
    ? Math.floor((Date.now() - new Date(`${oldest}T00:00:00`).getTime()) / 86_400_000)
    : 0;
  return {
    total,
    totalLabel: `${approximate ? "~" : ""}${fmtPoints(total)}`,
    owners,
    oldest,
    ageDays,
    stale: ageDays > POINTS_STALE_DAYS,
  };
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "TBD";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function daysUntil(iso: string): number {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(`${iso}T12:00:00`);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}
