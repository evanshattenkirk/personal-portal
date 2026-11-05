import type { Booking, PortalData, Trip } from "./types";
export const TIMEZONE = "America/Chicago";
export function todayISO(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function daysUntil(iso: string, now = new Date()) {
  return Math.round(
    (Date.parse(iso.slice(0, 10) + "T00:00:00Z") -
      Date.parse(todayISO(now) + "T00:00:00Z")) /
      86400000,
  );
}
export function fmtDate(iso?: string | null) {
  if (!iso) return "Dates open";
  return new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
export function fmtMoney(n?: number | null) {
  return n == null
    ? "Not recorded"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
      }).format(n);
}
export function fmtPoints(n: number) {
  return n.toLocaleString("en-US");
}
export function bookingStatus(b: Booking) {
  return b.status ?? "needs_review";
}
export function getReadiness(bookings: Booking[]) {
  return (["hotel", "flight", "car"] as const).map((kind) => {
    const items = bookings.filter(
      (b) => b.kind === kind && bookingStatus(b) !== "cancelled",
    );
    return {
      kind,
      label:
        kind === "hotel" ? "Stay" : kind === "flight" ? "Flights" : "Transport",
      status: !items.length
        ? "Not recorded"
        : items.every((b) => bookingStatus(b) === "confirmed")
          ? "Confirmed"
          : "Needs confirmation",
    };
  });
}
export function upcomingTrips(trips: Trip[], now = new Date()) {
  return trips
    .filter(
      (t) =>
        t.status !== "completed" && (!t.endDate || t.endDate >= todayISO(now)),
    )
    .sort((a, b) =>
      (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999"),
    );
}
export function tripWhen(trip: Trip) {
  if (trip.status === "completed") return "Past adventure";
  if (!trip.startDate) return "Room to dream";
  const days = daysUntil(trip.startDate);
  if (days === 0) return "Starts today";
  if (days < 0)
    return trip.endDate && daysUntil(trip.endDate) >= 0
      ? "On your trip"
      : "Past adventure";
  return `${days} days to go`;
}
export function creditTotals(b: Booking[]) {
  const active = b.filter((x) => bookingStatus(x) !== "cancelled");
  const paid = active.reduce((a, x) => a + (x.costPaid ?? 0), 0);
  const expected = active.reduce(
    (a, x) =>
      a + Math.max(0, (x.costPaid ?? 0) - (x.costNet ?? x.costPaid ?? 0)),
    0,
  );
  const posted = active.reduce((a, x) => a + (x.creditsPosted ?? 0), 0);
  return {
    paid,
    expected,
    posted,
    pending: Math.max(0, expected - posted),
    net: paid - posted,
    projected: paid - Math.max(expected, posted),
  };
}
export function emptyData(demo = false): PortalData {
  return {
    trips: [],
    bookings: [],
    suggestions: [],
    deadlines: [],
    points: [],
    links: [],
    tasks: [],
    scenarios: [],
    itinerary: [],
    credits: [],
    notes: [],
    briefs: [],
    ledgers: [],
    ledgerEntries: [],
    externalTasks: [],
    demo,
  };
}
export function safeURL(value?: string | null) {
  if (!value) return null;
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}
export function addDays(date: string, days: number) {
  return new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

export function resourceHref(
  resource: { name: string; url: string | null; category: string },
  ledgers: { name: string; slug: string }[],
) {
  const url = safeURL(resource.url);
  if (url) return url;
  if (resource.category.toLowerCase() !== "ledgers") return null;
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/\bledger\b/g, "")
      .replace(/[^a-z0-9]/g, "");
  const ledger = ledgers.find(
    (l) => normalize(l.name) === normalize(resource.name),
  );
  return ledger ? `/ledgers/${encodeURIComponent(ledger.slug)}` : null;
}
