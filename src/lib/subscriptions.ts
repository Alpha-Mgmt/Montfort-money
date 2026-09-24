import type { Category, RecurringItem, Transaction } from "@/lib/types";

/** Well-known subscription merchants (matched against notes / titles). */
const KNOWN = [
  "netflix", "spotify", "hulu", "disney", "youtube", "apple", "icloud", "prime video",
  "amazon prime", "hbo", "max", "paramount", "peacock", "adobe", "microsoft", "office 365",
  "google one", "google storage", "dropbox", "chatgpt", "openai", "claude", "anthropic",
  "gym", "planet fitness", "la fitness", "audible", "xbox", "playstation", "nintendo",
  "duolingo", "canva", "notion", "siriusxm", "vix", "crunchyroll", "patreon", "onlyfans",
  "linkedin", "tinder", "bumble", "hinge", "doordash dashpass", "uber one", "walmart+",
  "costco", "sam's club", "headspace", "calm", "nyt", "new york times", "wsj", "peloton",
];

const SUB_CATEGORY = /subscri|suscrip|streaming|membership|membres/i;

export type Cadence = "weekly" | "monthly" | "yearly";

export type Subscription = {
  key: string;
  name: string;
  amount: number; // typical charge
  lastAmount: number;
  cadence: Cadence;
  perYear: number;
  perMonth: number;
  lastDate: string;
  nextDate: string | null;
  count: number;
  inPlan: boolean; // a matching recurring item exists
  priceUp: boolean;
  stale: boolean; // expected charge hasn't shown up — maybe canceled
  source: "detected" | "plan";
  categoryId: string | null;
};

const PER_YEAR: Record<Cadence, number> = { weekly: 52, monthly: 12, yearly: 1 };
const DAYS: Record<Cadence, number> = { weekly: 7, monthly: 30.4, yearly: 365 };

