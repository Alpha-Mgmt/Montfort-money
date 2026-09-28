"use client";

import { useState } from "react";
import { tr } from "@/lib/i18n";
import { money } from "@/lib/format";

/** "plan $100" that you can tap: change it for this month only, or for every month. */
export function DebtPlanEditor({
  plan,
  base,
  paid,
  onSave,
}: {
  plan: number; // this month's plan
  base: number; // the usual monthly plan
  paid: number;
  onSave: (amount: number, scope: "month" | "all" | "reset") => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(String(plan));
  const [busy, setBusy] = useState(false);
  const custom = Math.abs(plan - base) > 0.004;
  const go = async (scope: "month" | "all" | "reset") => {
    const v = parseFloat(val);
    if (scope !== "reset" && !(v >= 0)) return;
    setBusy(true);
    await onSave(v || 0, scope);
    setBusy(false);
    setOpen(false);
  };
  if (!open)
    return (
      <button
        className="text-right text-xs hover:underline"
        title={tr("Change this month's plan")}
        onClick={() => {
          setVal(String(plan));
          setOpen(true);
        }}
      >
        {paid > 0 && <span className="chip mr-1">{tr("{amt} paid", { amt: money(paid) })}</span>}
        <span className={custom ? "font-semibold" : "faint"} style={custom ? { color: "var(--mint)" } : undefined}>
          {tr("plan {amt}", { amt: money(plan) })}
        </span>
        <span className="faint"> ✎</span>
      </button>
    );
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
      <span className="relative">
        <span className="faint pointer-events-none absolute left-2 top-1/2 -translate-y-1/2">$</span>
        <input
          className="input !w-24 !py-1 !pl-5 !pr-2 text-sm"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={val}
          autoFocus
          disabled={busy}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") go("month");
            if (e.key === "Escape") setOpen(false);
          }}
        />
      </span>
      <button className="btn btn-primary !px-2.5 !py-1 !text-xs" disabled={busy} onClick={() => go("month")}>
        {tr("This month")}
      </button>
      <button className="btn btn-ghost !px-2.5 !py-1 !text-xs" disabled={busy} onClick={() => go("all")}>
        {tr("Every month")}
      </button>
      {custom && (
        <button className="faint hover:underline" disabled={busy} onClick={() => go("reset")}>
          {tr("Back to {amt}", { amt: money(base) })}
        </button>
      )}
      <button className="faint px-1" onClick={() => setOpen(false)} aria-label={tr("Cancel")}>
        ×
      </button>
    </span>
  );
}
