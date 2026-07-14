"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/Logo";

export default function ResetPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset/update`,
    });
    setSent(true);
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6">
      <header className="py-6">
        <Link href="/">
          <Wordmark />
        </Link>
      </header>
      <div className="card mt-10 p-7">
        <h1 className="font-display text-2xl font-semibold">Reset password</h1>
        {sent ? (
          <p className="muted mt-3 text-sm leading-relaxed">
            If that email has an account, a reset link is on its way. Open it
            on this device to choose a new password.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 grid gap-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <p className="muted mt-5 text-center text-sm">
          <Link href="/login" className="underline underline-offset-4">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
