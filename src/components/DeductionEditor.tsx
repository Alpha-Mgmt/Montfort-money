"use client";

import { useState } from "react";
import { tr } from "@/lib/i18n";

/**
 * Inline editor for one paycheck deduction (or a new one): amount per
 * paycheck + the month it starts applying. Every paycheck from that month on
 * gets it, including the ones after a raise.
 */
export function DeductionEditor({
  label,
  perCheck,
  fromMonth,
  isNew = false,
  busy = false,
  onSave,
  onRemove,
  onCancel,
}: {
  label?: string;
  perCheck: number;
  fromMonth: string; // YYYY-MM
  isNew?: boolean;
  busy?: boolean;
  onSave: (amount: number, fromMonth: string, name: string) => void;
  onRemove?: (fromMonth: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(label ?? "");
  const [amt, setAmt] = useState(perCheck ? String(Math.round(perCheck * 100) / 100) : "");
  const [from, setFrom] = useState(fromMonth);
  const [askRemove, setAskRemove] = useState(false);
  const value = parseFloat(amt);
  const ok = value > 0 && /^\d{4}-\d{2}$/.test(from) && (!isNew || name.trim().length > 0);
  const input =
    "rounded-lg border px-2 py-1 text-sm outline-none focus:border-[var(--mint)]";
  const st = { background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" };
  return (
    <div className="my-1 grid gap-2 rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      {isNew && (
        <label className="grid gap-1">
          <span className="faint">{tr("Name")}</span>
          <input className={input} style={st} value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("e.g. Vision, Union dues")} autoFocus />
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1">
          <span className="faint">{tr("Per paycheck")}</span>
          <input
            className={`${input} w-28`}
            style={st}
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            autoFocus={!isNew}
          />
        </label>
        <label className="grid gap-1">
          <span className="faint">{tr("Starting")}</span>
          <input className={input} style={st} type="month" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
      </div>
      <p className="faint">{tr("Applies to every paycheck from that month on, raises included.")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn btn-primary !px-3 !py-1 !text-xs"
          disabled={!ok || busy}
          onClick={() => onSave(value, from, name.trim())}
        >
          {busy ? tr("Working…") : tr("Save")}
        </button>
        <button className="faint hover:underline" onClick={onCancel} disabled={busy}>
          {tr("Cancel")}
        </button>
        {onRemove &&
          (askRemove ? (
            <span>
              {tr("Remove from {v0} on?", { v0: from })}{" "}
              <button className="font-semibold" style={{ color: "var(--over)" }} onClick={() => onRemove(from)} disabled={busy}>
                {tr("Yes, remove")}
              </button>
            </span>
          ) : (
            <button className="ml-auto" style={{ color: "var(--over)" }} onClick={() => setAskRemove(true)}>
              {tr("Remove deduction")}
            </button>
          ))}
      </div>
    </div>
  );
}
