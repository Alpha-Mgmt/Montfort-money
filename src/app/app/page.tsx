"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  buildCategoryTree,
  fetchAccounts,
  fetchBudgetsForMonth,
  fetchCategories,
  fetchDebts,
  fetchGoals,
  fetchInvestments,
  fetchRecurring,
  fetchTasks,
  fetchTransactionsForMonth,
} from "@/lib/data";
import {
  addMonths,
  money,
  monthStartISO,
  shortDate,
  todayISO,
} from "@/lib/format";
import { CategoryDot } from "@/components/CategoryDot";
import {
  frequencyLabels,
  monthlyEquivalent,
  occurrenceDates,
  occurrencesInMonth,
  projectMonths,
  toISO,
} from "@/lib/recurring";
import { monthLabel } from "@/lib/format";
import {
  GoalSheet,
  emptyGoalDraft,
  goalToDraft,
  goalMath,
  type GoalDraft,
} from "@/components/GoalSheet";
import {
  debtProgress,
  payoffLabel,
  payoffMonth,
  projectInvestment,
} from "@/lib/debt";
import { ProgressBar } from "@/components/ProgressBar";
import { QuickAdd } from "@/components/QuickAdd";
import { ConfirmPay } from "@/components/ConfirmPay";
import { LineItemAdd, type LineItemFreq } from "@/components/LineItemAdd";
import { MonthPicker } from "@/components/MonthPicker";
import { AIAssistant } from "@/components/AIAssistant";
import { TxSheet, emptyTxDraft, type TxDraft } from "@/components/TxSheet";
import { CategoryQuickSheet } from "@/components/CategoryQuickSheet";
import {
  DebtSheet,
  InvestmentSheet,
  debtToDraft,
  emptyDebtDraft,
  emptyInvDraft,
  invToDraft,
  type DebtDraft,
  type InvDraft,
} from "@/components/MoneySheets";
import type {
  Account,
  Budget,
  Category,
  Debt,
  Frequency,
  Goal,
  Investment,
  Kind,
  RecurringItem,
  Task,
  Transaction,
} from "@/lib/types";

