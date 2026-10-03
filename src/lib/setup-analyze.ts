/**
 * AI setup: reads the user's bank movements and finds what their month looks
 * like — paychecks, fixed bills, subscriptions, debt payments and everyday
 * spending — plus the few things worth asking about. Pure: no I/O.
 */
import type { Frequency, Kind } from "@/lib/types";

export type SetupTx = {
  id: string;
  kind: Kind;
  amount: number;
  tx_date: string;
  note: string | null;
  category_id: string | null;
};
export type SetupCat = { id: string; name: string; kind: Kind };
export type SetupItem = { title: string; kind: Kind; amount: number; category_id: string | null; active: boolean };

export type Group = "income" | "fixed" | "sub" | "debt";

export type Found = {
  key: string;
  title: string;
  kind: Kind;
  group: Group;
  amount: number;
  freq: Frequency;
  /** last time it happened (the plan item starts from here) */
  last: string;
  day: number;
  count: number;
  monthly: number;
  category_id: string | null;
  /** already in the user's plan — shown, not created again */
  already: boolean;
  /** the amount changes month to month (we use the typical month) */
  varies: boolean;
  txIds: string[];
};

export type Spend = { category_id: string | null; name: string; monthly: number; txIds: string[] };

export type Question = {
  id: string;
  type: "person" | "other" | "mixed" | "subs";
  merchant: string;
  meta: string;
  monthly: number;
  total: number;
  count: number;
  txIds: string[];
  /** repeats in 2+ months → can become a plan line */
  repeats: boolean;
  avg: number;
  last: string;
  /** probably the user's own account (their name) */
  self?: boolean;
  /** suggested category names for "other" questions (bucket → name to create) */
  suggest?: string | null;
};

export type Analysis = {
  days: number;
  months: number;
  txCount: number;
  found: Found[];
  spend: Spend[];
  questions: Question[];
};

