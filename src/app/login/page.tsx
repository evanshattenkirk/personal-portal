"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const errors: Record<string, string> = {
  "not-owner":
    "That account isn’t allowed into this portal. Sign in with the owner’s Google account.",
  auth: "Sign-in didn’t finish. Please try again.",
};

function callbackUrl(next: string) {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(
    errors[searchParams.get("error") ?? ""] ?? null,
  );
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const signedOut = searchParams.get("signed-out") === "1";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("email");
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl(next), shouldCreateUser: false },
    });
    setBusy(null);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <section className="card" style={{ maxWidth: 460, margin: "60px auto" }}>
      <span className="eyebrow">Your personal portal</span>
      <h1>Welcome back.</h1>
      <p className="page-intro">Sign in to pick up your plans.</p>
      {signedOut && !error && (
        <p className="notice" style={{ marginTop: 24 }}>
          You’re signed out.
        </p>
      )}
      {error && (
        <p role="alert" className="notice danger" style={{ marginTop: 24 }}>
          {error}
        </p>
      )}
      <div className="stack" style={{ marginTop: 24 }}>
        {/* A full page load: /auth/google is a route handler that redirects to Google. */}
        <a
          className="button"
          href={`/auth/google?next=${encodeURIComponent(next)}`}
          onClick={() => setBusy("google")}
          aria-disabled={busy !== null}
        >
          {busy === "google" ? "Opening Google…" : "Continue with Google"}
        </a>
      </div>
      {sent ? (
        <p className="notice" style={{ marginTop: 24 }}>
          Check your inbox for a one-time sign-in link.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="stack" style={{ marginTop: 24 }}>
          <label className="field">
            Or get an email link
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          <button className="button secondary" disabled={busy !== null}>
            {busy === "email" ? "Sending…" : "Send sign-in link"}
          </button>
        </form>
      )}
    </section>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
