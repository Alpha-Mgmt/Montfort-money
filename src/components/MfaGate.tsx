"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { mfaStatus, verifyCode } from "@/lib/mfa";
import { useApp } from "@/lib/i18n";

/**
 * Step-up check: ask for the 6-digit code only when an action needs it
 * (connecting a bank, owner tools, turning 2FA off). Once passed, the
 * session stays verified — no more codes until the next sign-in.
 */
export function MfaCodeCard({
  reason,
  onDone,
  onCancel,
}: {
  reason?: string;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const { t } = useApp();
  const [state, setState] = useState<"checking" | "need" | "setup">("checking");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    mfaStatus()
      .then((m) => {
        if (m.verifiedNow) return onDone();
        if (!m.enrolled || !m.factorId) return setState("setup");
        setFactorId(m.factorId);
        setState("need");
      })
      .catch(() => setState("setup"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    onDone();
  }

  if (state === "checking") return null;
  if (state === "setup")
    return (
      <div className="card-soft rounded-2xl p-4 text-sm">
        <p>{t("Turn on two-step verification first (More → Settings → Security).")}</p>
        <Link href="/app/settings" className="btn btn-primary mt-3 inline-flex !py-1.5 text-sm">{t("Go to Security")}</Link>
      </div>
    );
  return (
    <div className="card-soft rounded-2xl p-4">
      <p className="font-semibold">{t("Enter your code")}</p>
      <p className="muted mt-1 text-sm">{reason ?? t("Open your authenticator app and type the 6-digit code for Montfort Money.")}</p>
      <div className="mt-3 flex gap-2">
        <input
          className="input flex-1 text-center font-mono text-xl tracking-[0.35em]"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && code.length === 6 && submit()}
        />
        <button className="btn btn-primary" onClick={submit} disabled={busy || code.length !== 6}>
          {busy ? "…" : t("Verify")}
        </button>
      </div>
      {err && <p className="mt-2 text-sm" style={{ color: "var(--over)" }}>{err}</p>}
      {onCancel && (
        <button className="muted mt-2 text-xs underline-offset-4 hover:underline" onClick={onCancel}>{t("Cancel")}</button>
      )}
    </div>
  );
}
