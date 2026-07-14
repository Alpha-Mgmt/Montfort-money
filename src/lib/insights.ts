import type {
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  RecurringItem,
  Transaction,
} from "@/lib/types";
import { occurrenceDates, occurrencesInMonth, projectMonths } from "@/lib/recurring";
import { payoffLabel, payoffMonth } from "@/lib/debt";
import { addMonths, monthLabel, monthStartISO } from "@/lib/format";

export type InsightInput = {
  month: string; // YYYY-MM-01
  today: string; // YYYY-MM-DD
  name: string;
  categories: Category[];
  txs: Transaction[];
  recurring: RecurringItem[];
  debts: Debt[];
  investments: Investment[];
  goals: Goal[];
  budgets: Budget[];
};

export type MonthSummary = {
  month: string;
  isCurrentMonth: boolean;
  name: string;
  income: { real: number; plan: number };
  expenses: { real: number; plan: number };
  netSoFar: number;
  projectedNet: number;
  overBudget: { category: string; spent: number; plan: number }[];
  upcomingBills: { title: string; amount: number; date: string }[];
  upcomingTotal: number;
  debts: {
    name: string;
    balance: number;
    apr: number;
    payment: number;
    payoff: string;
  }[];
  goals: {
    name: string;
    saved: number;
    target: number;
    neededPerMonth: number | null;
    contributedThisMonth: number;
    onTrack: boolean | null;
  }[];
  redMonths: { month: string; net: number }[];
  hasData: boolean;
};

