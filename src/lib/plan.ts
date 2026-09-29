import { occurrencesInMonth, projectMonths, type MonthProjection } from "@/lib/recurring";
import { goalMath } from "@/components/GoalSheet";
import type { Debt, Goal, Investment, RecurringItem } from "@/lib/types";

/**
 * What leaves (or comes in) each month OUTSIDE the plan lines, so every page
 * agrees with the Month view: debts with no plan line, goal savings and
 * investment deposits (out), investment withdrawals (in).
 */
export function planExtras(
  month: string, // YYYY-MM-01
  items: RecurringItem[],
  debts: Debt[],
  goals: Goal[],
  invs: Investment[]
) {
  const key = month.slice(0, 7);
  const live = debts.filter((d) => !d.archived && d.balance > 0);
  // a debt already paid through a plan line (matched by name) isn't counted twice
  const covered = new Set<string>();
  for (const it of items) {
    if (!it.active || it.kind !== "expense") continue;
    if (occurrencesInMonth(it.frequency, it.start_date, it.end_date, month, it.schedule) === 0) continue;
    const t = it.title.toLowerCase();
    for (const d of live) {
      const n = d.name.toLowerCase();
      if (t.includes(n) || n.includes(t)) covered.add(d.id);
    }
  }
  const debtOnly = live
    .filter((d) => !covered.has(d.id))
    .reduce((s, d) => s + (d.month_plans?.[key] != null ? Number(d.month_plans[key]) : d.planned_payment), 0);
  const goalsOut = goals
    .filter((g) => !(g as Goal & { archived?: boolean }).archived)
    .reduce((s, g) => {
      const v = g.month_plans?.[key];
      if (v != null) return s + Number(v);
      if (g.monthly_plan != null) return s + Number(g.monthly_plan);
      // same math as the Month view (months left counted from today)
      return s + (goalMath(g.target_amount, g.saved, g.target_date, "monthly").perMonth ?? 0);
    }, 0);
  const invOut = invs.filter((i) => !i.archived && i.monthly_amount > 0 && i.monthly_kind !== "withdraw").reduce((s, i) => s + i.monthly_amount, 0);
  const invIn = invs.filter((i) => !i.archived && i.monthly_amount > 0 && i.monthly_kind === "withdraw").reduce((s, i) => s + i.monthly_amount, 0);
  return { debtOnly, goalsOut, invOut, invIn, out: debtOnly + goalsOut + invOut };
}

/** projectMonths + the extras above, so projections match the Month view */
export function projectFull(
  items: RecurringItem[],
  debts: Debt[],
  goals: Goal[],
  invs: Investment[],
  months = 12,
  from?: string
): MonthProjection[] {
  const base = projectMonths(items, months, from);
  let cumulative = 0;
  return base.map((p) => {
    const x = planExtras(p.month, items, debts, goals, invs);
    const income = p.income + x.invIn;
    const expense = p.expense + x.out;
    const net = income - expense;
    cumulative += net;
    return { ...p, income, expense, net, cumulative };
  });
}
