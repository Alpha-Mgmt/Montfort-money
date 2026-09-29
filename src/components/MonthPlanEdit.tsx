"use client";

import { useState } from "react";
import { tr } from "@/lib/i18n";
import { money } from "@/lib/format";

/** Quick "this month's plan" editor shown under a row: amount + this month / every month / back. */
export function MonthPlanEdit({
  plan,
  base,
  onSave,
  onClose,
}: {
  plan: number;
  base: number;
  onSave: (amount: number, scope: "month" | "all" | "reset") => Promise<void> | void;
  onClose: () => void;
}) {
  const [val, setVal] = useState(String(plan));
  const [busy, setBusy] = useState(false);
  const custom = Math.abs(plan - base) > 0.004;
  const go = async (scope: "month" | "all" | "reset") => {
    const v = parseFloat(val);
    if (scope !== "reset" && !(v >= 0)) return;
    setBusy(true);
    await onSave(v || 0, scope);
    setBusy(false);
    onClose();
  };
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-lg border p-2 pl-5 text-xs" style={{ borderColor: "var(--border)" }}>
      <span className="faint mr-1">{tr("Plan")}</span>
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
            if (e.key === "Escape") onClose();
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
      <button className="faint ml-auto px-1" onClick={onClose} aria-label={tr("Cancel")}>
        ×
      </button>
    </div>
  );
}
