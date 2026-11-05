// Helpers for signing in with Google on the portal's own domain. Google
// posts an ID token back to /auth/google, which hands it to Supabase, so the
// Google screen names the portal instead of the Supabase project URL.

export const GOOGLE_COOKIE = "portal-google-signin";

// Only same-site paths: "/trips" is fine, "@evil.com" or "//evil.com" is not.
export function safeNext(requested: string | null | undefined): string {
  const path = requested ?? "/";
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")
    ? path
    : "/";
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Google gets the SHA-256 of the nonce; Supabase gets the raw value and
// checks that the token's nonce claim is its hash.
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export function googleAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  hashedNonce: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "id_token",
    response_mode: "form_post",
    scope: "openid email profile",
    state: opts.state,
    nonce: opts.hashedNonce,
    prompt: "select_account",
  }).toString();
  return url.toString();
}
