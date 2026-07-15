"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/Logo";

export default function SignupPage() {
  const router = useRouter();
  const [invite, setInvite] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (name.trim().split(/\s+/).length < 2) {
      setError("Please enter your full name (first and last).");
      return;
    }
    if (password.length < 8) {
      setError("Password needs at least 8 characters.");
      return;
    }

    setBusy(true);
    const supabase = createClient();

    const { data: ok, error: codeErr } = await supabase.rpc("check_invite", {
      p_code: invite,
    });
    if (codeErr || !ok) {
      setError("That invite code isn't valid or has been fully used.");
      setBusy(false);
      return;
    }

    const { error: signErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: name.trim(),
          invite_code: invite.trim().toLowerCase(),
        },
      },
    });
    if (signErr) {
      setError(
        signErr.message.includes("already registered")
          ? "That email already has an account. Try signing in."
          : "Something went wrong creating your account. Please try again."
      );
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
      <div className="card mt-8 p-7">
        <span className="chip">Private beta</span>
        <h1 className="mt-3 font-display text-2xl font-semibold">
          Create your account
        </h1>
        <p className="muted mt-1 text-sm">
          You need an invite code to join during the beta.
        </p>
        <form onSubmit={onSubmit} className="mt-6 grid gap-4">
          <div>
            <label className="label" htmlFor="invite">Invite code</label>
            <input
              id="invite"
              required
              className="input"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder="e.g. montfort-beta-01"
              autoCapitalize="none"
            />
          </div>
          <div>
            <label className="label" htmlFor="name">Full name</label>
            <input
              id="name"
              required
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>
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
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm" style={{ color: "var(--over)" }}>{error}</p>}
          <button className="btn btn-primary mt-1" disabled={busy}>
            {busy ? "Creating account…" : "Create account"}
          </button>
          <p className="faint text-center text-xs leading-relaxed">
            By creating an account you agree to our{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </form>
        <p className="muted mt-5 text-center text-sm">
          Already a member?{" "}
          <Link href="/login" className="underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
