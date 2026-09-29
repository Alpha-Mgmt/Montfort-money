"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { tr } from "@/lib/i18n";
import { SummaryView } from "@/components/views/SummaryView";
import { OverviewView } from "@/components/views/OverviewView";

/** Summary: two views of the same question under one menu item. */
function Inner() {
  const router = useRouter();
  const tab = useSearchParams().get("tab") === "spaces" ? "spaces" : "year";
  const tabs: [string, string][] = [
    ["year", tr("Your year")],
    ["spaces", tr("All spaces together")],
  ];
  return (
    <div className="grid gap-4">
      <div className="card grid max-w-md grid-cols-2 gap-1 p-1">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => router.replace(k === "year" ? "/app/summary" : "/app/summary?tab=" + k)}
            className="rounded-xl py-2 text-sm font-semibold"
            style={tab === k ? { background: "var(--text)", color: "var(--surface)" } : { color: "var(--text-soft)" }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "year" ? <SummaryView /> : <OverviewView />}
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
