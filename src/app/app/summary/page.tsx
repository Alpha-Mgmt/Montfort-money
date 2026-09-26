"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchCategories, fetchRecurring, fetchTransactionsRange } from "@/lib/data";
import { occurrenceDates } from "@/lib/recurring";
import { taxParts } from "@/lib/taxes";
import { money, todayISO } from "@/lib/format";
import { tr } from "@/lib/i18n";
import type { Category, RecurringItem, Transaction } from "@/lib/types";

type Period = "mtd" | "qtd" | "ytd" | "last12";

function periodStart(p: Period, today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (p === "mtd") return `${today.slice(0, 7)}-01`;
  if (p === "qtd") return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  if (p === "ytd") return `${y}-01-01`;
  const d = new Date(y, m - 1 - 11, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
const nextDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const n = new Date(y, m - 1, d + 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

/** Bar list: label + amount + share of the biggest. */
function Bars({ rows, color = "var(--mint)" }: { rows: { label: string; sub?: string; amount: number }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  if (!rows.length) return <p className="muted text-sm">{tr("Nothing yet in this period.")}</p>;
  return (
    <div className="grid gap-2.5">
      {rows.map((r) => (
        <div key={r.label + (r.sub ?? "")}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">
              {r.label}
              {r.sub && <span className="faint text-xs"> · {r.sub}</span>}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{money(r.amount)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full" style={{ background: "var(--surface-2)" }}>
            <div className="h-2 rounded-full" style={{ width: `${(r.amount / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SummaryPage() {
  const [period, setPeriod] = useState<Period>("ytd");
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [txs, setTxs] = useState<Transaction[] | null>(null);
  const today = todayISO();
  const from = periodStart(period, today);

  useEffect(() => {
    fetchCategories().then(setCats);
    fetchRecurring().then(setItems);
  }, []);
  useEffect(() => {
    setTxs(null);
    fetchTransactionsRange(from, nextDay(today)).then(setTxs);
  }, [from, today]);

  const data = useMemo(() => {
    const byId = new Map(cats.map((c) => [c.id, c]));
    const groupOf = (id: string | null) => {
      const c = id ? byId.get(id) : undefined;
      if (!c) return tr("Uncategorized");
      const p = c.parent_id ? byId.get(c.parent_id) : undefined;
      return (p ?? c).name;
    };

    // ---- income from the plan (gross → taxes → take-home), paychecks up to today
    let gross = 0;
    let planNet = 0;
    let withTaxes = 0;
    const taxes = new Map<string, number>();
    const sources = new Map<string, { label: string; sub: string; amount: number; gross: number }>();
    for (const it of items) {
      if (!it.active || it.kind !== "income") continue;
      const n = occurrenceDates(it, from, today).length;
      if (!n) continue;
      const net = it.amount * n;
      const g = it.taxes?.gross ? it.taxes.gross * n : net;
      planNet += net;
      gross += g;
      if (it.taxes?.gross) withTaxes++;
      for (const p of taxParts(it.taxes)) taxes.set(p.label, (taxes.get(p.label) ?? 0) + p.amount * n);
      const key = it.id;
      sources.set(key, { label: it.title, sub: groupOf(it.category_id), amount: net, gross: g });
    }
    const taxTotal = [...taxes.values()].reduce((s, v) => s + v, 0);

    // ---- what actually moved
    const list = txs ?? [];
    const realIncome = list.filter((t) => t.kind === "income" && !t.debt_id && !t.investment_id).reduce((s, t) => s + t.amount, 0);
    const spend = new Map<string, number>();
    const spendCat = new Map<string, number>();
    let realExpense = 0;
    let toDebt = 0;
    let toSavings = 0;
    for (const t of list) {
      if (t.kind !== "expense") continue;
      if (t.debt_id) { toDebt += t.amount; continue; }
      if (t.investment_id || t.goal_id) { toSavings += t.amount; continue; }
      realExpense += t.amount;
      const g = groupOf(t.category_id);
      spend.set(g, (spend.get(g) ?? 0) + t.amount);
      const c = t.category_id ? byId.get(t.category_id)?.name : undefined;
      const ck = c && c !== g ? `${g} › ${c}` : g;
      spendCat.set(ck, (spendCat.get(ck) ?? 0) + t.amount);
    }
    const left = realIncome - realExpense - toDebt;
    return {
      gross, planNet, taxTotal, withTaxes,
      taxes: [...taxes.entries()].map(([label, amount]) => ({ label: tr(label), amount })).sort((a, b) => b.amount - a.amount),
      sources: [...sources.values()].sort((a, b) => b.amount - a.amount),
      realIncome, realExpense, toDebt, toSavings, left,
      rate: realIncome > 0 ? (left / realIncome) * 100 : 0,
      spend: [...spend.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount),
      spendCat: [...spendCat.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount).slice(0, 12),
    };
  }, [cats, items, txs, from, today]);

  const Stat = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) => (
    <div>
      <p className="faint text-xs">{label}</p>
      <p className="font-display text-2xl font-semibold tabular-nums" style={tone ? { color: tone } : undefined}>{value}</p>
      {sub && <p className="faint text-[11px]">{sub}</p>}
    </div>
  );
  const periods: { v: Period; label: string }[] = [
    { v: "mtd", label: tr("This month") },
    { v: "qtd", label: tr("This quarter") },
    { v: "ytd", label: tr("This year") },
    { v: "last12", label: tr("12 months") },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{tr("Summary")}</h1>
          <p className="muted text-sm">
            {tr("From {a} to today", {
              a: new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, 1).toLocaleDateString(
                typeof document !== "undefined" && document.documentElement.lang === "es" ? "es-MX" : undefined,
                { day: "numeric", month: "short", year: "numeric" }
              ),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {periods.map((p) => (
            <button key={p.v} className={`btn !px-3 !py-1 !text-sm ${period === p.v ? "btn-primary" : "btn-ghost"}`} onClick={() => setPeriod(p.v)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* earnings */}
      <div className="card glow-mint p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">{tr("What you earned")}</p>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label={tr("Gross")} value={money(data.gross)} sub={tr("before taxes, per your plan")} />
          <Stat label={tr("Taxes & deductions")} value={money(data.taxTotal)} sub={data.gross > 0 ? `${((data.taxTotal / data.gross) * 100).toFixed(1)}% ${tr("of gross")}` : undefined} tone="var(--over)" />
          <Stat label={tr("Take-home (plan)")} value={money(data.planNet)} />
          <Stat label={tr("Take-home (received)")} value={txs ? money(data.realIncome) : "—"} sub={tr("logged or from your bank")} tone="var(--mint)" />
        </div>
        {data.withTaxes === 0 && (
          <p className="faint mt-4 text-xs">
            {tr("Add taxes to your income lines (Forecast → tap an income) to see gross vs take-home.")}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <p className="faint text-xs font-semibold uppercase tracking-wide">{tr("Where your taxes go")}</p>
          <div className="mt-4"><Bars rows={data.taxes} color="var(--over)" /></div>
        </div>
        <div className="card p-6">
          <p className="faint text-xs font-semibold uppercase tracking-wide">{tr("Income by source")}</p>
          <div className="mt-4">
            <Bars rows={data.sources.map((s) => ({ label: s.label, sub: s.gross !== s.amount ? `${s.sub} · ${tr("gross")} ${money(s.gross)}` : s.sub, amount: s.amount }))} />
          </div>
        </div>
      </div>

      {/* spending */}
      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">{tr("Where it went")}</p>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label={tr("Spent")} value={txs ? money(data.realExpense) : "—"} />
          <Stat label={tr("Debt payments")} value={txs ? money(data.toDebt) : "—"} />
          <Stat label={tr("Saved & invested")} value={txs ? money(data.toSavings) : "—"} />
          <Stat label={tr("Left over")} value={txs ? money(data.left) : "—"} sub={data.realIncome > 0 ? `${data.rate.toFixed(0)}% ${tr("of what came in")}` : undefined} tone={data.left < 0 ? "var(--over)" : "var(--mint)"} />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-sm font-semibold">{tr("By group")}</p>
            <Bars rows={data.spend} color="var(--accent-2, #7c83f7)" />
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold">{tr("Top categories")}</p>
            <Bars rows={data.spendCat} color="var(--accent-2, #7c83f7)" />
          </div>
        </div>
      </div>
    </div>
  );
}