export default function MonthPage() {
  const [month, setMonth] = useState(monthStartISO());
  const [name, setName] = useState("");
  const [cats, setCats] = useState<Category[]>([]);
  const [accts, setAccts] = useState<Account[]>([]);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [recurring, setRecurring] = useState<RecurringItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [invs, setInvs] = useState<Investment[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [plans, setPlans] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  const [txOpen, setTxOpen] = useState(false);
  const [txDraft, setTxDraft] = useState<TxDraft | null>(null);
  const [debtOpen, setDebtOpen] = useState(false);
  const [debtDraft, setDebtDraft] = useState<DebtDraft | null>(null);
  const [invOpen, setInvOpen] = useState(false);
  const [invDraft, setInvDraft] = useState<InvDraft | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null);
  const [catSheetKind, setCatSheetKind] = useState<Kind | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const [showDebts, setShowDebts] = useState(true);
  const [showInvs, setShowInvs] = useState(true);

  async function load(m = month) {
    const supabase = createClient();
    const [{ data: profile }, c, a, t, r, k, d, iv, gl, pl] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name,show_debts,show_investments")
        .single(),
      fetchCategories(),
      fetchAccounts(),
      fetchTransactionsForMonth(m),
      fetchRecurring(),
      fetchTasks(),
      fetchDebts(),
      fetchInvestments(),
      fetchGoals(),
      fetchBudgetsForMonth(m),
    ]);
    setName((profile?.full_name ?? "").split(" ")[0] ?? "");
    setShowDebts(profile?.show_debts ?? true);
    setShowInvs(profile?.show_investments ?? true);
    setCats(c);
    setAccts(a);
    setTxs(t);
    setRecurring(r);
    setTasks(k);
    setDebts(d);
    setInvs(iv);
    setGoals(gl);
    setPlans(pl);
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const isFuture = month > monthStartISO();
  const quickDate = month === monthStartISO() ? todayISO() : month;

  // debt/investment transactions live in their own sections
  const catTxs = useMemo(
    () => txs.filter((t) => !t.debt_id && !t.investment_id && !t.goal_id),
    [txs]
  );
  const debtPaidThisMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txs)
      if (t.debt_id) m.set(t.debt_id, (m.get(t.debt_id) ?? 0) + t.amount);
    return m;
  }, [txs]);
  const goalAddedThisMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txs)
      if (t.goal_id) m.set(t.goal_id, (m.get(t.goal_id) ?? 0) + t.amount);
    return m;
  }, [txs]);

  const invAddedThisMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txs)
      if (t.investment_id && t.kind === "expense")
        m.set(t.investment_id, (m.get(t.investment_id) ?? 0) + t.amount);
    return m;
  }, [txs]);
  const invWithdrawnThisMonth = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txs)
      if (t.investment_id && t.kind === "income")
        m.set(t.investment_id, (m.get(t.investment_id) ?? 0) + t.amount);
    return m;
  }, [txs]);

  const txByCat = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of catTxs) {
      const key = t.category_id ?? "uncategorized";
      const list = m.get(key) ?? [];
      list.push(t);
      m.set(key, list);
    }
    return m;
  }, [catTxs]);

  const plannedByCat = useMemo(() => {
    const m = new Map<string, { item: RecurringItem; total: number }[]>();
    for (const it of recurring) {
      if (!it.active) continue;
      const times = occurrencesInMonth(
        it.frequency,
        it.start_date,
        it.end_date,
        month
      );
      if (times === 0) continue;
      const key = it.category_id ?? "uncategorized";
      const list = m.get(key) ?? [];
      list.push({ item: it, total: it.amount * times });
      m.set(key, list);
    }
    return m;
  }, [recurring, month]);

  const spentIn = (catId: string) =>
    (txByCat.get(catId) ?? []).reduce((s, t) => s + t.amount, 0);
  const plannedIn = (catId: string) =>
    (plannedByCat.get(catId) ?? []).reduce((s, p) => s + p.total, 0);

  const planByCat = useMemo(
    () => new Map(plans.map((b) => [b.category_id, b])),
    [plans]
  );
  /** the month's plan for a category: sum of its plan items; your manual
   *  number only when the category has no items */
  const planFor = (catId: string) => {
    const items = plannedIn(catId);
    return items > 0 ? items : (planByCat.get(catId)?.limit_amount ?? 0);
  };

  async function savePlan(catId: string, amount: number) {
    const supabase = createClient();
    const existing = planByCat.get(catId);
    if (existing) {
      if (amount > 0)
        await supabase
          .from("budgets")
          .update({ limit_amount: amount })
          .eq("id", existing.id);
      else await supabase.from("budgets").delete().eq("id", existing.id);
    } else if (amount > 0) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("budgets").insert({
        user_id: user!.id,
        category_id: catId,
        month,
        limit_amount: amount,
      });
    }
    load();
  }

  // actuals only — the plan lives next to them everywhere
  // (investment withdrawals ARE income: money coming back to you)
  function kindTotal(kind: Kind) {
    let actual = 0;
    for (const t of txs)
      if (t.kind === kind && (kind === "income" ? !t.debt_id : true))
        actual += t.amount;
    return actual;
  }
  const incomeTotal = kindTotal("income");
  const expenseTotal = kindTotal("expense");
  const net = incomeTotal - expenseTotal;

  const pendingTasks = tasks.filter((t) => t.status === "pending").slice(0, 4);
  const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
  const totalInvested = invs.reduce((s, i) => s + i.balance, 0);
  const debtPaidTotal = [...debtPaidThisMonth.values()].reduce(
    (s, v) => s + v,
    0
  );
  const invContribTotal = [...invAddedThisMonth.values()].reduce(
    (s, v) => s + v,
    0
  );
  const goalContribTotal = [...goalAddedThisMonth.values()].reduce(
    (s, v) => s + v,
    0
  );
  const spendingOnly = Math.max(
    0,
    expenseTotal - debtPaidTotal - invContribTotal - goalContribTotal
  );
  // what your investments generate per month at their expected return
  const invMonthlyIncome = invs.reduce(
    (s, i) => s + (i.balance * i.expected_apr) / 100 / 12,
    0
  );
  const totalGoalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const netWorth = totalInvested - totalDebt;

  // paycheck frequency = your biggest recurring income
  const primaryFreq: Frequency = useMemo(() => {
    const incomes = recurring.filter((r) => r.active && r.kind === "income");
    if (incomes.length === 0) return "monthly";
    return incomes.reduce((a, b) =>
      monthlyEquivalent(a) >= monthlyEquivalent(b) ? a : b
    ).frequency;
  }, [recurring]);

  const goalsPlanMonthly = goals.reduce((sum, g) => {
    const m = goalMath(g.target_amount, g.saved, g.target_date, primaryFreq);
    return sum + (m.perMonth ?? 0);
  }, 0);

  // planned monthly investment flows (deposits = expense side, withdrawals = income side)
  const invPlanDeposit = invs
    .filter((i) => i.monthly_amount > 0 && i.monthly_kind === "deposit")
    .reduce((s, i) => s + i.monthly_amount, 0);
  const invPlanWithdraw = invs
    .filter((i) => i.monthly_amount > 0 && i.monthly_kind === "withdraw")
    .reduce((s, i) => s + i.monthly_amount, 0);

  // 13-month plan from recurring items (index 0 = current month)
  const projection = useMemo(() => projectMonths(recurring, 13), [recurring]);
  const redMonths = projection
    .slice(0, 12)
    .filter((p) => p.net < -0.005)
    .slice(0, 4);

  // how far ahead is the viewed month?
  const monthsAhead = (() => {
    const [cy, cm] = monthStartISO().split("-").map(Number);
    const [vy, vm] = month.split("-").map(Number);
    return (vy - cy) * 12 + (vm - cm);
  })();

  // plan totals for the viewed month: your explicit per-category plans,
  // falling back to the recurring schedule
  const planIncome =
    cats
      .filter((c) => c.kind === "income")
      .reduce((s, c) => s + planFor(c.id), 0) + invPlanWithdraw;
  const planExpense =
    cats
      .filter((c) => c.kind === "expense")
      .reduce((s, c) => s + planFor(c.id), 0) +
    (planByCat.get("uncategorized")?.limit_amount ?? plannedIn("uncategorized")) +
    invPlanDeposit;
  const netWorthShown =
    totalInvested -
    totalDebt +
    (monthsAhead <= 0
      ? net
      : projection.slice(0, monthsAhead + 1).reduce((s, p) => s + p.net, 0));

  // upcoming payments for the rest of THIS month (auto "tasks")
  const upcoming = useMemo(() => {
    const from = todayISO();
    const now = new Date();
    const until = toISO(
      new Date(now.getFullYear(), now.getMonth() + 1, 0) // last day of month
    );
    const list: {
      key: string;
      title: string;
      amount: number;
      date: string;
      type: "recurring" | "debt";
      categoryId?: string | null;
      debtId?: string;
      itemId?: string;
    }[] = [];
    for (const it of recurring) {
      if (!it.active || it.kind !== "expense") continue;
      for (const d of occurrenceDates(it, from, until)) {
        list.push({
          key: `r-${it.id}-${d}`,
          title: it.title,
          amount: it.amount,
          date: d,
          type: "recurring",
          categoryId: it.category_id,
          itemId: it.id,
        });
      }
    }
    const today = new Date();
    for (const d of debts) {
      if (!d.payment_due_day || d.balance <= 0) continue;
      const y = today.getFullYear();
      const m = today.getMonth();
      const lastThis = new Date(y, m + 1, 0).getDate();
      let due = new Date(y, m, Math.min(d.payment_due_day, lastThis));
      if (toISO(due) < from) {
        const lastNext = new Date(y, m + 2, 0).getDate();
        due = new Date(y, m + 1, Math.min(d.payment_due_day, lastNext));
      }
      if (toISO(due) <= until)
        list.push({
          key: `d-${d.id}`,
          title: `${d.name} payment`,
          amount: d.planned_payment,
          date: toISO(due),
          type: "debt",
          debtId: d.id,
        });
    }
    // hide what's already been logged: a linked contribution this month,
    // or any debt payment this month
    const paidItems = new Set(
      txs.filter((t) => t.recurring_item_id).map((t) => t.recurring_item_id!)
    );
    return list
      .filter((u) =>
        u.type === "debt"
          ? !debtPaidThisMonth.has(u.debtId!)
          : !paidItems.has(u.itemId!)
      )
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);
  }, [recurring, debts, txs, debtPaidThisMonth]);

  // runway to the next paycheck (current month view only)
  const runway = useMemo(() => {
    if (monthsAhead !== 0) return null;
    const from = todayISO();
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 45);
    let nextCheck: string | null = null;
    for (const it of recurring) {
      if (!it.active || it.kind !== "income") continue;
      const ds = occurrenceDates(it, from, toISO(horizon)).filter(
        (d) => d > from
      );
      if (ds.length && (!nextCheck || ds[0] < nextCheck)) nextCheck = ds[0];
    }
    if (!nextCheck) return null;
    // bills between now and payday — even when payday is next month
    const paidItems = new Set(
      txs.filter((t) => t.recurring_item_id).map((t) => t.recurring_item_id!)
    );
    const bills: { key: string; title: string; amount: number; date: string }[] =
      [];
    for (const it of recurring) {
      if (!it.active || it.kind !== "expense") continue;
      if (paidItems.has(it.id)) continue;
      for (const d of occurrenceDates(it, from, nextCheck)) {
        if (d > from && d < nextCheck)
          bills.push({ key: `r-${it.id}-${d}`, title: it.title, amount: it.amount, date: d });
      }
    }
    const nowD = new Date();
    for (const d of debts) {
      if (!d.payment_due_day || d.balance <= 0) continue;
      if (debtPaidThisMonth.has(d.id)) continue;
      const lastThis = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 0).getDate();
      let due = new Date(nowD.getFullYear(), nowD.getMonth(), Math.min(d.payment_due_day, lastThis));
      if (toISO(due) <= from) {
        const lastNext = new Date(nowD.getFullYear(), nowD.getMonth() + 2, 0).getDate();
        due = new Date(nowD.getFullYear(), nowD.getMonth() + 1, Math.min(d.payment_due_day, lastNext));
      }
      const dISO = toISO(due);
      if (dISO > from && dISO < nextCheck)
        bills.push({ key: `d-${d.id}`, title: `${d.name} payment`, amount: d.planned_payment, date: dISO });
    }
    const dueSum = bills.reduce((s, b) => s + b.amount, 0);
    const incomeActual = txs
      .filter((t) => t.kind === "income")
      .reduce((s, t) => s + t.amount, 0);
    const expenseActual = txs
      .filter((t) => t.kind === "expense")
      .reduce((s, t) => s + t.amount, 0);
    const onHand = incomeActual - expenseActual;
    // everyday (non-bill) spending pace so far this month, projected to payday
    const dayOfMonth = new Date().getDate();
    const daysToCheck = Math.max(
      0,
      Math.round(
        (new Date(nextCheck).getTime() - new Date(from).getTime()) / 86400000
      )
    );
    const everyday = (spendingOnly / Math.max(1, dayOfMonth)) * daysToCheck;
    const needed = dueSum + everyday;
    const pushable = [...bills].sort((a, b) => b.amount - a.amount).slice(0, 3);
    return {
      nextCheck,
      dueSum,
      everyday,
      onHand,
      covered: onHand >= needed,
      short: needed - onHand,
      pushable,
    };
  }, [monthsAhead, recurring, debts, debtPaidThisMonth, txs, spendingOnly]);

  // ---------- actions ----------
  async function quickAddTx(
    kind: Kind,
    categoryId: string,
    amount: number,
    note = "",
    freq: LineItemFreq = "none",
    date = quickDate,
    itemId: string | null = null
  ) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const catId = categoryId === "uncategorized" ? null : categoryId;
    if (freq === "none") {
      // log money that actually moved (optionally toward a plan item)
      await supabase.from("transactions").insert({
        user_id: user!.id,
        kind,
        amount,
        category_id: catId,
        account_id: accts[0]?.id ?? null,
        tx_date: date || quickDate,
        note: note || null,
        source: "manual",
        recurring_item_id: itemId,
      });
    } else {
      // create a PLAN line item — you fill it up with the item's +
      await supabase.from("recurring_items").insert({
        user_id: user!.id,
        title:
          note ||
          cats.find((c) => c.id === catId)?.name ||
          (kind === "income" ? "Income" : "Expense"),
        kind,
        amount,
        category_id: catId,
        account_id: accts[0]?.id ?? null,
        frequency: freq,
        start_date: date || quickDate,
      });
    }
    load();
  }

  async function deletePlanItem(itemId: string) {
    const supabase = createClient();
    await supabase.from("recurring_items").delete().eq("id", itemId);
    load();
  }

  async function togglePin(catId: string, pinned: boolean) {
    const supabase = createClient();
    await supabase.from("categories").update({ pinned }).eq("id", catId);
    load();
  }

  async function quickPayDebt(debtId: string, amount: number) {
    const supabase = createClient();
    await supabase.rpc("record_debt_payment", {
      p_debt_id: debtId,
      p_amount: amount,
    });
    load();
  }

  async function quickFundGoal(goalId: string, amount: number) {
    const supabase = createClient();
    await supabase.rpc("record_goal_contribution", {
      p_goal_id: goalId,
      p_amount: amount,
    });
    load();
  }

  async function quickContribute(invId: string, amount: number) {
    const supabase = createClient();
    await supabase.rpc("record_contribution", {
      p_investment_id: invId,
      p_amount: amount,
    });
    load();
  }

  async function quickWithdraw(invId: string, amount: number) {
    const supabase = createClient();
    await supabase.rpc("record_withdrawal", {
      p_investment_id: invId,
      p_amount: amount,
    });
    load();
  }

  /** delete a logged transaction, reversing debt/investment/goal balances */
  async function deleteTx(txId: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_transaction", {
      p_tx_id: txId,
    });
    if (error) await supabase.from("transactions").delete().eq("id", txId);
    load();
  }

  async function completeTask(id: string) {
    const supabase = createClient();
    await supabase.rpc("complete_task", { p_task_id: id });
    load();
  }

  function editTx(t: Transaction) {
    setTxDraft({
      id: t.id,
      kind: t.kind,
      amount: String(t.amount),
      category_id: t.category_id ?? "",
      account_id: t.account_id ?? "",
      tx_date: t.tx_date,
      note: t.note ?? "",
    });
    setTxOpen(true);
  }

  // ---------- pieces ----------
  function PlanEditor({ catId, plan }: { catId: string; plan: number }) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState("");
    if (!editing) {
      return (
        <button
          className="faint hover:underline"
          title="Set this month's plan"
          onClick={() => {
            setVal(plan > 0 ? String(plan) : "");
            setEditing(true);
          }}
        >
          / {plan > 0 ? money(plan) : "plan"}
        </button>
      );
    }
    return (
      <span className="flex items-center gap-1">
        <span className="faint">/</span>
        <input
          autoFocus
          className="input !w-24 !px-2 !py-0.5 text-sm"
          type="number"
          inputMode="decimal"
          min="0"
          placeholder="0"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              savePlan(catId, parseFloat(val || "0") || 0);
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={() => {
            savePlan(catId, parseFloat(val || "0") || 0);
            setEditing(false);
          }}
        />
      </span>
    );
  }

  function DeleteCategoryButton({ catId }: { catId: string }) {
    const [confirm, setConfirm] = useState(false);
    return (
      <button
        aria-label="Delete category"
        className="shrink-0 text-xs"
        style={{ color: confirm ? "var(--over)" : "var(--text-faint)" }}
        onClick={async () => {
          if (!confirm) {
            setConfirm(true);
            setTimeout(() => setConfirm(false), 3000);
            return;
          }
          const supabase = createClient();
          await supabase.from("categories").delete().eq("id", catId);
          load();
        }}
      >
        {confirm ? "sure?" : "✕"}
      </button>
    );
  }

  function PlanItemRow({
    item,
    planTotal,
    catId,
    kind,
  }: {
    item: RecurringItem;
    planTotal: number;
    catId: string;
    kind: Kind;
  }) {
    const linked = (txByCat.get(catId) ?? []).filter(
      (t) => t.recurring_item_id === item.id
    );
    const received = linked.reduce((s, t) => s + t.amount, 0);
    const open = expandedItem === item.id;
    const [confirmDel, setConfirmDel] = useState(false);
    const [confirmTxDel, setConfirmTxDel] = useState<string | null>(null);
    const nextMonth = addMonths(month, 1);
    const schedule = occurrenceDates(item, month, nextMonth).filter(
      (d) => d < nextMonth
    );

    return (
      <div className="py-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
            onClick={() => setExpandedItem(open ? null : item.id)}
          >
            <span className="truncate">{item.title}</span>
            <span className="faint text-xs">{open ? "▾" : "▸"}</span>
          </button>
          <span className="shrink-0 text-sm">
            <span className={received > 0 ? "muted" : "faint"}>
              {money(received)}
            </span>
            <span className="muted"> / </span>
            <span className="muted font-medium">{money(planTotal)}</span>
          </span>
          {!isFuture && (
            <ConfirmPay
              amount={item.amount}
              label={`Add to ${item.title}`}
              onConfirm={(amount) =>
                quickAddTx(
                  kind,
                  catId,
                  amount,
                  item.title,
                  "none",
                  todayISO(),
                  item.id
                )
              }
            />
          )}
        </div>
        <div className="mt-1">
          <ProgressBar
            spent={kind === "income" ? Math.min(received, planTotal) : received}
            limit={planTotal}
          />
        </div>
        {open && (
          <div
            className="mt-1 divide-y pl-3"
            style={{ borderColor: "var(--border)" }}
          >
            <p className="faint py-1 text-xs">
              {frequencyLabels[item.frequency]}
              {schedule.length > 0 && (
                <>
                  {" · scheduled "}
                  {schedule.map((d) => shortDate(d)).join(" · ")}
                </>
              )}
            </p>
            {linked.map((t) => (
              <div key={t.id} className="flex items-center gap-2 py-1 text-sm">
                <button
                  onClick={() => editTx(t)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left hover:opacity-80"
                >
                  <span className="faint">{shortDate(t.tx_date)}</span>
                  <span className="muted">{money(t.amount)}</span>
                </button>
                <button
                  aria-label="Delete this entry"
                  className="shrink-0 text-xs"
                  style={{
                    color:
                      confirmTxDel === t.id
                        ? "var(--over)"
                        : "var(--text-faint)",
                  }}
                  onClick={() => {
                    if (confirmTxDel !== t.id) {
                      setConfirmTxDel(t.id);
                      setTimeout(() => setConfirmTxDel(null), 3000);
                      return;
                    }
                    setConfirmTxDel(null);
                    deleteTx(t.id);
                  }}
                >
                  {confirmTxDel === t.id ? "sure?" : "✕"}
                </button>
              </div>
            ))}
            {linked.length === 0 && (
              <p className="faint py-1 text-xs">
                Nothing yet — tap ✓ when money moves.
              </p>
            )}
            <div className="py-1">
              <button
                className="text-xs"
                style={{
                  color: confirmDel ? "var(--over)" : "var(--text-faint)",
                }}
                onClick={() => {
                  if (!confirmDel) {
                    setConfirmDel(true);
                    setTimeout(() => setConfirmDel(false), 3000);
                    return;
                  }
                  deletePlanItem(item.id);
                }}
              >
                {confirmDel
                  ? "Tap again — removes the plan, keeps what you logged"
                  : "Remove plan"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function CategoryRow({ cat, kind }: { cat: Category; kind: Kind }) {
    const rows = txByCat.get(cat.id) ?? [];
    const items = plannedByCat.get(cat.id) ?? [];
    // a tx is "loose" (tap to edit/delete) if it isn't linked to a plan item
    // shown here — including ones whose plan item doesn't occur this month,
    // so nothing you logged ever becomes impossible to remove
    const shownItemIds = new Set(items.map((p) => p.item.id));
    const loose = rows.filter(
      (t) => !t.recurring_item_id || !shownItemIds.has(t.recurring_item_id)
    );
    const spent = spentIn(cat.id);
    const plan = planFor(cat.id);
    const isEmpty = rows.length === 0 && items.length === 0;
    const hasDetail = items.length > 0 || loose.length > 0;
    const isCollapsed = collapsed.has(cat.id);

    return (
      <div className="py-1.5">
        {/* the category line reads as a subtotal — tinted, bolder */}
        <div
          className="-mx-2 flex flex-wrap items-center gap-2 rounded-lg px-2 py-1.5"
          style={{
            background: "color-mix(in srgb, var(--surface-2) 55%, transparent)",
          }}
        >
          {hasDetail ? (
            <button
              aria-label={isCollapsed ? `Expand ${cat.name}` : `Collapse ${cat.name}`}
              className="faint w-4 shrink-0 text-xs"
              onClick={() => toggleCollapse(cat.id)}
            >
              {isCollapsed ? "▸" : "▾"}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <CategoryDot name={cat.name} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {cat.name}
            {isCollapsed && hasDetail && (
              <span className="faint ml-1.5 text-xs font-normal">
                {items.length + loose.length}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-sm">
            <span className={spent > 0 ? "muted" : "faint"}>
              {money(spent)}
            </span>
            {items.length > 0 ? (
              <span className="muted font-medium">/ {money(plan)}</span>
            ) : cat.id !== "uncategorized" ? (
              <PlanEditor catId={cat.id} plan={plan} />
            ) : plan > 0 ? (
              <span className="muted font-medium">/ {money(plan)}</span>
            ) : null}
          </span>
          <LineItemAdd
            defaultDate={quickDate}
            placeholder={
              kind === "income" ? "e.g. bonus" : "e.g. tires, insurance…"
            }
            onSubmit={(amount, note, freq, date) =>
              quickAddTx(kind, cat.id, amount, note, freq, date)
            }
          />
          {isEmpty && cat.id !== "uncategorized" && (
            <DeleteCategoryButton catId={cat.id} />
          )}
        </div>
        {plan > 0 && items.length === 0 && (
          <div className="mt-1.5">
            <ProgressBar
              spent={kind === "income" ? Math.min(spent, plan) : spent}
              limit={plan}
            />
          </div>
        )}
        {hasDetail && !isCollapsed && (
          <div
            className="mt-1 divide-y border-l pl-4 ml-2"
            style={{ borderColor: "var(--border)" }}
          >
            {items.map((p) => (
              <PlanItemRow
                key={p.item.id}
                item={p.item}
                planTotal={p.total}
                catId={cat.id}
                kind={kind}
              />
            ))}
            {loose.map((t) => (
              <button
                key={t.id}
                onClick={() => editTx(t)}
                className="flex w-full items-center justify-between gap-3 py-1.5 text-left text-sm hover:opacity-80"
              >
                <span className="min-w-0 truncate">
                  {t.note || cat.name}
                  <span className="faint">
                    {" "}
                    · {shortDate(t.tx_date)}
                    {t.source === "task" && " · from task"}
                  </span>
                </span>
                <span className="muted shrink-0">{money(t.amount)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function GroupBlock({
    g,
    kind,
    pinnedView = false,
  }: {
    g: Category & { children: Category[] };
    kind: Kind;
    pinnedView?: boolean;
  }) {
    const members = [g as Category, ...g.children];
    const gTotal = members.reduce((s, c) => s + spentIn(c.id), 0);
    const gPlanned = members.reduce((s, c) => s + planFor(c.id), 0);
    const gCollapsed = collapsed.has(`g-${g.id}`);
    return (
      <div className="py-2">
        <div className="flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <button
              aria-label={gCollapsed ? `Expand ${g.name}` : `Collapse ${g.name}`}
              className="faint w-4 shrink-0 text-xs"
              onClick={() => toggleCollapse(`g-${g.id}`)}
            >
              {gCollapsed ? "▸" : "▾"}
            </button>
            <CategoryDot name={g.name} size={10} />
            {g.name}
            {!pinnedView && !gCollapsed && (
              <button
                className="faint ml-1 text-xs font-normal"
                title="Show as its own section"
                onClick={() => togglePin(g.id, true)}
              >
                ↗ own section
              </button>
            )}
          </p>
          <p className="shrink-0 text-sm font-semibold">
            {money(gTotal)}
            {gPlanned > 0 && (
              <span className="muted font-medium"> / {money(gPlanned)}</span>
            )}
          </p>
        </div>
        {!gCollapsed && (
          <div
            className="ml-2 border-l pl-3"
            style={{ borderColor: "var(--border)" }}
          >
            {members.map((c) => (
              <CategoryRow
                key={c.id}
                cat={c.id === g.id ? { ...c, name: "General" } : c}
                kind={kind}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  function KindSection({ kind }: { kind: Kind }) {
    const { groups, standalone } = buildCategoryTree(cats, kind);
    const total = kind === "income" ? incomeTotal : expenseTotal;

    return (
      <div className="card p-6">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-lg font-semibold">
              {kind === "income" ? "Income" : "Expenses"}
            </h2>
            <button
              className="btn btn-ghost !px-2.5 !py-0.5 !text-xs"
              onClick={() => setCatSheetKind(kind)}
            >
              + Category
            </button>
          </div>
          <span
            className="font-display font-semibold"
            style={kind === "income" ? { color: "var(--mint)" } : undefined}
          >
            {money(total)}
            <span className="muted text-sm font-medium">
              {" "}
              / {money(kind === "income" ? planIncome : planExpense)}
            </span>
          </span>
        </div>

        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {groups
            .filter((g) => !g.pinned)
            .map((g) => (
              <GroupBlock key={g.id} g={g} kind={kind} />
            ))}
          {standalone
            .filter((c) => !c.pinned)
            .map((c) => (
              <CategoryRow key={c.id} cat={c} kind={kind} />
            ))}
          {(txByCat.get("uncategorized") ?? []).some(
            (t) => t.kind === kind
          ) && (
            <CategoryRow
              cat={{
                id: "uncategorized",
                name: "Uncategorized",
                icon: "🗂️",
                kind,
                parent_id: null,
              }}
              kind={kind}
            />
          )}
        </div>

      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Header — month control sized like the rail cards below it */}
      <div className="relative z-30 grid items-center gap-3 lg:grid-cols-3 lg:gap-4">
        <h1 className="font-display text-2xl font-semibold lg:col-span-2">
          <span className="text-grad">{name ? `Hey, ${name}` : "Your month"}</span>
        </h1>
        <div className="card flex items-center justify-between px-2 py-1.5">
          <button
            className="btn btn-ghost !border-0 !px-3"
            onClick={() => setMonth(addMonths(month, -1))}
            aria-label="Previous month"
          >
            ←
          </button>
          <MonthPicker value={month} onChange={setMonth} />
          <button
            className="btn btn-ghost !border-0 !px-3"
            onClick={() => setMonth(addMonths(month, 1))}
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>

      {loading ? (
        <p className="faint mt-10 text-center text-sm">Loading your month…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
          <div className="grid gap-4 lg:col-span-2">
            {/* Simple summary — three numbers, details on demand */}
            <div className="card p-5">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="faint text-xs font-semibold uppercase tracking-wide">
                    Income
                  </p>
                  <p
                    className="font-display text-xl font-semibold"
                    style={{ color: "var(--mint)" }}
                  >
                    {money(incomeTotal)}
                  </p>
                  {planIncome > 0 && (
                    <p className="faint text-xs">of {money(planIncome)}</p>
                  )}
                </div>
                <div>
                  <p className="faint text-xs font-semibold uppercase tracking-wide">
                    Spent
                  </p>
                  <p className="font-display text-xl font-semibold">
                    {money(expenseTotal)}
                  </p>
                  {planExpense > 0 && (
                    <p className="faint text-xs">of {money(planExpense)}</p>
                  )}
                </div>
                <div>
                  <p className="faint text-xs font-semibold uppercase tracking-wide">
                    Left
                  </p>
                  <p
                    className="font-display text-xl font-semibold"
                    style={{ color: net >= 0 ? "var(--mint)" : "var(--over)" }}
                  >
                    {net >= 0 ? "" : "−"}
                    {money(Math.abs(net))}
                  </p>
                  {planIncome - planExpense !== 0 && (
                    <p className="faint text-xs">
                      {planIncome - planExpense >= 0 ? "+" : "−"}
                      {money(Math.abs(planIncome - planExpense))} planned
                    </p>
                  )}
                </div>
              </div>

              <button
                className="faint mt-3 flex items-center gap-1 text-xs hover:underline"
                onClick={() => setSummaryOpen((v) => !v)}
              >
                {summaryOpen ? "Hide breakdown ▴" : "Show breakdown ▾"}
              </button>

              {summaryOpen && (
                <div className="divider mt-3 grid gap-3 pt-3 text-sm">
                  <div>
                    <p className="faint mb-1 text-xs font-semibold uppercase tracking-wide">
                      Coming in
                    </p>
                    <div className="grid gap-0.5">
                      {cats
                        .filter((c) => c.kind === "income")
                        .map((c) => {
                          const rec = (txByCat.get(c.id) ?? [])
                            .filter((t) => t.kind === "income")
                            .reduce((s, t) => s + t.amount, 0);
                          const plan = planFor(c.id);
                          if (rec <= 0 && plan <= 0) return null;
                          return (
                            <div key={c.id} className="flex justify-between">
                              <span className="muted">{c.name}</span>
                              <span style={{ color: "var(--mint)" }}>
                                {money(rec)}
                                {plan > rec && (
                                  <span className="faint">
                                    {" "}
                                    / {money(plan)}
                                  </span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      {invMonthlyIncome > 0 && (
                        <div className="flex justify-between">
                          <span className="faint">Investments (est.)</span>
                          <span style={{ color: "var(--mint)" }}>
                            +{money(invMonthlyIncome)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="faint mb-1 text-xs font-semibold uppercase tracking-wide">
                      Going out
                    </p>
                    <div className="grid gap-0.5">
                      <div className="flex justify-between">
                        <span className="muted">Spending</span>
                        <span>{money(spendingOnly)}</span>
                      </div>
                      {debtPaidTotal > 0 && (
                        <div className="flex justify-between">
                          <span className="muted">To debt</span>
                          <span>{money(debtPaidTotal)}</span>
                        </div>
                      )}
                      {invContribTotal > 0 && (
                        <div className="flex justify-between">
                          <span className="muted">Invested</span>
                          <span>{money(invContribTotal)}</span>
                        </div>
                      )}
                      {goalContribTotal > 0 && (
                        <div className="flex justify-between">
                          <span className="muted">To goals</span>
                          <span>{money(goalContribTotal)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {goalsPlanMonthly > 0 && (
                    <div>
                      <div className="flex justify-between">
                        <span className="faint">Goals this month</span>
                        <span className="muted">
                          {money(goalContribTotal)} / {money(goalsPlanMonthly)}
                        </span>
                      </div>
                      <div className="mt-1">
                        <ProgressBar
                          spent={Math.min(goalContribTotal, goalsPlanMonthly)}
                          limit={goalsPlanMonthly}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {isFuture && (
              <p className="faint -mt-2 text-xs">
                Future month — left side is what's logged, right side is the
                plan.
              </p>
            )}

            <KindSection kind="income" />
            <KindSection kind="expense" />

            {/* -------- Custom pinned sections -------- */}
            {cats
              .filter((c) => c.pinned && !c.parent_id)
              .map((p) => {
                const children = cats.filter((c) => c.parent_id === p.id);
                const members = [p, ...children];
                const total = members.reduce((s, c) => s + spentIn(c.id), 0);
                const planSum = members.reduce(
                  (s, c) => s + planFor(c.id),
                  0
                );
                return (
                  <div key={p.id} className="card p-6">
                    <div className="mb-1 flex items-center justify-between">
                      <h2 className="flex items-center gap-2.5 font-display text-lg font-semibold">
                        <CategoryDot name={p.name} size={10} />
                        {p.name}{" "}
                        <span className="faint text-xs font-normal">
                          {p.kind === "income" ? "income" : "expenses"}
                        </span>
                      </h2>
                      <span
                        className="font-display font-semibold"
                        style={
                          p.kind === "income"
                            ? { color: "var(--mint)" }
                            : undefined
                        }
                      >
                        {money(total)}
                        {planSum > 0 && (
                          <span className="muted text-sm font-medium">
                            {" "}
                            / {money(planSum)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div
                      className="divide-y"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {members.map((c) => (
                        <CategoryRow
                          key={c.id}
                          cat={c.id === p.id ? { ...c, name: "General" } : c}
                          kind={p.kind}
                        />
                      ))}
                    </div>
                    <button
                      className="faint mt-3 text-xs underline underline-offset-4"
                      onClick={() => togglePin(p.id, false)}
                    >
                      ↙ Move back into{" "}
                      {p.kind === "income" ? "Income" : "Expenses"}
                    </button>
                  </div>
                );
              })}

            {/* -------- Debts -------- */}
            {showDebts && (
            <div className="card p-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">Debts</h2>
                <div className="flex items-center gap-3">
                  {totalDebt > 0 && (
                    <span
                      className="font-display font-semibold"
                      style={{ color: "var(--over)" }}
                    >
                      {money(totalDebt)}
                    </span>
                  )}
                  <button
                    className="btn btn-ghost !px-3 !py-1 !text-sm"
                    onClick={() => {
                      setDebtDraft(emptyDebtDraft());
                      setDebtOpen(true);
                    }}
                  >
                    + Add
                  </button>
                </div>
              </div>
              {debts.length === 0 ? (
                <p className="muted py-2 text-sm">
                  Add a card or loan — balance, rate and payment — and I'll
                  tell you exactly when it dies.
                </p>
              ) : (
                <div className="grid gap-3">
                  {debts.map((d) => {
                    const prog = debtProgress(d);
                    const pm = payoffMonth(d);
                    const paid = debtPaidThisMonth.get(d.id) ?? 0;
                    return (
                      <div key={d.id} className="card-soft p-4">
                        <div className="flex items-center gap-3">
                          <button
                            className="min-w-0 flex-1 text-left"
                            onClick={() => {
                              setDebtDraft(debtToDraft(d));
                              setDebtOpen(true);
                            }}
                          >
                            <p className="flex items-center gap-2.5 truncate text-sm font-semibold">
                              <CategoryDot name={d.name} />
                              {d.name}
                            </p>
                            <p className="faint pl-5 text-xs">
                              {money(d.balance)} left
                              {d.apr > 0 && ` · ${d.apr}% APR`}
                              {" · "}
                              {pm
                                ? `paid off ${payoffLabel(pm)}`
                                : "payment doesn't cover interest"}
                            </p>
                            {(d.payment_due_day || d.statement_close_day) && (
                              <p className="muted pl-5 text-xs font-medium">
                                {d.payment_due_day &&
                                  `Due day ${d.payment_due_day}`}
                                {d.payment_due_day &&
                                  d.statement_close_day &&
                                  " · "}
                                {d.statement_close_day &&
                                  `statement closes day ${d.statement_close_day}`}
                              </p>
                            )}
                          </button>
                          <span className="shrink-0 text-right text-xs">
                            {paid > 0 ? (
                              <span className="chip">
                                {money(paid)} paid this month
                              </span>
                            ) : (
                              <span className="faint">
                                plan {money(d.planned_payment)}/mo
                              </span>
                            )}
                          </span>
                          <QuickAdd
                            label={`payment to ${d.name}`}
                            onSubmit={(amount) => quickPayDebt(d.id, amount)}
                          />
                        </div>
                        {prog !== null && (
                          <div className="mt-2">
                            <ProgressBar spent={prog * 100} limit={100} />
                            <p className="faint mt-1 text-xs">
                              {Math.round(prog * 100)}% paid off
                              {d.original_amount &&
                                ` of ${money(d.original_amount)}`}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {/* -------- Investments -------- */}
            {showInvs && (
            <div className="card p-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">
                  Investments
                </h2>
                <div className="flex items-center gap-3">
                  {totalInvested > 0 && (
                    <span
                      className="font-display font-semibold"
                      style={{ color: "var(--mint)" }}
                    >
                      {money(totalInvested)}
                    </span>
                  )}
                  <button
                    className="btn btn-ghost !px-3 !py-1 !text-sm"
                    onClick={() => {
                      setInvDraft(emptyInvDraft());
                      setInvOpen(true);
                    }}
                  >
                    + Add
                  </button>
                </div>
              </div>
              {invs.length === 0 ? (
                <p className="muted py-2 text-sm">
                  Track brokerage, retirement, crypto or your house fund — and
                  watch the balance grow with each contribution.
                </p>
              ) : (
                <div className="grid gap-3">
                  {invs.map((iv) => {
                    const added = invAddedThisMonth.get(iv.id) ?? 0;
                    const taken = invWithdrawnThisMonth.get(iv.id) ?? 0;
                    const now = new Date();
                    const monthsToDec = 12 - now.getMonth();
                    const eoy = projectInvestment(
                      iv.balance,
                      iv.expected_apr,
                      0,
                      monthsToDec
                    );
                    return (
                      <div
                        key={iv.id}
                        className="card-soft flex items-center gap-2 p-4"
                      >
                        <button
                          className="min-w-0 flex-1 text-left"
                          onClick={() => {
                            setInvDraft(invToDraft(iv));
                            setInvOpen(true);
                          }}
                        >
                          <p className="flex items-center gap-2.5 truncate text-sm font-semibold">
                            <CategoryDot name={iv.name} />
                            {iv.name}
                          </p>
                          <p className="faint pl-5 text-xs">
                            {money(iv.balance)} now · ~{money(eoy)} by Dec at{" "}
                            {iv.expected_apr}%
                          </p>
                          {iv.monthly_amount > 0 && (
                            <p className="muted pl-5 text-xs font-medium">
                              {iv.monthly_kind === "withdraw"
                                ? `Taking out ${money(iv.monthly_amount)}/mo (income)`
                                : `Putting in ${money(iv.monthly_amount)}/mo (expense)`}
                            </p>
                          )}
                        </button>
                        <span className="shrink-0 text-xs">
                          {added > 0 && (
                            <span className="chip">
                              +{money(added)} this month
                            </span>
                          )}
                          {taken > 0 && (
                            <span
                              className="chip"
                              style={{
                                background: "var(--over-soft)",
                                color: "var(--over)",
                              }}
                            >
                              −{money(taken)} this month
                            </span>
                          )}
                        </span>
                        <QuickAdd
                          label={`withdrawal from ${iv.name}`}
                          variant="withdraw"
                          onSubmit={(amount) => quickWithdraw(iv.id, amount)}
                        />
                        <QuickAdd
                          label={`contribution to ${iv.name}`}
                          onSubmit={(amount) => quickContribute(iv.id, amount)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {/* -------- Goals -------- */}
            <div className="card p-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">Goals</h2>
                <div className="flex items-center gap-3">
                  {totalGoalSaved > 0 && (
                    <span
                      className="font-display font-semibold"
                      style={{ color: "var(--mint)" }}
                    >
                      {money(totalGoalSaved)}
                    </span>
                  )}
                  <button
                    className="btn btn-ghost !px-3 !py-1 !text-sm"
                    onClick={() => {
                      setGoalDraft(emptyGoalDraft());
                      setGoalOpen(true);
                    }}
                  >
                    + Add
                  </button>
                </div>
              </div>
              {goals.length === 0 ? (
                <p className="muted py-2 text-sm">
                  A house, a car, a watch, a trip — set a target and a date and
                  I'll tell you exactly what each paycheck needs to give.
                </p>
              ) : (
                <div className="grid gap-3">
                  {goals.map((g) => {
                    const m = goalMath(
                      g.target_amount,
                      g.saved,
                      g.target_date,
                      primaryFreq
                    );
                    const added = goalAddedThisMonth.get(g.id) ?? 0;
                    const pct = Math.min(
                      100,
                      Math.round((g.saved / g.target_amount) * 100)
                    );
                    return (
                      <div key={g.id} className="card-soft p-4">
                        <div className="flex items-center gap-3">
                          <button
                            className="min-w-0 flex-1 text-left"
                            onClick={() => {
                              setGoalDraft(goalToDraft(g));
                              setGoalOpen(true);
                            }}
                          >
                            <p className="flex items-center gap-2.5 truncate text-sm font-semibold">
                              <CategoryDot name={g.name} />
                              {g.name}
                            </p>
                            <p className="faint pl-5 text-xs">
                              {money(g.saved)} of {money(g.target_amount)} ·{" "}
                              {pct}%
                            </p>
                          </button>
                          <span className="shrink-0 text-xs">
                            {added > 0 && (
                              <span className="chip">
                                +{money(added)} this month
                              </span>
                            )}
                          </span>
                          <QuickAdd
                            label={`contribution to ${g.name}`}
                            onSubmit={(amount) => quickFundGoal(g.id, amount)}
                          />
                        </div>
                        <div className="mt-2">
                          <ProgressBar spent={pct} limit={100} />
                        </div>
                        {m.perMonth !== null ? (
                          <p className="faint mt-1 text-xs">
                            Needs {money(m.perMonth)}/mo — ~
                            {money(m.perCheck!)} per paycheck for {m.months}{" "}
                            more months
                            {g.target_date && ` · by ${g.target_date}`}
                          </p>
                        ) : g.saved >= g.target_amount ? (
                          <p
                            className="mt-1 text-xs"
                            style={{ color: "var(--mint)" }}
                          >
                            Target reached — nice.
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="faint text-xs">
              Need the full history?{" "}
              <Link
                href="/app/transactions"
                className="underline underline-offset-4"
              >
                All activity →
              </Link>
            </p>
          </div>

          {/* Side rail */}
          <div className="grid gap-4">
            {redMonths.length > 0 && (
              <div
                className="card p-5"
                style={{ borderColor: "var(--over)" }}
              >
                <p
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--over)" }}
                >
                  Heads up — red months ahead
                </p>
                <div className="mt-2 grid gap-1.5 text-sm">
                  {redMonths.map((p) => (
                    <div key={p.month} className="flex justify-between">
                      <span className="muted">{monthLabel(p.month)}</span>
                      <span style={{ color: "var(--over)" }}>
                        −{money(Math.abs(p.net))}
                      </span>
                    </div>
                  ))}
                </div>
                <Link
                  href="/app/forecast"
                  className="faint mt-2 inline-block text-xs underline underline-offset-4"
                >
                  See the full forecast →
                </Link>
              </div>
            )}

            {(totalInvested > 0 || totalDebt > 0 || net !== 0) && (
              <div className="card p-5">
                <p className="faint text-xs font-semibold uppercase tracking-wide">
                  Net worth{monthsAhead > 0 ? ` by ${monthLabel(month)}` : ""}
                </p>
                <p
                  className={`font-display text-2xl font-semibold ${
                    netWorthShown >= 0 ? "glow-mint" : "glow-over"
                  }`}
                  style={{
                    color: netWorthShown >= 0 ? "var(--mint)" : "var(--over)",
                  }}
                >
                  {netWorthShown >= 0 ? "" : "−"}
                  {money(Math.abs(netWorthShown))}
                </p>
                <div className="mt-2 grid gap-1 text-sm">
                  <div className="flex justify-between">
                    <span className="muted">Invested</span>
                    <span>{money(totalInvested)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="muted">Debt</span>
                    <span style={{ color: "var(--over)" }}>
                      −{money(totalDebt)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="muted">
                      {monthsAhead > 0
                        ? `Plan through ${monthLabel(month)}`
                        : "Net this month"}
                    </span>
                    <span
                      style={{
                        color:
                          netWorthShown - netWorth >= 0
                            ? "var(--mint)"
                            : "var(--over)",
                      }}
                    >
                      {netWorthShown - netWorth >= 0 ? "+" : "−"}
                      {money(Math.abs(netWorthShown - netWorth))}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {runway && (
              <div className="card p-5">
                <p className="faint text-xs font-semibold uppercase tracking-wide">
                  To payday · {shortDate(runway.nextCheck)}
                </p>
                <div className="mt-2 grid gap-1 text-sm">
                  <div className="flex justify-between">
                    <span className="muted">Current cash</span>
                    <span className="font-medium">{money(runway.onHand)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="muted">Bills before payday</span>
                    <span>−{money(runway.dueSum)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="muted">Everyday spending (est.)</span>
                    <span>−{money(runway.everyday)}</span>
                  </div>
                </div>
                <div className="divider mt-3 pt-2.5">
                  <p className="faint text-xs font-semibold uppercase tracking-wide">
                    Safe to spend
                  </p>
                  <p
                    className={`font-display text-2xl font-semibold ${
                      runway.covered ? "glow-mint" : "glow-over"
                    }`}
                    style={{
                      color: runway.covered ? "var(--mint)" : "var(--over)",
                    }}
                  >
                    {runway.covered ? "" : "−"}
                    {money(
                      Math.abs(
                        runway.onHand - runway.dueSum - runway.everyday
                      )
                    )}
                  </p>
                </div>
                {!runway.covered && (
                  <>
                    <p className="mt-1.5 text-sm" style={{ color: "var(--over)" }}>
                      ~{money(runway.short)} short. Could move:
                    </p>
                    <div className="mt-1 grid gap-1 text-sm">
                      {runway.pushable.map((b) => (
                        <div key={b.key} className="flex justify-between">
                          <span className="muted truncate">{b.title}</span>
                          <span className="faint shrink-0">
                            {money(b.amount)} · {shortDate(b.date)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {(pendingTasks.length > 0 || upcoming.length > 0) && (
              <div className="card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-semibold">Up next</h2>
                  <Link href="/app/tasks" className="faint text-sm">
                    All →
                  </Link>
                </div>
                <div className="mt-3 grid gap-2">
                  {upcoming.map((u) => (
                    <div
                      key={u.key}
                      className="card-soft flex items-center gap-3 p-3"
                    >
                      <ConfirmPay
                        amount={u.amount}
                        label={`Mark ${u.title} paid`}
                        onConfirm={async (amount) => {
                          if (u.type === "debt" && u.debtId)
                            await quickPayDebt(u.debtId, amount);
                          else
                            await quickAddTx(
                              "expense",
                              u.categoryId ?? "uncategorized",
                              amount,
                              u.title,
                              "none",
                              todayISO(),
                              u.itemId ?? null
                            );
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {u.title}
                        </p>
                        <p className="faint text-xs">
                          {money(u.amount)} ·{" "}
                          {u.date === todayISO()
                            ? "today"
                            : shortDate(u.date)}
                        </p>
                      </div>
                    </div>
                  ))}
                  {pendingTasks.map((t) => (
                    <div
                      key={t.id}
                      className="card-soft flex items-center gap-3 p-3"
                    >
                      <button
                        onClick={() => completeTask(t.id)}
                        aria-label={`Complete ${t.title}`}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2"
                        style={{ borderColor: "var(--mint)" }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {t.title}
                        </p>
                        <p className="faint text-xs">
                          {t.amount != null && `${money(t.amount)} · `}
                          {t.due_date
                            ? t.due_date < todayISO()
                              ? `overdue — ${shortDate(t.due_date)}`
                              : shortDate(t.due_date)
                            : "no date"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(debts.some((d) => d.payment_due_day) ||
              accts.some((a) => a.payment_due_day || a.statement_close_day)) && (
              <div className="card p-5">
                <h2 className="font-display font-semibold">Money dates</h2>
                <div className="mt-2 grid gap-1.5">
                  {debts
                    .filter((d) => d.payment_due_day || d.statement_close_day)
                    .map((d) => (
                      <div key={d.id} className="text-sm">
                        <p className="font-medium">{d.name}</p>
                        <p className="faint text-xs">
                          {d.statement_close_day &&
                            `Statement closes day ${d.statement_close_day}`}
                          {d.statement_close_day && d.payment_due_day && " · "}
                          {d.payment_due_day &&
                            `Payment due day ${d.payment_due_day}`}
                        </p>
                      </div>
                    ))}
                  {accts
                    .filter(
                      (a) => a.payment_due_day || a.statement_close_day
                    )
                    .map((a) => (
                      <div key={a.id} className="text-sm">
                        <p className="font-medium">{a.name}</p>
                        <p className="faint text-xs">
                          {a.statement_close_day &&
                            `Statement closes day ${a.statement_close_day}`}
                          {a.statement_close_day && a.payment_due_day && " · "}
                          {a.payment_due_day &&
                            `Payment due day ${a.payment_due_day}`}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      <TxSheet
        open={txOpen}
        onClose={() => setTxOpen(false)}
        draft={txDraft}
        setDraft={setTxDraft}
        cats={cats}
        accts={accts}
        onSaved={() => load()}
      />
      <DebtSheet
        open={debtOpen}
        onClose={() => setDebtOpen(false)}
        draft={debtDraft}
        setDraft={setDebtDraft}
        onSaved={() => load()}
      />
      <InvestmentSheet
        open={invOpen}
        onClose={() => setInvOpen(false)}
        draft={invDraft}
        setDraft={setInvDraft}
        onSaved={() => load()}
      />
      <GoalSheet
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        draft={goalDraft}
        setDraft={setGoalDraft}
        paycheckFreq={primaryFreq}
        onSaved={() => load()}
      />
      <CategoryQuickSheet
        open={catSheetKind !== null}
        onClose={() => setCatSheetKind(null)}
        kind={catSheetKind ?? "expense"}
        onSaved={() => load()}
        defaultDate={quickDate}
      />

      <AIAssistant month={month} />
    </div>
  );
}
