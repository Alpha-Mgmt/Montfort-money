"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/i18n";

type Info = { household_name: string; inviter_name: string; valid: boolean };

function JoinInner() {
  const { t, household, ready } = useApp();
  const params = useSearchParams();
  const code = (params.get("code") || "").toUpperCase();
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!code) {
      setInfo(null);
      return;
    }
    createClient()
      .rpc("household_invite_info", { p_code: code })
      .then(({ data }) => setInfo(((data ?? []) as Info[])[0] ?? null));
  }, [code]);

  async function join() {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("join_household", { p_code: code });
    if (error) {
      setBusy(false);
      setErr(t("Couldn't join: {e}", { e: error.message }));
      return;
    }
    await supabase.rpc("set_space", { p_space: "shared" });
    window.location.href = "/app/couple";
  }

  return (
    <div className="mx-auto grid max-w-md gap-4 pt-6">
      <div className="card glow-mint p-6 text-center">
        {info === undefined || !ready ? (
          <p className="faint text-sm">{t("Loading…")}</p>
        ) : !info || !info.valid ? (
          <>
            <p className="font-display text-lg font-semibold">{t("This invite isn't valid")}</p>
            <p className="muted mt-2 text-sm">{t("It may have expired or already been used. Ask for a new link.")}</p>
          </>
        ) : household ? (
          <>
            <p className="font-display text-lg font-semibold">{t("You're already in a household")}</p>
            <p className="muted mt-2 text-sm">{t("Leave your current household first (Couple page), then open this link again.")}</p>
          </>
        ) : (
          <>
            <p className="font-display text-lg font-semibold">
              {t("{name} invited you", { name: info.inviter_name })}
            </p>
            <p className="muted mt-2 text-sm">
              {t("Join “{h}” to share a space for the money you manage together. Your personal money stays private.", { h: info.household_name })}
            </p>
            <button className="btn btn-primary mt-5 w-full" onClick={join} disabled={busy}>
              {busy ? "…" : t("Join")}
            </button>
            {err && <p className="mt-3 text-sm" style={{ color: "var(--over)" }}>{err}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinInner />
    </Suspense>
  );
}
