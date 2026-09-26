"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchAccounts,
  fetchCategories,
  fetchDebts,
  fetchInvestments,
  fetchRecurring,
} from "@/lib/data";
import { money, monthLabel, todayISO } from "@/lib/format";
import {
  frequencyLabels,
  monthlyEquivalent,
  projectMonths,
} from "@/lib/recurring";
import {
  debtProgress,
  monthsToPayoff,
  payoffLabel,
  payoffMonth,
  projectInvestment,
  totalInterestRemaining,
} from "@/lib/debt";
import { Sheet } from "@/components/Sheet";
import { CategorySelect, categoryPath } from "@/components/CategorySelect";
import { ForecastChart } from "@/components/ForecastChart";
import { FrequencyPicker } from "@/components/FrequencyPicker";
import { WhenPicker, whenFor } from "@/components/WhenPicker";
import { TaxEditor } from "@/components/TaxEditor";
import { ProgressBar } from "@/components/ProgressBar";
import type {
  Schedule,
  Taxes,
  Account,
  Category,
  Debt,
  Frequency,
  Investment,
  Kind,
  RecurringItem,
} from "@/lib/types";
import { tr } from "@/lib/i18n";

type View = "all" | "income" | "expenses" | "debts" | "investments";

const viewLabels: Record<View, string> = {
  all: "All",
  income: "Income",
  expenses: "Expenses",
  debts: "Debts",
  investments: "Investments",
};

type Draft = {
  id?: string;
  title: string;
  kind: Kind;
  amount: string;
  category_id: string;
  account_id: string;
  frequency: Frequency;
  start_date: string;
  end_date: string;
  schedule: Schedule | null;
  taxes: Taxes | null;
};

const emptyDraft = (kind: Kind): Draft => ({
  title: "",
  kind,
  amount: "",
  category_id: "",
  account_id: "",
  frequency: "monthly",
  start_date: todayISO(),
  end_date: "",
  schedule: { day: Number(todayISO().slice(8, 10)) },
  taxes: null,
});

