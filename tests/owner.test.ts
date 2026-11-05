import test from "node:test";
import assert from "node:assert/strict";
import { isOwnerEmail, ownerEmails } from "../src/lib/owner.ts";

test("owner check matches the configured address, ignoring case and spaces", () => {
  const raw = " Shattenkirke@Gmail.com ";
  assert.equal(isOwnerEmail("shattenkirke@gmail.com", raw), true);
  assert.equal(isOwnerEmail("SHATTENKIRKE@gmail.com ", raw), true);
  assert.equal(isOwnerEmail("someone@gmail.com", raw), false);
  assert.equal(isOwnerEmail(null, raw), false);
});

test("owner check fails closed when no owner is configured", () => {
  assert.deepEqual(ownerEmails(""), []);
  assert.equal(isOwnerEmail("shattenkirke@gmail.com", ""), false);
  assert.equal(isOwnerEmail("shattenkirke@gmail.com", undefined), false);
});

test("owner list accepts comma-separated addresses", () => {
  const raw = "a@example.com, shattenkirke@gmail.com";
  assert.equal(isOwnerEmail("shattenkirke@gmail.com", raw), true);
  assert.equal(isOwnerEmail("b@example.com", raw), false);
});
