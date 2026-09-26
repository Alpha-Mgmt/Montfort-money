import type { Taxes } from "@/lib/types";

export const TAX_KEYS = ["federal", "state", "social_security", "medicare"] as const;
export type TaxKey = (typeof TAX_KEYS)[number];

export const TAX_LABELS: Record<TaxKey, string> = {
  federal: "Federal tax",
  state: "State tax",
  social_security: "Social Security",
  medicare: "Medicare",
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Every tax / deduction of one paycheck, as { label, amount }. */
export function taxParts(t: Taxes | null | undefined): { key: string; label: string; amount: number }[] {
  if (!t || !(t.gross > 0)) return [];
  if (t.mode === "simple") {
    const amt = t.pct != null ? (t.gross * t.pct) / 100 : Number(t.total ?? 0);
    return amt > 0 ? [{ key: "taxes", label: "Taxes", amount: r2(amt) }] : [];
  }
  const out: { key: string; label: string; amount: number }[] = [];
  for (const k of TAX_KEYS) {
    const v = Number(t[k] ?? 0);
    if (v > 0) out.push({ key: k, label: TAX_LABELS[k], amount: r2(v) });
  }
  for (const o of t.other ?? []) {
    if (o && Number(o.amount) > 0) out.push({ key: `other:${o.name}`, label: o.name || "Other", amount: r2(Number(o.amount)) });
  }
  return out;
}

export function taxTotal(t: Taxes | null | undefined): number {
  return r2(taxParts(t).reduce((s, p) => s + p.amount, 0));
}

/** Take-home of one paycheck. */
export function netOf(t: Taxes): number {
  return r2(Math.max(0, t.gross - taxTotal(t)));
}
