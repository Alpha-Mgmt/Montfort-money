"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchCategories, fetchDebts, fetchGoals, fetchInvestments, fetchRecurring } from "@/lib/data";
import { monthlyEquivalent } from "@/lib/recurring";
import { debtProgress, debtTypeLabels } from "@/lib/debt";
import { extraNeeded, monthsBetween, simulatePayoff, type Strategy } from "@/lib/payoff";
import { goalMath } from "@/components/GoalSheet";
import { DebtSheet, debtToDraft, emptyDebtDraft, type DebtDraft } from "@/components/MoneySheets";
import { QuickAdd } from "@/components/QuickAdd";
import { addMonths, money, monthLabel, monthStartISO, todayISO } from "@/lib/format";
import { useApp } from "@/lib/i18n";
import type { Category, Debt, Goal, Investment, RecurringItem } from "@/lib/types";

const DEBTY = /debt|deuda|loan|pr[ée]stamo|card|tarjeta|credit|cr[ée]dito|mortgage|hipoteca/i;

export default function DebtsPage() {
  const { t } = useApp();
  const today = todayISO();
  const [debts, setDebts] = useState<Debt[] | null>(null);
  const [recurring, setRecurring] = useState<RecurringItem[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [invs, setInvs] = useState<Investment[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [strategy, setStrategy] = useState<Strategy>("avalanche");
  const [extra, setExtra] = useState("0");
  const [goal, setGoal] = useState("");
  const [typeFilter, setTypeFilter] = useState<Debt["debt_type"] | "all">("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<DebtDraft | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    const supabase = createClient();
    const [d, r, c, i, g, { data: prof }] = await Promise.all([
      fetchDebts(),
      fetchRecurring(),
      fetchCategories(),
      fetchInvestments(),
      fetchGoals(),
      supabase.from("profiles").select("debt_extra,debt_strategy,debt_free_goal").single(),
    ]);
    setDebts(d);
    setRecurring(r);
    setCats(c);
    setInvs(i);
    setGoals(g);
    if (prof) {
      setExtra(String(Number(prof.debt_extra ?? 0)));
      if (prof.debt_strategy === "snowball") setStrategy("snowball");
      setGoal(prof.debt_free_goal ?? "");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function saveSettings(patch: Record<string, unknown>) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.from("profiles").update(patch).eq("id", user.id);
  }

  const live = (debts ?? []).filter((d) => d.balance > 0);
  const extraNum = Math.max(0, Number(extra.replace(/[^0-9.]/g, "")) || 0);
  const plan = useMemo(() => simulatePayoff(live, extraNum, strategy), [live, extraNum, strategy]);
  const base = useMemo(() => simulatePayoff(live, 0, strategy), [live, strategy]);
  const other = useMemo(
    () => simulatePayoff(live, extraNum, strategy === "avalanche" ? "snowball" : "avalanche"),
    [live, extraNum, strategy]
  );
  const totalDebt = live.reduce((s, d) => s + d.balance, 0);
  const minPayments = live.reduce((s, d) => s + d.planned_payment, 0);
  const original = live.reduce((s, d) => s + (d.original_amount ?? d.balance), 0);
  const paidPct = original > 0 ? Math.max(0, Math.min(1, 1 - totalDebt / original)) : 0;
  const freeMonth = plan.months !== null ? addMonths(monthStartISO(), plan.months) : null;

  // goal: debt-free by a date
  const targetMonths = goal ? monthsBetween(today, goal) : null;
  const needed = useMemo(
    () => (targetMonths && targetMonths > 0 ? extraNeeded(live, targetMonths, strategy) : null),
    [live, targetMonths, strategy]
  );

  // what's left over each month in your plan
  const surplus = useMemo(() => {
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const act = recurring.filter((r) => r.active && r.frequency !== "once");
    const income = act.filter((r) => r.kind === "income").reduce((s, r) => s + monthlyEquivalent(r), 0);
    // leave out recurring items that already are debt payments (no double counting)
    const isDebtItem = (r: RecurringItem) =>
      DEBTY.test(r.title) ||
      DEBTY.test(catName.get(r.category_id ?? "") ?? "") ||
      live.some((d) => r.title.toLowerCase().includes(d.name.toLowerCase()));
    const expense = act.filter((r) => r.kind === "expense" && !isDebtItem(r)).reduce((s, r) => s + monthlyEquivalent(r), 0);
    const invIn = invs.filter((i) => i.monthly_kind === "deposit").reduce((s, i) => s + i.monthly_amount, 0);
    const invOut = invs.filter((i) => i.monthly_kind === "withdraw").reduce((s, i) => s + i.monthly_amount, 0);
    const goalsMo = goals.reduce((s, g) => s + (goalMath(g.target_amount, g.saved, g.target_date, "monthly").perMonth ?? 0), 0);
    const left = income + invOut - expense - invIn - goalsMo - minPayments;
    return { income: income + invOut, expense, invIn, goalsMo, left };
  }, [recurring, cats, invs, goals, live, minPayments]);

  function applyExtra(v: number) {
    const r = Math.max(0, Math.round(v));
    setExtra(String(r));
    saveSettings({ debt_extra: r });
    setMsg(t("Extra set to {amt}/mo.", { amt: money(r) }));
    setTimeout(() => setMsg(""), 2500);
  }

  async function pay(d: Debt, amount: number) {
    await createClient().rpc("record_debt_payment", { p_debt_id: d.id, p_amount: amount });
    load();
  }

  const types = Array.from(new Set(live.map((d) => d.debt_type)));
  const byId = new Map(live.map((d) => [d.id, d]));
  const ordered = plan.order.map((o) => ({ ...o, debt: byId.get(o.id)! })).filter((o) => o.debt);
  const shown = ordered.filter((o) => typeFilter === "all" || o.debt.debt_type === typeFilter);
  const monthOf = (n: number | null) => (n === null ? t("never at this payment") : monthLabel(addMonths(monthStartISO(), n)));

  // chart: total balance, with vs without extra
  const chart = useMemo(() => {
    const a = [totalDebt, ...plan.balances];
    const b = [totalDebt, ...base.balances];
    const n = Math.min(Math.max(a.length, b.length), 240);
    const max = Math.max(totalDebt, 1);
    const pts = (arr: number[]) =>
      arr
        .slice(0, n)
        .map((v, i) => `${(i / Math.max(n - 1, 1)) * 100},${40 - (v / max) * 38}`)
        .join(" ");
    return { a: pts(a), b: pts(b) };
  }, [plan, base, totalDebt]);

  if (debts === null) return <p className="faint mt-6 text-center text-sm">{t("Loading…")}</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <div className="flex flex-wrap items-end justify-between gap-3 lg:col-span-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t("Debt payoff")}</h1>
          <p className="muted text-sm">{t("Every debt in one place, a date to be free, and the plan to get there.")}</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setDraft(emptyDebtDraft());
            setSheetOpen(true);
          }}
        >
          {t("Add a debt")}
        </button>
      </div>

      {live.length === 0 ? (
        <div className="card p-8 text-center lg:col-span-3">
          <p className="font-display text-lg font-semibold">{t("No debts tracked")}</p>
          <p className="muted mt-2 text-sm">
            {t("Add your cards and loans — balance, rate and monthly payment — and you'll get your debt-free date and the fastest way there.")}
          </p>
        </div>
      ) : (
        <>
          {/* headline */}
          <div className="card glow-mint grid gap-4 p-6 sm:grid-cols-4 lg:col-span-3">
            <Big label={t("Total debt")} value={money(totalDebt)} color="var(--over)" />
            <Big label={t("Debt-free in")} value={plan.months === null ? "—" : monthOf(plan.months)} color="var(--mint)" small />
            <Big label={t("Interest left to pay")} value={money(plan.totalInterest)} />
            <div>
              <p className="faint text-xs">{t("Paid off so far")}</p>
              <p className="font-display text-2xl font-semibold tabular-nums">{Math.round(paidPct * 100)}%</p>
              <div className="progress-track mt-2">
                <div className="progress-fill" style={{ width: `${paidPct * 100}%` }} />
              </div>
            </div>
          </div>

          {/* attack plan */}
          <div className="card p-6 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Attack plan")}</p>
              <div className="flex gap-1.5">
                {(
                  [
                    ["avalanche", t("Highest interest first")],
                    ["snowball", t("Smallest balance first")],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    className="chip"
                    onClick={() => {
                      setStrategy(k);
                      saveSettings({ debt_strategy: k });
                    }}
                    style={strategy === k ? { background: "var(--mint)", color: "#06130d", borderColor: "var(--mint)" } : undefined}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="muted mt-2 text-sm">
              {strategy === "avalanche"
                ? t("Pay the minimum on everything and put every extra dollar on the highest-rate debt. Saves the most interest.")
                : t("Pay the minimum on everything and knock out the smallest balance first. Quick wins keep you going.")}
            </p>

            {/* balance over time */}
            <svg viewBox="0 0 100 42" preserveAspectRatio="none" className="mt-4 h-28 w-full">
              <polyline points={chart.b} fill="none" stroke="var(--text-faint)" strokeWidth="0.6" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />
              <polyline points={chart.a} fill="none" stroke="var(--mint)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className="faint flex flex-wrap justify-between gap-2 text-xs">
              <span>
                <span style={{ color: "var(--mint)" }}>━</span> {t("With {amt}/mo extra", { amt: money(extraNum) })}
                {plan.months !== null && ` · ${monthOf(plan.months)}`}
              </span>
              <span>
                ┅ {t("Minimums only")}
                {base.months !== null ? ` · ${monthOf(base.months)}` : ` · ${t("never at this payment")}`}
              </span>
            </div>

            {typeof base.months === "number" && typeof plan.months === "number" && base.months > plan.months && (
              <p className="mt-3 rounded-2xl p-3 text-sm" style={{ background: "var(--mint-soft)" }}>
                {t("Your extra gets you free {n} months sooner and saves {amt} in interest.", {
                  n: base.months - plan.months,
                  amt: money(Math.max(0, base.totalInterest - plan.totalInterest)),
                })}
              </p>
            )}

            {types.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {(["all", ...types] as const).map((k) => (
                  <button
                    key={k}
                    className="chip"
                    onClick={() => setTypeFilter(k as any)}
                    style={typeFilter === k ? { background: "var(--mint)", color: "#06130d", borderColor: "var(--mint)" } : undefined}
                  >
                    {k === "all" ? t("All") : t(debtTypeLabels[k as Debt["debt_type"]])}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 grid gap-2">
              {shown.map((o, idx) => {
                const d = o.debt;
                const prog = debtProgress(d);
                const isTarget = ordered[0]?.id === d.id;
                return (
                  <div
                    key={d.id}
                    className="card-soft rounded-2xl px-4 py-3"
                    style={isTarget ? { outline: "1.5px solid var(--mint)" } : undefined}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        className="min-w-0 text-left"
                        onClick={() => {
                          setDraft(debtToDraft(d));
                          setSheetOpen(true);
                        }}
                      >
                        <p className="truncate font-semibold">
                          <span className="faint mr-1.5 text-xs">#{ordered.findIndex((x) => x.id === d.id) + 1}</span>
                          {d.name}
                          {isTarget && (
                            <span className="chip ml-2 !py-0 text-[11px]" style={{ background: "var(--mint)", color: "#06130d", borderColor: "var(--mint)" }}>
                              {t("Focus")}
                            </span>
                          )}
                        </p>
                        <p className="faint text-xs">
                          {t(debtTypeLabels[d.debt_type])} · {d.apr}% APR · {t("{amt}/mo", { amt: money(d.planned_payment) })}
                        </p>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="text-right">
                          <p className="font-semibold tabular-nums">{money(d.balance)}</p>
                          <p className="faint text-[11px]">{t("free {m}", { m: monthOf(o.payoffMonth) })}</p>
                        </div>
                        <QuickAdd label={t("payment to {v0}", { v0: d.name })} onSubmit={(amount) => pay(d, amount)} />
                      </div>
                    </div>
                    {prog !== null && (
                      <div className="progress-track mt-2">
                        <div className="progress-fill" style={{ width: `${prog * 100}%` }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4">
            {/* extra */}
            <div className="card p-6">
              <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Extra toward debt")}</p>
              <div className="mt-3 flex items-end gap-2">
                <label className="grid flex-1 gap-1">
                  <span className="label">{t("Per month, on top of minimums")}</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={extra}
                    onChange={(e) => setExtra(e.target.value)}
                    onBlur={() => saveSettings({ debt_extra: extraNum })}
                  />
                </label>
              </div>
              <p className="faint mt-2 text-xs">{t("Minimums: {amt}/mo · total going to debt: {tot}/mo", { amt: money(minPayments), tot: money(minPayments + extraNum) })}</p>
              {msg && <p className="muted mt-2 text-sm">{msg}</p>}
            </div>

            {/* goal */}
            <div className="card p-6">
              <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Debt-free goal")}</p>
              <label className="mt-3 grid gap-1">
                <span className="label">{t("I want to be debt-free by")}</span>
                <input
                  className="input w-full min-w-0"
                  type="date"
                  value={goal}
                  min={today}
                  onChange={(e) => {
                    setGoal(e.target.value);
                    saveSettings({ debt_free_goal: e.target.value || null });
                  }}
                />
              </label>
              {goal && targetMonths !== null && (
                <div className="mt-3 text-sm">
                  {targetMonths <= 0 ? (
                    <p className="muted">{t("Pick a future date.")}</p>
                  ) : needed === null ? (
                    <p style={{ color: "var(--over)" }}>{t("That date isn't reachable — even paying everything at once. Try a later date.")}</p>
                  ) : needed === 0 ? (
                    <p style={{ color: "var(--mint)" }}>{t("You're on track with minimums alone.")}</p>
                  ) : (
                    <>
                      <p>
                        {t("You need {amt}/mo extra to make it.", { amt: money(needed) })}{" "}
                        {extraNum >= needed ? (
                          <span style={{ color: "var(--mint)" }}>{t("You're on track.")}</span>
                        ) : (
                          <span style={{ color: "var(--warn)" }}>{t("{amt} short right now.", { amt: money(needed - extraNum) })}</span>
                        )}
                      </p>
                      {extraNum < needed && (
                        <button className="btn btn-ghost mt-3 !px-3 !py-1 text-xs" onClick={() => applyExtra(needed)}>
                          {t("Use {amt}/mo", { amt: money(needed) })}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* leftover money */}
            <div className="card p-6">
              <p className="faint text-xs font-semibold uppercase tracking-wide">{t("What's left each month")}</p>
              <div className="mt-3 grid gap-1.5 text-sm">
                <Row label={t("Planned income")} value={surplus.income} />
                <Row label={t("Planned expenses")} value={-surplus.expense} />
                <Row label={t("Debt minimums")} value={-minPayments} />
                {surplus.invIn > 0 && <Row label={t("Investing")} value={-surplus.invIn} />}
                {surplus.goalsMo > 0 && <Row label={t("Goals")} value={-surplus.goalsMo} />}
                <div className="divider my-1" />
                <Row label={t("Left over")} value={surplus.left} strong />
              </div>
              {surplus.income === 0 ? (
                <p className="faint mt-3 text-xs">{t("Add your recurring income and bills in Forecast to see this.")}</p>
              ) : surplus.left > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn btn-ghost !px-3 !py-1 text-xs" onClick={() => applyExtra(surplus.left / 2)}>
                    {t("Put half ({amt})", { amt: money(Math.round(surplus.left / 2)) })}
                  </button>
                  <button className="btn btn-ghost !px-3 !py-1 text-xs" onClick={() => applyExtra(surplus.left)}>
                    {t("Put all ({amt})", { amt: money(Math.round(surplus.left)) })}
                  </button>
                </div>
              ) : (
                <p className="mt-3 text-xs" style={{ color: "var(--warn)" }}>
                  {t("Your plan doesn't leave room for extra payments yet. Trim a recurring expense to free some up.")}
                </p>
              )}
            </div>

            {/* strategy comparison */}
            {plan.months !== null && other.months !== null && (
              <div className="card p-6 text-sm">
                <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Compare methods")}</p>
                <div className="mt-3 grid gap-2">
                  {(
                    [
                      [strategy, plan],
                      [strategy === "avalanche" ? "snowball" : "avalanche", other],
                    ] as const
                  ).map(([k, p]) => (
                    <div key={k}>
                      <p className="muted text-xs">{k === "avalanche" ? t("Highest interest first") : t("Smallest balance first")}</p>
                      <p className="tabular-nums">
                        {monthOf(p.months)} · {t("{amt} interest", { amt: money(p.totalInterest) })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <DebtSheet open={sheetOpen} onClose={() => setSheetOpen(false)} draft={draft} setDraft={setDraft} onSaved={() => { setSheetOpen(false); load(); }} />
    </div>
  );
}

function Big({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <div>
      <p className="faint text-xs">{label}</p>
      <p className={`font-display font-semibold tabular-nums ${small ? "text-xl leading-8" : "text-2xl"}`} style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={strong ? "font-semibold" : "muted"}>{label}</span>
      <span
        className={`tabular-nums ${strong ? "font-semibold" : ""}`}
        style={{ color: strong ? (value < 0 ? "var(--over)" : "var(--mint)") : undefined }}
      >
        {money(value)}
      </span>
    </div>
  );
}
