/**
 * Actions Montfort AI can PROPOSE. Nothing runs until the user taps Apply;
 * then /api/ask/apply re-validates and runs them with the user's own session
 * (so row-level security still decides what they can touch).
 */
export type AIAction =
  | { type: "change_plan_amount"; item_id: string; new_amount: number; effective_date: string }
  | { type: "end_plan_item"; item_id: string; end_date: string }
  | {
      type: "add_plan_item";
      title: string;
      kind: "income" | "expense";
      amount: number;
      frequency: string;
      start_date: string;
      end_date?: string | null;
      category_id?: string | null;
    }
  | { type: "add_transaction"; kind: "income" | "expense"; amount: number; date: string; category_id?: string | null; note?: string | null }
  | { type: "create_category"; name: string; kind: "income" | "expense"; parent_id?: string | null };

export const AI_TOOLS = [
  {
    name: "change_plan_amount",
    description:
      "Change the amount of an existing plan item (recurring income or expense) starting on a date. Past months keep the old amount. Use for 'from February raise my salary to X'.",
    input_schema: {
      type: "object",
      properties: {
        item_id: { type: "string", description: "id from planItems" },
        new_amount: { type: "number", description: "new amount per occurrence, take-home for income" },
        effective_date: { type: "string", description: "YYYY-MM-DD, first date with the new amount" },
      },
      required: ["item_id", "new_amount", "effective_date"],
    },
  },
  {
    name: "end_plan_item",
    description: "Stop an existing plan item after a date (e.g. a subscription they cancelled).",
    input_schema: {
      type: "object",
      properties: { item_id: { type: "string" }, end_date: { type: "string", description: "YYYY-MM-DD, last date it happens" } },
      required: ["item_id", "end_date"],
    },
  },
  {
    name: "add_plan_item",
    description: "Add a new recurring or one-time plan line (income or expense).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        kind: { type: "string", enum: ["income", "expense"] },
        amount: { type: "number" },
        frequency: { type: "string", enum: ["once", "weekly", "biweekly", "semimonthly", "monthly", "quarterly", "semiannual", "yearly"] },
        start_date: { type: "string", description: "YYYY-MM-DD" },
        end_date: { type: "string", description: "YYYY-MM-DD, optional" },
        category_id: { type: "string", description: "id from categories, optional" },
      },
      required: ["title", "kind", "amount", "frequency", "start_date"],
    },
  },
  {
    name: "add_transaction",
    description: "Log money that actually moved (a purchase, a payment received).",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["income", "expense"] },
        amount: { type: "number" },
        date: { type: "string", description: "YYYY-MM-DD" },
        category_id: { type: "string", description: "id from categories, optional" },
        note: { type: "string" },
      },
      required: ["kind", "amount", "date"],
    },
  },
  {
    name: "create_category",
    description: "Create a category (optionally inside a parent group).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: ["income", "expense"] },
        parent_id: { type: "string", description: "id of the parent category, optional" },
      },
      required: ["name", "kind"],
    },
  },
] as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const FREQS = ["once", "weekly", "biweekly", "semimonthly", "monthly", "quarterly", "semiannual", "yearly"];

/** Validate + normalize one proposed action; null if it isn't safe/valid. */
export function cleanAction(name: string, input: any): AIAction | null {
  const amt = (v: any) => (typeof v === "number" && isFinite(v) && v > 0 && v < 10_000_000 ? Math.round(v * 100) / 100 : null);
  const str = (v: any, n = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  const kind = (v: any) => (v === "income" || v === "expense" ? v : null);
  switch (name) {
    case "change_plan_amount": {
      const a = amt(input?.new_amount);
      if (!str(input?.item_id) || !a || !ISO.test(input?.effective_date ?? "")) return null;
      return { type: name, item_id: input.item_id, new_amount: a, effective_date: input.effective_date };
    }
    case "end_plan_item":
      if (!str(input?.item_id) || !ISO.test(input?.end_date ?? "")) return null;
      return { type: name, item_id: input.item_id, end_date: input.end_date };
    case "add_plan_item": {
      const a = amt(input?.amount);
      const k = kind(input?.kind);
      if (!str(input?.title) || !a || !k || !FREQS.includes(input?.frequency) || !ISO.test(input?.start_date ?? "")) return null;
      return {
        type: name, title: str(input.title)!, kind: k, amount: a, frequency: input.frequency, start_date: input.start_date,
        end_date: ISO.test(input?.end_date ?? "") ? input.end_date : null, category_id: str(input?.category_id, 64),
      };
    }
    case "add_transaction": {
      const a = amt(input?.amount);
      const k = kind(input?.kind);
      if (!a || !k || !ISO.test(input?.date ?? "")) return null;
      return { type: name, kind: k, amount: a, date: input.date, category_id: str(input?.category_id, 64), note: str(input?.note, 200) };
    }
    case "create_category": {
      const k = kind(input?.kind);
      if (!str(input?.name, 60) || !k) return null;
      return { type: name, name: str(input.name, 60)!, kind: k, parent_id: str(input?.parent_id, 64) };
    }
  }
  return null;
}
