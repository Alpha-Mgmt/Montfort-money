"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/Logo";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password needs at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(
        "Couldn't update the password. The link may have expired — request a new one."
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
        <Wordmark />
      </header>
      <div className="card mt-10 p-7">
        <h1 className="font-display text-2xl font-semibold">
          Choose a new password
        </h1>
        <form onSubmit={onSubmit} className="mt-6 grid gap-4">
          <div>
            <label className="label" htmlFor="password">New password</label>
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
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save password"}
          </button>
        </form>
      </div>
    </main>
  );
}