const DAY = 86400000;
const d = (iso: string) => {
  const [y, m, dd] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, dd);
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const title = (s: string) =>
  s
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => (w.length <= 2 && w !== "de" ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");

/** a person the user sends money to (wire / Zelle / Cash App / Venmo), else null */
export function personOf(note: string): { via: string; name: string } | null {
  const n = note.replace(/\s+/g, " ");
  let m = n.match(/BEN:\s*(?:\/\S+\s+)?([A-Za-zÁÉÍÓÚÑáéíóúñ ]+?)(?:\s+REF:|\s+[A-Z]{2}\s+[A-Z0-9]{3}|\s+\d|$)/i);
  if (m && /wire/i.test(n)) return { via: "Wire", name: m[1].trim().split(" ").slice(0, 3).join(" ") };
  m = n.match(/zelle(?:\s+payment)?\s+(?:to|from)\s+([A-Za-z ]+?)(?:\s+(?:conf|jpm|ref|on)\b|\s*\d|$)/i);
  if (m) return { via: "Zelle", name: m[1].trim().split(" ").slice(0, 3).join(" ") };
  m = n.match(/cash ?app\s*\*\s*([A-Za-z ]+?)(?:\s+cash\.app|\s*\d|$)/i);
  if (m) return { via: "Cash App", name: m[1].trim().split(" ").slice(0, 3).join(" ") };
  m = n.match(/venmo\s*\*?\s*(?:payment\s+)?(?:to\s+)?([A-Za-z ]+?)(?:\s*\d|$)/i);
  if (m && m[1].trim()) return { via: "Venmo", name: m[1].trim().split(" ").slice(0, 3).join(" ") };
  return null;
}

/** a stable key for "the same merchant" across dates, store numbers and ids */
export function merchantKey(note: string | null): { key: string; label: string; person: boolean } {
  const raw = (note || "").trim();
  if (!raw) return { key: "", label: "", person: false };
  const p = personOf(raw);
  if (p) {
    const name = title(p.name);
    return { key: `${p.via}|${name.toLowerCase()}`, label: `${p.via} · ${name}`, person: true };
  }
  const clean = raw
    .replace(/\b(ppd|web|ccd|tel)\s+id:?\s*\S+/gi, " ")
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, " ")
    .replace(/[#*]\s*\S*\d\S*/g, " ")
    .replace(/\b[a-z]*\d[\w-]*\b/gi, " ")
    .replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ&' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = clean.split(" ").slice(0, 4).join(" ");
  const label = /[a-z]/.test(raw) ? words : title(words);
  return { key: words.toLowerCase(), label: label || raw.slice(0, 40), person: false };
}

const DEBT_RX = /financ|loan|lending|lender|afterpay|affirm|klarna|sezzle|credit one|capital one|discover|amex|american express|synchrony|mortgage|westlake|ally\b|santander|carmax|sallie|navient|nelnet|mohela|upstart|sofi|lendingclub|oportun|deuda|debt|pr[eé]stamo/i;
const SUB_RX = /netflix|spotify|hulu|disney|hbo|\bmax\b|youtube|prime|paramount|peacock|audible|apple|icloud|google|adobe|openai|chatgpt|anthropic|claude|microsoft|dropbox|notion|canva|github|patreon|onlyfans|twitch|xbox|playstation|nintendo|duolingo|linkedin|planet fitness|gym|fitness|subscri|suscrip|membership/i;
const MIXED_RX = /walmart|costco|target|amazon|amzn|sam'?s club|bj'?s|dollar general|family dollar|cvs|walgreens/i;
const EVERYDAY = /grocer|supermarket|s[uú]per|despensa|comida|food|dining|restaurant|caf[eé]|coffee|gas\b|gasolina|fuel|bashas|safeway|fry'?s|kroger|walmart|costco|trader joe|whole foods|aldi|sprouts|starbucks|mcdonald|chipotle|taco|pizza|uber eats|doordash|shell|chevron|circle k|quiktrip|arco|valero|convenience/i;
const NOT_RECURRING = /\batm\b|overdraft|deposit|transfer|withdraw|retiro/i;
const OTHER_RX = /^\s*(other|others|otro|otros|misc|miscellaneous|varios|general)\s*$/i;
const DEBT_CAT = /debt|deuda|loan|pr[eé]stamo|credit card|tarjeta/i;
const SUB_CAT = /subscri|suscrip|streaming|membres/i;

/** what a merchant probably is, for "where does this go?" questions */
export function suggestBucket(label: string): string | null {
  const s = label.toLowerCase();
  if (/insur|seguro|allstate|geico|progressive|state farm|homesite|lemonade/.test(s)) return "insurance";
  if (/mvd|dmv|registration|tag\b|placas/.test(s)) return "car";
  if (/fee|charge|comisi/.test(s)) return "fees";
  if (/ebay|etsy|shein|temu|best buy/.test(s)) return "shopping";
  if (/school|tuition|college|university|udemy|coursera/.test(s)) return "education";
  if (/vet|petco|petsmart|chewy/.test(s)) return "pets";
  if (/revolut|wise|remitly|western union|xoom|intermex/.test(s)) return "transfers";
  return null;
}

function freqOf(gapDays: number): Frequency | null {
  if (gapDays >= 5 && gapDays <= 9) return "weekly";
  if (gapDays >= 12 && gapDays <= 17) return "biweekly";
  if (gapDays >= 25 && gapDays <= 36) return "monthly";
  return null;
}
const perMonth: Partial<Record<Frequency, number>> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1 };

function looksAlready(f: { key: string; label: string; kind: Kind; amount: number; category_id: string | null }, items: SetupItem[]): boolean {
  const words = f.label
    .toLowerCase()
    .split(/[^a-záéíóúñ]+/)
    .filter((w) => w.length >= 4 && !["wire", "zelle", "payment", "online", "consumer"].includes(w));
  return items.some((it) => {
    if (!it.active || it.kind !== f.kind) return false;
    const t = it.title.toLowerCase();
    if (words.some((w) => t.includes(w))) return true;
    return Math.abs(it.amount - f.amount) / Math.max(1, f.amount) < 0.03 && (!f.category_id || it.category_id === f.category_id);
  });
}

export function analyze(
  txs: SetupTx[],
  cats: SetupCat[],
  items: SetupItem[],
  today: string,
  userName = "",
  windowDays = 180
): Analysis {
  const t0 = d(today);
  const recent = txs.filter((t) => t.note && d(t.tx_date) <= t0 && t0 - d(t.tx_date) <= windowDays * DAY && Number(t.amount) > 0);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const firstDay = recent.length ? Math.min(...recent.map((t) => d(t.tx_date))) : t0;
  const days = Math.max(1, Math.round((t0 - firstDay) / DAY) + 1);
  const months = Math.max(1, days / 30.4);

  // group by merchant + kind
  const groups = new Map<string, { kind: Kind; label: string; person: boolean; txs: SetupTx[] }>();
  for (const t of recent) {
    const mk = merchantKey(t.note);
    if (!mk.key) continue;
    const k = `${t.kind}|${mk.key}`;
    const g = groups.get(k) ?? { kind: t.kind, label: mk.label, person: mk.person, txs: [] };
    g.txs.push(t);
    groups.set(k, g);
  }

  const found: Found[] = [];
  const used = new Set<string>(); // tx ids already explained by a plan line
  const questions: Question[] = [];
  const me = (userName || "").toLowerCase().split(/\s+/).filter((w) => w.length >= 3);

  const catOf = (list: SetupTx[]) => {
    const cc = new Map<string, number>();
    for (const t of list) if (t.category_id) cc.set(t.category_id, (cc.get(t.category_id) ?? 0) + 1);
    return [...cc.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };

  function makeFound(key: string, g: { kind: Kind; label: string }, list: SetupTx[], freq: Frequency, amount: number, label: string, varies: boolean): Found {
    const dates = list.map((t) => t.tx_date).sort();
    const last = dates[dates.length - 1];
    const category_id = catOf(list);
    const cname = category_id ? catName.get(category_id) ?? "" : "";
    const text = `${g.label} ${cname}`;
    const group: Group =
      g.kind === "income" ? "income" : DEBT_RX.test(text) || DEBT_CAT.test(cname) ? "debt" : amount <= 80 && (SUB_RX.test(text) || SUB_CAT.test(cname)) ? "sub" : "fixed";
    const f: Found = {
      key,
      title: label,
      kind: g.kind,
      group,
      amount: r2(amount),
      freq,
      last,
      day: Number(last.slice(8, 10)),
      count: new Set(dates).size,
      monthly: r2(amount * (perMonth[freq] ?? 1)),
      category_id,
      already: false,
      varies,
      txIds: list.map((t) => t.id),
    };
    f.already = looksAlready({ key, label: g.label, kind: g.kind, amount: f.amount, category_id }, items);
    return f;
  }

  for (const [key, g] of groups) {
    const all = [...g.txs].sort((a, b) => d(a.tx_date) - d(b.tx_date));
    const gcat = catOf(all);
    const gcname = gcat ? catName.get(gcat) ?? "" : "";
    // groceries, eating out, gas… are everyday spending even when amounts repeat
    const everyday = EVERYDAY.test(`${g.label} ${gcname}`) && median(all.map((t) => Number(t.amount))) < 150;
    const noRepeat = g.person || NOT_RECURRING.test(g.label) || everyday;
    const streams: Found[] = [];
    if (!noRepeat) {
      // 1) streams of (about) the same amount — one merchant can bill several
      const sorted = [...all].sort((a, b) => Number(a.amount) - Number(b.amount));
      const clusters: SetupTx[][] = [];
      for (const t of sorted) {
        const c = clusters[clusters.length - 1];
        const m = c ? median(c.map((x) => Number(x.amount))) : 0;
        if (c && Math.abs(Number(t.amount) - m) <= Math.max(1.5, m * 0.05)) c.push(t);
        else clusters.push([t]);
      }
      for (const c of clusters) {
        const days1 = [...new Set(c.map((t) => t.tx_date))].sort();
        if (days1.length < 2) continue;
        const gaps = days1.slice(1).map((x, i) => (d(x) - d(days1[i])) / DAY);
        const freq = freqOf(median(gaps));
        if (!freq) continue;
        const since = (t0 - d(days1[days1.length - 1])) / DAY;
        const fresh = freq === "monthly" ? since <= 45 : freq === "biweekly" ? since <= 24 : since <= 12;
        const months1 = new Set(days1.map((x) => x.slice(0, 7))).size;
        const enough = freq === "monthly" ? months1 >= 2 : days1.length >= 3;
        if (!fresh || !enough) continue;
        const amts = c.map((t) => Number(t.amount));
        const amount = freq === "monthly" ? amts[amts.length - 1] : median(amts);
        if (amount < 1) continue;
        streams.push(makeFound(`${key}|${Math.round(median(amts))}`, g, c, freq, median(amts), g.label, false));
      }
      // 2) one bill a month that changes (power, phone): sum per month
      if (streams.length === 0) {
        const per = new Map<string, number>();
        for (const t of all) per.set(t.tx_date.slice(0, 7), (per.get(t.tx_date.slice(0, 7)) ?? 0) + Number(t.amount));
        const ym = [...per.keys()].sort();
        const since = (t0 - d(all[all.length - 1].tx_date)) / DAY;
        const sums = [...per.values()];
        const med = median(sums);
        const spread = (Math.max(...sums) - Math.min(...sums)) / Math.max(1, med);
        const perMonthCount = all.length / Math.max(1, ym.length);
        if (ym.length >= 3 && since <= 45 && spread <= 0.6 && perMonthCount <= 2.5 && ym.length >= Math.min(4, Math.ceil(months)) - 1) {
          streams.push(makeFound(`${key}|m`, g, all, "monthly", med, g.label, true));
        }
      }
    }
    // several streams from one merchant → tell them apart by amount
    if (streams.length > 1) for (const f of streams) f.title = `${g.label} ($${Math.round(f.amount)})`;
    for (const f of streams) {
      found.push(f);
      for (const id of f.txIds) used.add(id);
    }

    // questions — about money going out that no plan line explains
    if (g.kind !== "expense") continue;
    const list = all.filter((t) => !used.has(t.id));
    if (list.length === 0) continue;
    const total = list.reduce((a, t) => a + Number(t.amount), 0);
    const category_id = catOf(list);
    const cname = category_id ? catName.get(category_id) ?? "" : "";
    const dates = [...new Set(list.map((t) => t.tx_date))].sort();
    const base = {
      id: key,
      merchant: g.label,
      meta: "",
      monthly: r2(total / months),
      total: r2(total),
      count: list.length,
      txIds: list.map((t) => t.id),
      repeats: new Set(dates.map((x) => x.slice(0, 7))).size >= 2,
      avg: r2(total / list.length),
      last: dates[dates.length - 1],
      self: g.person && !!me[0] && g.label.toLowerCase().split(" · ")[1]?.split(" ")[0] === me[0],
    };
    const uncategorized = !category_id || OTHER_RX.test(cname);
    if (g.person && total >= 100 && uncategorized) {
      questions.push({ ...base, type: "person" });
      for (const id of base.txIds) used.add(id);
    } else if (!g.person && uncategorized && total >= 60 && !/fee|overdraft/i.test(g.label) && !NOT_RECURRING.test(g.label)) {
      questions.push({ ...base, type: "other", suggest: suggestBucket(g.label) });
    } else if (MIXED_RX.test(g.label) && total / months >= 120) {
      questions.push({ ...base, type: "mixed" });
    }
  }

  // everyday spending: what's left, averaged per month by category
  const spendMap = new Map<string, Spend>();
  for (const [, g] of groups) {
    if (g.kind !== "expense") continue;
    for (const t of g.txs) {
      if (used.has(t.id)) continue;
      const cid = t.category_id ?? null;
      const cn = cid ? catName.get(cid) ?? "" : "";
      if (DEBT_CAT.test(cn)) continue;
      const k = cid ?? "none";
      const s = spendMap.get(k) ?? { category_id: cid, name: cn || "Other", monthly: 0, txIds: [] };
      s.monthly += Number(t.amount) / months;
      s.txIds.push(t.id);
      spendMap.set(k, s);
    }
  }
  const spend = [...spendMap.values()]
    .map((s) => ({ ...s, monthly: Math.round(s.monthly) }))
    .filter((s) => s.monthly >= 10)
    .sort((a, b) => b.monthly - a.monthly);

  // the questions that matter most: people first, then by money
  const order = { person: 0, other: 1, mixed: 2, subs: 3 } as const;
  questions.sort((a, b) => order[a.type] - order[b.type] || b.monthly - a.monthly);
  const picked = [
    ...questions.filter((q) => q.type === "person").slice(0, 2),
    ...questions.filter((q) => q.type === "other").slice(0, 2),
    ...questions.filter((q) => q.type === "mixed").slice(0, 1),
  ];

  const order2: Record<Group, number> = { income: 0, fixed: 1, debt: 2, sub: 3 };
  found.sort((a, b) => order2[a.group] - order2[b.group] || b.monthly - a.monthly);
  return { days, months: r2(months), txCount: recent.length, found, spend, questions: picked };
}
