"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tr } from "@/lib/i18n";
import { shortDate } from "@/lib/format";
import { autoCover } from "@/lib/trips";

type Info = { trip_id: string; name: string; destination: string | null; start_date: string | null; owner_name: string | null; already: boolean };

function JoinTrip() {
  const router = useRouter();
  const code = (useSearchParams().get("code") || "").toUpperCase();
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!code) return setInfo(null);
    createClient()
      .rpc("trip_invite_info", { p_code: code })
      .then(({ data }) => {
        const i = ((data ?? []) as Info[])[0] ?? null;
        if (i?.already) router.replace(`/app/trips/${i.trip_id}`);
        else setInfo(i);
      });
  }, [code, router]);

  async function join() {
    setBusy(true);
    const { data, error } = await createClient().rpc("join_trip", { p_code: code });
    if (error) {
      setBusy(false);
      setErr(error.message);
      return;
    }
    router.replace(`/app/trips/${data as string}`);
  }

  return (
    <div className="mx-auto max-w-md pt-6">
      <div className="card overflow-hidden !p-0 text-center">
        {info === undefined ? (
          <p className="faint p-8 text-sm">{tr("Loading…")}</p>
        ) : !info ? (
          <div className="p-8">
            <p className="font-display text-lg font-semibold">{tr("This invite isn't valid")}</p>
            <p className="muted mt-2 text-sm">{tr("Ask for a new link.")}</p>
          </div>
        ) : (
          <>
            <div className="grid h-36 place-items-center" style={{ background: autoCover(info.destination || info.name) }}>
              <span className="text-4xl">🧳</span>
            </div>
            <div className="grid gap-2 p-6">
              <p className="muted text-sm">{tr("{name} invited you to", { name: info.owner_name ?? tr("Someone") })}</p>
              <p className="font-display text-2xl font-semibold">{info.name}</p>
              <p className="faint text-sm">
                {info.destination}
                {info.start_date ? ` · ${shortDate(info.start_date)}` : ""}
              </p>
              {err && <p className="text-xs" style={{ color: "var(--over)" }}>{err}</p>}
              <button className="btn btn-primary mt-2" onClick={join} disabled={busy}>
                {busy ? tr("Joining…") : tr("Join the trip")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function JoinTripPage() {
  return (
    <Suspense fallback={null}>
      <JoinTrip />
    </Suspense>
  );
}