export function normalizeMerchant(s: string): string {
  return s
    .toLowerCase()
    .replace(/[0-9#*_.,:;/\\-]+/g, " ")
    .replace(/\b(llc|inc|com|www|payment|pmt|purchase|debit|card|recurring|ach)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

function known(s: string): string | null {
  const n = s.toLowerCase();
  return KNOWN.find((k) => n.includes(k)) ?? null;
}

function median(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function daysBetween(a: string, b: string) {
  return (Date.parse(b) - Date.parse(a)) / 86_400_000;
}

function addDays(iso: string, d: number) {
  const x = new Date(Date.parse(iso) + Math.round(d) * 86_400_000);
  return x.toISOString().slice(0, 10);
}

function cadenceOf(gaps: number[]): Cadence | null {
  if (!gaps.length) return null;
  const g = median(gaps);
  if (g >= 5 && g <= 9) return "weekly";
  if (g >= 24 && g <= 38) return "monthly";
  if (g >= 340 && g <= 390) return "yearly";
  return null;
}

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Find recurring charges in the user's history and in their plan.
 * `txs` should cover ~13 months so yearly charges show up.
 */
export function detectSubscriptions(
  txs: Transaction[],
  recurring: RecurringItem[],
  cats: Category[],
  today: string
): Subscription[] {
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const planKeys = new Set(
    recurring
      .filter((r) => r.active && r.kind === "expense")
      .map((r) => normalizeMerchant(r.title))
  );

  // 1) group expenses by merchant (note) — fall back to category + amount
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (t.kind !== "expense") continue;
    if (t.debt_id || t.investment_id || t.goal_id) continue; // not subscriptions
    const note = (t.note ?? "").trim();
    const key = note
      ? `n:${normalizeMerchant(note)}`
      : `c:${t.category_id ?? "none"}:${Math.round(t.amount)}`;
    if (key === "n:") continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const out: Subscription[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a.tx_date.localeCompare(b.tx_date));
    const amounts = sorted.map((t) => t.amount);
    const typical = median(amounts);
    const rawName = sorted[sorted.length - 1].note?.trim() || "";
    const isKnown = !!known(rawName);
    const catIsSub = SUB_CATEGORY.test(catName.get(sorted[0].category_id ?? "") ?? "");
    const likelySub = isKnown || catIsSub;
    // amounts must be steady: known services may change price (±20%); anything
    // else must repeat the same amount (±3%) — groceries, dining, etc. drop out
    const tol = likelySub ? 0.2 : 0.03;
    const steady = sorted.filter((t) => Math.abs(t.amount - typical) <= typical * tol);
    if (!likelySub && (steady.length < 3 || typical > 200)) continue; // rent & big bills aren't subscriptions

    // one charge per month at most counts (avoid same-day duplicates)
    const dates: string[] = [];
    for (const t of steady) if (!dates.length || daysBetween(dates[dates.length - 1], t.tx_date) >= 5) dates.push(t.tx_date);
    const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
    let cadence = cadenceOf(gaps);

    if (!cadence) {
      // a single charge from a known service / subscription category → assume monthly
      // big one-off charges from a subscription are usually annual plans
      if ((isKnown || catIsSub) && dates.length >= 1) cadence = typical >= 50 ? "yearly" : "monthly";
      else continue;
    }
    if (dates.length < 2 && !isKnown && !catIsSub) continue;
    if (key.startsWith("c:") && !catIsSub) continue; // no merchant name: only trust subscription categories

    const last = steady[steady.length - 1] ?? sorted[sorted.length - 1];
    const name = rawName
      ? title(known(rawName) ?? normalizeMerchant(rawName))
      : catName.get(sorted[0].category_id ?? "") ?? "Recurring charge";
    const nextDate = addDays(last.tx_date, DAYS[cadence]);
    const overdue = daysBetween(nextDate, today);
    const first = steady[0] ?? sorted[0];
    const cost = last.amount; // what it costs now
    const matchesPlan = recurring.some(
      (r) =>
        r.active &&
        r.kind === "expense" &&
        r.category_id === last.category_id &&
        Math.abs(r.amount - cost) <= cost * 0.1
    );
    out.push({
      key,
      name,
      amount: round(cost),
      lastAmount: last.amount,
      cadence,
      perYear: round(cost * PER_YEAR[cadence]),
      perMonth: round((cost * PER_YEAR[cadence]) / 12),
      lastDate: last.tx_date,
      nextDate,
      count: dates.length,
      inPlan: matchesPlan || planKeys.has(normalizeMerchant(name)) || planKeys.has(key.slice(2)),
      priceUp: dates.length >= 2 && last.amount > first.amount * 1.05,
      stale: overdue > DAYS[cadence] * 0.5,
      source: "detected",
      categoryId: last.category_id,
    });
  }

  // 2) planned recurring items that look like subscriptions but never matched a charge
  const seen = new Set(out.map((s) => normalizeMerchant(s.name)));
  for (const r of recurring) {
    if (!r.active || r.kind !== "expense") continue;
    const n = normalizeMerchant(r.title);
    if (seen.has(n)) continue;
    const looksSub = !!known(r.title) || SUB_CATEGORY.test(catName.get(r.category_id ?? "") ?? "");
    if (!looksSub) continue;
    const cad: Cadence | null =
      r.frequency === "weekly" ? "weekly" : r.frequency === "yearly" ? "yearly" : r.frequency === "monthly" ? "monthly" : null;
    if (!cad) continue;
    out.push({
      key: `p:${r.id}`,
      name: r.title,
      amount: r.amount,
      lastAmount: r.amount,
      cadence: cad,
      perYear: round(r.amount * PER_YEAR[cad]),
      perMonth: round((r.amount * PER_YEAR[cad]) / 12),
      lastDate: r.start_date,
      nextDate: null,
      count: 0,
      inPlan: true,
      priceUp: false,
      stale: false,
      source: "plan",
      categoryId: r.category_id,
    });
  }

  return out.sort((a, b) => b.perYear - a.perYear);
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
