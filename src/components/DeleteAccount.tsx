"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MfaCodeCard } from "@/components/MfaGate";
import { useApp } from "@/lib/i18n";

/** Delete my whole account from inside the app (required by the App Store). */
export function DeleteAccount({ email }: { email: string }) {
  const { t } = useApp();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [needCode, setNeedCode] = useState(false);
  const [msg, setMsg] = useState("");

  async function go() {
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) {
      await createClient().auth.signOut().catch(() => {});
      window.location.href = "/?deleted=1";
      return;
    }
    if (j.error === "mfa_required") return setNeedCode(true);
    setMsg(
      j.error === "confirm_mismatch"
        ? t("The email doesn't match.")
        : j.error === "owner_account"
        ? t("The owner account can't be deleted from here.")
        : t("Couldn't delete the account. Try again or email us.")
    );
  }

  return (
    <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
      <p className="text-sm font-medium">{t("Delete my account")}</p>
      <p className="muted mt-1 text-xs">
        {t("Deletes your account and all your data for good, and disconnects your banks. This can't be undone.")}
      </p>
      {!open ? (
        <button className="btn btn-ghost mt-3 !px-3 !py-1 text-xs" style={{ color: "var(--over)", borderColor: "var(--over)" }} onClick={() => setOpen(true)}>
          {t("Delete my account")}
        </button>
      ) : needCode ? (
        <div className="mt-3">
          <MfaCodeCard
            reason={t("Confirm it's you with your code to delete the account.")}
            onDone={() => { setNeedCode(false); go(); }}
            onCancel={() => setNeedCode(false)}
          />
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          <p className="text-xs">{t("Type your email to confirm:")} <b>{email}</b></p>
          <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={email} autoCapitalize="off" />
          <div className="flex gap-2">
            <button
              className="btn btn-primary !py-1.5 text-sm"
              style={{ background: "var(--over)" }}
              disabled={busy || confirm.trim().toLowerCase() !== email.toLowerCase()}
              onClick={go}
            >
              {busy ? "…" : t("Delete forever")}
            </button>
            <button className="btn btn-ghost !py-1.5 text-sm" onClick={() => { setOpen(false); setConfirm(""); }}>{t("Cancel")}</button>
          </div>
          {msg && <p className="text-sm" style={{ color: "var(--over)" }}>{msg}</p>}
        </div>
      )}
    </div>
  );
}
