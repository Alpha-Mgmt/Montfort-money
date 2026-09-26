"use client";

import { tr } from "@/lib/i18n";
import { money } from "@/lib/format";
import { netOf, taxTotal, TAX_KEYS, TAX_LABELS } from "@/lib/taxes";
import type { Taxes } from "@/lib/types";

/**
 * Gross → taxes → take-home for one income line. The plan keeps using the
 * take-home (`amount`), and `taxes` remembers the gross and the breakdown.
 */
export function TaxEditor({
  amount,
  taxes,
  onChange,
  compact = false,
}: {
  amount: string;
  taxes: Taxes | null | undefined;
  onChange: (v: { amount: string; taxes: Taxes | null }) => void;
  compact?: boolean;
}) {
  const inp = `input ${compact ? "!py-1 !px-2 text-xs" : "!py-1.5 !px-2 text-sm"}`;
  const lbl = "faint text-xs";

  if (!taxes) {
    return (
      <button
        type="button"
        className="faint w-fit text-xs underline underline-offset-4"
        onClick={() => {
          const g = parseFloat(amount) || 0;
          const t: Taxes = { gross: g, mode: "simple", pct: 0 };
          onChange({ amount, taxes: t });
        }}
      >
        {tr("+ taxes (gross vs take-home)")}
      </button>
    );
  }

  const set = (patch: Partial<Taxes>) => {
    const t = { ...taxes, ...patch } as Taxes;
    onChange({ amount: t.gross > 0 ? String(netOf(t)) : amount, taxes: t });
  };
  const num = (v: string) => (v === "" ? null : Math.max(0, parseFloat(v) || 0));
  const val = (v: number | null | undefined) => (v == null ? "" : String(v));
  const tot = taxTotal(taxes);
  const rate = taxes.gross > 0 ? (tot / taxes.gross) * 100 : 0;
  const pctMode = taxes.mode === "simple" && taxes.pct != null;

  return (
    <div className="card-soft grid gap-2 rounded-xl p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className={lbl}>{tr("Gross per payment")}</span>
          <input className={`${inp} !w-28`} type="number" inputMode="decimal" min="0" placeholder="0.00"
            value={taxes.gross || ""} onChange={(e) => set({ gross: num(e.target.value) ?? 0 })} />
        </label>
        <div className="flex gap-1">
          {(["simple", "detailed"] as const).map((m) => (
            <button key={m} type="button"
              className={`btn !px-2.5 !py-0.5 !text-xs ${taxes.mode === m ? "btn-primary" : "btn-ghost"}`}
              onClick={() => set({ mode: m })}>
              {m === "simple" ? tr("Simple") : tr("Detailed")}
            </button>
          ))}
        </div>
      </div>

      {taxes.mode === "simple" ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={lbl}>{tr("Taxes")}</span>
          <input className={`${inp} !w-24`} type="number" inputMode="decimal" min="0" placeholder="0"
            value={pctMode ? val(taxes.pct) : val(taxes.total)}
            onChange={(e) => (pctMode ? set({ pct: num(e.target.value) ?? 0 }) : set({ total: num(e.target.value) ?? 0, pct: null }))} />
          <div className="flex gap-1">
            <button type="button" className={`btn !px-2 !py-0.5 !text-xs ${pctMode ? "btn-primary" : "btn-ghost"}`}
              onClick={() => set({ pct: taxes.gross > 0 ? Math.round((tot / taxes.gross) * 1000) / 10 : 0, total: null })}>%</button>
            <button type="button" className={`btn !px-2 !py-0.5 !text-xs ${!pctMode ? "btn-primary" : "btn-ghost"}`}
              onClick={() => set({ total: tot, pct: null })}>$</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-1.5">
          {TAX_KEYS.map((k) => (
            <div key={k} className="flex flex-wrap items-center gap-1.5">
              <span className={`${lbl} w-28`}>{tr(TAX_LABELS[k])}</span>
              <input className={`${inp} !w-24`} type="number" inputMode="decimal" min="0" placeholder="0.00"
                value={val(taxes[k])} onChange={(e) => set({ [k]: num(e.target.value) } as Partial<Taxes>)} />
              {(k === "social_security" || k === "medicare") && taxes.gross > 0 && (
                <button type="button" className="faint text-xs underline underline-offset-4"
                  onClick={() => set({ [k]: Math.round(taxes.gross * (k === "social_security" ? 6.2 : 1.45)) / 100 } as Partial<Taxes>)}>
                  {k === "social_security" ? "6.2%" : "1.45%"}
                </button>
              )}
            </div>
          ))}
          {(taxes.other ?? []).map((o, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <input className={`${inp} !w-28`} placeholder={tr("e.g. 401k")} value={o.name}
                onChange={(e) => set({ other: (taxes.other ?? []).map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input className={`${inp} !w-24`} type="number" inputMode="decimal" min="0" placeholder="0.00"
                value={o.amount || ""}
                onChange={(e) => set({ other: (taxes.other ?? []).map((x, j) => (j === i ? { ...x, amount: num(e.target.value) ?? 0 } : x)) })} />
              <button type="button" className="faint px-1 text-sm" aria-label={tr("Remove")}
                onClick={() => set({ other: (taxes.other ?? []).filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <button type="button" className="faint w-fit text-xs underline underline-offset-4"
            onClick={() => set({ other: [...(taxes.other ?? []), { name: "", amount: 0 }] })}>
            {tr("+ other deduction (401k, insurance…)")}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          {tr("Taxes")}: <b>{money(tot)}</b>{taxes.gross > 0 && ` (${rate.toFixed(1)}%)`} · {tr("Take-home")}:{" "}
          <b style={{ color: "var(--mint)" }}>{money(taxes.gross > 0 ? netOf(taxes) : parseFloat(amount) || 0)}</b>
        </span>
        <button type="button" className="faint underline underline-offset-4" onClick={() => onChange({ amount, taxes: null })}>
          {tr("Remove taxes")}
        </button>
      </div>
    </div>
  );
}
