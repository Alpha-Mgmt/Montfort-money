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

/** Deduction keys that can be edited from the employer card. */
export function isEditableKey(key: string): boolean {
  return (TAX_KEYS as readonly string[]).includes(key) || key.startsWith("other:");
}

/** Does this paycheck have that deduction? */
export function hasDeduction(t: Taxes | null | undefined, key: string): boolean {
  if (!t || t.mode !== "detailed") return false;
  if ((TAX_KEYS as readonly string[]).includes(key)) return Number(t[key as TaxKey] ?? 0) > 0;
  const name = key.slice(6).toLowerCase();
  return (t.other ?? []).some((o) => (o.name || "").toLowerCase() === name);
}

/** Set (or remove, with null) one deduction of a detailed paycheck. */
export function setDeduction(t: Taxes, key: string, amount: number | null): Taxes | null {
  if (t.mode !== "detailed") return null;
  if ((TAX_KEYS as readonly string[]).includes(key)) return { ...t, [key]: amount ? r2(amount) : 0 };
  if (!key.startsWith("other:")) return null;
  const name = key.slice(6);
  const other = [...(t.other ?? [])];
  const i = other.findIndex((o) => (o.name || "").toLowerCase() === name.toLowerCase());
  if (amount == null || amount <= 0) {
    if (i >= 0) other.splice(i, 1);
  } else if (i >= 0) other[i] = { ...other[i], amount: r2(amount) };
  else other.push({ name, amount: r2(amount) });
  return { ...t, other };
}
