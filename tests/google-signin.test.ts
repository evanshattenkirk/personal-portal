import test from "node:test";
import assert from "node:assert/strict";
import {
  googleAuthUrl,
  randomToken,
  safeNext,
  sha256Hex,
} from "../src/lib/google-signin.ts";

test("safeNext keeps same-site paths and rejects everything else", () => {
  assert.equal(safeNext("/trips"), "/trips");
  assert.equal(safeNext(null), "/");
  assert.equal(safeNext("//evil.com"), "/");
  assert.equal(safeNext("@evil.com"), "/");
  assert.equal(safeNext("/\\evil.com"), "/");
});

test("nonce hash is the hex SHA-256 Supabase expects", async () => {
  assert.equal(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.match(randomToken(), /^[0-9a-f]{64}$/);
});

test("Google URL posts an ID token back to the portal", () => {
  const url = new URL(
    googleAuthUrl({
      clientId: "client",
      redirectUri: "https://portal.example/auth/google",
      state: "s",
      hashedNonce: "n",
    }),
  );
  assert.equal(url.host, "accounts.google.com");
  assert.equal(url.searchParams.get("redirect_uri"), "https://portal.example/auth/google");
  assert.equal(url.searchParams.get("response_type"), "id_token");
  assert.equal(url.searchParams.get("response_mode"), "form_post");
  assert.equal(url.searchParams.get("nonce"), "n");
});
