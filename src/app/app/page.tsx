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
import { hasDeduction, isEditableKey, netOf, renameDeduction, setDeduction, taxParts, taxTotal } from "@/lib/taxes";
import { DeductionEditor } from "@/components/DeductionEditor";
import { MonthPlanEdit } from "@/components/MonthPlanEdit";
import { monthEvents, dailyBalances } from "@/lib/daily";
import { MoneyRow } from "@/components/MoneyRow";
import { Sheet } from "@/components/Sheet";
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
import { type LineItemFreq } from "@/components/LineItemAdd";
import { MonthPicker } from "@/components/MonthPicker";
import { projectFull } from "@/lib/plan";
import { CategoryEditSheet } from "@/components/CategoryEditSheet";
import { MonthRail, type RailLine, type RailSlice, type RailTrend } from "@/components/MonthRail";
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
  // employer breakdown sheet (group id) and the "+ add" chooser ("in" | "out")
  const [empSheet, setEmpSheet] = useState<string | null>(null);
  const [addMenu, setAddMenu] = useState<"in" | "out" | null>(null);
  const [catEdit, setCatEdit] = useState<Category | null>(null);
  const [trendPast, setTrendPast] = useState<{ month: string; income: number; expense: number }[]>([]);
  useEffect(() => {
    (async () => {
      const cur = monthStartISO();
      const from = addMonths(cur, -5);
      const { data } = await createClient()
        .from("transactions")
        .select("kind,amount,tx_date,debt_id")
        .gte("tx_date", from)
        .lt("tx_date", addMonths(cur, 1));
      const rows = Array.from({ length: 6 }, (_, i) => ({ month: addMonths(from, i), income: 0, expense: 0 }));
      for (const t of (data ?? []) as { kind: Kind; amount: number; tx_date: string; debt_id: string | null }[]) {
        const r = rows.find((x) => x.month.slice(0, 7) === t.tx_date.slice(0, 7));
        if (!r) continue;
        if (t.kind === "income") { if (!t.debt_id) r.income += Number(t.amount); }
        else r.expense += Number(t.amount);
      }
      setTrendPast(rows);
    })();
  }, []);
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
  // the quick "+" logger saved something: refresh the month
  useEffect(() => {
    const on = () => load(month);
    window.addEventListener("mf:changed", on);
    return () => window.removeEventListener("mf:changed", on);
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
  const cashHere = 0; // cash lives in the CASH header (banks + cash in hand), not in the month's flows
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
  // plan lines + debts, goals and investments (same as every other page)
  const projection = useMemo(() => projectFull(recurring, debts, goals, invs, 13), [recurring, debts, goals, invs]);
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

  // ---------- CASH: banks (Plaid balances) + cash in hand, today ----------
  const today = todayISO();
  const curMonth = monthStartISO();
  const bankCash = accts
    .filter((a) => !a.archived && ["checking", "savings", "cash"].includes(a.type) && a.current_balance != null)
    .reduce((s2, a) => s2 + Number(a.current_balance), 0);
  const hasBanks = accts.some((a) => a.source === "plaid" && a.current_balance != null);
  const cashInHandNow = Number(cashMap[curMonth.slice(0, 7)] ?? 0);
  const cashNow = bankCash + cashInHandNow;

  // ---------- the month, day by day ----------
  const doneByItem = new Map<string, number>();
  for (const t of txs) if (t.recurring_item_id) doneByItem.set(t.recurring_item_id, (doneByItem.get(t.recurring_item_id) ?? 0) + t.amount);
  const isPast = month < curMonth;
  const dayExtras: { title: string; amount: number; day: number | null }[] = [];
  for (const d of liveDebts) {
    if (coveredDebt.has(d.id)) continue;
    const left = debtPlanFor(d) - (debtPaidThisMonth.get(d.id) ?? 0);
    if (left > 0) dayExtras.push({ title: d.name, amount: -left, day: d.payment_due_day ?? 15 });
  }
  for (const g of goals) {
    const left = goalPlanFor(g) - (goalAddedThisMonth.get(g.id) ?? 0);
    if (left > 0) dayExtras.push({ title: g.name, amount: -left, day: null });
  }
  for (const iv of invs) {
    if (!(iv.monthly_amount > 0)) continue;
    if (iv.monthly_kind === "withdraw") {
      const left = iv.monthly_amount - (invWithdrawnThisMonth.get(iv.id) ?? 0);
      if (left > 0) dayExtras.push({ title: iv.name, amount: left, day: 1 });
    } else {
      const left = iv.monthly_amount - (invAddedThisMonth.get(iv.id) ?? 0);
      if (left > 0) dayExtras.push({ title: iv.name, amount: -left, day: 1 });
    }
  }
  const events = isPast
    ? []
    : monthEvents({
        month,
        today: month === curMonth ? today : month,
        items: recurring,
        doneByItem: month === curMonth ? doneByItem : new Map(),
        extras: dayExtras,
      });
  // where the month starts: today's cash (this month) or an estimate (future months)
  const monthStartCash = (() => {
    if (month === curMonth) return cashNow;
    let bal = cashNow;
    const [cy, cm] = curMonth.split("-").map(Number);
    const daysIn = new Date(cy, cm, 0).getDate();
    const leftFrac = Math.max(0, (daysIn - Number(today.slice(8, 10))) / daysIn);
    for (const p of projection) {
      if (p.month >= month) break;
      bal += p.month === curMonth ? p.net * leftFrac : p.net;
    }
    return bal;
  })();
  const balances = isPast ? new Map<string, number>() : dailyBalances(month, month === curMonth ? today : month, monthStartCash, events);
  const endOfMonth = isPast ? null : monthStartCash + events.reduce((a, e) => a + e.amount, 0);
  const LOW = 1000;

  // ---------- side rail: calendar / detail / charts ----------
  const catById = new Map(cats.map((c) => [c.id, c]));
  const topName = (id: string | null) => {
    const c = id ? catById.get(id) : undefined;
    if (!c) return tr("Other");
    const p = c.parent_id ? catById.get(c.parent_id) : undefined;
    return (p ?? c).name;
  };
  const txTitle = (t: Transaction) =>
    t.note ||
    (t.debt_id && debts.find((d) => d.id === t.debt_id)?.name) ||
    (t.goal_id && goals.find((g) => g.id === t.goal_id)?.name) ||
    (t.investment_id && invs.find((i) => i.id === t.investment_id)?.name) ||
    catNameById.get(t.category_id ?? "") ||
    (t.kind === "income" ? tr("Income") : tr("Expense"));
  const signedTx = (t: Transaction) => (t.kind === "income" ? t.amount : -t.amount);
  const railLines: RailLine[] = [
    ...txs.map((t) => ({ date: t.tx_date, title: txTitle(t), amount: signedTx(t), done: true })),
    ...events.map((e) => ({ date: e.date, title: e.title, amount: e.amount, done: false })),
  ];
  // balance at the end of each PAST day this month: walk back from today's cash
  const railBalances = new Map(balances);
  if (month === curMonth && (hasBanks || cashInHandNow > 0)) {
    const [ry, rm] = month.split("-").map(Number);
    const byDate = new Map<string, number>();
    for (const t of txs) byDate.set(t.tx_date, (byDate.get(t.tx_date) ?? 0) + signedTx(t));
    let bal = cashNow;
    for (let d = Number(today.slice(8, 10)); d > 1; d--) {
      bal -= byDate.get(toISO(new Date(ry, rm - 1, d))) ?? 0;
      railBalances.set(toISO(new Date(ry, rm - 1, d - 1)), bal);
    }
  }
  const badList = [...balances.entries()].filter(([, v]) => v < 0);
  const railSlices: RailSlice[] = (() => {
    const mp = new Map<string, RailSlice>();
    const add = (name: string, actual: number, plan: number) => {
      const x = mp.get(name) ?? { name, actual: 0, plan: 0 };
      x.actual += actual;
      x.plan += plan;
      mp.set(name, x);
    };
    for (const t of catTxs) if (t.kind === "expense") add(topName(t.category_id), t.amount, 0);
    for (const c of cats) if (c.kind === "expense") add(topName(c.id), 0, planFor(c.id));
    add(tr("Debts"), debtPaidTotal, debtOnlyPlan);
    add(tr("Goals"), goalContribTotal, planGoals);
    add(tr("Investments"), invContribTotal, invPlanDeposit);
    return [...mp.values()];
  })();
  const railTrend: RailTrend[] = [
    ...trendPast.map((t) => ({ ...t, planned: false })),
    ...projection.slice(1, 7).map((p) => ({ month: p.month, income: p.income, expense: p.expense, planned: true })),
  ];
  const railDetail = {
    cash: cashNow,
    invested: totalInvested,
    debt: totalDebt,
    goalsSaved: totalGoalSaved,
    incomeDone: incomeTotal,
    incomePlan: planIncome,
    outDone: expenseTotal,
    outPlan: planExpense,
    debtPaid: debtPaidTotal,
    endOfMonth,
    in12:
      cashNow + totalInvested - totalDebt + (endOfMonth != null && month === curMonth ? endOfMonth - cashNow : 0) +
      projection.slice(1, 12).reduce((a, p) => a + p.net, 0),
  };
  const rail = (
    <MonthRail
      key={month}
      month={month}
      today={today}
      curMonth={curMonth}
      isPast={isPast}
      low={LOW}
      lines={railLines}
      balances={railBalances}
      detail={railDetail}
      slices={railSlices}
      trend={railTrend}
      badDays={badList.length}
      firstBad={badList[0]?.[0] ?? null}
    />
  );
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
          className="faint ml-1 font-medium hover:underline"
          title={tr("Set this month's plan")}
          onClick={() => {
            setVal(plan > 0 ? String(plan) : "");
            setEditing(true);
          }}
        >
          / {plan > 0 ? money(plan) : `+ ${tr("plan")}`}
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
          const { error } = await supabase.from("categories").delete().eq("id", catId);
          if (error) {
            const n = /CATEGORY_IN_USE:(\d+)/.exec(error.message)?.[1];
            window.alert(n ? tr("This category still has {n} plan items in other months. Move them first (open each item → Category).", { n }) : error.message);
          }
          load();
        }}
      >
        {confirm ? "sure?" : "✕"}
      </button>
    );
  }

  function PlanItemRow({ item, planTotal, catId, kind }: { item: RecurringItem; planTotal: number; catId: string; kind: Kind }) {
    const linked = (txByCat.get(catId) ?? []).filter((t) => t.recurring_item_id === item.id);
    const received = linked.reduce((s, t) => s + t.amount, 0);
    const nextMonth = addMonths(month, 1);
    const schedule = occurrenceDates(item, month, nextMonth).filter((d) => d < nextMonth);
    return (
      <MoneyRow
        name={item.title}
        subtitle={
          <>
            {tr(frequencyLabels[item.frequency])}
            {schedule.length > 0 && <> · {schedule.map((d) => shortDate(d)).join(" · ")}</>}
            {linked.length > 0 && <> · ✓ {linked.map((t) => shortDate(t.tx_date)).join(" · ")}</>}
          </>
        }
        done={received}
        plan={planTotal}
        tone={kind === "income" ? "in" : "out"}
        onOpen={() => setPlanSheet({ item, kind, catId })}
        onPay={!isFuture ? (amount) => quickAddTx(kind, catId, amount, item.title, "none", todayISO(), item.id) : undefined}
        onDelete={() => deletePlanItem(item.id)}
        deleteLabel={tr("Remove plan")}
      />
    );
  }

  /** Group header: one line, then its rows. Every total = THIS MONTH, done / plan. */
  function Group({
    id,
    name,
    done,
    plan,
    tone,
    pill,
    onAdd,
    planEditor,
    onDelete,
    onEdit,
    children,
  }: {
    id: string;
    name: string;
    done: number;
    plan: number;
    tone: "in" | "out";
    pill?: string;
    onAdd?: () => void;
    planEditor?: React.ReactNode;
    onDelete?: () => void;
    onEdit?: () => void;
    children?: React.ReactNode;
  }) {
    const col = collapsed.has(id);
    const color = tone === "in" ? "var(--mint)" : "var(--over)";
    return (
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <button className="faint w-3 shrink-0 text-xs" onClick={() => toggleCollapse(id)} aria-label={col ? tr("Expand {v0}", { v0: name }) : tr("Collapse {v0}", { v0: name })}>
            {col ? "▸" : "▾"}
          </button>
          <button className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold" onClick={() => toggleCollapse(id)}>
            <span className="truncate">{name}</span>
            {pill && <span className="chip !py-0 text-[10px] font-medium max-sm:!hidden">{pill}</span>}
          </button>
          <span className="ml-auto whitespace-nowrap text-sm font-semibold tabular-nums">
            <span className={done > 0 ? "" : "faint"} style={done > 0 ? { color } : undefined}>
              {money(done)}
            </span>
            {planEditor ?? (plan > 0 ? <span className="muted font-medium"> / {money(plan)}</span> : null)}
          </span>
          {onAdd && (
            <button className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold" style={{ background: "var(--mint-soft)", color: "var(--mint)" }} onClick={onAdd} aria-label={tr("Add to {v0}", { v0: name })}>
              +
            </button>
          )}
          {onEdit && (
            <button className="faint grid h-7 w-6 shrink-0 place-items-center rounded-full text-base leading-none hover:opacity-70" onClick={onEdit} aria-label={tr("Edit {v0}", { v0: name })}>
              ⋯
            </button>
          )}
          {onDelete && <DeleteCategoryButton catId={id} />}
        </div>
        {!col && (
          <div className="divide-y border-t px-4" style={{ borderColor: "var(--border)" }}>
            {children}
          </div>
        )}
      </div>
    );
  }

  /** one debt as a row (plain function so it can sit in any group) */
  function debtRow(d: Debt) {

                    const prog = debtProgress(d);
                    const pm = payoffMonth(d);
                    const paid = debtPaidThisMonth.get(d.id) ?? 0;
    return (
      <MoneyRow
                        key={d.id}
                        name={d.name}
                        subtitle={
                          <>
                            {tr("You owe {amt}", { amt: money(d.balance) })}
                            {d.apr > 0 && ` · ${d.apr}%`}
                            {" · "}
                            {pm ? tr("paid off {v0}", { v0: payoffLabel(pm) }) : tr("payment doesn't cover interest")}
                            {d.payment_due_day && ` · ${tr("day {v0}", { v0: d.payment_due_day })}`}
                            {prog !== null && ` · ${tr("{pct}% paid off", { pct: Math.round(prog * 100) })}`}
                          </>
                        }
                        done={paid}
                        plan={coveredDebt.has(d.id) ? undefined : debtPlanFor(d)}
                        tone="out"
                        onOpen={() => { setDebtDraft(debtToDraft(d)); setDebtOpen(true); }}
                        onPay={(amount) => quickPayDebt(d.id, amount)}
                        payLabel={tr("payment to {v0}", { v0: d.name })}
                        onPlanTap={() => setPlanEditFor(planEditFor === d.id ? null : d.id)}
                        onDelete={async () => { await createClient().from("debts").update({ archived: true }).eq("id", d.id); load(); }}
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
  }

  // debts section: grouped by kind (cards, cars, home, lenders, people, other)
  const DEBT_BUCKETS = ["cards", "cars", "home", "lenders", "people", "other"] as const;
  type DebtBucket = (typeof DEBT_BUCKETS)[number];
  const bucketName: Record<DebtBucket, string> = {
    cards: tr("Credit cards"),
    cars: tr("Cars"),
    home: tr("Home"),
    lenders: tr("Loans & lenders"),
    people: tr("People"),
    other: tr("Other debts"),
  };
  const bucketOfType = (t: Debt["debt_type"]): DebtBucket =>
    t === "credit_card" ? "cards" : t === "car_loan" ? "cars" : t === "mortgage" ? "home" : t === "personal_loan" || t === "student_loan" ? "lenders" : "other";
  const bucketOfText = (txt: string): DebtBucket => {
    const l = txt.toLowerCase();
    const hit = liveDebts.find((d) => l.includes(d.name.toLowerCase()) || d.name.toLowerCase().includes(l));
    if (hit) return bucketOfType(hit.debt_type);
    if (/tarjeta|card|visa|amex|master|discover|fleet|chase|citi|capital one|credit|cr[ée]dito/.test(l)) return "cards";
    if (/carro|coche|auto|jeep|mercedes|toyota|vehic|\bcar\b/.test(l)) return "cars";
    if (/casa|home|hipoteca|mortgage|house/.test(l)) return "home";
    if (/afterpay|klarna|affirm|cash ?app|zip|sofi|upstart|lending|lender|pr[ée]stamo|loan|student|estudiant/.test(l)) return "lenders";
    if (/amig|friend|famil|mam[aá]|pap[aá]|herman|brother|sister|t[ií]o|primo|efectivo|boda/.test(l)) return "people";
    return "other";
  };
  const DEBT_CAT = /^(deudas?|debts?)$/i;
  const debtCatIds = new Set(
    cats.filter((c) => c.kind === "expense" && (DEBT_CAT.test(c.name) || (c.parent_id && DEBT_CAT.test(catNameById.get(c.parent_id) ?? "")))).map((c) => c.id)
  );

  /** A group (big category) → its categories (a tinted label strip each) → items. */
  function CategoryGroup({ cat, kind }: { cat: Category; kind: Kind }) {
    const kids = cats.filter((c) => c.parent_id === cat.id);
    const parts = [cat, ...kids].map((c) => {
      const rows = (plannedByCat.get(c.id) ?? []).map((p) => ({ c, p }));
      const shown = new Set(rows.map((r) => r.p.item.id));
      const loose = (txByCat.get(c.id) ?? []).filter((t) => !t.recurring_item_id || !shown.has(t.recurring_item_id));
      return { c, rows, loose, done: spentIn(c.id), plan: planFor(c.id) };
    });
    const done = parts.reduce((s2, p) => s2 + p.done, 0);
    const plan = parts.reduce((s2, p) => s2 + p.plan, 0);
    const isEmpty = parts.every((p) => p.rows.length === 0 && p.loose.length === 0);
    if (isEmpty && plan === 0 && kids.length === 0) return null;
    const tone = kind === "income" ? "in" : "out";
    const color = kind === "income" ? "var(--mint)" : "var(--over)";
    const body = (p: (typeof parts)[number]) => (
      <>
        {p.rows.map((r) => (
          <PlanItemRow key={r.p.item.id} item={r.p.item} planTotal={r.p.total} catId={r.c.id} kind={kind} />
        ))}
        {p.loose.map((t) => (
          <MoneyRow
            key={t.id}
            name={t.note || p.c.name}
            subtitle={
              <>
                ✓ {shortDate(t.tx_date)}
                {t.source === "plaid" && ` · ${tr("bank")}`}
                {t.source === "task" && ` · ${tr("from task")}`}
              </>
            }
            done={t.amount}
            tone={tone}
            onOpen={() => editTx(t)}
            onDelete={() => deleteTx(t.id)}
          />
        ))}
      </>
    );
    const uncat = isUncat(cat.id);
    return (
      <Group
        id={cat.id}
        name={cat.name}
        done={done}
        plan={plan}
        tone={tone}
        onAdd={!uncat ? () => setPlanSheet({ item: null, kind, catId: kids[0]?.id ?? cat.id }) : undefined}
        planEditor={kids.length === 0 && parts[0].rows.length === 0 && !uncat ? <PlanEditor catId={cat.id} plan={plan} /> : undefined}
        onEdit={!uncat ? () => setCatEdit(cat) : undefined}
        onDelete={isEmpty && kids.length === 0 && !uncat ? () => {} : undefined}
      >
        {body(parts[0])}
        {parts.slice(1).map((p) => (
          <div key={p.c.id} className="!border-t-0">
            <div className="-mx-4 flex items-center gap-2 border-t px-4 py-2" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
              <CategoryDot name={p.c.name} size={7} />
              <span className="muted min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider">{p.c.name}</span>
              <span className="ml-auto whitespace-nowrap text-xs font-semibold tabnum">
                <span className={p.done > 0 ? "" : "faint"} style={p.done > 0 ? { color } : undefined}>{money(p.done)}</span>
                {p.rows.length === 0 ? <PlanEditor catId={p.c.id} plan={p.plan} /> : <span className="faint font-medium"> / {money(p.plan)}</span>}
              </span>
              <button className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold" style={{ background: "var(--mint-soft)", color: "var(--mint)" }} onClick={() => setPlanSheet({ item: null, kind, catId: p.c.id })} aria-label={tr("Add to {v0}", { v0: p.c.name })}>
                +
              </button>
              <button className="faint grid h-6 w-5 shrink-0 place-items-center text-sm leading-none hover:opacity-70" onClick={() => setCatEdit(p.c)} aria-label={tr("Edit {v0}", { v0: p.c.name })}>
                ⋯
              </button>
            </div>
            {(p.rows.length > 0 || p.loose.length > 0) && <div className="divide-y" style={{ borderColor: "var(--border)" }}>{body(p)}</div>}
          </div>
        ))}
      </Group>
    );
  }

  function EmployerCard({ g, inner = false }: { g: Category & { children: Category[] }; inner?: boolean }) {
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
      <div className={inner ? "" : "card p-6"}>
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
              <CategoryGroup key={c.id} cat={c.id === g.id && g.children.length ? { ...c, name: tr("General") } : c} kind="income" />
            ))}
          </div>
        )}
      </div>
    );
  }

  async function saveCash(amount: number | null, forMonth: string = month) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const next = { ...cashMap };
    const key = forMonth.slice(0, 7);
    if (amount && amount > 0) next[key] = Math.round(amount * 100) / 100;
    else delete next[key];
    setCashMap(next);
    await supabase.from("profiles").update({ cash_on_hand: Object.keys(next).length ? next : null }).eq("id", user.id);
  }

  function EmployerBlock({ g }: { g: Category & { children: Category[] } }) {
    const members = [g as Category, ...g.children];
    const rows = members.flatMap((c) => (plannedByCat.get(c.id) ?? []).map((p) => ({ c, p })));
    const shown = new Set(rows.map((r) => r.p.item.id));
    const loose = members.flatMap((c) => (txByCat.get(c.id) ?? []).filter((t) => !t.recurring_item_id || !shown.has(t.recurring_item_id)).map((t) => ({ c, t })));
    const done = members.reduce((a, c) => a + spentIn(c.id), 0);
    const plan = members.reduce((a, c) => a + planFor(c.id), 0);
    const dedGroup = (key: string, label: string) => {
      if (!key.startsWith("other:")) return "taxes";
      const l = label.toLowerCase();
      if (/loan|pr[ée]stamo/.test(l)) return "loans";
      if (/rent|renta|basura|trash|housing|casa/.test(l)) return "housing";
      if (/401|dental|visi|vision|hsa|fsa|seguro|insurance|life|vida|medical|m[ée]dico|benefit/.test(l)) return "benefits";
      return "other";
    };
    const names: Record<string, string> = { taxes: tr("Taxes"), benefits: tr("Benefits"), loans: tr("Loans"), housing: tr("Rent & housing"), other: tr("Other") };
    return (
      <Group id={g.id} name={`${tr("Employer")} · ${g.name}`} done={done} plan={plan} tone="in" onAdd={() => setPlanSheet({ item: null, kind: "income", catId: g.id })}>
        {rows.map(({ c, p }) => {
          const t = p.item.taxes;
          const taxed = !!(t && t.gross > 0);
          const n = taxed ? Math.max(1, Math.round(p.total / p.item.amount)) : 0;
          const parts = taxed ? taxParts(t) : [];
          const grp = new Map<string, number>();
          for (const x of parts) grp.set(dedGroup(x.key, x.label), (grp.get(dedGroup(x.key, x.label)) ?? 0) + x.amount * n);
          const dedTotal = [...grp.values()].reduce((a, b) => a + b, 0);
          const gross = taxed ? t!.gross * n : 0;
          const open = payOpen.has(`ded-${p.item.id}`);
          return (
            <div key={p.item.id}>
              <PlanItemRow item={p.item} planTotal={p.total} catId={c.id} kind="income" />
              {taxed && (
                <div className="-mt-1 pb-2 pl-5 text-xs">
                  <button
                    className="faint hover:underline"
                    onClick={() =>
                      setPayOpen((st) => {
                        const nx = new Set(st);
                        const k = `ded-${p.item.id}`;
                        if (nx.has(k)) nx.delete(k);
                        else nx.add(k);
                        return nx;
                      })
                    }
                  >
                    {tr("Gross {g} · deductions −{d} ({p}%)", { g: money(gross), d: money(dedTotal), p: gross ? Math.round((dedTotal / gross) * 100) : 0 })} {open ? "▴" : "▾"}
                  </button>
                  {open && (
                    <div className="mt-1.5 grid gap-1 rounded-lg p-2.5" style={{ background: "var(--surface-2)" }}>
                      {["taxes", "benefits", "loans", "housing", "other"].filter((k) => grp.has(k)).map((k) => (
                        <div key={k} className="flex justify-between">
                          <span className="muted">
                            {names[k]} <span className="faint">{((grp.get(k)! / gross) * 100).toFixed(1)}%</span>
                          </span>
                          <span style={{ color: "var(--over)" }}>−{money(grp.get(k)!)}</span>
                        </div>
                      ))}
                      <button className="mt-1 justify-self-start font-semibold" style={{ color: "var(--mint)" }} onClick={() => setEmpSheet(g.id)}>
                        {tr("See every line / edit deductions")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {loose.map(({ c, t }) => (
          <MoneyRow key={t.id} name={t.note || c.name} subtitle={<>✓ {shortDate(t.tx_date)}{t.source === "plaid" && ` · ${tr("bank")}`}</>} done={t.amount} tone="in" onOpen={() => editTx(t)} onDelete={() => deleteTx(t.id)} />
        ))}
      </Group>
    );
  }

  function CashRow() {
    const [edit, setEdit] = useState(false);
    const [val, setVal] = useState(cashHere ? String(cashHere) : "");
    return (
      <div className="flex items-center gap-2 border-t py-2" style={{ borderColor: "var(--border)" }}>
        <span className="mt-0.5 text-sm" aria-hidden>💵</span>
        <button className="min-w-0 flex-1 text-left" onClick={() => setEdit(true)}>
          <span className="block text-sm font-medium">{tr("Cash in hand")}</span>
          <span className="faint block text-xs">{tr("Not income — it adds to what's left")}</span>
        </button>
        {edit ? (
          <span className="flex items-center gap-1.5">
            <span className="relative">
              <span className="faint pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm">$</span>
              <input className="input !w-28 !py-1 !pl-5 !pr-2 text-sm" type="number" step="0.01" min="0" inputMode="decimal" autoFocus value={val} onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { saveCash(parseFloat(val) || 0); setEdit(false); } if (e.key === "Escape") setEdit(false); }} />
            </span>
            <button className="btn btn-primary !px-2.5 !py-1 !text-xs" onClick={() => { saveCash(parseFloat(val) || 0); setEdit(false); }}>{tr("Save")}</button>
            <button className="faint px-1 text-sm" onClick={() => setEdit(false)} aria-label={tr("Cancel")}>×</button>
          </span>
        ) : (
          <button className="text-sm tabular-nums hover:underline" onClick={() => setEdit(true)}>
            {cashHere > 0 ? <span style={{ color: "var(--mint)" }}>{money(cashHere)}</span> : <span className="faint">{money(0)}</span>}
            <span className="faint text-xs"> ✎</span>
          </button>
        )}
      </div>
    );
  }

  function CashHero() {
    const [edit, setEdit] = useState(false);
    const [val, setVal] = useState(cashInHandNow ? String(cashInHandNow) : "");
    const lastDayLabel = (() => {
      const [y, m] = month.split("-").map(Number);
      return shortDate(toISO(new Date(y, m, 0)));
    })();
    const Tile = ({ label, now, plan, color }: { label: string; now: number; plan: number; color: string }) => (
      <div className="card p-4">
        <p className="faint text-xs font-semibold">{label}</p>
        <p className="font-display text-2xl font-semibold tabnum" style={{ color }}>
          {money(now)}
        </p>
        <p className="faint text-xs">{tr("of {amt} planned", { amt: money(plan) })}</p>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
          <div className="h-full rounded-full" style={{ width: `${plan > 0 ? Math.min(100, (now / plan) * 100) : 0}%`, background: color }} />
        </div>
      </div>
    );
    return (
      <div className="grid gap-4">
        <div className="px-1">
          <p className="faint text-xs font-semibold uppercase tracking-wide">{month === curMonth ? "Cash" : tr("Cash today")}</p>
          <p className="num-hero" style={{ color: cashNow < 0 ? "var(--over)" : undefined }}>
            {cashNow < 0 ? "−" : ""}
            {money(Math.abs(cashNow))}
          </p>
          <p className="muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {hasBanks && <span>{tr("Banks {amt}", { amt: money(bankCash) })} ·</span>}
            {edit ? (
              <span className="inline-flex items-center gap-1.5">
                {tr("Cash in hand")}
                <span className="relative">
                  <span className="faint pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm">$</span>
                  <input className="input !w-24 !py-0.5 !pl-5 !pr-2 text-sm" type="number" step="0.01" min="0" inputMode="decimal" autoFocus value={val}
                    onChange={(e) => setVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { saveCash(parseFloat(val) || 0, curMonth); setEdit(false); } if (e.key === "Escape") setEdit(false); }} />
                </span>
                <button className="btn btn-primary !px-2.5 !py-0.5 !text-xs" onClick={() => { saveCash(parseFloat(val) || 0, curMonth); setEdit(false); }}>{tr("Save")}</button>
                <button className="faint px-1" onClick={() => setEdit(false)} aria-label={tr("Cancel")}>×</button>
              </span>
            ) : (
              <button className="hover:underline" onClick={() => setEdit(true)}>
                {tr("Cash in hand {amt}", { amt: money(Number(cashInHandNow) || 0) })} <span className="faint text-xs">✎</span>
              </button>
            )}
            {endOfMonth !== null && (
              <span>
                · {tr("On {d} you'd have", { d: lastDayLabel })}{" "}
                <b style={{ color: endOfMonth < 0 ? "var(--over)" : "var(--mint)" }}>
                  {endOfMonth < 0 ? "−" : ""}
                  {money(Math.abs(endOfMonth))}
                </b>
              </span>
            )}
          </p>
          {!hasBanks && cashInHandNow === 0 && (
            <p className="faint mt-1 text-xs">{tr("Connect your bank or type the cash you have, so the calendar knows where you start.")}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Tile label={tr("Money in")} now={incomeTotal} plan={planIncome} color="var(--mint)" />
          <Tile label={tr("Money out")} now={expenseTotal} plan={planExpense} color="var(--over)" />
        </div>
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
            {leftPlan >= 0 ? ` · ${tr("{amt} left at month end", { amt: money(leftPlan) })}` : ` · ${tr("{amt} short at month end", { amt: money(-leftPlan) })}`}
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

  /** a quiet divider that splits Money out into Spending · Debts · Goals · Investments */
  function SectionLabel({ title, done, plan, note, onAdd, first = false }: { title: string; done: number; plan: number; note?: string; onAdd?: () => void; first?: boolean }) {
    return (
      <div className={`${first ? "" : "mt-4"} px-1`}>
        <div className="flex items-center gap-3">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--over)" }}>{title}</h3>
          <span className="h-px flex-1" style={{ background: "var(--border)" }} />
          <span className="whitespace-nowrap text-xs font-semibold tabnum">
            <span className={done > 0 ? "" : "faint"} style={done > 0 ? { color: "var(--over)" } : undefined}>{money(done)}</span>
            <span className="faint font-medium"> / {money(plan)}</span>
          </span>
          {onAdd && (
            <button className="grid h-6 w-6 place-items-center rounded-full text-xs font-semibold" style={{ background: "var(--over-soft)", color: "var(--over)" }} onClick={onAdd} aria-label={tr("Add to {v0}", { v0: title })}>
              +
            </button>
          )}
        </div>
        {note && <p className="faint mt-0.5 text-[11px]">{note}</p>}
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
      {false && parts.length > 1 && (
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
          onLog={(amount, note, catId, date) => quickAddTx(planSheet.kind, catId ?? uncatId(planSheet.kind), amount, note, "none", date)}
          linked={planSheet.item ? txs.filter((t) => t.recurring_item_id === planSheet.item!.id) : []}
          onOpenTx={(t) => { setPlanSheet(null); editTx(t); }}
          onDeleteTx={(id) => deleteTx(id)}
        />
      )}
      {loading ? (
        <p className="faint mt-10 text-center text-sm">{tr("Loading your month…")}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
          <div className="grid gap-4 lg:col-span-2">
            {/* ---- CASH, then In / Out ---- */}
            <CashHero />
            {/* phones: the calendar right after cash (desktop shows it in the side rail) */}
            <div className="lg:hidden">{rail}</div>
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
            <div className="grid gap-3">
              {employerGroups.map((g) => (
                <EmployerBlock key={g.id} g={g} />
              ))}
              {(() => {
                const t = buildCategoryTree(cats, "income");
                const list = [...t.groups, ...t.standalone].filter((c) => !employerIds.has(c.id));
                return list.map((c) => <CategoryGroup key={c.id} cat={c} kind="income" />);
              })()}
              {(txByCat.get(uncatId("income")) ?? []).length > 0 && (
                <CategoryGroup cat={{ id: uncatId("income"), name: tr("Uncategorized"), icon: "🗂️", kind: "income", parent_id: null }} kind="income" />
              )}
              {invs.some((iv) => iv.monthly_kind === "withdraw" && iv.monthly_amount > 0) && (
              <Group id="g-inv-in" name={tr("Investments")} pill={tr("taking out this month")} done={invWithdrawTotal} plan={invPlanWithdraw} tone="in">
              {invs.filter((iv) => iv.monthly_kind === "withdraw" && iv.monthly_amount > 0).map((iv) => (
                <MoneyRow
                  key={iv.id}
                  name={iv.name}
                  subtitle={tr("Investment · balance {bal} · taking out", { bal: money(iv.balance) })}
                  done={invWithdrawnThisMonth.get(iv.id) ?? 0}
                  plan={iv.monthly_amount}
                  tone="in"
                  onOpen={() => {
                    setInvDraft(invToDraft(iv));
                    setInvOpen(true);
                  }}
                  onPay={(amount) => quickWithdraw(iv.id, amount)}
                  payLabel={tr("withdrawal from {v0}", { v0: iv.name })}
                />
              ))}
              </Group>
              )}
              <div className="px-1 py-1">
                {addMenu === "in" ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <button className="btn btn-ghost !px-3 !py-1 !text-xs" onClick={() => { setAddMenu(null); setPlanSheet({ item: null, kind: "income", catId: null }); }}>{tr("Income")}</button>
                    <button className="btn btn-ghost !px-3 !py-1 !text-xs" onClick={() => { setAddMenu(null); setInvDraft(emptyInvDraft()); setInvOpen(true); }}>{tr("Investment")}</button>
                    <button className="btn btn-ghost !px-3 !py-1 !text-xs" onClick={() => { setAddMenu(null); setCatSheetKind("income"); }}>{tr("Category")}</button>
                    <button className="faint px-1" onClick={() => setAddMenu(null)}>×</button>
                  </div>
                ) : (
                  <button className="text-sm font-semibold" style={{ color: "var(--mint)" }} onClick={() => setAddMenu("in")}>
                    {tr("+ Add income")}
                  </button>
                )}
              </div>
            </div>

            {/* ======== MONEY OUT ======== */}
            <FlowHeader dir="out" />
            <p className="faint -mt-2 text-xs">{tr("Every total here is this month: paid / plan. What you owe in total is on each line.")}</p>
            <div className="grid gap-3">
              {(() => {
                const t = buildCategoryTree(cats, "expense");
                const tops = [...t.groups, ...t.standalone].filter((c) => !debtCatIds.has(c.id));
                const spendCats = cats.filter((c) => c.kind === "expense" && !debtCatIds.has(c.id));
                const sDone = spendCats.reduce((a2, c) => a2 + spentIn(c.id), 0) + spentIn(uncatId("expense"));
                const sPlan = spendCats.reduce((a2, c) => a2 + planFor(c.id), 0);
                return (
                  <>
                    <SectionLabel title={tr("Spending")} done={sDone} plan={sPlan} onAdd={() => setPlanSheet({ item: null, kind: "expense", catId: null })} first />
                    {tops.map((c) => <CategoryGroup key={c.id} cat={c} kind="expense" />)}
                  </>
                );
              })()}
              {(txByCat.get(uncatId("expense")) ?? []).length > 0 && (
                <CategoryGroup cat={{ id: uncatId("expense"), name: tr("Uncategorized"), icon: "🗂️", kind: "expense", parent_id: null }} kind="expense" />
              )}

              {(() => {
                // ---- DEBTS: its own section, one block per kind ----
                const blocks = new Map<DebtBucket, { rows: React.ReactNode[]; done: number; plan: number }>();
                const put = (b: DebtBucket, node: React.ReactNode, done: number, plan: number) => {
                  const x = blocks.get(b) ?? { rows: [], done: 0, plan: 0 };
                  x.rows.push(node);
                  x.done += done;
                  x.plan += plan;
                  blocks.set(b, x);
                };
                if (showDebts)
                  for (const d of liveDebts)
                    put(bucketOfType(d.debt_type), debtRow(d), debtPaidThisMonth.get(d.id) ?? 0, coveredDebt.has(d.id) ? 0 : debtPlanFor(d));
                for (const cid of debtCatIds) {
                  const list = plannedByCat.get(cid) ?? [];
                  const shown = new Set(list.map((p) => p.item.id));
                  for (const p of list) {
                    const got = (txByCat.get(cid) ?? []).filter((t) => t.recurring_item_id === p.item.id).reduce((a2, t) => a2 + t.amount, 0);
                    put(bucketOfText(p.item.title), <PlanItemRow key={p.item.id} item={p.item} planTotal={p.total} catId={cid} kind="expense" />, got, p.total);
                  }
                  for (const t of (txByCat.get(cid) ?? []).filter((t) => !t.recurring_item_id || !shown.has(t.recurring_item_id)))
                    put(
                      bucketOfText(t.note ?? ""),
                      <MoneyRow key={t.id} name={t.note || catNameById.get(cid) || tr("Debt")} subtitle={<>✓ {shortDate(t.tx_date)}</>} done={t.amount} tone="out" onOpen={() => editTx(t)} onDelete={() => deleteTx(t.id)} />,
                      t.amount,
                      0
                    );
                }
                if (blocks.size === 0) return null;
                const all = [...blocks.values()];
                return (
                  <>
                    <SectionLabel
                      title={tr("Debts")}
                      done={all.reduce((a2, x) => a2 + x.done, 0)}
                      plan={all.reduce((a2, x) => a2 + x.plan, 0)}
                      note={totalDebt > 0 ? tr("You owe {amt} in total", { amt: money(totalDebt) }) : undefined}
                      onAdd={() => { setDebtDraft(emptyDebtDraft()); setDebtOpen(true); }}
                    />
                    {DEBT_BUCKETS.filter((b) => blocks.has(b)).map((b) => {
                      const x = blocks.get(b)!;
                      return (
                        <Group key={b} id={`debt-${b}`} name={bucketName[b]} done={x.done} plan={x.plan} tone="out" onAdd={() => { setDebtDraft(emptyDebtDraft()); setDebtOpen(true); }}>
                          {x.rows}
                        </Group>
                      );
                    })}
                  </>
                );
              })()}

              {goals.length > 0 && <SectionLabel title={tr("Goals")} done={goalContribTotal} plan={planGoals} onAdd={() => { setGoalDraft(emptyGoalDraft()); setGoalOpen(true); }} />}
              {goals.length > 0 && (
                <Group id="g-goals" name={tr("Saving this month")} done={goalContribTotal} plan={planGoals} tone="out" onAdd={() => { setGoalDraft(emptyGoalDraft()); setGoalOpen(true); }}>
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
                        onOpen={() => { setGoalDraft(goalToDraft(g)); setGoalOpen(true); }}
                        onPay={(amount) => quickFundGoal(g.id, amount)}
                        payLabel={tr("contribution to {v0}", { v0: g.name })}
                        onPlanTap={() => setPlanEditFor(planEditFor === g.id ? null : g.id)}
                        onDelete={async () => { await createClient().from("goals").update({ archived: true }).eq("id", g.id); load(); }}
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
                              if (scope === "all") { delete mp[key]; patch.monthly_plan = amount; }
                              else if (scope === "reset") { if (key in mp) delete mp[key]; else patch.monthly_plan = null; }
                              else mp[key] = amount;
                              patch.month_plans = Object.keys(mp).length ? mp : null;
                              await supabase.from("goals").update(patch).eq("id", g.id);
                              load(month);
                            }}
                          />
                        )}
                      </MoneyRow>
                    );
                  })}
                </Group>
              )}

              {showInvs && invs.filter((iv) => iv.monthly_kind !== "withdraw").length > 0 && (
                <SectionLabel title={tr("Investments")} done={invContribTotal} plan={invPlanDeposit} onAdd={() => { setInvDraft(emptyInvDraft()); setInvOpen(true); }} />
              )}
              {showInvs && invs.filter((iv) => iv.monthly_kind !== "withdraw").length > 0 && (
                <Group id="g-invs" name={tr("Adding this month")} done={invContribTotal} plan={invPlanDeposit} tone="out" onAdd={() => { setInvDraft(emptyInvDraft()); setInvOpen(true); }}>
                  {invs.filter((iv) => iv.monthly_kind !== "withdraw").map((iv) => {
                    const added = invAddedThisMonth.get(iv.id) ?? 0;
                    const eoy = projectInvestment(iv.balance, iv.expected_apr, 0, 12 - new Date().getMonth());
                    return (
                      <MoneyRow
                        key={iv.id}
                        name={iv.name}
                        subtitle={tr("Balance {bal} · {apr}% expected · ~{eoy} by Dec", { bal: money(iv.balance), apr: iv.expected_apr, eoy: money(eoy) })}
                        done={added}
                        plan={iv.monthly_amount > 0 ? iv.monthly_amount : 0}
                        tone="out"
                        onOpen={() => { setInvDraft(invToDraft(iv)); setInvOpen(true); }}
                        onPay={(amount) => quickContribute(iv.id, amount)}
                        payLabel={tr("contribution to {v0}", { v0: iv.name })}
                        onDelete={async () => { await createClient().from("investments").update({ archived: true }).eq("id", iv.id); load(); }}
                        deleteLabel={tr("Archive")}
                      />
                    );
                  })}
                </Group>
              )}

              <div className="px-1 py-1">
                {addMenu === "out" ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <button className="btn btn-ghost !px-3 !py-1 !text-xs" onClick={() => { setAddMenu(null); setPlanSheet({ item: null, kind: "expense", catId: null }); }}>{tr("Expense")}</button>
                    <button className="btn btn-ghost !px-3 !py-1 !text-xs" onClick={() => { setAddMenu(null); setDebtDraft(emptyDebtDraft()); setDebtOpen(true); }}>{tr("Debt")}</button>
                    <button className="btn btn-ghost !px-3 !py-1 !text-xs" onClick={() => { setAddMenu(null); setGoalDraft(emptyGoalDraft()); setGoalOpen(true); }}>{tr("Goal")}</button>
                    <button className="btn btn-ghost !px-3 !py-1 !text-xs" onClick={() => { setAddMenu(null); setInvDraft(emptyInvDraft()); setInvOpen(true); }}>{tr("Investment")}</button>
                    <button className="btn btn-ghost !px-3 !py-1 !text-xs" onClick={() => { setAddMenu(null); setCatSheetKind("expense"); }}>{tr("Category")}</button>
                    <button className="faint px-1" onClick={() => setAddMenu(null)}>×</button>
                  </div>
                ) : (
                  <button className="text-sm font-semibold" style={{ color: "var(--over)" }} onClick={() => setAddMenu("out")}>
                    {tr("+ Add expense, debt, goal or investment")}
                  </button>
                )}
              </div>
            </div>

            {catEdit && (
              <CategoryEditSheet
                key={catEdit.id}
                cat={catEdit}
                cats={cats}
                onClose={() => setCatEdit(null)}
                onSaved={() => { setCatEdit(null); load(month); }}
              />
            )}
            {empSheet && (() => {
              const g = employerGroups.find((x) => x.id === empSheet);
              return g ? (
                <Sheet open onClose={() => setEmpSheet(null)} title={g.name}>
                  <EmployerCard g={g} inner />
                </Sheet>
              ) : null;
            })()}

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

          {/* Side rail: calendar · detail · charts */}
          <div className="hidden lg:sticky lg:top-6 lg:block">{rail}</div>
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
