import type { Category, Transaction } from "@/lib/types";

export type PnlLine = { id: string; name: string; icon: string; amount: number };
export type Pnl = {
  income: PnlLine[];
  expenses: PnlLine[];
  totalIncome: number;
  totalExpenses: number;
  ownerPay: number; // money moved to personal — shown apart, not an operating cost
  profit: number; // income − operating expenses (before owner pay)
  margin: number | null; // profit / income
};

const OWNER_NAMES = new Set(["owner pay", "pago al dueño"]);

export function isOwnerPay(cat: Category | undefined): boolean {
  return !!cat && OWNER_NAMES.has(cat.name.trim().toLowerCase());
}

/** Profit & loss for a set of business transactions. Pure — easy to test. */
export function buildPnl(txs: Transaction[], cats: Category[]): Pnl {
  const byId = new Map(cats.map((c) => [c.id, c]));
  // roll sub-categories up into their parent group
  const top = (id: string | null): Category | undefined => {
    let c = id ? byId.get(id) : undefined;
    let guard = 0;
    while (c?.parent_id && byId.get(c.parent_id) && guard++ < 5) c = byId.get(c.parent_id);
    return c;
  };
  const inc = new Map<string, PnlLine>();
  const exp = new Map<string, PnlLine>();
  let ownerPay = 0;
  for (const t of txs) {
    const leaf = t.category_id ? byId.get(t.category_id) : undefined;
    if (t.kind === "expense" && isOwnerPay(leaf)) {
      ownerPay += t.amount;
      continue;
    }
    const c = top(t.category_id);
    const key = c?.id ?? "uncategorized";
    const m = t.kind === "income" ? inc : exp;
    const line = m.get(key) ?? {
      id: key,
      name: c?.name ?? "Uncategorized",
      icon: c?.icon ?? "•",
      amount: 0,
    };
    line.amount += t.amount;
    m.set(key, line);
  }
  const sort = (m: Map<string, PnlLine>) =>
    [...m.values()].sort((a, b) => b.amount - a.amount);
  const income = sort(inc);
  const expenses = sort(exp);
  const totalIncome = round(income.reduce((s, l) => s + l.amount, 0));
  const totalExpenses = round(expenses.reduce((s, l) => s + l.amount, 0));
  const profit = round(totalIncome - totalExpenses);
  return {
    income,
    expenses,
    totalIncome,
    totalExpenses,
    ownerPay: round(ownerPay),
    profit,
    margin: totalIncome > 0 ? profit / totalIncome : null,
  };
}

/**
 * US estimated-tax periods (IRS Form 1040-ES):
 * Q1 Jan–Mar → Apr 15 · Q2 Apr–May → Jun 15 · Q3 Jun–Aug → Sep 15 · Q4 Sep–Dec → Jan 15 (next year)
 */
export type TaxQuarter = {
  q: 1 | 2 | 3 | 4;
  from: string; // inclusive YYYY-MM-DD
  to: string; // exclusive
  due: string; // YYYY-MM-DD
};

export function taxQuarters(year: number): TaxQuarter[] {
  const d = (y: number, m: number, day: number) =>
    `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return [
    { q: 1, from: d(year, 1, 1), to: d(year, 4, 1), due: d(year, 4, 15) },
    { q: 2, from: d(year, 4, 1), to: d(year, 6, 1), due: d(year, 6, 15) },
    { q: 3, from: d(year, 6, 1), to: d(year, 9, 1), due: d(year, 9, 15) },
    { q: 4, from: d(year, 9, 1), to: d(year + 1, 1, 1), due: d(year + 1, 1, 15) },
  ];
}

export type QuarterEstimate = TaxQuarter & {
  profit: number;
  estimate: number; // what to set aside / pay
  status: "past" | "current" | "upcoming";
};

/**
 * Rough set-aside per quarter = max(profit, 0) × rate.
 * Deliberately simple: a planning number, not tax advice.
 */
export function estimateQuarterlyTax(
  txs: Transaction[],
  cats: Category[],
  year: number,
  ratePct: number,
  today: string
): QuarterEstimate[] {
  return taxQuarters(year).map((q) => {
    const inQ = txs.filter((t) => t.tx_date >= q.from && t.tx_date < q.to);
    const { profit } = buildPnl(inQ, cats);
    const status: QuarterEstimate["status"] =
      today >= q.to ? "past" : today >= q.from ? "current" : "upcoming";
    return {
      ...q,
      profit,
      estimate: round(Math.max(profit, 0) * (ratePct / 100)),
      status,
    };
  });
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
