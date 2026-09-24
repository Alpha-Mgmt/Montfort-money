"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchCategories, fetchTransactionsRange } from "@/lib/data";
import { buildPnl, estimateQuarterlyTax } from "@/lib/business";
import { money, shortDate, todayISO } from "@/lib/format";
import { useApp } from "@/lib/i18n";
import type { Category, Transaction } from "@/lib/types";

type Period = "month" | "quarter" | "ytd" | "lastyear";

function periodRange(p: Period, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const iso = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  const next = (yy: number, mm: number) => (mm === 12 ? iso(yy + 1, 1) : iso(yy, mm + 1));
  if (p === "month") return { from: iso(y, m), to: next(y, m) };
  if (p === "quarter") {
    const qs = Math.floor((m - 1) / 3) * 3 + 1;
    return { from: iso(y, qs), to: qs + 3 > 12 ? iso(y + 1, 1) : iso(y, qs + 3) };
  }
  if (p === "ytd") return { from: iso(y, 1), to: next(y, m) };
  return { from: iso(y - 1, 1), to: iso(y, 1) };
}

export default function BusinessPage() {
  const { t, lang, space, switchSpace, businessName, taxRate, ready } = useApp();
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const [period, setPeriod] = useState<Period>("month");
  const [cats, setCats] = useState<Category[]>([]);
  const [yearTxs, setYearTxs] = useState<Transaction[]>([]);
  const [lastYearTxs, setLastYearTxs] = useState<Transaction[] | null>(null);
  const [loading, setLoading] = useState(true);

  const [rate, setRate] = useState(String(taxRate));
  const [bizName, setBizName] = useState(businessName ?? "");
  const [savedMsg, setSavedMsg] = useState("");

  const [payAmt, setPayAmt] = useState("");
  const [payDate, setPayDate] = useState(today);
  const [payMsg, setPayMsg] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => setRate(String(taxRate)), [taxRate]);
  useEffect(() => setBizName(businessName ?? ""), [businessName]);

  async function load() {
    setLoading(true);
    const [c, txs] = await Promise.all([
      fetchCategories(),
      fetchTransactionsRange(`${year}-01-01`, `${year + 1}-01-01`),
    ]);
    setCats(c);
    setYearTxs(txs);
    setLoading(false);
  }

  useEffect(() => {
    if (ready && space === "business") load();
    else if (ready) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, space]);

  useEffect(() => {
    if (period === "lastyear" && lastYearTxs === null && space === "business")
      fetchTransactionsRange(`${year - 1}-01-01`, `${year}-01-01`).then(setLastYearTxs);
  }, [period, lastYearTxs, space, year]);

  const range = periodRange(period, today);
  const pnl = useMemo(() => {
    const src = period === "lastyear" ? lastYearTxs ?? [] : yearTxs;
    return buildPnl(
      src.filter((x) => x.tx_date >= range.from && x.tx_date < range.to),
      cats
    );
  }, [period, yearTxs, lastYearTxs, cats, range.from, range.to]);

  const rateNum = Math.min(Math.max(Number(rate) || 0, 0), 60);
  const quarters = useMemo(
    () => estimateQuarterlyTax(yearTxs, cats, year, rateNum, today),
    [yearTxs, cats, year, rateNum, today]
  );

  async function saveSettings() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ tax_rate: rateNum, business_name: bizName.trim() || null })
      .eq("id", user.id);
    setSavedMsg(error ? t("Couldn't save.") : t("Saved."));
    setTimeout(() => setSavedMsg(""), 2500);
  }

  async function payOwner() {
    const amt = Number(payAmt.replace(/[^0-9.]/g, ""));
    if (!amt || amt <= 0) return;
    setPaying(true);
    const { error } = await createClient().rpc("pay_owner", {
      p_amount: amt,
      p_date: payDate,
      p_note: null,
      p_lang: lang,
    });
    setPaying(false);
    if (error) {
      setPayMsg(t("Couldn't record it. Try again."));
      return;
    }
    setPayAmt("");
    setPayMsg(t("Done — {amt} moved from Business to Personal.", { amt: money(amt) }));
    if (space === "business") load();
  }

  const periods: [Period, string][] = [
    ["month", t("This month")],
    ["quarter", t("This quarter")],
    ["ytd", t("Year to date")],
    ["lastyear", t("Last year")],
  ];

  const payCard = (
    <div className="card p-6">
      <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Pay yourself")}</p>
      <p className="muted mt-1 text-sm">
        {t("Move money from the business to you. It's recorded as business spending and personal income in one step.")}
      </p>
      <div className="mt-4 grid gap-3">
        <label className="grid gap-1">
          <span className="label">{t("Amount")}</span>
          <input
            className="input"
            inputMode="decimal"
            placeholder="$0"
            value={payAmt}
            onChange={(e) => setPayAmt(e.target.value)}
          />
        </label>
        <label className="grid gap-1">
          <span className="label">{t("Date")}</span>
          <input className="input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
        </label>
      </div>
      <button className="btn btn-primary mt-4 w-full" disabled={paying || !payAmt} onClick={payOwner}>
        {paying ? "…" : t("Pay myself")}
      </button>
      {payMsg && <p className="muted mt-2 text-sm">{payMsg}</p>}
      {pnl.profit > 0 && space === "business" && (
        <p className="faint mt-3 text-xs">
          {t("Suggested: keep {tax} for taxes; up to {pay} of this period's profit is left to pay yourself.", {
            tax: money(pnl.profit * (rateNum / 100)),
            pay: money(Math.max(pnl.profit * (1 - rateNum / 100) - pnl.ownerPay, 0)),
          })}
        </p>
      )}
    </div>
  );

  if (ready && space !== "business") {
    return (
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="lg:col-span-2">
          <h1 className="font-display text-2xl font-semibold">{t("Business tools")}</h1>
          <p className="muted text-sm">{t("Profit & loss, quarterly taxes and paying yourself.")}</p>
        </div>
        <div className="card glow-mint p-6">
          <p className="font-display text-lg font-semibold">{t("Your business gets its own space")}</p>
          <p className="muted mt-2 text-sm">
            {t("Switch to Business and the whole app — plan, recurring, goals, AI — works for your business, kept apart from your personal money.")}
          </p>
          <button className="btn btn-primary mt-4" onClick={() => switchSpace("business")}>
            {t("Switch to Business")}
          </button>
        </div>
        {payCard}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <div className="flex flex-wrap items-end justify-between gap-3 lg:col-span-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {businessName || t("Business tools")}
          </h1>
          <p className="muted text-sm">{t("Profit & loss, quarterly taxes and paying yourself.")}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {periods.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setPeriod(k)}
              className="chip"
              style={
                period === k
                  ? { background: "var(--mint)", color: "#06130d", borderColor: "var(--mint)" }
                  : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* P&L */}
      <div className="card p-6 lg:col-span-2">
        <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Profit & loss")}</p>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Big label={t("Income")} value={pnl.totalIncome} loading={loading} />
          <Big label={t("Expenses")} value={pnl.totalExpenses} loading={loading} />
          <Big label={t("Profit")} value={pnl.profit} signed loading={loading} />
        </div>
        {pnl.margin !== null && (
          <p className="muted mt-1 text-sm">
            {t("Margin")}: <b>{Math.round(pnl.margin * 100)}%</b>
          </p>
        )}
        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          <Lines title={t("Income")} lines={pnl.income} total={pnl.totalIncome} color="var(--chart-income)" empty={t("No income yet in this period.")} t={t} />
          <Lines title={t("Expenses")} lines={pnl.expenses} total={pnl.totalExpenses} color="var(--chart-expense)" empty={t("No expenses yet in this period.")} t={t} />
        </div>
        {pnl.ownerPay > 0 && (
          <p className="muted mt-4 text-sm">
            {t("Paid to yourself this period: {amt} (not counted as an expense).", { amt: money(pnl.ownerPay) })}
          </p>
        )}
      </div>

      <div className="grid gap-4">
        {payCard}
      </div>

      {/* Quarterly taxes */}
      <div className="card p-6 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="faint text-xs font-semibold uppercase tracking-wide">
              {t("Quarterly estimated taxes")} · {year}
            </p>
            <p className="muted mt-1 text-sm">
              {t("How much to set aside from each quarter's profit, and when it's due.")}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="muted">{t("Rate")}</span>
            <input
              className="input !w-20 text-right"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              onBlur={saveSettings}
            />
            <span className="muted">%</span>
          </label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {quarters.map((q) => (
            <div
              key={q.q}
              className="card-soft rounded-2xl p-4"
              style={q.status === "current" ? { outline: "1.5px solid var(--mint)" } : undefined}
            >
              <p className="faint text-xs font-semibold">
                Q{q.q} · {t("due")} {shortDate(q.due)}
              </p>
              <p className="font-display mt-1 text-xl font-semibold tabular-nums">
                {loading ? "—" : money(q.estimate)}
              </p>
              <p className="muted text-xs">
                {t("Profit")} {loading ? "—" : money(q.profit)}
                {q.status === "current" && ` · ${t("so far")}`}
              </p>
            </div>
          ))}
        </div>
        <p className="faint mt-4 text-xs">
          {t("A planning estimate, not tax advice. Many self-employed people set aside 25–30% (income tax + 15.3% self-employment tax). Confirm your rate with a tax professional.")}
        </p>
      </div>

      {/* Business settings */}
      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Business settings")}</p>
        <label className="mt-3 grid gap-1">
          <span className="label">{t("Business name")}</span>
          <input className="input" value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder={t("My business LLC")} />
        </label>
        <button className="btn btn-ghost mt-3" onClick={saveSettings}>
          {t("Save")}
        </button>
        {savedMsg && <p className="muted mt-2 text-sm">{savedMsg}</p>}
      </div>
    </div>
  );
}

