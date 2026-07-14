"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setError("That email and password don't match. Try again.");
      setBusy(false);
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6">
      <header className="py-6">
        <Link href="/">
          <Wordmark />
        </Link>
      </header>
      <div className="card mt-10 p-7">
        <h1 className="font-display text-2xl font-semibold">Welcome back</h1>
        <p className="muted mt-1 text-sm">Sign in to your account.</p>
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
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm" style={{ color: "var(--over)" }}>{error}</p>}
          <button className="btn btn-primary mt-1" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="mt-5 flex items-center justify-between text-sm">
          <Link href="/reset" className="muted underline-offset-4 hover:underline">
            Forgot password?
          </Link>
          <Link href="/signup" className="muted underline-offset-4 hover:underline">
            Have an invite code?
          </Link>
        </div>
      </div>
    </main>
  );
}
