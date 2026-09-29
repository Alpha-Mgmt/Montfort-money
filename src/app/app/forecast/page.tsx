"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { tr } from "@/lib/i18n";
import { ForecastView } from "@/components/views/ForecastView";
import { FutureView } from "@/components/views/FutureView";

/** Future: two views of the same question under one menu item. */
function Inner() {
  const router = useRouter();
  const tab = useSearchParams().get("tab") === "wealth" ? "wealth" : "plan";
  const tabs: [string, string][] = [
    ["plan", tr("Next 12 months")],
    ["wealth", tr("Net worth ahead")],
  ];
  return (
    <div className="grid gap-4">
      <div className="card grid max-w-md grid-cols-2 gap-1 p-1">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => router.replace(k === "plan" ? "/app/forecast" : "/app/forecast?tab=" + k)}
            className="rounded-xl py-2 text-sm font-semibold"
            style={tab === k ? { background: "var(--text)", color: "var(--surface)" } : { color: "var(--text-soft)" }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "plan" ? <ForecastView /> : <FutureView />}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
