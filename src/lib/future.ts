import type { Category, Debt, Goal, Investment, RecurringItem } from "@/lib/types";
import { occurrencesInMonth } from "@/lib/recurring";
import { addMonths, monthStartISO } from "@/lib/format";
import { attackOrder, type Strategy } from "@/lib/payoff";

export type FutureMonth = {
  month: string; // YYYY-MM-01 (balances at the END of this month; index 0 = today)
  cash: number;
  invest: number;
  debt: number;
  goals: number;
  netWorth: number;
  inv: Record<string, number>;
  debts: Record<string, number>;
  goalSaved: Record<string, number>;
};

export type Scenario = {
  extraDebt: number; // $ more to debts every month
  raisePct: number; // % change to income…
  raiseFrom: string | null; // …starting this month (YYYY-MM-01)
};

const DEBTY = /debt|deuda|loan|pr[ée]stamo|card|tarjeta|credit|cr[ée]dito|mortgage|hipoteca/i;

/**
 * Month-by-month projection of cash, investments, debts and goals.
 * Cash = what the plan leaves over (take-home income − expenses) after
 * debt payments, investment deposits and goal savings, starting from the
 * balances of the user's cash/checking/savings accounts.
 */
export function simulateFuture(opts: {
  recurring: RecurringItem[];
  debts: Debt[];
  investments: Investment[];
  goals: Goal[];
  categories: Category[];
  startCash: number;
  debtExtra: number;
  strategy: Strategy;
  months: number;
  scenario?: Scenario;
}): { rows: FutureMonth[]; debtFree: Record<string, string | null>; allDebtFree: string | null } {
  const sc = opts.scenario ?? { extraDebt: 0, raisePct: 0, raiseFrom: null };
  const start = monthStartISO();
  const catName = new Map(opts.categories.map((c) => [c.id, c.name]));
  const liveDebts = opts.debts.filter((d) => !d.archived && d.balance > 0);
  const isDebtItem = (r: RecurringItem) =>
    DEBTY.test(r.title) ||
    DEBTY.test(catName.get(r.category_id ?? "") ?? "") ||
    liveDebts.some((d) => r.title.toLowerCase().includes(d.name.toLowerCase()));

  const debtBal = new Map(liveDebts.map((d) => [d.id, d.balance]));
  const order = attackOrder(liveDebts, opts.strategy);
  const debtBudget =
    liveDebts.reduce((s, d) => s + Math.max(0, d.planned_payment), 0) + Math.max(0, opts.debtExtra) + Math.max(0, sc.extraDebt);
  const invBal = new Map(opts.investments.filter((i) => !i.archived).map((i) => [i.id, i.balance]));
  const goalBal = new Map(opts.goals.filter((g) => !g.archived).map((g) => [g.id, g.saved]));
  const debtFree: Record<string, string | null> = Object.fromEntries(liveDebts.map((d) => [d.id, null]));
  let cash = opts.startCash;

  const snap = (month: string): FutureMonth => {
    const inv = Object.fromEntries(invBal);
    const debts = Object.fromEntries(debtBal);
    const goalSaved = Object.fromEntries(goalBal);
    const invest = [...invBal.values()].reduce((a, b) => a + b, 0);
    const debt = [...debtBal.values()].reduce((a, b) => a + b, 0);
    const goals = [...goalBal.values()].reduce((a, b) => a + b, 0);
    return { month, cash, invest, debt, goals, netWorth: cash + invest + goals - debt, inv, debts, goalSaved };
  };
  const rows: FutureMonth[] = [snap(start)];

  for (let i = 1; i <= opts.months; i++) {
    const m = addMonths(start, i);
    // plan income / expenses this month
    let income = 0;
    let expense = 0;
    for (const it of opts.recurring) {
      if (!it.active) continue;
      const n = occurrencesInMonth(it.frequency, it.start_date, it.end_date, m, it.schedule);
      if (!n) continue;
      if (it.kind === "income") {
        const raise = sc.raiseFrom && m >= sc.raiseFrom ? 1 + sc.raisePct / 100 : 1;
        income += it.amount * n * raise;
      } else if (!isDebtItem(it)) expense += it.amount * n;
    }

    // debts: interest, minimums, then the rest to the first in attack order
    let paid = 0;
    for (const d of order) {
      const b = debtBal.get(d.id)!;
      if (b > 0) debtBal.set(d.id, b * (1 + d.apr / 100 / 12));
    }
    let pool = [...debtBal.values()].some((b) => b > 0.005) ? debtBudget : 0;
    for (const d of order) {
      const b = debtBal.get(d.id)!;
      if (b <= 0) continue;
      const pay = Math.min(b, Math.max(0, d.planned_payment), pool);
      debtBal.set(d.id, b - pay);
      pool -= pay;
      paid += pay;
    }
    for (const d of order) {
      if (pool <= 0.005) break;
      const b = debtBal.get(d.id)!;
      if (b <= 0) continue;
      const pay = Math.min(b, pool);
      debtBal.set(d.id, b - pay);
      pool -= pay;
      paid += pay;
    }
    for (const d of order) {
      if (debtBal.get(d.id)! <= 0.005) {
        debtBal.set(d.id, 0);
        if (!debtFree[d.id]) debtFree[d.id] = m;
      }
    }

    // investments grow + monthly deposits/withdrawals
    let invFlow = 0;
    for (const iv of opts.investments) {
      if (iv.archived || !invBal.has(iv.id)) continue;
      let b = invBal.get(iv.id)! * (1 + iv.expected_apr / 100 / 12);
      if (iv.monthly_kind === "withdraw") {
        const w = Math.min(b, iv.monthly_amount);
        b -= w;
        invFlow -= w;
      } else {
        b += iv.monthly_amount;
        invFlow += iv.monthly_amount;
      }
      invBal.set(iv.id, b);
    }

    // goals: save what's needed each month until the target date
    let goalFlow = 0;
    for (const g of opts.goals) {
      if (g.archived || !goalBal.has(g.id)) continue;
      const saved = goalBal.get(g.id)!;
      const left = g.target_amount - saved;
      if (left <= 0 || !g.target_date) continue;
      const monthsLeft =
        (Number(g.target_date.slice(0, 4)) - Number(m.slice(0, 4))) * 12 + (Number(g.target_date.slice(5, 7)) - Number(m.slice(5, 7))) + 1;
      const put = monthsLeft > 0 ? left / monthsLeft : 0;
      if (put > 0) {
        goalBal.set(g.id, saved + put);
        goalFlow += put;
      }
    }

    cash += income - expense - paid - invFlow - goalFlow;
    rows.push(snap(m));
  }

  const allPaid = liveDebts.length && Object.values(debtFree).every(Boolean)
    ? Object.values(debtFree).sort().slice(-1)[0] ?? null
    : null;
  return { rows, debtFree, allDebtFree: allPaid };
}
