import test from "node:test";
import assert from "node:assert/strict";
import {
  daysUntil,
  todayISO,
  creditTotals,
  bookingStatus,
  safeURL,
  upcomingTrips,
} from "../src/lib/model.ts";
import { validateRecord } from "../src/lib/records.ts";
import { itineraryCalendar } from "../src/lib/calendar.ts";
import type { Booking, Trip } from "../src/lib/types.ts";
test("Chicago calendar dates work at midnight and across DST", () => {
  assert.equal(todayISO(new Date("2026-11-05T01:00:00Z")), "2026-11-04");
  assert.equal(daysUntil("2026-11-04", new Date("2026-11-05T01:00:00Z")), 0);
  assert.equal(daysUntil("2026-11-05", new Date("2026-11-05T01:00:00Z")), 1);
  assert.equal(daysUntil("2026-03-09", new Date("2026-03-08T06:01:00Z")), 1);
  assert.equal(daysUntil("2026-11-02", new Date("2026-11-01T05:01:00Z")), 1);
});
const booking = {
  id: "b",
  tripSlug: "trip",
  name: "Stay",
  kind: "hotel",
  provider: "Hotel",
  startDate: "2026-12-10",
  endDate: "2026-12-13",
  status: "awaiting_confirmation",
  costPaid: 760,
  costNet: 260,
  creditsPosted: 0,
} as Booking;
test("confirmation requires both reference and verification date", () => {
  assert.throws(
    () => validateRecord("bookings", { ...booking, status: "confirmed" }),
    /Confirmation/,
  );
  assert.throws(
    () =>
      validateRecord("bookings", {
        ...booking,
        status: "confirmed",
        confirmation: "ABC",
      }),
    /Confirmation/,
  );
  assert.doesNotThrow(() =>
    validateRecord("bookings", {
      ...booking,
      status: "confirmed",
      confirmation: "ABC",
      confirmationCheckedAt: "2026-11-04",
    }),
  );
  assert.equal(
    bookingStatus({ ...booking, status: undefined }),
    "needs_review",
  );
});
test("pending credits are never counted as posted", () => {
  assert.deepEqual(creditTotals([booking]), {
    paid: 760,
    expected: 500,
    posted: 0,
    pending: 500,
    net: 760,
    projected: 260,
  });
  assert.equal(creditTotals([{ ...booking, creditsPosted: 200 }]).net, 560);
  assert.equal(creditTotals([{ ...booking, status: "cancelled" }]).paid, 0);
});
test("nearest researching trip precedes later booked trip", () => {
  const trips = [
    {
      id: "a",
      startDate: "2027-03-19",
      endDate: "2027-03-22",
      status: "booked",
    },
    {
      id: "b",
      startDate: "2026-12-10",
      endDate: "2026-12-13",
      status: "researching",
    },
  ] as Trip[];
  assert.equal(
    upcomingTrips(trips, new Date("2026-11-04T12:00:00Z"))[0].id,
    "b",
  );
});
test("record validation rejects impossible dates, unsafe URLs, money and ownership fields", () => {
  assert.throws(
    () => validateRecord("bookings", { ...booking, startDate: "2026-02-30" }),
    /valid date/,
  );
  assert.throws(
    () => validateRecord("bookings", { ...booking, creditsPosted: 900 }),
    /cannot exceed/,
  );
  assert.throws(
    () =>
      validateRecord("bookings", { ...booking, cancelAt: "2026-11-03T10:00" }),
    /timezone/,
  );
  assert.throws(
    () => validateRecord("bookings", { ...booking, user_id: "other" }),
    /Unexpected/,
  );
  assert.throws(
    () =>
      validateRecord("links", {
        id: "l",
        name: "Test",
        category: "Link",
        url: "javascript:alert(1)",
      }),
    /http/,
  );
  assert.equal(safeURL("javascript:alert(1)"), null);
  assert.throws(
    () =>
      validateRecord("credits", {
        id: "c",
        name: "credit",
        period: "November",
        limit: 10,
        used: 5,
        posted: 7,
        resetDate: "2026-12-01",
      }),
    /posted/,
  );
});
test("calendar export escapes injected newlines and excludes removed plans", () => {
  const base = {
    id: "event",
    tripSlug: "trip",
    date: "2026-12-10",
    time: "12:00",
    title: "Lunch\nBEGIN:VEVENT",
    location: "A,B",
    notes: null,
    bookingId: null,
    kind: "plan" as const,
    status: "planned" as const,
  };
  const ics = itineraryCalendar(
    [base, { ...base, id: "removed", status: "removed" }],
    "Trip",
  );
  assert.equal(
    ics.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length,
    1,
  );
  assert.match(ics, /Lunch\\nBEGIN:VEVENT/);
  assert.match(ics, /LOCATION:A\\,B/);
  assert.ok(!ics.includes("UID:removed"));
});
