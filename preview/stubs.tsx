// Stubs replacing next/* and the Supabase client for offline previews.
import React from "react";

// ---- next/link ----
export function Link({ href, children, ...rest }: any) {
  return (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  );
}
export default Link;

// ---- next/navigation ----
export function useRouter() {
  return { push: () => {}, refresh: () => {}, back: () => {} };
}
export function usePathname() {
  return (globalThis as any).__previewPath ?? "/app";
}
export function useSearchParams() {
  return new URLSearchParams("");
}

// ---- sample data ----
const uid = "u-preview";
export const sample = {
  profile: { full_name: "Daniel Mora", show_debts: true, show_investments: true },
  categories: [
    { id: "c1", name: "Housing", icon: "🏠", kind: "expense", parent_id: null },
    { id: "c2", name: "Groceries", icon: "🛒", kind: "expense", parent_id: null },
    { id: "c3", name: "Dining out", icon: "🍽️", kind: "expense", parent_id: null },
    { id: "c4", name: "Transport", icon: "🚗", kind: "expense", parent_id: null },
    { id: "c5", name: "Subscriptions", icon: "📺", kind: "expense", parent_id: null },
    { id: "c6", name: "Salary", icon: "💼", kind: "income", parent_id: null },
    { id: "c7", name: "Cars", icon: "🚗", kind: "expense", parent_id: null },
    { id: "c8", name: "Mercedes", icon: "🚙", kind: "expense", parent_id: "c7" },
    { id: "c9", name: "Montfort", icon: "🏔️", kind: "income", parent_id: null },
    { id: "c10", name: "My job", icon: "💼", kind: "income", parent_id: null },
    { id: "c11", name: "Bonus", icon: "🎁", kind: "income", parent_id: "c10" },
  ],
  debts: [
    { id: "d1", name: "Amex Gold", debt_type: "credit_card", original_amount: 8000, balance: 5000, apr: 24, planned_payment: 500, payment_due_day: 15, statement_close_day: 21, archived: false },
    { id: "d2", name: "Mercedes loan", debt_type: "car_loan", original_amount: 42000, balance: 28000, apr: 7.2, planned_payment: 650, payment_due_day: 1, statement_close_day: null, archived: false },
  ],
  investments: [
    { id: "i1", name: "Fidelity brokerage", inv_type: "brokerage", balance: 10800, expected_apr: 8, contributed_total: 800, monthly_amount: 500, monthly_kind: "deposit", archived: false },
    { id: "i2", name: "House fund", inv_type: "savings", balance: 12400, expected_apr: 4.2, contributed_total: 12400, monthly_amount: 0, monthly_kind: "deposit", archived: false },
  ],
  goals: [
    { id: "g1", name: "House down payment", target_amount: 60000, target_date: "2027-12-31", saved: 14200, archived: false },
    { id: "g2", name: "Rolex Submariner", target_amount: 12000, target_date: "2026-12-15", saved: 3500, archived: false },
  ],
  recurring_items: [
    { id: "r1", title: "Salary", kind: "income", amount: 2100, category_id: "c6", account_id: "a1", frequency: "biweekly", start_date: "2026-01-02", end_date: null, active: true },
    { id: "r2", title: "Montfort draw", kind: "income", amount: 1000, category_id: "c9", account_id: "a1", frequency: "monthly", start_date: "2026-03-01", end_date: null, active: true },
    { id: "r3", title: "Rent", kind: "expense", amount: 1600, category_id: "c1", account_id: "a1", frequency: "monthly", start_date: "2026-01-01", end_date: null, active: true },
    { id: "r4", title: "Mercedes insurance", kind: "expense", amount: 180, category_id: "c8", account_id: "a2", frequency: "monthly", start_date: "2026-01-15", end_date: null, active: true },
    { id: "r5", title: "Netflix", kind: "expense", amount: 15.99, category_id: "c5", account_id: "a2", frequency: "monthly", start_date: "2026-01-09", end_date: null, active: true },
    { id: "r6", title: "Mercedes registration", kind: "expense", amount: 600, category_id: "c8", account_id: "a2", frequency: "yearly", start_date: "2026-11-01", end_date: null, active: true },
    { id: "r7", title: "Property tax", kind: "expense", amount: 6000, category_id: "c1", account_id: "a1", frequency: "yearly", start_date: "2026-12-10", end_date: null, active: true },
    { id: "r8", title: "Q3 bonus", kind: "income", amount: 900, category_id: "c11", account_id: "a1", frequency: "once", start_date: "2026-07-20", end_date: null, active: true },
    { id: "r9", title: "New tires", kind: "expense", amount: 800, category_id: "c8", account_id: "a2", frequency: "once", start_date: "2026-07-25", end_date: null, active: true },
  ],
  accounts: [
    { id: "a1", name: "Chase checking", type: "checking", source: "manual", currency: "USD", archived: false, payment_due_day: null, statement_close_day: null },
    { id: "a2", name: "Amex card", type: "credit", source: "manual", currency: "USD", archived: false, payment_due_day: 15, statement_close_day: 21 },
    { id: "a3", name: "Car loan", type: "loan", source: "manual", currency: "USD", archived: false, payment_due_day: 1, statement_close_day: null },
  ],
  budgets: [
    { id: "b1", category_id: "c1", month: "2026-07-01", limit_amount: 1600 },
    { id: "b2", category_id: "c2", month: "2026-07-01", limit_amount: 600 },
    { id: "b3", category_id: "c3", month: "2026-07-01", limit_amount: 250 },
    { id: "b4", category_id: "c4", month: "2026-07-01", limit_amount: 200 },
  ],
  transactions: [
    { id: "t8", account_id: "a1", category_id: "c11", kind: "income", amount: 200, tx_date: "2026-07-12", note: "Q3 bonus", source: "manual", task_id: null, recurring_item_id: "r8" },
    { id: "t1", account_id: "a1", category_id: "c1", kind: "expense", amount: 1600, tx_date: "2026-07-01", note: "Rent — July", source: "task", task_id: "k9", recurring_item_id: "r3" },
    { id: "t2", account_id: "a2", category_id: "c2", kind: "expense", amount: 182.45, tx_date: "2026-07-11", note: "Costco run", source: "manual", task_id: null },
    { id: "t3", account_id: "a2", category_id: "c3", kind: "expense", amount: 64.2, tx_date: "2026-07-11", note: "Tacos El Güero", source: "manual", task_id: null },
    { id: "t4", account_id: "a1", category_id: "c6", kind: "income", amount: 4200, tx_date: "2026-07-10", note: "Paycheck", source: "manual", task_id: null, recurring_item_id: "r1" },
    { id: "t5", account_id: "a2", category_id: "c5", kind: "expense", amount: 15.99, tx_date: "2026-07-09", note: "Netflix", source: "manual", task_id: null, recurring_item_id: "r5" },
    { id: "t6", account_id: "a2", category_id: "c4", kind: "expense", amount: 48.3, tx_date: "2026-07-08", note: "Gas", source: "manual", task_id: null },
    { id: "t7", account_id: "a2", category_id: "c2", kind: "expense", amount: 96.1, tx_date: "2026-07-05", note: "Groceries", source: "manual", task_id: null },
  ],
  tasks: [
    { id: "k1", title: "Pay Amex card", category_id: "c1", account_id: "a1", kind: "expense", amount: 500, due_date: "2026-07-15", recurrence: "monthly", status: "pending", completed_at: null, transaction_id: null },
    { id: "k2", title: "Cancel unused gym membership", category_id: "c5", account_id: null, kind: "expense", amount: null, due_date: "2026-07-10", recurrence: "none", status: "pending", completed_at: null, transaction_id: null },
    { id: "k3", title: "Set aside for house fund", category_id: null, account_id: "a1", kind: "expense", amount: 800, due_date: "2026-07-30", recurrence: "monthly", status: "pending", completed_at: null, transaction_id: null },
    { id: "k9", title: "Pay rent", category_id: "c1", account_id: "a1", kind: "expense", amount: 1600, due_date: "2026-07-01", recurrence: "monthly", status: "completed", completed_at: "2026-07-01T12:00:00Z", transaction_id: "t1" },
  ],
};

