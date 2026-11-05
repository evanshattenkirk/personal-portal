import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/owner";
import {
  GOOGLE_COOKIE,
  googleAuthUrl,
  randomToken,
  safeNext,
  sha256Hex,
} from "@/lib/google-signin";

// GET starts Google sign-in. With GOOGLE_CLIENT_ID set, Google sends the
// user back here (so its screen names the portal); otherwise it falls back
// to Supabase's hosted flow and /auth/callback.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error || !data.url) {
      return NextResponse.redirect(`${origin}/login?error=auth`);
    }
    return NextResponse.redirect(data.url);
  }

  const state = randomToken();
  const nonce = randomToken();
  const response = NextResponse.redirect(
    googleAuthUrl({
      clientId,
      redirectUri: `${origin}/auth/google`,
      state,
      hashedNonce: await sha256Hex(nonce),
    }),
  );
  // Google returns with a cross-site POST, so the cookie must be SameSite=None.
  response.cookies.set(GOOGLE_COOKIE, JSON.stringify({ state, nonce, next }), {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/auth/google",
    maxAge: 600,
  });
  return response;
}

// POST is Google's form_post with the ID token. It must match the state we
// set, then Supabase verifies the token and nonce and starts the session.
export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  const cookieStore = await cookies();
  const saved = cookieStore.get(GOOGLE_COOKIE)?.value;
  cookieStore.delete({ name: GOOGLE_COOKIE, path: "/auth/google" });

  const form = await request.formData();
  const idToken = form.get("id_token");
  const state = form.get("state");

  let pending: { state?: string; nonce?: string; next?: string } = {};
  try {
    pending = saved ? JSON.parse(saved) : {};
  } catch {}

  const fail = NextResponse.redirect(`${origin}/login?error=auth`, 303);
  if (
    typeof idToken !== "string" ||
    !pending.state ||
    !pending.nonce ||
    state !== pending.state
  ) {
    return fail;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce: pending.nonce,
  });
  if (error) {
    return fail;
  }
  if (!isOwnerEmail(data.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not-owner`, 303);
  }
  return NextResponse.redirect(`${origin}${safeNext(pending.next)}`, 303);
}
