"use client";

import { useState } from "react";
import { tr } from "@/lib/i18n";
import { WhenPicker, whenFor, type When } from "@/components/WhenPicker";
import { keepSkip } from "@/lib/recurring";
import type { Frequency, RecurringItem } from "@/lib/types";

const FREQS: { v: Frequency; label: string }[] = [
  { v: "once", label: "This month only" },
  { v: "weekly", label: "Every week" },
  { v: "biweekly", label: "Every 2 weeks" },
  { v: "semimonthly", label: "Twice a month" },
  { v: "monthly", label: "Every month" },
  { v: "quarterly", label: "Every 3 months" },
  { v: "semiannual", label: "Twice a year" },
  { v: "yearly", label: "Every year" },
  { v: "custom", label: "Custom dates" },
];

export type PlanItemPatch = Pick<RecurringItem, "title" | "amount" | "frequency" | "start_date" | "end_date" | "schedule">;

/** Inline editor for one plan line: name, amount, how often, when, until. */
export function PlanItemEditor({
  item,
  busy = false,
  onSave,
  onCancel,
}: {
  item: RecurringItem;
  busy?: boolean;
  onSave: (patch: PlanItemPatch) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [amt, setAmt] = useState(String(item.amount));
  const [freq, setFreq] = useState<Frequency>(item.frequency);
  const [when, setWhen] = useState<When>({ start_date: item.start_date, schedule: item.schedule ?? null });
  const [end, setEnd] = useState(item.end_date ?? "");
  const hasTaxes = !!(item.taxes && item.taxes.gross > 0);
  const amount = parseFloat(amt);
  const ok = title.trim().length > 0 && amount > 0;
  const input = "input !px-2 !py-1 text-sm";
  return (
    <div className="my-1 grid gap-2 rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex flex-wrap gap-2">
        <label className="grid flex-1 gap-1" style={{ minWidth: 140 }}>
          <span className="faint">{tr("Name")}</span>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="grid gap-1">
          <span className="faint">{hasTaxes ? tr("Take-home per payment") : tr("Amount")}</span>
          <input
            className={`${input} !w-28`}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={amt}
            disabled={hasTaxes}
            onChange={(e) => setAmt(e.target.value)}
          />
        </label>
      </div>
      {hasTaxes && <p className="faint">{tr("This one is calculated from gross pay minus deductions — edit those in your employer card.")}</p>}
      <label className="grid gap-1">
        <span className="faint">{tr("How often")}</span>
        <select
          className={`${input} !w-auto`}
          value={freq}
          onChange={(e) => {
            const f = e.target.value as Frequency;
            setFreq(f);
            setWhen(whenFor(f, when.start_date));
            if (f === "once") setEnd("");
          }}
        >
          {FREQS.map((o) => (
            <option key={o.v} value={o.v}>
              {tr(o.label)}
            </option>
          ))}
        </select>
      </label>
      {freq === "once" ? (
        <label className="grid gap-1">
          <span className="faint">{tr("Date")}</span>
          <input className={`${input} !w-40`} type="date" value={when.start_date} onChange={(e) => setWhen({ start_date: e.target.value, schedule: null })} />
        </label>
      ) : (
        <>
          <WhenPicker freq={freq} value={when} onChange={setWhen} compact />
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1">
              <span className="faint">{tr("Starts")}</span>
              <input className={`${input} !w-40`} type="date" value={when.start_date} onChange={(e) => setWhen({ ...when, start_date: e.target.value })} />
            </label>
            <label className="grid gap-1">
              <span className="faint">{tr("Ends (optional)")}</span>
              <input className={`${input} !w-40`} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
        </>
      )}
      <div className="flex items-center gap-3">
        <button
          className="btn btn-primary !px-3 !py-1 !text-xs"
          disabled={!ok || busy}
          onClick={() =>
            onSave({
              title: title.trim(),
              amount: hasTaxes ? item.amount : Math.round(amount * 100) / 100,
              frequency: freq,
              start_date: when.start_date,
              end_date: freq === "once" ? null : end || null,
              schedule: keepSkip(when.schedule, item.schedule),
            })
          }
        >
          {busy ? tr("Working…") : tr("Save")}
        </button>
        <button className="faint hover:underline" onClick={onCancel} disabled={busy}>
          {tr("Cancel")}
        </button>
      </div>
    </div>
  );
}
