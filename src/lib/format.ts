export function money(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2,
  }).format(n);
}

export function moneyExact(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(n);
}

/** 'YYYY-MM-DD' for today's local date */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** First day of the month containing `date` (local), as 'YYYY-MM-01' */
export function monthStartISO(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Add n months to a 'YYYY-MM-01' string */
export function addMonths(monthISO: string, n: number): string {
  const [y, m] = monthISO.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return monthStartISO(d);
}

export function monthLabel(monthISO: string): string {
  const [y, m] = monthISO.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function monthRange(monthISO: string): { from: string; to: string } {
  return { from: monthISO, to: addMonths(monthISO, 1) };
}
