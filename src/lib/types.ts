export type Kind = "expense" | "income";

export type Account = {
  id: string;
  name: string;
  type: "cash" | "checking" | "savings" | "credit" | "loan" | "other";
  source: "manual" | "plaid";
  currency: string;
  archived: boolean;
  payment_due_day: number | null;
  statement_close_day: number | null;
};

export type Category = {
  id: string;
  name: string;
  icon: string;
  kind: Kind;
  parent_id: string | null;
  pinned?: boolean;
};

export type Frequency =
  | "once"
  | "weekly"
  | "biweekly"
  | "semimonthly"
  | "monthly"
  | "yearly";

export type RecurringItem = {
  id: string;
  title: string;
  kind: Kind;
  amount: number;
  category_id: string | null;
  account_id: string | null;
  frequency: Frequency;
  start_date: string;
  end_date: string | null;
  active: boolean;
};

export type Transaction = {
  id: string;
  account_id: string | null;
  category_id: string | null;
  kind: Kind;
  amount: number;
  tx_date: string;
  note: string | null;
  source: "manual" | "task" | "plaid";
  task_id: string | null;
  recurring_item_id?: string | null;
  debt_id?: string | null;
  investment_id?: string | null;
  goal_id?: string | null;
};

export type Budget = {
  id: string;
  category_id: string;
  month: string;
  limit_amount: number;
};

export type Debt = {
  id: string;
  name: string;
  debt_type:
    | "credit_card"
    | "car_loan"
    | "mortgage"
    | "personal_loan"
    | "student_loan"
    | "other";
  original_amount: number | null;
  balance: number;
  apr: number;
  planned_payment: number;
  payment_due_day: number | null;
  statement_close_day: number | null;
  archived: boolean;
};

export type Investment = {
  id: string;
  name: string;
  inv_type:
    | "brokerage"
    | "retirement"
    | "crypto"
    | "real_estate"
    | "savings"
    | "other";
  balance: number;
  expected_apr: number;
  contributed_total: number;
  monthly_amount: number;
  monthly_kind: "deposit" | "withdraw";
  archived: boolean;
};

export type Goal = {
  id: string;
  name: string;
  target_amount: number;
  target_date: string | null;
  saved: number;
  archived: boolean;
};

export type Recurrence = "none" | "weekly" | "biweekly" | "monthly" | "yearly";

export type Task = {
  id: string;
  title: string;
  category_id: string | null;
  account_id: string | null;
  kind: Kind;
  amount: number | null;
  due_date: string | null;
  recurrence: Recurrence;
  status: "pending" | "completed";
  completed_at: string | null;
  transaction_id: string | null;
};