// ---- @supabase/ssr replacement ----
function table(name: string): any {
  const rowsFor: Record<string, any[]> = {
    profiles: [sample.profile],
    categories: sample.categories,
    accounts: sample.accounts,
    budgets: sample.budgets,
    transactions: sample.transactions,
    tasks: sample.tasks,
    recurring_items: (sample as any).recurring_items,
    debts: (sample as any).debts,
    investments: (sample as any).investments,
    goals: (sample as any).goals,
  };
  const b: any = {
    _rows: rowsFor[name] ?? [],
    _single: false,
    select() { return b; },
    eq() { return b; },
    gte() { return b; },
    lt() { return b; },
    order() { return b; },
    insert() { return b; },
    update() { return b; },
    delete() { return b; },
    single() { b._single = true; return b; },
    then(resolve: any) {
      resolve({ data: b._single ? b._rows[0] ?? null : b._rows, error: null });
    },
  };
  return b;
}

export function createBrowserClient() {
  return {
    from: table,
    rpc: async () => ({ data: true, error: null }),
    auth: {
      getUser: async () => ({ data: { user: { id: uid, email: "daniel@montfortfinancial.com" } } }),
      signOut: async () => ({}),
      signInWithPassword: async () => ({ error: null }),
      signUp: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({}),
      updateUser: async () => ({ error: null }),
    },
  };
}
