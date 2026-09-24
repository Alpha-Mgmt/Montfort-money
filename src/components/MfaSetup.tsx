"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearUnverified, mfaStatus, verifyCode } from "@/lib/mfa";
import { useApp } from "@/lib/i18n";

/**
 * Settings card: turn on two-step verification with an authenticator app
 * (Google Authenticator, Authy, 1Password, iCloud Keychain…).
 */
export function MfaSetup({ onDone }: { onDone?: () => void }) {
  const { t } = useApp();
  const [status, setStatus] = useState<{ enrolled: boolean; verifiedNow: boolean; factorId: string | null } | null>(null);
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [armOff, setArmOff] = useState(false);

  async function load() {
    try {
      setStatus(await mfaStatus());
    } catch {
      setStatus({ enrolled: false, verifiedNow: false, factorId: null });
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function start() {
    setBusy(true);
    setMsg("");
    await clearUnverified();
    const { data, error } = await createClient().auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Montfort Money ${new Date().toISOString().slice(0, 10)}`,
    });
    setBusy(false);
    if (error || !data) {
      setMsg(t("Couldn't start setup: {e}", { e: error?.message ?? "error" }));
      return;
    }
    setEnroll({ factorId: data.id, qr: safeQr(data.totp.qr_code), secret: data.totp.secret });
  }

  async function confirm() {
    if (!enroll) return;
    setBusy(true);
    const err = await verifyCode(enroll.factorId, code);
    setBusy(false);
    if (err) {
      setMsg(t("That code didn't work. Check the app and try again."));
      return;
    }
    setEnroll(null);
    setCode("");
    setMsg(t("Two-step verification is on."));
    await load();
    onDone?.();
  }

  async function turnOff() {
    if (!status?.factorId) return;
    if (!armOff) {
      setArmOff(true);
      return;
    }
    const { error } = await createClient().auth.mfa.unenroll({ factorId: status.factorId });
    setArmOff(false);
    setMsg(error ? t("To turn it off, sign in again with your code first.") : t("Two-step verification is off."));
    load();
  }

  return (
    <div className="card p-6">
      <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Security")}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{t("Two-step verification")}</p>
          <p className="faint text-xs">
            {status?.enrolled
              ? t("On — you'll enter a 6-digit code from your authenticator app when you sign in.")
              : t("Protect your account with a code from an authenticator app. Required to connect a bank.")}
          </p>
        </div>
        {status && !enroll && (
          <span
            className="chip shrink-0 !py-0 text-[11px]"
            style={status.enrolled ? undefined : { color: "var(--warn)", borderColor: "var(--warn)" }}
          >
            {status.enrolled ? t("On") : t("Off")}
          </span>
        )}
      </div>

      {status && !status.enrolled && !enroll && (
        <button className="btn btn-primary mt-4" onClick={start} disabled={busy}>
          {busy ? "…" : t("Turn on two-step verification")}
        </button>
      )}

      {enroll && (
        <div className="mt-4 grid gap-3">
          <p className="text-sm">
            {t("1. Open an authenticator app (Google Authenticator, Authy, 1Password…) and scan this code.")}
          </p>
          <div className="mx-auto rounded-2xl bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enroll.qr} alt="QR" width={180} height={180} />
          </div>
          <p className="faint break-all text-center text-xs">
            {t("Can't scan? Enter this key:")} <span className="font-mono">{enroll.secret}</span>
          </p>
          <p className="text-sm">{t("2. Type the 6-digit code the app shows.")}</p>
          <div className="flex gap-2">
            <input
              className="input flex-1 text-center font-mono tracking-[0.3em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <button className="btn btn-primary" onClick={confirm} disabled={busy || code.length !== 6}>
              {busy ? "…" : t("Confirm")}
            </button>
          </div>
          <button className="muted justify-self-start text-xs" onClick={() => setEnroll(null)}>
            {t("Cancel")}
          </button>
        </div>
      )}

      {status?.enrolled && (
        <button
          className="btn btn-ghost mt-4 !px-3 !py-1 text-xs"
          style={armOff ? { color: "var(--over)", borderColor: "var(--over)" } : undefined}
          onClick={turnOff}
        >
          {armOff ? t("Tap again to turn off") : t("Turn off")}
        </button>
      )}
      {msg && <p className="muted mt-3 text-sm">{msg}</p>}
    </div>
  );
}

/** Supabase returns `data:image/svg+xml;utf-8,<svg…>` with raw markup; make it a well-formed data URL. */
function safeQr(qr: string): string {
  const i = qr.indexOf(",");
  if (!qr.startsWith("data:image/svg+xml") || i < 0) return qr;
  let svg = qr.slice(i + 1);
  try {
    if (/%3C/i.test(svg)) svg = decodeURIComponent(svg);
  } catch {}
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
