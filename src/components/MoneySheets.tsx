"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sheet } from "@/components/Sheet";
import { money, monthLabel, monthStartISO, addMonths } from "@/lib/format";
import {
  debtTypeLabels,
  invTypeLabels,
  monthsToPayoff,
  payoffLabel,
  projectInvestment,
  totalInterestRemaining,
} from "@/lib/debt";
import type { Debt, Investment } from "@/lib/types";

// ============================== DEBTS ==============================

export type DebtDraft = {
  id?: string;
  name: string;
  debt_type: Debt["debt_type"];
  original_amount: string;
  balance: string;
  apr: string;
  planned_payment: string;
  payment_due_day: string;
  statement_close_day: string;
};

export const emptyDebtDraft = (): DebtDraft => ({
  name: "",
  debt_type: "credit_card",
  original_amount: "",
  balance: "",
  apr: "",
  planned_payment: "",
  payment_due_day: "",
  statement_close_day: "",
});

export function debtToDraft(d: Debt): DebtDraft {
  return {
    id: d.id,
    name: d.name,
    debt_type: d.debt_type,
    original_amount: d.original_amount ? String(d.original_amount) : "",
    balance: String(d.balance),
    apr: String(d.apr),
    planned_payment: String(d.planned_payment),
    payment_due_day: d.payment_due_day ? String(d.payment_due_day) : "",
    statement_close_day: d.statement_close_day
      ? String(d.statement_close_day)
      : "",
  };
}

