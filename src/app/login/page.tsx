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
      // Never create accounts from the login form: only the existing owner
      // user can request a link. Also disable signups in Supabase Auth.
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
    <div className="mx-auto max-w-sm pt-16">
      <h1 className="text-xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Magic link by email. Single user: only the owner account can sign in.
      </p>
      {sent ? (
        <div className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          Check your inbox. The sign-in link expires shortly and can be used
          once.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500 focus:outline-none"
          />
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-zinc-100 px-3 py-2.5 text-sm font-semibold text-zinc-900 transition-colors hover:bg-white disabled:opacity-50"
          >
            {busy ? "Sending..." : "Send magic link"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
