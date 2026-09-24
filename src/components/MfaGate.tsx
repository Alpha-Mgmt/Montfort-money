"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { verifyCode } from "@/lib/mfa";
import { useApp } from "@/lib/i18n";

/**
 * If the account has two-step verification and this session hasn't passed it
 * yet, ask for the 6-digit code before showing anything else.
 */
export function MfaGate({ children }: { children: React.ReactNode }) {
  const { t } = useApp();
  const [state, setState] = useState<"checking" | "need" | "ok">("checking");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.mfa
      .getAuthenticatorAssuranceLevel()
      .then(async ({ data }) => {
        if (data && data.nextLevel === "aal2" && data.currentLevel !== "aal2") {
          const { data: f } = await supabase.auth.mfa.listFactors();
          const totp = (f?.totp ?? []).find((x) => x.status === "verified");
          if (totp) {
            setFactorId(totp.id);
            setState("need");
            return;
          }
        }
        setState("ok");
      })
      .catch(() => setState("ok"));
  }, []);

  async function submit() {
    if (!factorId) return;
    setBusy(true);
    setErr("");
    const e = await verifyCode(factorId, code);
    setBusy(false);
    if (e) {
      setErr(t("That code didn't work. Check the app and try again."));
      setCode("");
      return;
    }
    setState("ok");
  }

  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  if (state === "ok") return <>{children}</>;
  if (state === "checking") return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "var(--bg)" }}>
      <div className="card w-full max-w-sm p-6 text-center">
        <p className="font-display text-xl font-semibold">{t("Enter your code")}</p>
        <p className="muted mt-2 text-sm">{t("Open your authenticator app and type the 6-digit code for Montfort Money.")}</p>
        <input
          className="input mt-5 w-full text-center font-mono text-2xl tracking-[0.4em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && code.length === 6 && submit()}
        />
        {err && (
          <p className="mt-2 text-sm" style={{ color: "var(--over)" }}>
            {err}
          </p>
        )}
        <button className="btn btn-primary mt-4 w-full" onClick={submit} disabled={busy || code.length !== 6}>
          {busy ? "…" : t("Verify")}
        </button>
        <button className="muted mt-3 text-xs underline-offset-4 hover:underline" onClick={signOut}>
          {t("Sign out")}
        </button>
      </div>
    </div>
  );
}