export function buildMonthSummary(input: InsightInput): MonthSummary {
  const { month, today, categories, txs, recurring, debts, investments, goals, budgets } =
    input;
  const isCurrentMonth = month === monthStartISO();

  // ---- category-level plan (mirrors the app) ----
  const plannedByCat = new Map<string, number>();
  for (const it of recurring) {
    if (!it.active) continue;
    const n = occurrencesInMonth(it.frequency, it.start_date, it.end_date, month);
    if (n === 0) continue;
    const key = it.category_id ?? "uncategorized";
    plannedByCat.set(key, (plannedByCat.get(key) ?? 0) + it.amount * n);
  }
  const manualByCat = new Map<string, number>();
  for (const b of budgets) manualByCat.set(b.category_id, b.limit_amount);
  const planFor = (catId: string) => {
    const items = plannedByCat.get(catId) ?? 0;
    return items > 0 ? items : (manualByCat.get(catId) ?? 0);
  };

  // ---- category transactions (exclude debt/inv/goal — those have own sections) ----
  const catTxs = txs.filter((t) => !t.debt_id && !t.investment_id && !t.goal_id);
  const spentByCat = new Map<string, number>();
  for (const t of catTxs) {
    if (t.kind !== "expense") continue;
    const key = t.category_id ?? "uncategorized";
    spentByCat.set(key, (spentByCat.get(key) ?? 0) + t.amount);
  }

  // ---- planned monthly investment flows ----
  const invPlanDeposit = investments
    .filter((i) => i.monthly_amount > 0 && i.monthly_kind === "deposit")
    .reduce((s, i) => s + i.monthly_amount, 0);
  const invPlanWithdraw = investments
    .filter((i) => i.monthly_amount > 0 && i.monthly_kind === "withdraw")
    .reduce((s, i) => s + i.monthly_amount, 0);

  // ---- totals ----
  const realIncome = txs
    .filter((t) => t.kind === "income" && !t.debt_id)
    .reduce((s, t) => s + t.amount, 0);
  const realExpense = txs
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + t.amount, 0);

  const incomeCats = categories.filter((c) => c.kind === "income");
  const expenseCats = categories.filter((c) => c.kind === "expense");
  const planIncome =
    incomeCats.reduce((s, c) => s + planFor(c.id), 0) + invPlanWithdraw;
  const planExpense =
    expenseCats.reduce((s, c) => s + planFor(c.id), 0) +
    planFor("uncategorized") +
    invPlanDeposit;

  // ---- over-budget categories ----
  const overBudget: MonthSummary["overBudget"] = [];
  for (const c of expenseCats) {
    const spent = spentByCat.get(c.id) ?? 0;
    const plan = planFor(c.id);
    if (plan > 0 && spent > plan) {
      overBudget.push({ category: c.name, spent: round(spent), plan: round(plan) });
    }
  }
  overBudget.sort((a, b) => b.spent - b.plan - (a.spent - a.plan));

  // ---- upcoming bills for the rest of the month (current month only) ----
  const upcomingBills: MonthSummary["upcomingBills"] = [];
  if (isCurrentMonth) {
    const [y, m] = month.split("-").map(Number);
    const endOfMonth = `${y}-${String(m).padStart(2, "0")}-${String(
      new Date(y, m, 0).getDate()
    ).padStart(2, "0")}`;
    const paidItems = new Set(
      txs.filter((t) => t.recurring_item_id).map((t) => t.recurring_item_id!)
    );
    for (const it of recurring) {
      if (!it.active || it.kind !== "expense" || paidItems.has(it.id)) continue;
      for (const d of occurrenceDates(it, today, endOfMonth)) {
        if (d >= today) upcomingBills.push({ title: it.title, amount: it.amount, date: d });
      }
    }
    const paidDebts = new Set(txs.filter((t) => t.debt_id).map((t) => t.debt_id!));
    for (const d of debts) {
      if (!d.payment_due_day || d.balance <= 0 || paidDebts.has(d.id)) continue;
      const lastDay = new Date(y, m, 0).getDate();
      const due = `${y}-${String(m).padStart(2, "0")}-${String(
        Math.min(d.payment_due_day, lastDay)
      ).padStart(2, "0")}`;
      if (due >= today)
        upcomingBills.push({ title: `${d.name} payment`, amount: d.planned_payment, date: due });
    }
    upcomingBills.sort((a, b) => a.date.localeCompare(b.date));
  }
  const upcomingTotal = round(upcomingBills.reduce((s, b) => s + b.amount, 0));

  // ---- debts ----
  const debtsSummary = debts
    .filter((d) => d.balance > 0)
    .map((d) => ({
      name: d.name,
      balance: round(d.balance),
      apr: d.apr,
      payment: round(d.planned_payment),
      payoff: payoffLabel(payoffMonth(d)),
    }));

  // ---- goals ----
  const goalContrib = new Map<string, number>();
  for (const t of txs)
    if (t.goal_id) goalContrib.set(t.goal_id, (goalContrib.get(t.goal_id) ?? 0) + t.amount);
  const goalsSummary = goals.map((g) => {
    const needed = goalNeededPerMonth(g.target_amount, g.saved, g.target_date, today);
    const contributed = round(goalContrib.get(g.id) ?? 0);
    return {
      name: g.name,
      saved: round(g.saved),
      target: round(g.target_amount),
      neededPerMonth: needed === null ? null : round(needed),
      contributedThisMonth: contributed,
      onTrack: needed === null ? null : contributed >= needed,
    };
  });

  // ---- forecast red months (next 12, from current month) ----
  const projection = projectMonths(recurring, 12, monthStartISO());
  const redMonths = projection
    .filter((p) => p.net < -0.005)
    .slice(0, 3)
    .map((p) => ({ month: monthLabel(p.month), net: round(p.net) }));

  const hasData =
    txs.length > 0 || recurring.length > 0 || debts.length > 0 || goals.length > 0;

  return {
    month: monthLabel(month),
    isCurrentMonth,
    name: input.name,
    income: { real: round(realIncome), plan: round(planIncome) },
    expenses: { real: round(realExpense), plan: round(planExpense) },
    netSoFar: round(realIncome - realExpense),
    projectedNet: round(planIncome - planExpense),
    overBudget: overBudget.slice(0, 6),
    upcomingBills: upcomingBills.slice(0, 6),
    upcomingTotal,
    debts: debtsSummary,
    goals: goalsSummary,
    redMonths,
    hasData,
  };
}

function goalNeededPerMonth(
  target: number,
  saved: number,
  targetDate: string | null,
  today: string
): number | null {
  const remaining = target - saved;
  if (remaining <= 0 || !targetDate) return null;
  const [ty, tm] = targetDate.split("-").map(Number);
  const [ny, nm] = today.split("-").map(Number);
  const months = Math.max(1, (ty - ny) * 12 + (tm - nm));
  return remaining / months;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
