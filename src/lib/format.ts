let LOCALE = "en-US";
/** called by AppProvider when the language changes */
export function setFormatLocale(lang: "en" | "es") {
  LOCALE = lang === "es" ? "es-US" : "en-US";
}

export function money(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    // whole amounts read cleaner without ".00"; big amounts drop cents entirely
    minimumFractionDigits: Math.abs(n) >= 1000 || Math.round(n * 100) % 100 === 0 ? 0 : 2,
    maximumFractionDigits: Math.abs(n) >= 1000 || Math.round(n * 100) % 100 === 0 ? 0 : 2,
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
  return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, {
    month: "long",
    year: "numeric",
  });
}

export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(LOCALE, {
    month: "short",
    day: "numeric",
  });
}

export function monthRange(monthISO: string): { from: string; to: string } {
  return { from: monthISO, to: addMonths(monthISO, 1) };
}

/** "lunes, 28 de septiembre" / "Monday, September 28" in the app language */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1, d).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** short month name in the app language: "sep" / "Sep" */
export function monthShort(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, { month: "short" }).replace(".", "").slice(0, 3);
}