function Big({ label, value, signed, loading }: { label: string; value: number; signed?: boolean; loading?: boolean }) {
  return (
    <div>
      <p className="faint text-xs">{label}</p>
      <p
        className="font-display text-2xl font-semibold tabular-nums"
        style={{ color: signed ? (value < 0 ? "var(--over)" : "var(--mint)") : undefined }}
      >
        {loading ? "—" : money(value)}
      </p>
    </div>
  );
}

function Lines({
  title,
  lines,
  total,
  color,
  empty,
  t,
}: {
  title: string;
  lines: { id: string; name: string; icon: string; amount: number }[];
  total: number;
  color: string;
  empty: string;
  t: (k: string) => string;
}) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      {lines.length === 0 ? (
        <p className="faint mt-2 text-sm">{empty}</p>
      ) : (
        <div className="mt-2 grid gap-2.5">
          {lines.map((l) => (
            <div key={l.id}>
              <div className="flex items-center justify-between text-sm">
                <span className="truncate">
                  <span className="mr-1.5">{l.icon}</span>
                  {l.id === "uncategorized" ? t("Uncategorized") : l.name}
                </span>
                <span className="tabular-nums">{money(l.amount)}</span>
              </div>
              <div className="progress-track mt-1">
                <div className="progress-fill" style={{ width: `${total ? (l.amount / total) * 100 : 0}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
