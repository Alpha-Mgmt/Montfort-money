"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { tr } from "@/lib/i18n";
import { money } from "@/lib/format";
import { WhenPicker, whenFor, type When } from "@/components/WhenPicker";
import { CategorySelect } from "@/components/CategorySelect";
import { keepSkip, toggleSkip } from "@/lib/recurring";
import type { Category, Frequency, Kind, RecurringItem } from "@/lib/types";

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

export type PlanItemPatch = Pick<RecurringItem, "title" | "amount" | "frequency" | "start_date" | "end_date" | "schedule" | "category_id" | "kind">;

/**
 * THE sheet for a plan line — new or existing. Name, amount, category,
 * how often, when, until; "skip this month"; Delete at the bottom.
 */
export function PlanItemSheet({
  open,
  onClose,
  item,
  kind,
  categoryId,
  categories,
  month,
  defaultDate,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  item: RecurringItem | null; // null = new
  kind: Kind;
  categoryId: string | null;
  categories: Category[];
  month: string; // YYYY-MM-01 (the month being viewed)
  defaultDate: string;
  onSave: (patch: PlanItemPatch) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}) {
  const ym = month.slice(0, 7);
  const [title, setTitle] = useState(item?.title ?? "");
  const [amt, setAmt] = useState(item ? String(item.amount) : "");
  const [cat, setCat] = useState(item?.category_id ?? categoryId ?? "");
  const [freq, setFreq] = useState<Frequency>(item?.frequency ?? "monthly");
  const [when, setWhen] = useState<When>(
    item ? { start_date: item.start_date, schedule: item.schedule ?? null } : whenFor("monthly", defaultDate)
  );
  const [end, setEnd] = useState(item?.end_date ?? "");
  const [skipHere, setSkipHere] = useState(!!item?.schedule?.skip?.includes(ym));
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const hasTaxes = !!(item?.taxes && item.taxes.gross > 0);
  const amount = parseFloat(amt);
  const ok = title.trim().length > 0 && amount > 0;
  const lbl = "faint text-xs";

  async function save() {
    if (!ok) return;
    setBusy(true);
    let schedule = keepSkip(when.schedule, item?.schedule);
    schedule = toggleSkip(schedule, ym, skipHere);
    await onSave({
      title: title.trim(),
      amount: hasTaxes ? item!.amount : Math.round(amount * 100) / 100,
      kind,
      category_id: cat || null,
      frequency: freq,
      start_date: when.start_date,
      end_date: freq === "once" ? null : end || null,
      schedule,
    });
    setBusy(false);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={item ? tr("Edit plan item") : kind === "income" ? tr("New planned income") : tr("New planned expense")}>
      <div className="grid gap-3">
        <label className="grid gap-1">
          <span className={lbl}>{tr("Name")}</span>
          <input className="input" value={title} autoFocus={!item} onChange={(e) => setTitle(e.target.value)} placeholder={kind === "income" ? tr("e.g. bonus") : tr("e.g. car registration")} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className={lbl}>{hasTaxes ? tr("Take-home per payment") : tr("Amount")}</span>
            <input className="input" type="number" step="0.01" min="0" inputMode="decimal" value={amt} disabled={hasTaxes} onChange={(e) => setAmt(e.target.value)} placeholder="0.00" />
          </label>
          <label className="grid gap-1">
            <span className={lbl}>{tr("Category")}</span>
            <CategorySelect cats={categories} kind={kind} value={cat} onChange={setCat} allowEmpty emptyLabel={tr("No category")} />
          </label>
        </div>
        {hasTaxes && <p className="faint text-xs">{tr("This one is calculated from gross pay minus deductions — edit those in your employer card.")}</p>}
        <label className="grid gap-1">
          <span className={lbl}>{tr("How often")}</span>
          <select
            className="input"
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
            <span className={lbl}>{tr("Date")}</span>
            <input className="input" type="date" value={when.start_date} onChange={(e) => setWhen({ start_date: e.target.value, schedule: null })} />
          </label>
        ) : (
          <>
            <WhenPicker freq={freq} value={when} onChange={setWhen} />
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1">
                <span className={lbl}>{tr("Starts")}</span>
                <input className="input" type="date" value={when.start_date} onChange={(e) => setWhen({ ...when, start_date: e.target.value })} />
              </label>
              <label className="grid gap-1">
                <span className={lbl}>{tr("Ends (optional)")}</span>
                <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            </div>
            {item && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={skipHere} onChange={(e) => setSkipHere(e.target.checked)} />
                {tr("Skip this month only")}
              </label>
            )}
          </>
        )}

        <div className="mt-2 flex items-center gap-3">
          <button className="btn btn-primary" disabled={!ok || busy} onClick={save}>
            {busy ? tr("Working…") : item ? tr("Save") : tr("Add to plan")}
          </button>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {tr("Cancel")}
          </button>
          {item && onDelete && (
            <button
              className="btn btn-danger ml-auto"
              disabled={busy}
              onClick={async () => {
                if (!confirmDel) {
                  setConfirmDel(true);
                  setTimeout(() => setConfirmDel(false), 3000);
                  return;
                }
                setBusy(true);
                await onDelete();
                setBusy(false);
                onClose();
              }}
            >
              {confirmDel ? tr("Tap again — removes the plan, keeps what you logged") : tr("Delete")}
            </button>
          )}
        </div>
        {item && (
          <p className="faint text-xs">
            {tr("{amt} · {freq}", { amt: money(item.amount), freq: tr(FREQS.find((f) => f.v === item.frequency)?.label ?? item.frequency) })}
          </p>
        )}
      </div>
    </Sheet>
  );
}