export function DebtSheet({
  open,
  onClose,
  draft,
  setDraft,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  draft: DebtDraft | null;
  setDraft: (d: DebtDraft) => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!draft) return null;
    const balance = parseFloat(draft.balance);
    const apr = parseFloat(draft.apr || "0");
    const payment = parseFloat(draft.planned_payment);
    if (!balance || !payment) return null;
    const n = monthsToPayoff(balance, apr, payment);
    if (n === null)
      return {
        bad: true,
        text: `⚠️ ${money(payment)}/mo doesn't cover the interest — this debt would never be paid off. Raise the payment.`,
      };
    const when = payoffLabel(addMonths(monthStartISO(), n));
    const interest = totalInterestRemaining({
      balance,
      apr,
      planned_payment: payment,
    } as Debt);
    return {
      bad: false,
      text: `Paid off in ${when} (${n} payments) · ~${money(interest ?? 0)} in interest from here`,
    };
  }, [draft]);

  if (!draft) return null;

  async function save() {
    if (!draft) return;
    const balance = parseFloat(draft.balance);
    const payment = parseFloat(draft.planned_payment);
    if (!draft.name.trim() || isNaN(balance) || !payment) {
      setError("Name, current balance and monthly payment are required.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const day = parseInt(draft.payment_due_day, 10);
    const closeDay = parseInt(draft.statement_close_day, 10);
    const orig = parseFloat(draft.original_amount);
    const row = {
      name: draft.name.trim(),
      debt_type: draft.debt_type,
      original_amount: orig > 0 ? orig : null,
      balance,
      apr: parseFloat(draft.apr || "0"),
      planned_payment: payment,
      payment_due_day: day >= 1 && day <= 31 ? day : null,
      statement_close_day: closeDay >= 1 && closeDay <= 31 ? closeDay : null,
    };
    if (draft.id) {
      await supabase.from("debts").update(row).eq("id", draft.id);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("debts").insert({ ...row, user_id: user!.id });
    }
    setBusy(false);
    onClose();
    onSaved();
  }

  async function archive() {
    if (!draft?.id) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("debts").update({ archived: true }).eq("id", draft.id);
    setBusy(false);
    onClose();
    onSaved();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={draft.id ? "Edit debt" : "Add a debt"}
    >
      <div className="grid gap-4">
        <div>
          <label className="label">What kind of debt?</label>
          <select
            className="input"
            value={draft.debt_type}
            onChange={(e) =>
              setDraft({ ...draft, debt_type: e.target.value as any })
            }
          >
            {(Object.keys(debtTypeLabels) as Debt["debt_type"][]).map((t) => (
              <option key={t} value={t}>
                {debtTypeLabels[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            placeholder="e.g. Amex Gold, Mercedes loan"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Current balance</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="e.g. 5000"
              value={draft.balance}
              onChange={(e) => setDraft({ ...draft, balance: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Original total — optional</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="for the progress bar"
              value={draft.original_amount}
              onChange={(e) =>
                setDraft({ ...draft, original_amount: e.target.value })
              }
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Interest rate (APR %)</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.01"
              placeholder="e.g. 24"
              value={draft.apr}
              onChange={(e) => setDraft({ ...draft, apr: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Monthly payment</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              placeholder="e.g. 500"
              value={draft.planned_payment}
              onChange={(e) =>
                setDraft({ ...draft, planned_payment: e.target.value })
              }
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Payment due day — optional</label>
            <input
              className="input"
              type="number"
              min="1"
              max="31"
              placeholder="e.g. 15"
              value={draft.payment_due_day}
              onChange={(e) =>
                setDraft({ ...draft, payment_due_day: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">Statement close day — optional</label>
            <input
              className="input"
              type="number"
              min="1"
              max="31"
              placeholder="e.g. 21"
              value={draft.statement_close_day}
              onChange={(e) =>
                setDraft({ ...draft, statement_close_day: e.target.value })
              }
            />
          </div>
        </div>

        {preview && (
          <div
            className="card-soft p-4 text-sm"
            style={preview.bad ? { color: "var(--over)" } : undefined}
          >
            {preview.text}
          </div>
        )}

        {error && (
          <p className="text-sm" style={{ color: "var(--over)" }}>
            {error}
          </p>
        )}
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : draft.id ? "Save changes" : "Add debt"}
        </button>
        {draft.id && (
          <button className="btn btn-danger" onClick={archive} disabled={busy}>
            Archive debt
          </button>
        )}
      </div>
    </Sheet>
  );
}

// =========================== INVESTMENTS ===========================

export type InvDraft = {
  id?: string;
  name: string;
  inv_type: Investment["inv_type"];
  balance: string;
  expected_apr: string;
  monthly_flow: "none" | "deposit" | "withdraw";
  monthly_amount: string;
};

export const emptyInvDraft = (): InvDraft => ({
  name: "",
  inv_type: "brokerage",
  balance: "",
  expected_apr: "7",
  monthly_flow: "none",
  monthly_amount: "",
});

export function invToDraft(i: Investment): InvDraft {
  return {
    id: i.id,
    name: i.name,
    inv_type: i.inv_type,
    balance: String(i.balance),
    expected_apr: String(i.expected_apr),
    monthly_flow: i.monthly_amount > 0 ? i.monthly_kind : "none",
    monthly_amount: i.monthly_amount > 0 ? String(i.monthly_amount) : "",
  };
}

export function InvestmentSheet({
  open,
  onClose,
  draft,
  setDraft,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  draft: InvDraft | null;
  setDraft: (d: InvDraft) => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!draft) return null;
    const balance = parseFloat(draft.balance || "0");
    const apr = parseFloat(draft.expected_apr || "0");
    if (!balance) return null;
    const now = new Date();
    const monthsToDec = 11 - now.getMonth() + 1; // to end of December
    const fv = projectInvestment(balance, apr, 0, monthsToDec);
    return `At ${apr}%/yr, ~${money(fv)} by end of December (before new contributions).`;
  }, [draft]);

  if (!draft) return null;

  async function save() {
    if (!draft) return;
    const balance = parseFloat(draft.balance || "0");
    if (!draft.name.trim() || isNaN(balance)) {
      setError("Name and current balance are required.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const flowAmount = parseFloat(draft.monthly_amount || "0");
    const row = {
      name: draft.name.trim(),
      inv_type: draft.inv_type,
      balance,
      expected_apr: parseFloat(draft.expected_apr || "0"),
      monthly_amount:
        draft.monthly_flow === "none" || !(flowAmount > 0) ? 0 : flowAmount,
      monthly_kind: draft.monthly_flow === "withdraw" ? "withdraw" : "deposit",
    };
    if (draft.id) {
      await supabase.from("investments").update(row).eq("id", draft.id);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("investments").insert({ ...row, user_id: user!.id });
    }
    setBusy(false);
    onClose();
    onSaved();
  }

  async function archive() {
    if (!draft?.id) return;
    setBusy(true);
    const supabase = createClient();
    await supabase
      .from("investments")
      .update({ archived: true })
      .eq("id", draft.id);
    setBusy(false);
    onClose();
    onSaved();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={draft.id ? "Edit investment" : "Add an investment"}
    >
      <div className="grid gap-4">
        <div>
          <label className="label">Type</label>
          <select
            className="input"
            value={draft.inv_type}
            onChange={(e) =>
              setDraft({ ...draft, inv_type: e.target.value as any })
            }
          >
            {(Object.keys(invTypeLabels) as Investment["inv_type"][]).map(
              (t) => (
                <option key={t} value={t}>
                  {invTypeLabels[t]}
                </option>
              )
            )}
          </select>
        </div>
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            placeholder="e.g. Fidelity brokerage, House fund"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Current balance</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="e.g. 10000"
              value={draft.balance}
              onChange={(e) => setDraft({ ...draft, balance: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Expected return %/yr</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.1"
              value={draft.expected_apr}
              onChange={(e) =>
                setDraft({ ...draft, expected_apr: e.target.value })
              }
            />
          </div>
        </div>

        <div className="card-soft grid gap-3 p-4">
          <div>
            <label className="label">Monthly movement</label>
            <select
              className="input"
              value={draft.monthly_flow}
              onChange={(e) =>
                setDraft({ ...draft, monthly_flow: e.target.value as any })
              }
            >
              <option value="none">Nothing regular</option>
              <option value="deposit">I put money IN every month</option>
              <option value="withdraw">I take money OUT every month</option>
            </select>
          </div>
          {draft.monthly_flow !== "none" && (
            <div>
              <label className="label">
                How much per month?
              </label>
              <div className="relative">
                <span className="faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                  $
                </span>
                <input
                  className="input !pl-7"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 500"
                  value={draft.monthly_amount}
                  onChange={(e) =>
                    setDraft({ ...draft, monthly_amount: e.target.value })
                  }
                />
              </div>
              <p className="faint mt-1 text-xs">
                {draft.monthly_flow === "deposit"
                  ? "Counts in your monthly expense plan. Log each deposit with the + on the card."
                  : "Counts in your monthly income plan. Log each withdrawal with the − on the card."}
              </p>
            </div>
          )}
        </div>

        {preview && <div className="card-soft p-4 text-sm">{preview}</div>}

        {error && (
          <p className="text-sm" style={{ color: "var(--over)" }}>
            {error}
          </p>
        )}
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : draft.id ? "Save changes" : "Add investment"}
        </button>
        {draft.id && (
          <button className="btn btn-danger" onClick={archive} disabled={busy}>
            Archive
          </button>
        )}
      </div>
    </Sheet>
  );
}