export default function ForecastPage() {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [accts, setAccts] = useState<Account[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [invs, setInvs] = useState<Investment[]>([]);
  const [view, setView] = useState<View>("all");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [r, c, a, d, iv] = await Promise.all([
      fetchRecurring(),
      fetchCategories(),
      fetchAccounts(),
      fetchDebts(),
      fetchInvestments(),
    ]);
    setItems(r);
    setCats(c);
    setAccts(a);
    setDebts(d);
    setInvs(iv);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const projection = useMemo(() => projectMonths(items, 12), [items]);
  const monthlyIncome = useMemo(
    () =>
      items
        .filter((i) => i.active && i.kind === "income")
        .reduce((s, i) => s + monthlyEquivalent(i), 0),
    [items]
  );
  const monthlyExpense = useMemo(
    () =>
      items
        .filter((i) => i.active && i.kind === "expense")
        .reduce((s, i) => s + monthlyEquivalent(i), 0),
    [items]
  );
  const yearNet = projection.length
    ? projection[projection.length - 1].cumulative
    : 0;

  const incomeItems = items.filter((i) => i.kind === "income");
  const expenseItems = items.filter((i) => i.kind === "expense");

  function startAdd(kind: Kind) {
    setDraft(emptyDraft(kind));
    setOpen(true);
  }

  function startEdit(it: RecurringItem) {
    setDraft({
      id: it.id,
      title: it.title,
      kind: it.kind,
      amount: String(it.amount),
      category_id: it.category_id ?? "",
      account_id: it.account_id ?? "",
      frequency: it.frequency,
      start_date: it.start_date,
      end_date: it.end_date ?? "",
      schedule: it.schedule ?? null,
      taxes: it.taxes ?? null,
    });
    setOpen(true);
  }

  async function save() {
    if (!draft || !draft.title.trim()) return;
    const amount = parseFloat(draft.amount);
    if (!amount || amount <= 0) return;
    setBusy(true);
    const supabase = createClient();
    const row = {
      title: draft.title.trim(),
      kind: draft.kind,
      amount,
      category_id: draft.category_id || null,
      account_id: draft.account_id || null,
      frequency: draft.frequency,
      start_date: draft.start_date,
      end_date: draft.end_date || null,
      schedule: draft.schedule,
      taxes: draft.kind === "income" ? draft.taxes : null,
    };
    if (draft.id) {
      await supabase.from("recurring_items").update(row).eq("id", draft.id);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase
        .from("recurring_items")
        .insert({ ...row, user_id: user!.id });
    }
    setBusy(false);
    setOpen(false);
    load();
  }

  async function remove() {
    if (!draft?.id) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("recurring_items").delete().eq("id", draft.id);
    setBusy(false);
    setOpen(false);
    load();
  }

  function ItemRow({ it }: { it: RecurringItem }) {
    const path = categoryPath(cats, it.category_id);
    return (
      <button
        onClick={() => startEdit(it)}
        className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm"
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{it.title}</p>
          <p className="faint truncate text-xs">
            {tr(frequencyLabels[it.frequency])}
            {path && ` · ${path.label}`}
            {it.end_date && tr(" · until {v0}", { v0: it.end_date })}
          </p>
        </div>
        <span
          className="shrink-0 font-semibold"
          style={it.kind === "income" ? { color: "var(--mint)" } : undefined}
        >
          {it.kind === "income" ? "+" : "−"}
          {money(it.amount)}
        </span>
      </button>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">{tr("Forecast")}</h1>
          <p className="muted text-sm">
            {tr("Your recurring money, projected over the next 12 months.")}
          </p>
        </div>
      </div>

      {/* view switcher */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(viewLabels) as View[]).map((v) => (
          <button
            key={v}
            className={`btn !px-4 !py-1.5 !text-sm ${view === v ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setView(v)}
          >
            {tr(viewLabels[v])}
          </button>
        ))}
      </div>

      {/* ---------- DEBTS VIEW ---------- */}
      {!loading && view === "debts" && (
        <DebtsView debts={debts} />
      )}

      {/* ---------- INVESTMENTS VIEW ---------- */}
      {!loading && view === "investments" && (
        <InvestmentsView invs={invs} />
      )}

      {/* ---------- INCOME / EXPENSES VIEWS ---------- */}
      {!loading && (view === "income" || view === "expenses") && (
        <div className="grid gap-4">
          <div className="card p-5">
            <p className="faint text-xs font-semibold uppercase tracking-wide">
              {tr("Monthly")}{" "}
{view === "income" ? "income" : "expenses"} (recurring)
            </p>
            <p
              className="font-display text-2xl font-semibold"
              style={view === "income" ? { color: "var(--mint)" } : undefined}
            >
              {money(view === "income" ? monthlyIncome : monthlyExpense)}
            </p>
          </div>
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold">
                {tr("Recurring")}{" "}
{view === "income" ? "income" : "expenses"}
              </h2>
              <button
                className="faint text-sm"
                onClick={() =>
                  startAdd(view === "income" ? "income" : "expense")
                }
              >
                {tr("+ Add")}
              </button>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {(view === "income" ? incomeItems : expenseItems).map((it) => (
                <ItemRow key={it.id} it={it} />
              ))}
              {(view === "income" ? incomeItems : expenseItems).length ===
                0 && (
                <p className="muted py-3 text-sm">{tr("Nothing recurring yet.")}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="faint mt-6 text-center text-sm">{tr("Loading…")}</p>
      ) : view !== "all" ? null : items.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="muted mx-auto mt-2 max-w-sm text-sm">
            {tr("Add your recurring income (salary, rents) and expenses (rent, insurance, subscriptions) and I'll project the next 12 months for you.")}
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <button className="btn btn-primary" onClick={() => startAdd("income")}>
              {tr("+ Recurring income")}
            </button>
            <button className="btn btn-ghost" onClick={() => startAdd("expense")}>
              {tr("+ Recurring expense")}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="card p-5">
              <p className="faint text-xs font-semibold uppercase tracking-wide">
                {tr("Monthly income")}
              </p>
              <p
                className="font-display text-2xl font-semibold"
                style={{ color: "var(--mint)" }}
              >
                {money(monthlyIncome)}
              </p>
            </div>
            <div className="card p-5">
              <p className="faint text-xs font-semibold uppercase tracking-wide">
                {tr("Monthly expenses")}
              </p>
              <p className="font-display text-2xl font-semibold">
                {money(monthlyExpense)}
              </p>
            </div>
            <div className="card p-5">
              <p className="faint text-xs font-semibold uppercase tracking-wide">
                {tr("Net in 12 months")}
              </p>
              <p
                className="font-display text-2xl font-semibold"
                style={{ color: yearNet >= 0 ? "var(--mint)" : "var(--over)" }}
              >
                {yearNet >= 0 ? "+" : "−"}
                {money(Math.abs(yearNet))}
              </p>
            </div>
          </div>

          {/* Chart */}
          <div className="card p-6">
            <h2 className="mb-3 font-display font-semibold">
              {tr("Next 12 months")}
            </h2>
            <ForecastChart data={projection} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            {/* Recurring lists */}
            <div className="card p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold">{tr("Recurring income")}</h2>
                <button
                  className="faint text-sm"
                  onClick={() => startAdd("income")}
                >
                  {tr("+ Add")}
                </button>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {incomeItems.map((it) => (
                  <ItemRow key={it.id} it={it} />
                ))}
                {incomeItems.length === 0 && (
                  <p className="muted py-3 text-sm">
                    {tr("Salary, bonuses, Montfort income, rents…")}
                  </p>
                )}
              </div>
            </div>
            <div className="card p-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold">
                  {tr("Recurring expenses")}
                </h2>
                <button
                  className="faint text-sm"
                  onClick={() => startAdd("expense")}
                >
                  {tr("+ Add")}
                </button>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {expenseItems.map((it) => (
                  <ItemRow key={it.id} it={it} />
                ))}
                {expenseItems.length === 0 && (
                  <p className="muted py-3 text-sm">
                    {tr("Rent, insurance, subscriptions, car payments…")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Month-by-month table */}
          <div className="card overflow-x-auto p-6">
            <h2 className="mb-3 font-display font-semibold">
              {tr("Month by month")}
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="faint text-left text-xs uppercase tracking-wide">
                  <th className="py-2 pr-4 font-semibold">{tr("Month")}</th>
                  <th className="py-2 pr-4 text-right font-semibold">{tr("Income")}</th>
                  <th className="py-2 pr-4 text-right font-semibold">
                    {tr("Expenses")}
                  </th>
                  <th className="py-2 pr-4 text-right font-semibold">{tr("Net")}</th>
                  <th className="py-2 text-right font-semibold">{tr("Cumulative")}</th>
                </tr>
              </thead>
              <tbody>
                {projection.map((p) => (
                  <tr
                    key={p.month}
                    className="divider"
                  >
                    <td className="py-2 pr-4">{monthLabel(p.month)}</td>
                    <td className="py-2 pr-4 text-right">{money(p.income)}</td>
                    <td className="py-2 pr-4 text-right">{money(p.expense)}</td>
                    <td
                      className="py-2 pr-4 text-right font-medium"
                      style={{
                        color: p.net >= 0 ? "var(--mint)" : "var(--over)",
                      }}
                    >
                      {p.net >= 0 ? "+" : "−"}
                      {money(Math.abs(p.net))}
                    </td>
                    <td className="py-2 text-right font-medium">
                      {p.cumulative >= 0 ? "+" : "−"}
                      {money(Math.abs(p.cumulative))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Add / edit sheet */}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={
          draft?.id
            ? tr("Edit recurring item")
            : draft?.kind === "income"
              ? tr("New recurring income")
              : tr("New recurring expense")
        }
      >
        {draft && (
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as Kind[]).map((k) => (
                <button
                  key={k}
                  className={`btn ${draft.kind === k ? "btn-primary" : "btn-ghost"}`}
                  onClick={() =>
                    setDraft({ ...draft, kind: k, category_id: "" })
                  }
                >
                  {k === "expense" ? tr("Expense") : tr("Income")}
                </button>
              ))}
            </div>
            <div>
              <label className="label">{tr("Name")}</label>
              <input
                className="input"
                placeholder={
                  draft.kind === "income" ? tr("e.g. Salary") : tr("e.g. Rent")
                }
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            <div>
              <label className="label">{tr("Amount")}</label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              />
              {draft.kind === "income" && (
                <div className="mt-2">
                  <TaxEditor
                    amount={draft.amount}
                    taxes={draft.taxes}
                    onChange={(v) => setDraft({ ...draft, amount: v.amount, taxes: v.taxes })}
                  />
                </div>
              )}
            </div>
            <div>
              <label className="label">{tr("Repeats")}</label>
              <FrequencyPicker
                value={draft.frequency}
                onChange={(v) =>
                  setDraft({ ...draft, frequency: v as Frequency, ...whenFor(v as Frequency, draft.start_date) })
                }
              />
              <div className="mt-2">
                <WhenPicker
                  freq={draft.frequency}
                  value={{ start_date: draft.start_date, schedule: draft.schedule }}
                  onChange={(w) => setDraft({ ...draft, ...w })}
                />
              </div>
            </div>
            <div>
              <label className="label">{tr("Category")}</label>
              <CategorySelect
                cats={cats}
                kind={draft.kind}
                value={draft.category_id}
                onChange={(id) => setDraft({ ...draft, category_id: id })}
                allowEmpty
              />
            </div>
            {accts.length > 0 && (
              <div>
                <label className="label">{tr("Account")}</label>
                <select
                  className="input"
                  value={draft.account_id}
                  onChange={(e) =>
                    setDraft({ ...draft, account_id: e.target.value })
                  }
                >
                  <option value="">{tr("No account")}</option>
                  {accts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">{tr("Starts")}</label>
                <input
                  className="input"
                  type="date"
                  value={draft.start_date}
                  onChange={(e) =>
                    setDraft({ ...draft, start_date: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">{tr("Ends — optional")}</label>
                <input
                  className="input"
                  type="date"
                  value={draft.end_date}
                  onChange={(e) =>
                    setDraft({ ...draft, end_date: e.target.value })
                  }
                />
              </div>
            </div>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? tr("Saving…") : draft.id ? tr("Save changes") : tr("Add")}
            </button>
            {draft.id && (
              <button className="btn btn-danger" onClick={remove} disabled={busy}>
                {tr("Delete")}
              </button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function DebtsView({ debts }: { debts: Debt[] }) {
  if (debts.length === 0)
    return (
      <div className="card p-8 text-center">
        <p className="muted mx-auto mt-2 max-w-sm text-sm">
          {tr("No debts tracked. Add them from your month page — balance, rate and payment — and this view shows exactly when each one dies.")}
        </p>
      </div>
    );

  const totalBalance = debts.reduce((s, d) => s + d.balance, 0);
  const totalPayment = debts.reduce((s, d) => s + d.planned_payment, 0);
  const payoffs = debts.map((d) => payoffMonth(d));
  const worst = payoffs.some((p) => p === null)
    ? null
    : payoffs.reduce((a, b) => (a! > b! ? a : b), "0000-00");
  const totalInterest = debts.reduce(
    (s, d) => s + (totalInterestRemaining(d) ?? 0),
    0
  );

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-5">
          <p className="faint text-xs font-semibold uppercase tracking-wide">
            {tr("Total debt")}
          </p>
          <p
            className="font-display text-2xl font-semibold"
            style={{ color: "var(--over)" }}
          >
            {money(totalBalance)}
          </p>
        </div>
        <div className="card p-5">
          <p className="faint text-xs font-semibold uppercase tracking-wide">
            {tr("Debt-free by")}
          </p>
          <p className="font-display text-2xl font-semibold">
            {worst ? payoffLabel(worst) : "—"}
          </p>
          <p className="faint text-xs">
            {tr("paying")}{" "}
{money(totalPayment)}/mo total
          </p>
        </div>
        <div className="card p-5">
          <p className="faint text-xs font-semibold uppercase tracking-wide">
            {tr("Interest left to pay")}
          </p>
          <p className="font-display text-2xl font-semibold">
            {money(totalInterest)}
          </p>
          <p className="faint text-xs">{tr("across all debts, at current payments")}</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {debts.map((d) => {
          const pm = payoffMonth(d);
          const n = monthsToPayoff(d.balance, d.apr, d.planned_payment);
          const interest = totalInterestRemaining(d);
          const prog = debtProgress(d);
          return (
            <div key={d.id} className="card p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{d.name}</p>
                <p className="muted text-sm">{money(d.balance)}</p>
              </div>
              {prog !== null && (
                <div className="mt-2">
                  <ProgressBar spent={prog * 100} limit={100} />
                </div>
              )}
              <p className="muted mt-2 text-sm">
                {pm ? (
                  <>
                    {tr("Paid off in")} <strong>{payoffLabel(pm)}</strong>{" "}
                    {tr("({n} payments of {amt})", { n: n ?? 0, amt: money(d.planned_payment) })}
                    {interest !== null &&
                      tr(" · ~{v0} interest from here", { v0: money(interest) })}
                  </>
                ) : (
                  <span style={{ color: "var(--over)" }}>
                    {tr("⚠️ {amt}/mo doesn't cover interest at {apr}% — this one never dies. Raise the payment.", { amt: money(d.planned_payment), apr: d.apr })}
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InvestmentsView({ invs }: { invs: Investment[] }) {
  if (invs.length === 0)
    return (
      <div className="card p-8 text-center">
        <p className="muted mx-auto mt-2 max-w-sm text-sm">
          {tr("No investments tracked. Add them from your month page and this view projects where each balance is heading.")}
        </p>
      </div>
    );

  const total = invs.reduce((s, i) => s + i.balance, 0);
  const totalContributed = invs.reduce((s, i) => s + i.contributed_total, 0);
  const now = new Date();
  const monthsToDec = 12 - now.getMonth();
  const totalEoy = invs.reduce(
    (s, i) => s + projectInvestment(i.balance, i.expected_apr, 0, monthsToDec),
    0
  );
  const total12 = invs.reduce(
    (s, i) => s + projectInvestment(i.balance, i.expected_apr, 0, 12),
    0
  );

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-5">
          <p className="faint text-xs font-semibold uppercase tracking-wide">
            {tr("Invested today")}
          </p>
          <p
            className="font-display text-2xl font-semibold"
            style={{ color: "var(--mint)" }}
          >
            {money(total)}
          </p>
          {totalContributed > 0 && (
            <p className="faint text-xs">
              {money(totalContributed)} contributed since you started tracking
            </p>
          )}
        </div>
        <div className="card p-5">
          <p className="faint text-xs font-semibold uppercase tracking-wide">
            {tr("By end of December")}
          </p>
          <p className="font-display text-2xl font-semibold">
            ~{money(totalEoy)}
          </p>
          <p className="faint text-xs">{tr("at each account's expected return")}</p>
        </div>
        <div className="card p-5">
          <p className="faint text-xs font-semibold uppercase tracking-wide">
            {tr("In 12 months")}
          </p>
          <p className="font-display text-2xl font-semibold">
            ~{money(total12)}
          </p>
          <p className="faint text-xs">{tr("before any new contributions")}</p>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {invs.map((iv) => {
          const eoy = projectInvestment(
            iv.balance,
            iv.expected_apr,
            0,
            monthsToDec
          );
          const in12 = projectInvestment(iv.balance, iv.expected_apr, 0, 12);
          return (
            <div key={iv.id} className="card p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{iv.name}</p>
                <p className="muted text-sm">{money(iv.balance)}</p>
              </div>
              <p className="muted mt-2 text-sm">
                {tr("~{eoy} by December · ~{in12} in 12 months at {apr}%/yr", { eoy: money(eoy), in12: money(in12), apr: iv.expected_apr })}
              </p>
              {iv.contributed_total > 0 && (
                <p className="faint mt-1 text-xs">
                  {money(iv.contributed_total)} of the balance is your own
                  contributions
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
