"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const next = searchParams.get("next") ?? "/";
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <section className="card" style={{ maxWidth: 460, margin: "60px auto" }}>
      <h1>Sign in</h1>
      <p className="page-intro">
        Sign in with your email to pick up your plans.
      </p>
      {sent ? (
        <p className="notice" style={{ marginTop: 24 }}>
          Check your inbox for a one-time sign-in link.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="stack" style={{ marginTop: 24 }}>
          <label className="field">
            Email address
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
          {error && (
            <p role="alert" className="notice danger">
              {error}
            </p>
          )}
          <button className="button" disabled={busy}>
            {busy ? "Sending…" : "Send sign-in link"}
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
