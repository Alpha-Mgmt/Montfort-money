import type { Debt, Investment } from "@/lib/types";
import { addMonths, monthStartISO } from "@/lib/format";

/**
 * Months until a debt is paid off with a fixed monthly payment.
 * Standard amortization: n = -ln(1 - r*B/P) / ln(1+r), r = APR/12.
 * Returns null when the payment doesn't even cover interest.
 */
export function monthsToPayoff(
  balance: number,
  apr: number,
  payment: number
): number | null {
  if (balance <= 0) return 0;
  if (payment <= 0) return null;
  const r = apr / 100 / 12;
  if (r === 0) return Math.ceil(balance / payment);
  const monthlyInterest = balance * r;
  if (payment <= monthlyInterest) return null; // never pays off
  return Math.ceil(-Math.log(1 - (r * balance) / payment) / Math.log(1 + r));
}

/** 'YYYY-MM-01' of the payoff month, from today */
export function payoffMonth(debt: Debt): string | null {
  const n = monthsToPayoff(debt.balance, debt.apr, debt.planned_payment);
  if (n === null) return null;
  return addMonths(monthStartISO(), n);
}

export function payoffLabel(monthISO: string | null): string {
  if (monthISO === null) return "never at this payment";
  const [y, m] = monthISO.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

/** Total interest you'll pay from here to payoff (approx). */
export function totalInterestRemaining(debt: Debt): number | null {
  const n = monthsToPayoff(debt.balance, debt.apr, debt.planned_payment);
  if (n === null) return null;
  if (n === 0) return 0;
  // simulate — exact against the recursive balance, cheap for n <= 1200
  const r = debt.apr / 100 / 12;
  let b = debt.balance;
  let interest = 0;
  for (let i = 0; i < n && b > 0; i++) {
    const int = b * r;
    interest += int;
    b = Math.max(0, b + int - debt.planned_payment);
  }
  return Math.round(interest * 100) / 100;
}

/** 0..1 progress if we know the original size of the debt */
export function debtProgress(debt: Debt): number | null {
  if (!debt.original_amount || debt.original_amount <= 0) return null;
  return Math.min(
    1,
    Math.max(0, 1 - debt.balance / debt.original_amount)
  );
}

export const debtTypeLabels: Record<Debt["debt_type"], string> = {
  credit_card: "Credit card",
  car_loan: "Car loan",
  mortgage: "Mortgage",
  personal_loan: "Personal loan",
  student_loan: "Student loan",
  other: "Other debt",
};

export const debtTypeIcons: Record<Debt["debt_type"], string> = {
  credit_card: "💳",
  car_loan: "🚗",
  mortgage: "🏠",
  personal_loan: "🤝",
  student_loan: "🎓",
  other: "📄",
};

/**
 * Future value of an investment after `months`, with monthly compounding
 * and a fixed monthly contribution.
 */
export function projectInvestment(
  balance: number,
  expectedApr: number,
  monthlyContribution: number,
  months: number
): number {
  const r = expectedApr / 100 / 12;
  if (r === 0) return balance + monthlyContribution * months;
  const growth = Math.pow(1 + r, months);
  return balance * growth + monthlyContribution * ((growth - 1) / r);
}

export const invTypeLabels: Record<Investment["inv_type"], string> = {
  brokerage: "Brokerage",
  retirement: "Retirement",
  crypto: "Crypto",
  real_estate: "Real estate",
  savings: "Savings",
  other: "Other",
};

export const invTypeIcons: Record<Investment["inv_type"], string> = {
  brokerage: "📈",
  retirement: "🏖️",
  crypto: "🪙",
  real_estate: "🏘️",
  savings: "🏦",
  other: "💼",
};
