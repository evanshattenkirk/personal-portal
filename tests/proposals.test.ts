import test from "node:test";
import assert from "node:assert/strict";
import {
  describeChange,
  parseChanges,
  resolveChange,
} from "../src/lib/proposals.ts";
import { validateRecord } from "../src/lib/records.ts";

test("proposal changes accept allowed creates and updates", () => {
  const changes = parseChanges(
    JSON.stringify([
      { op: "create", entity: "suggestions", record: { title: "Carnival Bahamas", category: "stay" } },
      { op: "update", entity: "trips", id: "t1", patch: { startDate: "2027-04-15" } },
    ]),
  );
  assert.equal(changes.length, 2);
  assert.equal(describeChange(changes[0]), "Add idea: Carnival Bahamas");
  assert.equal(describeChange(changes[1]), "Update trip details: startDate");
});

test("proposal changes refuse bookings, unknown fields, new trips, and slug changes", () => {
  assert.throws(() => parseChanges([{ op: "create", entity: "bookings", record: {} }]), /can't be changed/);
  assert.throws(() => parseChanges([{ op: "create", entity: "trips", record: {} }]), /isn't allowed/);
  assert.throws(() => parseChanges([{ op: "create", entity: "suggestions", record: { user_id: "x" } }]), /unknown field/);
  assert.throws(() => parseChanges([{ op: "update", entity: "trips", id: "t1", patch: { slug: "x" } }]), /trip address/);
  assert.throws(() => parseChanges("{not json"), /valid JSON/);
  assert.deepEqual(parseChanges(null), []);
});

test("resolving a change fills defaults and validates the full record", () => {
  const [create] = parseChanges([{ op: "create", entity: "suggestions", record: { title: "Jazz brunch", category: "food" } }]);
  const record = resolveChange(create, null, { tripSlug: "family-trip", id: "new-1" });
  assert.equal(record.tripSlug, "family-trip");
  assert.equal(record.status, "suggested");
  assert.equal(record.id, "new-1");
  const [update] = parseChanges([{ op: "update", entity: "tasks", id: "k1", patch: { status: "done" } }]);
  const existing = { id: "k1", title: "Pick a cruise", tripSlug: null, bookingId: null, dueDate: null, status: "todo", notes: null, snoozedUntil: null };
  assert.equal(resolveChange(update, existing, { tripSlug: null, id: "x" }).status, "done");
  assert.throws(() => resolveChange(update, null, { tripSlug: null, id: "x" }), /no longer exists/);
  const [bad] = parseChanges([{ op: "create", entity: "suggestions", record: { title: "Booked!", category: "stay", status: "booked" } }]);
  assert.throws(() => resolveChange(bad, null, { tripSlug: "t", id: "y" }), /booked/);
});

test("note attachments must be private storage paths", () => {
  const base = { id: "n", tripSlug: "t", body: "see pic", kind: "note", status: "open", aiReply: null, createdAt: null };
  validateRecord("notes", { ...base, attachments: "0b6c2f7e-1d1a-4c55-9d0e-2b8d1c3e4f5a/family-trip/abc.png" });
  assert.throws(() => validateRecord("notes", { ...base, attachments: "../../etc/passwd" }), /attachment/);
  assert.throws(() => validateRecord("notes", { ...base, attachments: "https://evil.example/x.png" }), /attachment/);
});
