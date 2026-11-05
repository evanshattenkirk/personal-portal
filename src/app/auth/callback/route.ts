import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Magic-link callback: exchanges the code for a session cookie, then
// redirects to the page the user originally asked for.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Only same-site paths: "/trips" is fine, "@evil.com" or "//evil.com" is not.
  const requested = searchParams.get("next") ?? "/";
  const next =
    requested.startsWith("/") &&
    !requested.startsWith("//") &&
    !requested.includes("\\")
      ? requested
      : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
