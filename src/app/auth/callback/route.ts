import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/owner";
import { safeNext } from "@/lib/google-signin";

// Sign-in callback for email links (and Google when GOOGLE_CLIENT_ID is unset): exchanges the code for a
// session cookie, refuses anyone but the owner, then redirects to the page
// the user originally asked for.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (!isOwnerEmail(data.user?.email)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=not-owner`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
