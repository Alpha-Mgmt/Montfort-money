import { occurrenceDates, toISO } from "@/lib/recurring";
import type { RecurringItem } from "@/lib/types";

export type DayEvent = { date: string; title: string; amount: number }; // + in, − out

const lastDay = (monthISO: string) => {
  const [y, m] = monthISO.split("-").map(Number);
  return toISO(new Date(y, m, 0));
};
const clampDay = (monthISO: string, day: number) => {
  const [y, m] = monthISO.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return toISO(new Date(y, m - 1, Math.min(Math.max(1, day), last)));
};

/**
 * What is still going to move this month, dated.
 * Plan lines: what you already logged covers the EARLIEST dates first; what's
 * left lands on its own date (or today, if that date already passed).
 */
export function monthEvents(opts: {
  month: string; // YYYY-MM-01
  today: string; // YYYY-MM-DD
  items: RecurringItem[];
  doneByItem: Map<string, number>;
  extras: { title: string; amount: number; day: number | null }[]; // signed; day null = month end
}): DayEvent[] {
  const end = lastDay(opts.month);
  const from = opts.today > opts.month ? opts.today : opts.month;
  if (from > end) return [];
  const out: DayEvent[] = [];
  const push = (date: string, title: string, amount: number) => {
    if (Math.abs(amount) < 0.005) return;
    out.push({ date: date < from ? from : date, title, amount });
  };
  for (const it of opts.items) {
    if (!it.active) continue;
    const dates = occurrenceDates(it, opts.month, end);
    if (!dates.length) continue;
    let done = opts.doneByItem.get(it.id) ?? 0;
    for (const d of dates) {
      const covered = Math.min(it.amount, done);
      done -= covered;
      const left = it.amount - covered;
      if (left > 0.005) push(d, it.title, it.kind === "income" ? left : -left);
    }
  }
  for (const x of opts.extras) push(x.day ? clampDay(opts.month, x.day) : end, x.title, x.amount);
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Running balance at the END of each day from `from` to month end. */
export function dailyBalances(month: string, from: string, start: number, events: DayEvent[]) {
  const end = lastDay(month);
  const byDay = new Map<string, number>();
  for (const e of events) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.amount);
  const res = new Map<string, number>();
  let bal = start;
  const [y, m] = month.split("-").map(Number);
  for (let d = 1; ; d++) {
    const iso = toISO(new Date(y, m - 1, d));
    if (iso > end) break;
    if (iso < from) continue;
    bal += byDay.get(iso) ?? 0;
    res.set(iso, bal);
  }
  return res;
}
