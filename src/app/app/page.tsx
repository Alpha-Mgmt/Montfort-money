"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  toggleSkip,
} from "@/lib/recurring";
import { monthLabel } from "@/lib/format";
import { hasDeduction, isEditableKey, netOf, renameDeduction, setDeduction, taxParts } from "@/lib/taxes";
import { DeductionEditor } from "@/components/DeductionEditor";
import { MonthPlanEdit } from "@/components/MonthPlanEdit";
import { MoneyRow } from "@/components/MoneyRow";
import { PlanItemSheet, type PlanItemPatch } from "@/components/PlanItemSheet";
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
import { tr } from "@/lib/i18n";

// transactions without a category are grouped per kind, so an uncategorized
// expense never shows up in the income section (and vice versa)
const uncatId = (kind: string) => (kind === "income" ? "uncategorized-income" : "uncategorized");
const isUncat = (id: string | null | undefined) => id === "uncategorized" || id === "uncategorized-income";

export default function MonthPage() {
  const router = useRouter();
  const [month, setMonth] = useState(monthStartISO());
  const [name, setName] = useState("");
  const [cashMap, setCashMap] = useState<Record<string, number>>({});
  // THE sheet for plan lines (new or existing)
  const [planSheet, setPlanSheet] = useState<{ item: RecurringItem | null; kind: Kind; catId: string | null } | null>(null);
  // which debt/goal is showing its "this month's plan" editor
  const [planEditFor, setPlanEditFor] = useState<string | null>(null);
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
  const [openBoxes, setOpenBoxes] = useState<Set<string>>(new Set());
  function toggleBox(id: string) {
    setOpenBoxes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
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

  // Montfort AI applied a change → reload
  useEffect(() => {
    const h = () => load();
    window.addEventListener("mf:data-changed", h);
    return () => window.removeEventListener("mf:data-changed", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  async function load(m = month) {
    const supabase = createClient();
    const [{ data: profile }, c, a, t, r, k, d, iv, gl, pl] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name,show_debts,show_investments,onboarded,cash_on_hand")
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
    // brand-new users (however they arrived) go through setup first
    if (profile && profile.onboarded === false) {
      router.replace("/app/welcome");
      return;
    }
    setName((profile?.full_name ?? "").split(" ")[0] ?? "");
    setCashMap(((profile as { cash_on_hand?: Record<string, number> } | null)?.cash_on_hand) ?? {});
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

  // employer groups: income groups whose plan items carry paycheck taxes/deductions
  const employerGroups = useMemo(() => {
    const { groups: grouped, standalone } = buildCategoryTree(cats, "income");
    const groups = [...grouped, ...standalone.map((c) => ({ ...c, children: [] as Category[] }))];
    const taxed = new Set(
      recurring
        .filter((it) => it.active && it.kind === "income" && it.taxes && it.taxes.gross > 0)
        .map((it) => it.category_id)
    );
    return groups.filter((g) => [g.id, ...g.children.map((c) => c.id)].some((id) => taxed.has(id)));
  }, [cats, recurring]);
  const employerIds = useMemo(() => new Set(employerGroups.map((g) => g.id)), [employerGroups]);
  const employerMemberIds = useMemo(
    () => new Set(employerGroups.flatMap((g) => [g.id, ...g.children.map((c) => c.id)])),
    [employerGroups]
  );
  const [payOpen, setPayOpen] = useState<Set<string>>(new Set());

  // "clear this month": the plan items skip this one month (other months untouched)
  const monthKey = month.slice(0, 7);
  const [clearAsk, setClearAsk] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const planItemsHere = useMemo(
    () =>
      recurring.filter(
        (it) =>
          it.active &&
          occurrencesInMonth(it.frequency, it.start_date, it.end_date, month, it.schedule) > 0
      ),
    [recurring, month]
  );
  const clearedHere = useMemo(
    () => recurring.filter((it) => it.active && it.schedule?.skip?.includes(monthKey)),
    [recurring, monthKey]
  );
  async function setMonthCleared(on: boolean) {
    setClearBusy(true);
    const supabase = createClient();
    const targets = on ? planItemsHere : clearedHere;
    await Promise.all(
      targets.map((it) =>
        supabase
          .from("recurring_items")
          .update({ schedule: toggleSkip(it.schedule, monthKey, on) })
          .eq("id", it.id)
      )
    );
    if (on) await supabase.from("budgets").delete().eq("month", month);
    setClearBusy(false);
    setClearAsk(false);
    await load(month);
    window.dispatchEvent(new Event("mf:data-changed"));
  }
  useEffect(() => setClearAsk(false), [month]);

  /** change / add / remove / rename one paycheck deduction on every employer paycheck.
   *  amount undefined = keep amounts (rename only); renames apply to every paycheck. */
  async function applyDeduction(
    memberIds: Set<string>,
    key: string,
    amount: number | null | undefined,
    fromYM: string,
    addIfMissing: boolean,
    rename?: string
  ) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const from = `${fromYM}-01`;
    const [fy, fm] = fromYM.split("-").map(Number);
    const dayBefore = toISO(new Date(fy, fm - 1, 0));
    const keyN = rename ? `other:${rename}` : key;
    for (const it of recurring) {
      if (!it.active || it.kind !== "income" || !memberIds.has(it.category_id ?? "")) continue;
      const t0 = it.taxes;
      if (!t0 || t0.mode !== "detailed" || !(t0.gross > 0)) continue;
      const renamed = rename && key.startsWith("other:") ? renameDeduction(t0, key.slice(6), rename) : null;
      const t = renamed ?? t0;
      const dated =
        amount !== undefined && !(it.end_date && it.end_date < from) && (addIfMissing || hasDeduction(t, keyN));
      if (!dated) {
        if (renamed) await supabase.from("recurring_items").update({ taxes: renamed }).eq("id", it.id);
        continue;
      }
      const nt = setDeduction(t, keyN, amount ?? null);
      if (!nt) continue;
      const net = netOf(nt);
      if (it.start_date >= from || it.frequency === "once") {
        await supabase.from("recurring_items").update({ taxes: nt, amount: net }).eq("id", it.id);
        continue;
      }
      const upto = new Date(fy + 2, fm - 1, 1);
      const first = occurrenceDates(it, from, toISO(upto))[0];
      if (!first) {
        if (renamed) await supabase.from("recurring_items").update({ taxes: renamed }).eq("id", it.id);
        continue;
      }
      await supabase.from("recurring_items").update({ end_date: dayBefore, taxes: t }).eq("id", it.id);
      await supabase.from("recurring_items").insert({
        user_id: user.id,
        title: it.title,
        kind: it.kind,
        amount: net,
        category_id: it.category_id,
        account_id: it.account_id,
        frequency: it.frequency,
        schedule: it.schedule ?? null,
        taxes: nt,
        start_date: first,
        end_date: it.end_date,
        active: true,
      });
    }
    await load(month);
    window.dispatchEvent(new Event("mf:data-changed"));
  }

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
      const key = t.category_id ?? uncatId(t.kind);
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
        month,
        it.schedule
      );
      if (times === 0) continue;
      const key = it.category_id ?? uncatId(it.kind);
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
  // cash in hand isn't income, but it's money you have this month
  const cashHere = Number(cashMap[month.slice(0, 7)] ?? 0);
  const net = incomeTotal - expenseTotal + cashHere;

  const pendingTasks = tasks.filter((t) => t.status === "pending").slice(0, 4);
  const totalDebt = debts.reduce((s, d) => s + d.balance, 0);
  const totalInvested = invs.reduce((s, i) => s + i.balance, 0);
  const debtPaidTotal = [...debtPaidThisMonth.values()].reduce(
    (s, v) => s + v,
    0
  );
  const invWithdrawTotal = [...invWithdrawnThisMonth.values()].reduce((s, v) => s + v, 0);
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

  const goalAuto = (g: Goal) => goalMath(g.target_amount, g.saved, g.target_date, primaryFreq).perMonth ?? 0;
  const goalPlanFor = (g: Goal) => {
    const v = g.month_plans?.[month.slice(0, 7)];
    if (v != null) return Number(v);
    return g.monthly_plan != null ? Number(g.monthly_plan) : goalAuto(g);
  };
  const goalsPlanMonthly = goals.reduce((sum, g) => sum + goalPlanFor(g), 0);

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
  const planExpenseCats =
    cats
      .filter((c) => c.kind === "expense")
      .reduce((s, c) => s + planFor(c.id), 0) +
    (planByCat.get("uncategorized")?.limit_amount ?? plannedIn("uncategorized"));
  // debts: plan lines that ARE a debt payment, plus debts with no plan line this month
  const liveDebts = debts.filter((d) => !d.archived && d.balance > 0);
  const DEBTY = /debt|deuda|loan|pr[ée]stamo|card|tarjeta|credit|cr[ée]dito|mortgage|hipoteca/i;
  const catNameById = new Map(cats.map((c) => [c.id, c.name]));
  let debtItemPlan = 0;
  const coveredDebt = new Set<string>();
  for (const [catId, list] of plannedByCat) {
    for (const p of list) {
      if (p.item.kind !== "expense") continue;
      const t = p.item.title.toLowerCase();
      const hit = liveDebts.filter((d) => t.includes(d.name.toLowerCase()) || d.name.toLowerCase().includes(t));
      hit.forEach((d) => coveredDebt.add(d.id));
      if (hit.length || DEBTY.test(p.item.title) || DEBTY.test(catNameById.get(catId) ?? "")) debtItemPlan += p.total;
    }
  }
  const debtPlanFor = (d: Debt) => {
    const v = d.month_plans?.[month.slice(0, 7)];
    return v != null ? Number(v) : d.planned_payment;
  };
  const debtOnlyPlan = liveDebts.filter((d) => !coveredDebt.has(d.id)).reduce((s, d) => s + debtPlanFor(d), 0);
  const planDebts = debtItemPlan + debtOnlyPlan;
  const planGoals = goalsPlanMonthly;
  // everything that leaves: spending + debts + goals + investment deposits
  const planExpense = planExpenseCats + debtOnlyPlan + planGoals + invPlanDeposit;
  const planSpending = Math.max(0, planExpenseCats - debtItemPlan);
  const plannedLeft = planIncome - planExpense + cashHere;
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
    const catId = isUncat(categoryId) ? null : categoryId;
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
          (kind === "income" ? tr("Income") : tr("Expense")),
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

  async function savePlanItem(patch: PlanItemPatch) {
    const supabase = createClient();
    if (planSheet?.item) {
      await supabase.from("recurring_items").update(patch).eq("id", planSheet.item.id);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("recurring_items").insert({ ...patch, user_id: user!.id, account_id: accts[0]?.id ?? null, active: true });
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
          title={tr("Set this month's plan")}
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
        aria-label={tr("Delete category")}
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
    merged,
  }: {
    item: RecurringItem;
    planTotal: number;
    catId: string;
    kind: Kind;
    /** the category has only this item: show ONE line (the item) instead of category + item */
    merged?: Category;
  }) {
    const linked = (txByCat.get(catId) ?? []).filter((t) => t.recurring_item_id === item.id);
    const received = linked.reduce((s, t) => s + t.amount, 0);
    const nextMonth = addMonths(month, 1);
    const schedule = occurrenceDates(item, month, nextMonth).filter((d) => d < nextMonth);
    const sub = (
      <>
        {tr(frequencyLabels[item.frequency])}
        {schedule.length > 0 && <> · {schedule.map((d) => shortDate(d)).join(" · ")}</>}
      </>
    );
    return (
      <div className={merged ? "-mx-2 rounded-lg px-2" : ""} style={merged ? { background: "color-mix(in srgb, var(--surface-2) 55%, transparent)" } : undefined}>
        <MoneyRow
          name={item.title}
          subtitle={sub}
          done={received}
          plan={planTotal}
          tone={kind === "income" ? "in" : "out"}
          bold={!!merged}
          onOpen={() => setPlanSheet({ item, kind, catId })}
          onPay={!isFuture ? (amount) => quickAddTx(kind, catId, amount, item.title, "none", todayISO(), item.id) : undefined}
          onDelete={() => deletePlanItem(item.id)}
          deleteLabel={tr("Remove plan")}
        >
          {linked.length > 0 && (
            <div className="mt-1 grid gap-0.5 pl-5">
              {linked.map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-xs">
                  <button onClick={() => editTx(t)} className="muted flex min-w-0 flex-1 items-center justify-between gap-3 text-left hover:opacity-80">
                    <span className="faint">
                      ✓ {shortDate(t.tx_date)}
                      {t.note && t.note !== item.title ? ` · ${t.note}` : ""}
                    </span>
                    <span>{money(t.amount)}</span>
                  </button>
                  <button aria-label={tr("Delete this entry")} className="faint px-1" onClick={() => deleteTx(t.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </MoneyRow>
        {merged && (
          <div className="pb-1 pl-5">
            <LineItemAdd
              defaultDate={quickDate}
              placeholder={kind === "income" ? tr("e.g. bonus") : tr("e.g. tires, insurance…")}
              onSubmit={(amount, note, freq, date) => quickAddTx(kind, catId, amount, note, freq, date)}
            />
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

    // one plan item named like its category and nothing else logged: one line is enough
    const norm = (x: string) =>
      x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const sameName =
      items.length === 1 &&
      (norm(items[0].item.title).startsWith(norm(cat.name)) || norm(cat.name).startsWith(norm(items[0].item.title)));
    if (sameName && loose.length === 0 && !isUncat(cat.id)) {
      return (
        <PlanItemRow
          item={items[0].item}
          planTotal={items[0].total}
          catId={cat.id}
          kind={kind}
          merged={cat}
        />
      );
    }
    // the group's own bucket ("General") only when something is in it
    if (cat.name === tr("General") && isEmpty && plan === 0) return null;

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
              aria-label={isCollapsed ? tr("Expand {v0}", { v0: cat.name }) : tr("Collapse {v0}", { v0: cat.name })}
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
            ) : !isUncat(cat.id) ? (
              <PlanEditor catId={cat.id} plan={plan} />
            ) : plan > 0 ? (
              <span className="muted font-medium">/ {money(plan)}</span>
            ) : null}
          </span>
          <LineItemAdd
            defaultDate={quickDate}
            placeholder={
              kind === "income" ? tr("e.g. bonus") : tr("e.g. tires, insurance…")
            }
            onSubmit={(amount, note, freq, date) =>
              quickAddTx(kind, cat.id, amount, note, freq, date)
            }
          />
          {isEmpty && !isUncat(cat.id) && (
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
              <MoneyRow
                key={t.id}
                name={t.note || cat.name}
                subtitle={
                  <>
                    ✓ {shortDate(t.tx_date)}
                    {t.source === "plaid" && ` · ${tr("bank")}`}
                    {t.source === "task" && ` · ${tr("from task")}`}
                  </>
                }
                done={t.amount}
                tone={kind === "income" ? "in" : "out"}
                onOpen={() => editTx(t)}
                onDelete={() => deleteTx(t.id)}
              />
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
              aria-label={gCollapsed ? tr("Expand {v0}", { v0: g.name }) : tr("Collapse {v0}", { v0: g.name })}
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
                title={tr("Show as its own section")}
                onClick={() => togglePin(g.id, true)}
              >
                {tr("↗ own section")}
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
                cat={c.id === g.id ? { ...c, name: tr("General") } : c}
                kind={kind}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  function EmployerCard({ g }: { g: Category & { children: Category[] } }) {
    const members = [g as Category, ...g.children];
    const ids = new Set(members.map((c) => c.id));
    const dedGroup = (key: string, label: string) => {
      if (!key.startsWith("other:")) return "taxes";
      const l = label.toLowerCase();
      if (/loan|pr[ée]stamo/.test(l)) return "loans";
      if (/rent|renta|basura|trash|housing|casa/.test(l)) return "housing";
      if (/401|dental|visi|vision|hsa|fsa|seguro|insurance|life|vida|medical|m[ée]dico|benefit/.test(l)) return "benefits";
      return "other";
    };
    const grossBy = new Map<string, number>();
    const ded = new Map<string, { group: string; label: string; amount: number; key: string; perCheck: number }>();
    const [edit, setEdit] = useState<{ key: string; label: string; perCheck: number } | "new" | null>(null);
    const [busy, setBusy] = useState(false);
    const fromYM = month.slice(0, 7);
    const run = async (key: string, amount: number | null | undefined, ym: string, add: boolean, rename?: string) => {
      setBusy(true);
      await applyDeduction(ids, key, amount, ym, add, rename);
      setBusy(false);
      setEdit(null);
    };
    let gross = 0;
    let checks = 0;
    for (const it of recurring) {
      if (!it.active || it.kind !== "income" || !ids.has(it.category_id ?? "")) continue;
      const n = occurrencesInMonth(it.frequency, it.start_date, it.end_date, month, it.schedule);
      if (!n) continue;
      const g1 = it.taxes && it.taxes.gross > 0 ? it.taxes.gross : it.amount;
      // one line per kind of pay (Sueldo, Stipend, Bono…), whatever category it sits in
      const name = it.title.trim() || g.name;
      grossBy.set(name, (grossBy.get(name) ?? 0) + g1 * n);
      gross += g1 * n;
      if (it.frequency === "semimonthly" || it.frequency === "biweekly" || it.frequency === "weekly") checks += n;
      for (const p of taxParts(it.taxes)) {
        const grp = dedGroup(p.key, p.label);
        const k = grp + "|" + p.label.toLowerCase();
        const cur = ded.get(k) ?? { group: grp, label: p.label, amount: 0, key: p.key, perCheck: p.amount };
        cur.amount += p.amount * n;
        ded.set(k, cur);
      }
    }
    const groups = ["taxes", "benefits", "loans", "housing", "other"]
      .map((k) => {
        const ls = [...ded.values()].filter((l) => l.group === k).sort((a, b) => b.amount - a.amount);
        return { key: k, lines: ls, total: ls.reduce((s2, l) => s2 + l.amount, 0) };
      })
      .filter((x) => x.lines.length > 0);
    const dedTotal = groups.reduce((s2, x) => s2 + x.total, 0);
    const planNet = members.reduce((s2, c) => s2 + planFor(c.id), 0);
    const received = members.reduce((s2, c) => s2 + spentIn(c.id), 0);
    const names: Record<string, string> = {
      taxes: tr("Taxes"),
      benefits: tr("Benefits"),
      loans: tr("Loans"),
      housing: tr("Rent & housing"),
      other: tr("Other"),
    };
    const toggle = (k: string) =>
      setPayOpen((st) => {
        const n = new Set(st);
        if (n.has(k)) n.delete(k);
        else n.add(k);
        return n;
      });
    const showTx = payOpen.has(`tx-${g.id}`);
    return (
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="faint text-xs font-semibold uppercase tracking-wide">{tr("Your employer")}</p>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <CategoryDot name={g.name} size={10} />
              {g.name}
            </h2>
          </div>
          <div className="text-right">
            <p className="font-display font-semibold" style={{ color: "var(--mint)" }}>
              {money(received)}
              <span className="muted text-sm font-medium"> / {money(planNet)}</span>
            </p>
            <p className="faint text-xs">{tr("received / take-home planned")}</p>
          </div>
        </div>
        {planNet > 0 && (
          <div className="mt-2">
            <ProgressBar spent={Math.min(received, planNet)} limit={planNet} />
          </div>
        )}

        {gross > 0 ? (
          <div className="mt-4 grid gap-1 text-sm">
            <p className="faint text-xs font-semibold uppercase tracking-wide">{tr("What you earn (gross)")}</p>
            {[...grossBy.entries()].map(([n2, v]) => (
              <div key={n2} className="flex justify-between">
                <span>{n2}</span>
                <span>{money(v)}</span>
              </div>
            ))}
            <div className="divider flex justify-between pt-1 font-semibold">
              <span>{tr("Gross pay")}</span>
              <span className="font-display">{money(gross)}</span>
            </div>
            {checks > 0 && (
              <p className="faint text-xs">
                {tr("Before taxes and deductions · {n} payments this month (plan)", { n: checks })}
              </p>
            )}

            {groups.length > 0 && (
              <>
                <p className="faint mt-3 text-xs font-semibold uppercase tracking-wide">{tr("Deductions")}</p>
                {groups.map((x) => (
                  <div key={x.key}>
                    <button className="flex w-full items-baseline justify-between py-0.5" onClick={() => toggle(x.key)}>
                      <span>
                        {names[x.key]}{" "}
                        <span className="faint text-xs">{((x.total / gross) * 100).toFixed(1)}%</span>{" "}
                        <span className="faint text-xs">{payOpen.has(x.key) ? "▴" : "▾"}</span>
                      </span>
                      <span style={{ color: "var(--over)" }}>−{money(x.total)}</span>
                    </button>
                    {payOpen.has(x.key) && (
                      <div className="mb-1 grid gap-0.5 pl-3">
                        {x.lines.map((l) =>
                          edit !== "new" && edit?.key === l.key ? (
                            <DeductionEditor
                              key={l.key}
                              label={tr(l.label)}
                              perCheck={l.perCheck}
                              fromMonth={fromYM}
                              busy={busy}
                              renamable={l.key.startsWith("other:")}
                              onSave={(a, ym, nm) => {
                                const newName = l.key.startsWith("other:") && nm && nm !== l.label ? nm : undefined;
                                const changed = Math.abs(a - l.perCheck) > 0.004;
                                if (!newName && !changed) return setEdit(null);
                                run(l.key, changed ? a : undefined, ym, false, newName);
                              }}
                              onRemove={(ym) => run(l.key, null, ym, false)}
                              onCancel={() => setEdit(null)}
                            />
                          ) : (
                            <div key={l.label} className="muted flex items-center justify-between gap-2 text-xs">
                              <span className="flex items-center gap-1.5">
                                {tr(l.label)}
                                <span className="faint">{((l.amount / gross) * 100).toFixed(1)}%</span>
                                {isEditableKey(l.key) && (
                                  <button
                                    className="faint hover:underline"
                                    title={tr("Edit")}
                                    onClick={() => setEdit({ key: l.key, label: l.label, perCheck: l.perCheck })}
                                  >
                                    ✎
                                  </button>
                                )}
                              </span>
                              <span>−{money(l.amount)}</span>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {edit === "new" ? (
                  <DeductionEditor
                    isNew
                    perCheck={0}
                    fromMonth={fromYM}
                    busy={busy}
                    onSave={(a, ym, nm) => run(`other:${nm}`, a, ym, true)}
                    onCancel={() => setEdit(null)}
                  />
                ) : (
                  <button className="faint justify-self-start text-xs hover:underline" onClick={() => setEdit("new")}>
                    {tr("+ Add deduction")}
                  </button>
                )}
                <div className="flex justify-between pt-0.5 font-semibold">
                  <span>
                    {tr("Total deductions")}{" "}
                    <span className="faint text-xs font-normal">{((dedTotal / gross) * 100).toFixed(1)}%</span>
                  </span>
                  <span style={{ color: "var(--over)" }}>−{money(dedTotal)}</span>
                </div>
              </>
            )}

            <div className="divider mt-2 flex items-baseline justify-between pt-2">
              <span className="font-semibold">{tr("Take-home pay")}</span>
              <span className="font-display font-semibold" style={{ color: "var(--mint)" }}>
                {money(planNet)}
              </span>
            </div>
            {gross > 0 && dedTotal > 0 && (
              <p className="faint text-xs">
                {tr("{amt} in deductions ({pct}% of your gross)", {
                  amt: money(dedTotal),
                  pct: Math.round((dedTotal / gross) * 100),
                })}
              </p>
            )}
          </div>
        ) : (
          <p className="faint mt-3 text-sm">{tr("No pay planned this month.")}</p>
        )}

        <button className="faint mt-3 text-xs underline-offset-4 hover:underline" onClick={() => toggle(`tx-${g.id}`)}>
          {showTx ? tr("Hide deposits ▴") : tr("Deposits & tracking ▾")}
        </button>
        {showTx && (
          <div className="mt-1 divide-y" style={{ borderColor: "var(--border)" }}>
            {members.map((c) => (
              <CategoryRow key={c.id} cat={c.id === g.id && g.children.length ? { ...c, name: tr("General") } : c} kind="income" />
            ))}
          </div>
        )}
      </div>
    );
  }

  async function saveCash(amount: number | null) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const next = { ...cashMap };
    const key = month.slice(0, 7);
    if (amount && amount > 0) next[key] = Math.round(amount * 100) / 100;
    else delete next[key];
    setCashMap(next);
    await supabase.from("profiles").update({ cash_on_hand: Object.keys(next).length ? next : null }).eq("id", user.id);
  }

  function CashCard() {
    const [edit, setEdit] = useState(false);
    const [val, setVal] = useState(cashHere ? String(cashHere) : "");
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <span aria-hidden>💵</span> {tr("Cash in hand")}
          </p>
          <p className="faint text-xs">{tr("Not income — it's money you already have. It adds to what's left this month.")}</p>
        </div>
        {edit ? (
          <span className="flex items-center gap-1.5">
            <span className="relative">
              <span className="faint pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm">$</span>
              <input
                className="input !w-28 !py-1 !pl-5 !pr-2 text-sm"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                autoFocus
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    saveCash(parseFloat(val) || 0);
                    setEdit(false);
                  }
                  if (e.key === "Escape") setEdit(false);
                }}
              />
            </span>
            <button
              className="btn btn-primary !px-2.5 !py-1 !text-xs"
              onClick={() => {
                saveCash(parseFloat(val) || 0);
                setEdit(false);
              }}
            >
              {tr("Save")}
            </button>
            <button className="faint px-1 text-sm" onClick={() => setEdit(false)} aria-label={tr("Cancel")}>
              ×
            </button>
          </span>
        ) : (
          <button className="font-display font-semibold hover:underline" onClick={() => setEdit(true)}>
            {cashHere > 0 ? money(cashHere) : <span className="faint text-sm font-normal">{tr("+ Add cash")}</span>}
            {cashHere > 0 && <span className="faint text-xs font-normal"> ✎</span>}
          </button>
        )}
      </div>
    );
  }

  function MonthGlance() {
    const inNow = incomeTotal + cashHere;
    const outNow = expenseTotal;
    const leftNow = net;
    const inPlan = planIncome + cashHere;
    const outPlan = planExpense;
    const leftPlan = plannedLeft;
    const pctOut = inPlan > 0 ? Math.min(100, (outPlan / inPlan) * 100) : outPlan > 0 ? 100 : 0;
    const pctOutNow = inPlan > 0 ? Math.min(100, (outNow / inPlan) * 100) : 0;
    const open = openBoxes.has("glance");
    const Num = ({ label, short, now, plan, color }: { label: string; short: string; now: number; plan: number; color: string }) => (
      <div className="min-w-0">
        <p className="faint text-xs font-semibold uppercase tracking-wide">
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{label}</span>
        </p>
        <p className="font-display text-2xl font-semibold leading-tight" style={{ color }}>
          {now < 0 ? "−" : ""}
          {money(Math.abs(now))}
        </p>
        <p className="faint text-xs">
          {tr("plan")} {plan < 0 ? "−" : ""}
          {money(Math.abs(plan))}
        </p>
      </div>
    );
    return (
      <div className="card p-5">
        <div className="grid grid-cols-3 gap-3">
          <Num label={tr("Money in")} short={tr("In")} now={inNow} plan={inPlan} color="var(--mint)" />
          <Num label={tr("Money out")} short={tr("Out")} now={outNow} plan={outPlan} color="var(--over)" />
          <Num label={tr("Left")} short={tr("Left")} now={leftNow} plan={leftPlan} color={leftPlan >= 0 && leftNow >= 0 ? "var(--mint)" : "var(--over)"} />
        </div>
        {/* one bar: what comes in, and how much of it goes out (plan = soft, so far = solid) */}
        <div className="mt-4 h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--mint-soft)" }}>
          <div className="relative h-full" style={{ width: `${pctOut}%`, background: "var(--over-soft)" }}>
            <div className="h-full rounded-full" style={{ width: `${pctOut ? (pctOutNow / pctOut) * 100 : 0}%`, background: "var(--over)" }} />
          </div>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="faint">
            {outPlan > inPlan && inPlan > 0
              ? tr("Plan spends {amt} more than comes in", { amt: money(outPlan - inPlan) })
              : tr("{pct}% of what comes in is planned to go out", { pct: Math.round(pctOut) })}
          </span>
          <button className="faint hover:underline" onClick={() => toggleBox("glance")}>
            {open ? tr("Hide breakdown ▴") : tr("Breakdown ▾")}
          </button>
        </div>
        {open && (
          <div className="divider mt-3 grid gap-3 pt-3 text-xs sm:grid-cols-2">
            <div className="grid gap-1">
              <p className="font-semibold" style={{ color: "var(--mint)" }}>{tr("Money in")}</p>
              {employerGroups.map((g) => {
                const ids = [g.id, ...g.children.map((c) => c.id)];
                return (
                  <div key={g.id} className="flex justify-between">
                    <span className="muted">{g.name}</span>
                    <span>
                      {money(ids.reduce((a, id) => a + spentIn(id), 0))} <span className="faint">/ {money(ids.reduce((a, id) => a + planFor(id), 0))}</span>
                    </span>
                  </div>
                );
              })}
              <div className="flex justify-between">
                <span className="muted">{tr("Other income")}</span>
                <span>
                  {money(incomeTotal - [...employerMemberIds].reduce((a, id) => a + spentIn(id), 0))}{" "}
                  <span className="faint">/ {money(planIncome - invPlanWithdraw - [...employerMemberIds].reduce((a, id) => a + planFor(id), 0))}</span>
                </span>
              </div>
              {(invPlanWithdraw > 0 || invWithdrawTotal > 0) && (
                <div className="flex justify-between">
                  <span className="muted">{tr("Investments")}</span>
                  <span>
                    {money(invWithdrawTotal)} <span className="faint">/ {money(invPlanWithdraw)}</span>
                  </span>
                </div>
              )}
              {cashHere > 0 && (
                <div className="flex justify-between">
                  <span className="muted">{tr("Cash in hand")}</span>
                  <span>{money(cashHere)}</span>
                </div>
              )}
            </div>
            <div className="grid gap-1">
              <p className="font-semibold" style={{ color: "var(--over)" }}>{tr("Money out")}</p>
              {[
                { k: tr("Spending"), a: spendingOnly, p: planSpending },
                { k: tr("Debts"), a: debtPaidTotal, p: planDebts },
                { k: tr("Goals"), a: goalContribTotal, p: planGoals },
                { k: tr("Investments"), a: invContribTotal, p: invPlanDeposit },
              ]
                .filter((x) => x.a > 0 || x.p > 0)
                .map((x) => (
                  <div key={x.k} className="flex justify-between">
                    <span className="muted">{x.k}</span>
                    <span>
                      {money(x.a)} <span className="faint">/ {money(x.p)}</span>
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  function FlowHeader({ dir }: { dir: "in" | "out" }) {
    const actual = dir === "in" ? incomeTotal : expenseTotal;
    const plan = dir === "in" ? planIncome : planExpense;
    const parts =
      dir === "out"
        ? [
            { k: tr("Spending"), a: spendingOnly, p: planSpending },
            { k: tr("Debts"), a: debtPaidTotal, p: planDebts },
            { k: tr("Goals"), a: goalContribTotal, p: planGoals },
            { k: tr("Investments"), a: invContribTotal, p: invPlanDeposit },
          ].filter((x) => x.a > 0 || x.p > 0)
        : [];
    return (
      <div className="mt-2 border-b-2 pb-2" style={{ borderColor: dir === "in" ? "var(--mint)" : "var(--over)" }}>
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-display text-xl font-semibold">
          <span className={dir === "in" ? "text-grad" : "text-grad-out"}>{dir === "in" ? tr("Money in") : tr("Money out")}</span>
        </h2>
        <span className="font-display font-semibold" style={{ color: dir === "in" ? "var(--mint)" : "var(--over)" }}>
          {money(actual)}
          <span className="muted text-sm font-medium"> / {money(plan)}</span>
        </span>
      </div>
      {parts.length > 1 && (
        <div className="faint mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
          {parts.map((x) => (
            <span key={x.k}>
              {x.k} {money(x.a)} / {money(x.p)}
            </span>
          ))}
        </div>
      )}
      </div>
    );
  }

  function KindSection({ kind }: { kind: Kind }) {
    const tree = buildCategoryTree(cats, kind);
    const standalone = kind === "income" ? tree.standalone.filter((c) => !employerIds.has(c.id)) : tree.standalone;
    const groups = kind === "income" ? tree.groups.filter((g) => !employerIds.has(g.id)) : tree.groups;
    const empActual = kind === "income" ? [...employerMemberIds].reduce((s2, id) => s2 + spentIn(id), 0) : 0;
    const empPlan = kind === "income" ? [...employerMemberIds].reduce((s2, id) => s2 + planFor(id), 0) : 0;
    const total = (kind === "income" ? incomeTotal : expenseTotal) - empActual;

    return (
      <div className="card p-6">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-lg font-semibold">
              {kind === "income" ? (employerGroups.length ? tr("Other income") : tr("Income")) : tr("Monthly expenses")}
            </h2>
            <button
              className="btn btn-ghost whitespace-nowrap !px-2.5 !py-0.5 !text-xs"
              onClick={() => setCatSheetKind(kind)}
            >
              {tr("+ Category")}
            </button>
          </div>
          <span
            className="font-display font-semibold"
            style={kind === "income" ? { color: "var(--mint)" } : undefined}
          >
            {money(total)}
            <span className="muted text-sm font-medium">
              {" "}
              / {money(kind === "income" ? planIncome - empPlan : planExpenseCats)}
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
          {(txByCat.get(uncatId(kind)) ?? []).length > 0 && (
            <CategoryRow
              cat={{
                id: uncatId(kind),
                name: tr("Uncategorized"),
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
          <span className="text-grad">{name ? tr("Hey, {name}", { name }) : tr("Your month")}</span>
        </h1>
        <div className="card flex items-center justify-between px-2 py-1.5">
          <button
            className="btn btn-ghost !border-0 !px-3"
            onClick={() => setMonth(addMonths(month, -1))}
            aria-label={tr("Previous month")}
          >
            ←
          </button>
          <MonthPicker value={month} onChange={setMonth} />
          <button
            className="btn btn-ghost !border-0 !px-3"
            onClick={() => setMonth(addMonths(month, 1))}
            aria-label={tr("Next month")}
          >
            →
          </button>
        </div>
      </div>

      {planSheet && (
        <PlanItemSheet
          key={planSheet.item?.id ?? "new"}
          open
          onClose={() => setPlanSheet(null)}
          item={planSheet.item}
          kind={planSheet.kind}
          categoryId={planSheet.catId}
          categories={cats}
          month={month}
          defaultDate={quickDate}
          onSave={savePlanItem}
          onDelete={planSheet.item ? () => deletePlanItem(planSheet.item!.id) : undefined}
        />
      )}
      {loading ? (
        <p className="faint mt-10 text-center text-sm">{tr("Loading your month…")}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
          <div className="grid gap-4 lg:col-span-2">
            {/* ---- Your month at a glance: In · Out · Left ---- */}
            <MonthGlance />
            {isFuture && (
              <p className="faint -mt-2 text-xs">
                {tr("Future month — left side is what's logged, right side is the plan.")}
              </p>
            )}
            {(planItemsHere.length > 0 || clearedHere.length > 0 || plans.length > 0) && (
              <div className="-mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                {clearedHere.length > 0 && (
                  <span className="faint">
                    {tr("Plan cleared for {v0} ({n} items).", { v0: monthLabel(month), n: clearedHere.length })}{" "}
                    <button
                      className="font-semibold underline-offset-4 hover:underline"
                      style={{ color: "var(--mint)" }}
                      disabled={clearBusy}
                      onClick={() => setMonthCleared(false)}
                    >
                      {clearBusy ? tr("Working…") : tr("Restore plan")}
                    </button>
                  </span>
                )}
                {(planItemsHere.length > 0 || plans.length > 0) &&
                  (clearAsk ? (
                    <span className="faint">
                      {tr("Remove {n} plan items only in {v0}? Other months stay the same.", {
                        n: planItemsHere.length,
                        v0: monthLabel(month),
                      })}{" "}
                      <button
                        className="font-semibold underline-offset-4 hover:underline"
                        style={{ color: "var(--over)" }}
                        disabled={clearBusy}
                        onClick={() => setMonthCleared(true)}
                      >
                        {clearBusy ? tr("Working…") : tr("Yes, clear")}
                      </button>{" "}
                      <button className="underline-offset-4 hover:underline" onClick={() => setClearAsk(false)}>
                        {tr("Cancel")}
                      </button>
                    </span>
                  ) : (
                    <button className="faint underline-offset-4 hover:underline" onClick={() => setClearAsk(true)}>
                      {tr("Clear this month's plan")}
                    </button>
                  ))}
              </div>
            )}

            {/* ======== MONEY IN ======== */}
            <FlowHeader dir="in" />
            <CashCard />
            {employerGroups.map((g) => (
              <EmployerCard key={g.id} g={g} />
            ))}
            <KindSection kind="income" />
            {/* -------- Pinned income sections -------- */}
            {cats
              .filter((c) => c.pinned && !c.parent_id && !employerIds.has(c.id) && c.kind === "income")
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
                          cat={c.id === p.id ? { ...c, name: tr("General") } : c}
                          kind={p.kind}
                        />
                      ))}
                    </div>
                    <button
                      className="faint mt-3 text-xs underline underline-offset-4"
                      onClick={() => togglePin(p.id, false)}
                    >
                      {tr("↙ Move back into")}
{" "}
                      {p.kind === "income" ? tr("Income") : tr("Expenses")}
                    </button>
                  </div>
                );
              })}

            {/* -------- Investments -------- */}
            {showInvs && (
            <div className="card p-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">
                  {tr("Investments")}
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
                    {tr("+ Add")}
                  </button>
                </div>
              </div>
              {invs.length === 0 ? (
                <p className="muted py-2 text-sm">
                  {tr("Track brokerage, retirement, crypto or your house fund — and watch the balance grow with each contribution.")}
                </p>
              ) : (
                <div className="grid gap-3">
                  {invs.map((iv) => {
                    const added = invAddedThisMonth.get(iv.id) ?? 0;
                    const taken = invWithdrawnThisMonth.get(iv.id) ?? 0;
                    const now = new Date();
                    const eoy = projectInvestment(iv.balance, iv.expected_apr, 0, 12 - now.getMonth());
                    const isW = iv.monthly_kind === "withdraw";
                    return (
                      <MoneyRow
                        key={iv.id}
                        name={iv.name}
                        subtitle={
                          <>
                            {tr("{bal} now · ~{eoy} by Dec at {apr}%", { bal: money(iv.balance), eoy: money(eoy), apr: iv.expected_apr })}
                            {taken > 0 && ` · −${money(taken)} ${tr("taken out")}`}
                          </>
                        }
                        done={isW ? taken : added}
                        plan={iv.monthly_amount > 0 ? iv.monthly_amount : 0}
                        tone="in"
                        onOpen={() => {
                          setInvDraft(invToDraft(iv));
                          setInvOpen(true);
                        }}
                        onPay={(amount) => (isW ? quickWithdraw(iv.id, amount) : quickContribute(iv.id, amount))}
                        payLabel={isW ? tr("withdrawal from {v0}", { v0: iv.name }) : tr("contribution to {v0}", { v0: iv.name })}
                        onDelete={async () => {
                          await createClient().from("investments").update({ archived: true }).eq("id", iv.id);
                          load();
                        }}
                        deleteLabel={tr("Archive")}
                      />
                    );
                  })}
                </div>
              )}
            </div>
            )}


            {/* ======== MONEY OUT ======== */}
            <FlowHeader dir="out" />
            <KindSection kind="expense" />

            {/* -------- Custom pinned sections -------- */}
            {cats
              .filter((c) => c.pinned && !c.parent_id && !employerIds.has(c.id) && c.kind === "expense")
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
                          cat={c.id === p.id ? { ...c, name: tr("General") } : c}
                          kind={p.kind}
                        />
                      ))}
                    </div>
                    <button
                      className="faint mt-3 text-xs underline underline-offset-4"
                      onClick={() => togglePin(p.id, false)}
                    >
                      {tr("↙ Move back into")}
{" "}
                      {p.kind === "income" ? tr("Income") : tr("Expenses")}
                    </button>
                  </div>
                );
              })}

            {/* -------- Debts -------- */}
            {showDebts && (
            <div className="card p-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">
                  {tr("Debts")}
                  {totalDebt > 0 && (
                    <a href="/app/debts" className="muted ml-2 text-xs font-normal underline-offset-4 hover:underline">
                      {tr("Payoff plan →")}
                    </a>
                  )}
                </h2>
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
                    {tr("+ Add")}
                  </button>
                </div>
              </div>
              {debts.length === 0 ? (
                <p className="muted py-2 text-sm">
                  {tr("Add a card or loan — balance, rate and payment — and I'll tell you exactly when it dies.")}
                </p>
              ) : (
                <div className="grid gap-3">
                  {debts.map((d) => {
                    const prog = debtProgress(d);
                    const pm = payoffMonth(d);
                    const paid = debtPaidThisMonth.get(d.id) ?? 0;
                    return (
                      <MoneyRow
                        key={d.id}
                        name={d.name}
                        subtitle={
                          <>
                            {tr("{amt} left", { amt: money(d.balance) })}
                            {d.apr > 0 && ` · ${d.apr}% APR`}
                            {" · "}
                            {pm ? tr("paid off {v0}", { v0: payoffLabel(pm) }) : tr("payment doesn't cover interest")}
                            {d.payment_due_day && ` · ${tr("Due day {v0}", { v0: d.payment_due_day })}`}
                            {prog !== null && ` · ${tr("{pct}% paid off", { pct: Math.round(prog * 100) })}`}
                          </>
                        }
                        done={paid}
                        plan={debtPlanFor(d)}
                        tone="out"
                        onOpen={() => {
                          setDebtDraft(debtToDraft(d));
                          setDebtOpen(true);
                        }}
                        onPay={(amount) => quickPayDebt(d.id, amount)}
                        payLabel={tr("payment to {v0}", { v0: d.name })}
                        onPlanTap={() => setPlanEditFor(planEditFor === d.id ? null : d.id)}
                        onDelete={async () => {
                          await createClient().from("debts").update({ archived: true }).eq("id", d.id);
                          load();
                        }}
                        deleteLabel={tr("Archive debt")}
                      >
                        {planEditFor === d.id && (
                          <MonthPlanEdit
                            plan={debtPlanFor(d)}
                            base={d.planned_payment}
                            onClose={() => setPlanEditFor(null)}
                            onSave={async (amount, scope) => {
                              const supabase = createClient();
                              const key = month.slice(0, 7);
                              const mp = { ...(d.month_plans ?? {}) };
                              if (scope === "all") {
                                delete mp[key];
                                await supabase.from("debts").update({ planned_payment: amount, month_plans: Object.keys(mp).length ? mp : null }).eq("id", d.id);
                              } else {
                                if (scope === "reset") delete mp[key];
                                else mp[key] = amount;
                                await supabase.from("debts").update({ month_plans: Object.keys(mp).length ? mp : null }).eq("id", d.id);
                              }
                              load(month);
                            }}
                          />
                        )}
                      </MoneyRow>
                    );
                  })}
                </div>
              )}
            </div>
            )}

            {/* -------- Goals -------- */}
            <div className="card p-6">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold">{tr("Goals")}</h2>
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
                    {tr("+ Add")}
                  </button>
                </div>
              </div>
              {goals.length === 0 ? (
                <p className="muted py-2 text-sm">
                  {tr("A house, a car, a watch, a trip — set a target and a date and I'll tell you exactly what each paycheck needs to give.")}
                </p>
              ) : (
                <div className="grid gap-3">
                  {goals.map((g) => {
                    const m = goalMath(g.target_amount, g.saved, g.target_date, primaryFreq);
                    const added = goalAddedThisMonth.get(g.id) ?? 0;
                    const pct = Math.min(100, Math.round((g.saved / g.target_amount) * 100));
                    return (
                      <MoneyRow
                        key={g.id}
                        name={g.name}
                        subtitle={
                          <>
                            {tr("{saved} of {target} · {pct}%", { saved: money(g.saved), target: money(g.target_amount), pct })}
                            {m.perMonth !== null && ` · ${tr("Needs {mo}/mo", { mo: money(m.perMonth) })}`}
                            {g.target_date && tr(" · by {v0}", { v0: g.target_date })}
                            {g.saved >= g.target_amount && ` · ${tr("Target reached — nice.")}`}
                          </>
                        }
                        done={added}
                        plan={goalPlanFor(g)}
                        tone="out"
                        onOpen={() => {
                          setGoalDraft(goalToDraft(g));
                          setGoalOpen(true);
                        }}
                        onPay={(amount) => quickFundGoal(g.id, amount)}
                        payLabel={tr("contribution to {v0}", { v0: g.name })}
                        onPlanTap={() => setPlanEditFor(planEditFor === g.id ? null : g.id)}
                        onDelete={async () => {
                          await createClient().from("goals").update({ archived: true }).eq("id", g.id);
                          load();
                        }}
                        deleteLabel={tr("Archive goal")}
                      >
                        {planEditFor === g.id && (
                          <MonthPlanEdit
                            plan={goalPlanFor(g)}
                            base={goalAuto(g)}
                            onClose={() => setPlanEditFor(null)}
                            onSave={async (amount, scope) => {
                              const supabase = createClient();
                              const key = month.slice(0, 7);
                              const mp = { ...(g.month_plans ?? {}) };
                              const patch: Record<string, unknown> = {};
                              if (scope === "all") {
                                delete mp[key];
                                patch.monthly_plan = amount;
                              } else if (scope === "reset") {
                                if (key in mp) delete mp[key];
                                else patch.monthly_plan = null;
                              } else mp[key] = amount;
                              patch.month_plans = Object.keys(mp).length ? mp : null;
                              await supabase.from("goals").update(patch).eq("id", g.id);
                              load(month);
                            }}
                          />
                        )}
                      </MoneyRow>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="faint text-xs">
              {tr("Need the full history?")}
{" "}
              <Link
                href="/app/transactions"
                className="underline underline-offset-4"
              >
                {tr("All activity →")}
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
                  {tr("Heads up — red months ahead")}
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
                  {tr("See the full forecast →")}
                </Link>
              </div>
            )}

            {(totalInvested > 0 || totalDebt > 0 || net !== 0) && (
              <div className="card p-5">
                <p className="faint text-xs font-semibold uppercase tracking-wide">
                  {tr("Net worth")}
{monthsAhead > 0 ? tr(" by {v0}", { v0: monthLabel(month) }) : ""}
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
                    <span className="muted">{tr("Invested")}</span>
                    <span>{money(totalInvested)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="muted">{tr("Debt")}</span>
                    <span style={{ color: "var(--over)" }}>
                      −{money(totalDebt)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="muted">
                      {monthsAhead > 0
                        ? tr("Plan through {v0}", { v0: monthLabel(month) })
                        : tr("Net this month")}
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
                  {tr("Safe to spend")}
                </p>
                <p
                  className={`font-display text-3xl font-semibold ${
                    runway.covered ? "glow-mint" : "glow-over"
                  }`}
                  style={{
                    color: runway.covered ? "var(--mint)" : "var(--over)",
                  }}
                >
                  {runway.covered ? "" : "−"}
                  {money(
                    Math.abs(runway.onHand - runway.dueSum - runway.everyday)
                  )}
                </p>
                <p className="muted mt-1 text-sm">
                  {tr("before your next paycheck,")}{" "}
{shortDate(runway.nextCheck)}
                </p>
                {!runway.covered && (
                  <p className="mt-1 text-sm" style={{ color: "var(--over)" }}>
                    ~{money(runway.short)} short this stretch
                  </p>
                )}

                <button
                  className="faint mt-3 text-xs hover:underline"
                  onClick={() => toggleBox("runway")}
                >
                  {openBoxes.has("runway") ? tr("Hide the math ▴") : tr("How's this figured? ▾")}
                </button>
                {openBoxes.has("runway") && (
                  <div className="divider mt-2 grid gap-1 pt-2 text-sm">
                    <div className="flex justify-between">
                      <span className="muted">{tr("Cash on hand")}</span>
                      <span>{money(runway.onHand)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="muted">{tr("Bills coming")}</span>
                      <span>−{money(runway.dueSum)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="muted">{tr("Everyday spending (est.)")}</span>
                      <span>−{money(runway.everyday)}</span>
                    </div>
                    {!runway.covered && runway.pushable.length > 0 && (
                      <div className="divider mt-1 pt-1.5">
                        <p className="faint mb-1 text-xs">{tr("Could push:")}</p>
                        {runway.pushable.map((b) => (
                          <div key={b.key} className="flex justify-between">
                            <span className="muted truncate">{b.title}</span>
                            <span className="faint shrink-0">
                              {money(b.amount)} · {shortDate(b.date)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {(pendingTasks.length > 0 || upcoming.length > 0) && (
              <div className="card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-semibold">{tr("Up next")}</h2>
                  <Link href="/app/tasks" className="faint text-sm">
                    {tr("All →")}
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
                        label={tr("Mark {v0} paid", { v0: u.title })}
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
                        aria-label={tr("Complete {v0}", { v0: t.title })}
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
                              ? tr("overdue — {v0}", { v0: shortDate(t.due_date) })
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
                <h2 className="font-display font-semibold">{tr("Money dates")}</h2>
                <div className="mt-2 grid gap-1.5">
                  {debts
                    .filter((d) => d.payment_due_day || d.statement_close_day)
                    .map((d) => (
                      <div key={d.id} className="text-sm">
                        <p className="font-medium">{d.name}</p>
                        <p className="faint text-xs">
                          {d.statement_close_day &&
                            tr("Statement closes day {v0}", { v0: d.statement_close_day })}
                          {d.statement_close_day && d.payment_due_day && " · "}
                          {d.payment_due_day &&
                            tr("Payment due day {v0}", { v0: d.payment_due_day })}
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
                            tr("Statement closes day {v0}", { v0: a.statement_close_day })}
                          {a.statement_close_day && a.payment_due_day && " · "}
                          {a.payment_due_day &&
                            tr("Payment due day {v0}", { v0: a.payment_due_day })}
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
