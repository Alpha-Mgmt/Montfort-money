import { tr } from "@/lib/i18n";
import { shortDate } from "@/lib/format";

/** Trips: shared travel plans (members, itinerary, expenses, trip fund). */

export type Trip = {
  id: string;
  owner_id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  cover_path: string | null;
  budget: number | null;
  fund_goal: number | null;
  currency: string;
  notes: string | null;
  invite_code: string;
  archived: boolean;
};

export type TripMember = { trip_id: string; user_id: string; display_name: string; role: "owner" | "member" };

export type TripItemKind = "flight" | "stay" | "transport" | "activity" | "food" | "note";

export type TripItem = {
  id: string;
  trip_id: string;
  kind: TripItemKind;
  title: string;
  item_date: string | null;
  item_time: string | null;
  end_date: string | null;
  location: string | null;
  reference: string | null;
  confirmation: string | null;
  url: string | null;
  details: string | null;
  cost: number | null;
};

export type TripExpense = {
  id: string;
  trip_id: string;
  title: string;
  amount: number;
  paid_by: string;
  split_among: string[] | null;
  spent_on: string;
  category: string | null;
};

export type TripContribution = {
  id: string;
  trip_id: string;
  user_id: string;
  amount: number;
  given_on: string;
  note: string | null;
};

export const ITEM_KINDS: { k: TripItemKind; label: string; icon: string }[] = [
  { k: "flight", label: "Flight", icon: "✈️" },
  { k: "stay", label: "Stay", icon: "🏨" },
  { k: "transport", label: "Transport", icon: "🚆" },
  { k: "activity", label: "Activity", icon: "🎟️" },
  { k: "food", label: "Food", icon: "🍝" },
  { k: "note", label: "Note", icon: "📝" },
];
export const kindIcon = (k: TripItemKind) => ITEM_KINDS.find((x) => x.k === k)?.icon ?? "•";

/** public URL of a cover photo (bucket trip-covers is public-read) */
export function coverUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/trip-covers/${path}`;
}

/** an automatic cover when there's no photo: a gradient picked from the name */
export function autoCover(seed: string): string {
  const pairs = [
    ["#0f766e", "#34d399"],
    ["#1e3a8a", "#60a5fa"],
    ["#7c2d12", "#fb923c"],
    ["#701a75", "#f472b6"],
    ["#14532d", "#a3e635"],
    ["#312e81", "#a78bfa"],
    ["#7f1d1d", "#fca5a5"],
    ["#0c4a6e", "#22d3ee"],
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const [a, b] = pairs[h % pairs.length];
  return `radial-gradient(120% 90% at 85% 10%, ${b}cc 0%, transparent 55%), linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** days from today to a date (negative = past) */
export function daysUntil(iso: string, today = new Date()): number {
  const [y, m, d] = iso.split("-").map(Number);
  const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - t0) / 86400000);
}

/** who paid more than their share (+) and who owes (−) */
export function tripBalances(members: TripMember[], expenses: TripExpense[]): Map<string, number> {
  const net = new Map<string, number>(members.map((m) => [m.user_id, 0]));
  for (const e of expenses) {
    const among = e.split_among && e.split_among.length ? e.split_among : members.map((m) => m.user_id);
    if (!among.length) continue;
    const share = Number(e.amount) / among.length;
    net.set(e.paid_by, (net.get(e.paid_by) ?? 0) + Number(e.amount));
    for (const u of among) net.set(u, (net.get(u) ?? 0) - share);
  }
  return net;
}

/** the fewest payments that settle everyone up */
export function settleUp(net: Map<string, number>): { from: string; to: string; amount: number }[] {
  const owe = [...net.entries()].filter(([, v]) => v < -0.005).map(([u, v]) => ({ u, v: -v })).sort((a, b) => b.v - a.v);
  const get = [...net.entries()].filter(([, v]) => v > 0.005).map(([u, v]) => ({ u, v })).sort((a, b) => b.v - a.v);
  const out: { from: string; to: string; amount: number }[] = [];
  let i = 0,
    j = 0;
  while (i < owe.length && j < get.length) {
    const x = Math.min(owe[i].v, get[j].v);
    out.push({ from: owe[i].u, to: get[j].u, amount: Math.round(x * 100) / 100 });
    owe[i].v -= x;
    get[j].v -= x;
    if (owe[i].v < 0.005) i++;
    if (get[j].v < 0.005) j++;
  }
  return out;
}

export function tripWhen(t: Pick<Trip, "start_date" | "end_date">): string {
  if (!t.start_date) return tr("No dates yet");
  if (!t.end_date || t.end_date === t.start_date) return shortDate(t.start_date);
  return `${shortDate(t.start_date)} – ${shortDate(t.end_date)}`;
}

export function countdown(t: Pick<Trip, "start_date" | "end_date">): { label: string; tone: "soon" | "now" | "past" | "none" } {
  if (!t.start_date) return { label: tr("Someday"), tone: "none" };
  const d = daysUntil(t.start_date);
  const e = t.end_date ? daysUntil(t.end_date) : d;
  if (d > 1) return { label: tr("in {n} days", { n: d }), tone: "soon" };
  if (d === 1) return { label: tr("tomorrow"), tone: "soon" };
  if (d <= 0 && e >= 0) return { label: tr("happening now"), tone: "now" };
  return { label: tr("done"), tone: "past" };
}

