"use client";

import { createClient } from "@/lib/supabase/client";
import type {
  Account,
  Budget,
  Category,
  Debt,
  Goal,
  Investment,
  RecurringItem,
  Task,
  Transaction,
} from "@/lib/types";
import { monthRange } from "@/lib/format";

export async function fetchCategories(): Promise<Category[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("categories")
    .select("id,name,icon,kind,parent_id,pinned")
    .order("name");
  return (data ?? []).map((c: any) => ({
    parent_id: null,
    pinned: false,
    ...c,
  })) as Category[];
}

export type CategoryNode = Category & { children: Category[] };

/**
 * Groups (categories with children) first, then standalone categories.
 * A category is a "group" if any other category points to it.
 */
export function buildCategoryTree(
  cats: Category[],
  kind?: "expense" | "income"
): { groups: CategoryNode[]; standalone: Category[] } {
  const pool = kind ? cats.filter((c) => c.kind === kind) : cats;
  const childrenByParent = new Map<string, Category[]>();
  for (const c of pool) {
    if (c.parent_id) {
      const list = childrenByParent.get(c.parent_id) ?? [];
      list.push(c);
      childrenByParent.set(c.parent_id, list);
    }
  }
  const groups: CategoryNode[] = [];
  const standalone: Category[] = [];
  for (const c of pool) {
    if (c.parent_id) continue;
    const children = childrenByParent.get(c.id);
    if (children && children.length > 0) {
      groups.push({ ...c, children });
    } else {
      standalone.push(c);
    }
  }
  return { groups, standalone };
}

export async function fetchAccounts(): Promise<Account[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("accounts")
    .select(
      "id,name,type,source,currency,archived,payment_due_day,statement_close_day"
    )
    .eq("archived", false)
    .order("created_at");
  return (data ?? []).map((a: any) => ({
    payment_due_day: null,
    statement_close_day: null,
    ...a,
  })) as Account[];
}

export async function fetchTransactionsForMonth(
  monthISO: string
): Promise<Transaction[]> {
  const supabase = createClient();
  const { from, to } = monthRange(monthISO);
  const { data } = await supabase
    .from("transactions")
    .select(
      "id,account_id,category_id,kind,amount,tx_date,note,source,task_id,recurring_item_id,debt_id,investment_id,goal_id"
    )
    .gte("tx_date", from)
    .lt("tx_date", to)
    .order("tx_date", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []).map((t) => ({ ...t, amount: Number(t.amount) })) as Transaction[];
}

export async function fetchBudgetsForMonth(
  monthISO: string
): Promise<Budget[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("budgets")
    .select("id,category_id,month,limit_amount")
    .eq("month", monthISO);
  return (data ?? []).map((b) => ({
    ...b,
    limit_amount: Number(b.limit_amount),
  })) as Budget[];
}

export async function fetchTasks(): Promise<Task[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("tasks")
    .select(
      "id,title,category_id,account_id,kind,amount,due_date,recurrence,status,completed_at,transaction_id"
    )
    .order("status")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  return (data ?? []).map((t) => ({
    ...t,
    amount: t.amount === null ? null : Number(t.amount),
  })) as Task[];
}

export async function fetchRecurring(): Promise<RecurringItem[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("recurring_items")
    .select(
      "id,title,kind,amount,category_id,account_id,frequency,start_date,end_date,active"
    )
    .order("kind")
    .order("created_at");
  return (data ?? []).map((r: any) => ({
    ...r,
    amount: Number(r.amount),
  })) as RecurringItem[];
}

export async function fetchDebts(): Promise<Debt[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("debts")
    .select(
      "id,name,debt_type,original_amount,balance,apr,planned_payment,payment_due_day,statement_close_day,archived"
    )
    .eq("archived", false)
    .order("created_at");
  return (data ?? []).map((d: any) => ({
    statement_close_day: null,
    ...d,
    original_amount: d.original_amount === null ? null : Number(d.original_amount),
    balance: Number(d.balance),
    apr: Number(d.apr),
    planned_payment: Number(d.planned_payment),
  })) as Debt[];
}

export async function fetchInvestments(): Promise<Investment[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("investments")
    .select(
      "id,name,inv_type,balance,expected_apr,contributed_total,monthly_amount,monthly_kind,archived"
    )
    .eq("archived", false)
    .order("created_at");
  return (data ?? []).map((i: any) => ({
    ...i,
    balance: Number(i.balance),
    expected_apr: Number(i.expected_apr),
    contributed_total: Number(i.contributed_total),
    monthly_amount: Number(i.monthly_amount ?? 0),
    monthly_kind: i.monthly_kind ?? "deposit",
  })) as Investment[];
}

export async function fetchGoals(): Promise<Goal[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("goals")
    .select("id,name,target_amount,target_date,saved,archived")
    .eq("archived", false)
    .order("created_at");
  return (data ?? []).map((g: any) => ({
    ...g,
    target_amount: Number(g.target_amount),
    saved: Number(g.saved),
  })) as Goal[];
}

/** spent per category_id (expenses only) for a set of transactions */
export function spentByCategory(txs: Transaction[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of txs) {
    if (t.kind !== "expense") continue;
    const key = t.category_id ?? "uncategorized";
    m.set(key, (m.get(key) ?? 0) + t.amount);
  }
  return m;
}
