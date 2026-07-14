import type { Frequency, RecurringItem } from "@/lib/types";
import { addMonths, monthStartISO } from "@/lib/format";

/** Parse 'YYYY-MM-DD' as a local Date (no TZ surprises). */
function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * How many times does an item with `frequency` starting at `start_date`
 * (ending at `end_date`, if any) occur inside the month `monthISO` (YYYY-MM-01)?
 */
export function occurrencesInMonth(
  frequency: Frequency,
  startISO: string,
  endISO: string | null,
  monthISO: string
): number {
  const monthStart = parseISO(monthISO);
  const nextMonth = parseISO(addMonths(monthISO, 1));
  const start = parseISO(startISO);
  const end = endISO ? parseISO(endISO) : null;

  if (start >= nextMonth) return 0;
  if (end && end < monthStart) return 0;

  if (frequency === "monthly") {
    // one occurrence per month on the start day (clamped to month length)
    return 1;
  }

  if (frequency === "once") {
    // planned for a single month: the one containing start_date
    return start.getFullYear() === monthStart.getFullYear() &&
      start.getMonth() === monthStart.getMonth()
      ? 1
      : 0;
  }

  if (frequency === "yearly") {
    return start.getMonth() === monthStart.getMonth() ? 1 : 0;
  }

  if (frequency === "semimonthly") {
    // paid on the 15th and the 30th (last day in February)
    const y = monthStart.getFullYear();
    const m = monthStart.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    const payDates = [
      new Date(y, m, 15),
      new Date(y, m, Math.min(30, lastDay)),
    ];
    return payDates.filter((d) => d >= start && (!end || d <= end)).length;
  }

  // weekly / biweekly: step through real occurrence dates
  const stepDays = frequency === "weekly" ? 7 : 14;
  const msPerDay = 86400000;
  let count = 0;
  // jump close to the month start instead of walking from start_date
  let t = start.getTime();
  if (t < monthStart.getTime()) {
    const steps = Math.floor((monthStart.getTime() - t) / (stepDays * msPerDay));
    t += steps * stepDays * msPerDay;
    while (t < monthStart.getTime()) t += stepDays * msPerDay;
  }
  const stopAt = Math.min(
    nextMonth.getTime(),
    end ? end.getTime() + msPerDay : Infinity
  );
  while (t < stopAt) {
    count++;
    t += stepDays * msPerDay;
  }
  return count;
}

export type MonthProjection = {
  month: string; // YYYY-MM-01
  income: number;
  expense: number;
  net: number;
  cumulative: number;
};

/** Project the next `months` months (starting current month) from recurring items. */
export function projectMonths(
  items: RecurringItem[],
  months = 12,
  fromMonthISO = monthStartISO()
): MonthProjection[] {
  const out: MonthProjection[] = [];
  let cumulative = 0;
  for (let i = 0; i < months; i++) {
    const m = addMonths(fromMonthISO, i);
    let income = 0;
    let expense = 0;
    for (const it of items) {
      if (!it.active) continue;
      const n = occurrencesInMonth(it.frequency, it.start_date, it.end_date, m);
      if (n === 0) continue;
      if (it.kind === "income") income += it.amount * n;
      else expense += it.amount * n;
    }
    const net = income - expense;
    cumulative += net;
    out.push({ month: m, income, expense, net, cumulative });
  }
  return out;
}

export const frequencyLabels: Record<Frequency, string> = {
  once: "Just this month",
  monthly: "Monthly",
  semimonthly: "Twice a month",
  biweekly: "Every 2 weeks",
  weekly: "Weekly",
  yearly: "Yearly",
};

export const frequencyHints: Record<Frequency, string> = {
  once: "A plan for this month only — doesn't repeat",
  monthly: "Once a month, same day",
  semimonthly: "On the 15th and the 30th — 24 payments a year",
  biweekly: "Every 14 days — 26 payments a year, some months get 3",
  weekly: "Every 7 days",
  yearly: "Once a year",
};

/** Rough monthly equivalent, for sorting/summary chips. */
export function monthlyEquivalent(item: RecurringItem): number {
  switch (item.frequency) {
    case "once":
      return 0;
    case "weekly":
      return (item.amount * 52) / 12;
    case "biweekly":
      return (item.amount * 26) / 12;
    case "semimonthly":
      return item.amount * 2;
    case "monthly":
      return item.amount;
    case "yearly":
      return item.amount / 12;
  }
}

/**
 * The actual occurrence DATES of an item between `fromISO` and `untilISO`
 * (inclusive), respecting the item's own start/end window. Capped at 100.
 */
export function occurrenceDates(
  item: Pick<RecurringItem, "frequency" | "start_date" | "end_date">,
  fromISO: string,
  untilISO: string
): string[] {
  const from = parseISO(fromISO);
  const until = parseISO(untilISO);
  const start = parseISO(item.start_date);
  const end = item.end_date ? parseISO(item.end_date) : null;
  const lo = start > from ? start : from;
  const hi = end && end < until ? end : until;
  if (lo > hi) return [];

  const out: string[] = [];
  const push = (d: Date) => {
    if (d >= lo && d <= hi && out.length < 100) out.push(toISO(d));
  };

  if (item.frequency === "once") {
    return start >= lo && start <= hi ? [toISO(start)] : [];
  }

  if (item.frequency === "monthly" || item.frequency === "yearly") {
    const stepMonths = item.frequency === "monthly" ? 1 : 12;
    // walk month steps from the start date
    let y = start.getFullYear();
    let m = start.getMonth();
    const day = start.getDate();
    // fast-forward near `lo`
    while (new Date(y, m + stepMonths, day) <= lo) {
      m += stepMonths;
    }
    for (let i = 0; i < 200; i++) {
      const lastDay = new Date(y, m + 1, 0).getDate();
      const d = new Date(y, m, Math.min(day, lastDay));
      if (d > hi) break;
      push(d);
      m += stepMonths;
    }
    return out;
  }

  if (item.frequency === "semimonthly") {
    let y = lo.getFullYear();
    let m = lo.getMonth();
    for (let i = 0; i < 30; i++) {
      const lastDay = new Date(y, m + 1, 0).getDate();
      push(new Date(y, m, 15));
      push(new Date(y, m, Math.min(30, lastDay)));
      if (new Date(y, m, 1) > hi) break;
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
    return out.filter((d) => d >= fromISO && d <= untilISO).sort();
  }

  // weekly / biweekly
  const stepDays = item.frequency === "weekly" ? 7 : 14;
  const msPerDay = 86400000;
  let t = start.getTime();
  if (t < lo.getTime()) {
    const steps = Math.floor((lo.getTime() - t) / (stepDays * msPerDay));
    t += steps * stepDays * msPerDay;
    while (t < lo.getTime()) t += stepDays * msPerDay;
  }
  while (t <= hi.getTime() && out.length < 100) {
    push(new Date(t));
    t += stepDays * msPerDay;
  }
  return out;
}

/** paychecks per month implied by a frequency (for per-check math) */
export function checksPerMonth(freq: Frequency): number {
  switch (freq) {
    case "once":
      return 1;
    case "weekly":
      return 52 / 12;
    case "biweekly":
      return 26 / 12;
    case "semimonthly":
      return 2;
    case "monthly":
      return 1;
    case "yearly":
      return 1 / 12;
  }
}

export { toISO };
