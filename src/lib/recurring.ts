import type { Frequency, RecurringItem, Schedule } from "@/lib/types";
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
  monthISO: string,
  schedule?: Schedule | null
): number {
  const monthStart = parseISO(monthISO);
  const nextMonth = parseISO(addMonths(monthISO, 1));
  const start = parseISO(startISO);
  const end = endISO ? parseISO(endISO) : null;

  if (start >= nextMonth) return 0;
  if (end && end < monthStart) return 0;

  // one occurrence per month (the day only moves it inside the month)
  if (frequency === "monthly") return 1;

  if (frequency === "once") {
    return start.getFullYear() === monthStart.getFullYear() &&
      start.getMonth() === monthStart.getMonth()
      ? 1
      : 0;
  }

  if (frequency === "yearly") {
    return start.getMonth() === monthStart.getMonth() ? 1 : 0;
  }

  if (frequency === "quarterly") {
    const diff =
      (monthStart.getFullYear() - start.getFullYear()) * 12 +
      (monthStart.getMonth() - start.getMonth());
    return diff >= 0 && diff % 3 === 0 ? 1 : 0;
  }

  // everything else: count the real dates inside the month
  const lastISO = toISO(new Date(nextMonth.getTime() - 86400000));
  return occurrenceDates(
    { frequency, start_date: startISO, end_date: endISO, schedule },
    monthISO,
    lastISO
  ).length;
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
      const n = occurrencesInMonth(it.frequency, it.start_date, it.end_date, m, it.schedule);
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
  quarterly: "Quarterly",
  semiannual: "Twice a year",
  yearly: "Yearly",
  custom: "Custom dates",
};

export const frequencyHints: Record<Frequency, string> = {
  once: "A plan for this month only — doesn't repeat",
  monthly: "Once a month, same day",
  semimonthly: "Two days each month that you pick — 24 payments a year",
  biweekly: "Every 14 days — 26 payments a year, some months get 3",
  weekly: "Every 7 days",
  quarterly: "Every 3 months — 4 times a year",
  semiannual: "Two dates a year that you pick",
  yearly: "Once a year",
  custom: "Any dates you pick, repeating every year",
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
    case "quarterly":
      return item.amount / 3;
    case "semiannual":
    case "custom":
      return (item.amount * yearlyCount(item)) / 12;
    case "yearly":
      return item.amount / 12;
  }
}

/** How many times a year a dates-based item happens. */
function yearlyCount(item: Pick<RecurringItem, "frequency" | "schedule">): number {
  const n = item.schedule?.dates?.length ?? 0;
  return n || (item.frequency === "semiannual" ? 2 : 1);
}

/**
 * The actual occurrence DATES of an item between `fromISO` and `untilISO`
 * (inclusive), respecting the item's own start/end window. Capped at 100.
 */
export function occurrenceDates(
  item: Pick<RecurringItem, "frequency" | "start_date" | "end_date"> & { schedule?: Schedule | null },
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
  const sch = item.schedule ?? null;

  const out: string[] = [];
  const push = (d: Date) => {
    if (d >= lo && d <= hi && out.length < 100) out.push(toISO(d));
  };
  const clampDay = (y: number, m: number, day: number) =>
    new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));

  if (item.frequency === "once") {
    return start >= lo && start <= hi ? [toISO(start)] : [];
  }

  if (item.frequency === "monthly" || item.frequency === "quarterly" || item.frequency === "yearly") {
    const stepMonths = item.frequency === "monthly" ? 1 : item.frequency === "quarterly" ? 3 : 12;
    const day = item.frequency === "yearly" ? start.getDate() : sch?.day ?? start.getDate();
    let y = start.getFullYear();
    let m = start.getMonth();
    // fast-forward near `lo`
    while (clampDay(y, m + stepMonths, day) < lo) m += stepMonths;
    for (let i = 0; i < 400; i++) {
      const d = clampDay(y, m, day);
      if (d > hi) break;
      push(d);
      m += stepMonths;
    }
    return out;
  }

  if (item.frequency === "semimonthly") {
    const days = (sch?.days?.length ? sch.days : [15, 30]).slice(0, 2);
    let y = lo.getFullYear();
    let m = lo.getMonth();
    for (let i = 0; i < 400; i++) {
      if (new Date(y, m, 1) > hi) break;
      for (const d of days) push(clampDay(y, m, d));
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
    }
    return out.sort();
  }

  if (item.frequency === "semiannual" || item.frequency === "custom") {
    const md = (sch?.dates ?? [])
      .map((s) => s.split("-").map(Number))
      .filter(([mm, dd]) => mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31);
    if (!md.length) md.push([start.getMonth() + 1, start.getDate()]);
    for (let y = lo.getFullYear(); y <= hi.getFullYear() && out.length < 100; y++) {
      for (const [mm, dd] of md) push(clampDay(y, mm - 1, dd));
    }
    return out.sort();
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

/** Sensible "when" for a frequency, anchored on a date (YYYY-MM-DD). */
export function defaultSchedule(freq: Frequency | "none", anchorISO: string): Schedule | null {
  const a = parseISO(anchorISO);
  const md = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  switch (freq) {
    case "monthly":
    case "quarterly":
      return { day: a.getDate() };
    case "semimonthly":
      return { days: [15, 30] };
    case "semiannual":
      return { dates: [md(a), md(new Date(a.getFullYear(), a.getMonth() + 6, a.getDate()))] };
    case "custom":
      return { dates: [md(a)] };
    default:
      return null;
  }
}

/** Where a plan item's date window should start so the chosen dates count. */
export function scheduleStart(freq: Frequency, schedule: Schedule | null | undefined, fallbackISO: string): string {
  if (freq === "semimonthly" || freq === "semiannual" || freq === "custom") {
    const d = parseISO(fallbackISO);
    // from the 1st of that month, so this month's chosen dates are included
    return toISO(new Date(d.getFullYear(), d.getMonth(), 1));
  }
  if ((freq === "monthly" || freq === "quarterly") && schedule?.day) {
    const d = parseISO(fallbackISO);
    return toISO(new Date(d.getFullYear(), d.getMonth(), Math.min(schedule.day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())));
  }
  return fallbackISO;
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
    case "quarterly":
      return 1 / 3;
    case "semiannual":
      return 2 / 12;
    case "custom":
      return 1 / 12;
    case "yearly":
      return 1 / 12;
  }
}

export { toISO };
