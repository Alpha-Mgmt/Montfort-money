"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/i18n";

type Ev = { created_at: string; device: string | null; place: string | null; is_new: boolean };

/** Recent sign-ins + a way to sign out everywhere. */
export function LoginActivity() {
  const { t, lang } = useApp();
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [arm, setArm] = useState(false);

  useEffect(() => {
    fetch("/api/security/login", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setEvents(j.events ?? []))
      .catch(() => setEvents([]));
  }, []);

  async function signOutEverywhere() {
    if (!arm) return setArm(true);
    await createClient().auth.signOut({ scope: "global" });
    window.location.href = "/login";
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleString(lang === "es" ? "es-MX" : "en-US", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="card p-6">
      <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Recent sign-ins")}</p>
      {events === null ? null : events.length === 0 ? (
        <p className="muted mt-2 text-sm">{t("Your sign-ins will show up here.")}</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {events.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {e.device ?? t("Unknown device")}
                  {e.is_new && (
                    <span className="chip ml-2 !py-0 text-[11px]" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>
                      {t("new device")}
                    </span>
                  )}
                </p>
                <p className="faint truncate text-xs">{e.place ?? t("Unknown place")}</p>
              </div>
              <span className="faint shrink-0 text-xs">{when(e.created_at)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="muted mt-4 text-xs">{t("Don't recognize one? Sign out everywhere and change your password.")}</p>
      <button
        className="btn btn-ghost mt-2 !px-3 !py-1 text-xs"
        style={arm ? { color: "var(--over)", borderColor: "var(--over)" } : undefined}
        onClick={signOutEverywhere}
      >
        {arm ? t("Tap again to sign out everywhere") : t("Sign out on all devices")}
      </button>
    </div>
  );
}
