import type { RecurringItem } from "@/lib/types";
import { occurrenceDates } from "@/lib/recurring";

export type Invoice = {
  id: string;
  number: string;
  client_id: string | null;
  issue_date: string;
  due_date: string | null;
  amount: number;
  status: "draft" | "sent" | "paid" | "void";
  paid_on: string | null;
  items: { description: string; qty: number; price: number }[];
  notes: string | null;
};

export type CashItem = { date: string; label: string; amount: number }; // + in, − out
export type CashWeek = {
  start: string; // Monday-less: week = 7 days from start
  end: string;
  inflow: number;
  outflow: number;
  balance: number; // end of week
  items: CashItem[];
};

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(Date.parse(d) + n * DAY);

/** When an unpaid invoice is expected to come in (due date, or issue + 30 days). */
export function expectedPayDate(inv: Invoice): string {
  return inv.due_date ?? addDays(inv.issue_date, 30);
}

/**
 * Week-by-week cash forecast for the business.
 * Money in: open invoices (overdue ones land in week 1) + recurring income.
 * Money out: recurring expenses + estimated tax payments.
 */
export function forecastCash(opts: {
  startCash: number;
  today: string;
  weeks?: number;
  invoices: Invoice[];
  recurring: RecurringItem[];
  taxes?: { due: string; amount: number; label: string }[];
}): { weeks: CashWeek[]; low: number; lowWeek: number; firstNegative: number | null } {
  const n = opts.weeks ?? 13;
  const end = addDays(opts.today, n * 7 - 1);
  const items: CashItem[] = [];

  for (const inv of opts.invoices) {
    if (inv.status !== "sent") continue;
    const d = expectedPayDate(inv);
    items.push({ date: d < opts.today ? opts.today : d, label: inv.number, amount: inv.amount });
  }
  for (const r of opts.recurring) {
    if (!r.active) continue;
    for (const d of occurrenceDates(r, opts.today, end)) {
      items.push({ date: d, label: r.title, amount: r.kind === "income" ? r.amount : -r.amount });
    }
  }
  for (const t of opts.taxes ?? []) {
    if (t.amount > 0 && t.due >= opts.today && t.due <= end)
      items.push({ date: t.due, label: t.label, amount: -t.amount });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));

  const weeks: CashWeek[] = [];
  let bal = opts.startCash;
  let low = bal;
  let lowWeek = 0;
  let firstNegative: number | null = null;
  for (let w = 0; w < n; w++) {
    const start = addDays(opts.today, w * 7);
    const stop = addDays(opts.today, w * 7 + 6);
    const inWeek = items.filter((i) => i.date >= start && i.date <= stop);
    const inflow = inWeek.filter((i) => i.amount > 0).reduce((a, i) => a + i.amount, 0);
    const outflow = inWeek.filter((i) => i.amount < 0).reduce((a, i) => a - i.amount, 0);
    bal = Math.round((bal + inflow - outflow) * 100) / 100;
    if (bal < low) {
      low = bal;
      lowWeek = w;
    }
    if (bal < 0 && firstNegative === null) firstNegative = w;
    weeks.push({ start, end: stop, inflow, outflow, balance: bal, items: inWeek });
  }
  return { weeks, low, lowWeek, firstNegative };
}

/** Receivables aging buckets for open invoices. */
export function aging(invoices: Invoice[], today: string) {
  const out = { current: 0, d1_30: 0, d31_60: 0, d60plus: 0, total: 0, overdueCount: 0 };
  for (const inv of invoices) {
    if (inv.status !== "sent") continue;
    const late = Math.floor((Date.parse(today) - Date.parse(expectedPayDate(inv))) / DAY);
    out.total += inv.amount;
    if (late <= 0) out.current += inv.amount;
    else {
      out.overdueCount++;
      if (late <= 30) out.d1_30 += inv.amount;
      else if (late <= 60) out.d31_60 += inv.amount;
      else out.d60plus += inv.amount;
    }
  }
  return out;
}
