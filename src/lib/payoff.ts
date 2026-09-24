import type { Debt } from "@/lib/types";

export type Strategy = "avalanche" | "snowball";

export type PayoffPlan = {
  months: number | null; // until every debt is gone; null = never (payments don't cover interest)
  totalInterest: number;
  order: { id: string; payoffMonth: number | null; interest: number }[]; // in attack order
  balances: number[]; // total balance at the end of each month (index 0 = after month 1)
};

const MAX_MONTHS = 600;

/** Attack order: avalanche = highest APR first; snowball = smallest balance first. */
export function attackOrder(debts: Debt[], strategy: Strategy): Debt[] {
  const live = debts.filter((d) => d.balance > 0);
  return [...live].sort((a, b) =>
    strategy === "avalanche"
      ? b.apr - a.apr || a.balance - b.balance
      : a.balance - b.balance || b.apr - a.apr
  );
}

/**
 * Month-by-month simulation. Every debt gets its planned payment; the
 * `extra` plus any payment freed by a finished debt ("rollover") goes to the
 * first debt in the attack order.
 */
export function simulatePayoff(debts: Debt[], extra: number, strategy: Strategy): PayoffPlan {
  const order = attackOrder(debts, strategy);
  const bal = new Map(order.map((d) => [d.id, d.balance]));
  const interest = new Map(order.map((d) => [d.id, 0]));
  const done = new Map<string, number>();
  const balances: number[] = [];
  const budget = order.reduce((s, d) => s + Math.max(0, d.planned_payment), 0) + Math.max(0, extra);

  let m = 0;
  while (m < MAX_MONTHS && [...bal.values()].some((b) => b > 0.005)) {
    m++;
    // interest
    for (const d of order) {
      const b = bal.get(d.id)!;
      if (b <= 0) continue;
      const i = b * (d.apr / 100 / 12);
      bal.set(d.id, b + i);
      interest.set(d.id, interest.get(d.id)! + i);
    }
    // minimums, then everything left to the target
    let pool = budget;
    for (const d of order) {
      const b = bal.get(d.id)!;
      if (b <= 0) continue;
      const pay = Math.min(b, Math.max(0, d.planned_payment));
      bal.set(d.id, b - pay);
      pool -= pay;
    }
    for (const d of order) {
      if (pool <= 0.005) break;
      const b = bal.get(d.id)!;
      if (b <= 0) continue;
      const pay = Math.min(b, pool);
      bal.set(d.id, b - pay);
      pool -= pay;
    }
    for (const d of order) {
      if (!done.has(d.id) && bal.get(d.id)! <= 0.005) {
        bal.set(d.id, 0);
        done.set(d.id, m);
      }
    }
    const total = [...bal.values()].reduce((a, b) => a + b, 0);
    balances.push(Math.round(total * 100) / 100);
    // stuck: balance not shrinking for a year → payments don't cover interest
    if (m > 12 && total >= balances[m - 13] - 0.005) {
      return {
        months: null,
        totalInterest: round([...interest.values()].reduce((a, b) => a + b, 0)),
        order: order.map((d) => ({ id: d.id, payoffMonth: done.get(d.id) ?? null, interest: round(interest.get(d.id)!) })),
        balances,
      };
    }
  }
  const finished = ![...bal.values()].some((b) => b > 0.005);
  return {
    months: finished ? m : null,
    totalInterest: round([...interest.values()].reduce((a, b) => a + b, 0)),
    order: order.map((d) => ({ id: d.id, payoffMonth: done.get(d.id) ?? null, interest: round(interest.get(d.id)!) })),
    balances,
  };
}

/** Smallest extra per month that makes you debt-free within `targetMonths`. */
export function extraNeeded(debts: Debt[], targetMonths: number, strategy: Strategy): number | null {
  if (targetMonths < 1) return null;
  const base = simulatePayoff(debts, 0, strategy);
  if (base.months !== null && base.months <= targetMonths) return 0;
  const total = debts.reduce((s, d) => s + Math.max(0, d.balance), 0);
  let lo = 0;
  let hi = Math.max(total, 1);
  const hiPlan = simulatePayoff(debts, hi, strategy);
  if (hiPlan.months === null || hiPlan.months > targetMonths) return null;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const p = simulatePayoff(debts, mid, strategy);
    if (p.months !== null && p.months <= targetMonths) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi);
}

/** Whole months from `fromISO` (YYYY-MM-DD) to `toISO`. */
export function monthsBetween(fromISO: string, toISO: string): number {
  const [fy, fm] = fromISO.split("-").map(Number);
  const [ty, tm] = toISO.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
