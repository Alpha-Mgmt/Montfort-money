"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchBudgetsForMonth,
  fetchCategories,
  fetchTransactionsForMonth,
  spentByCategory,
} from "@/lib/data";
import { addMonths, money, monthLabel, monthStartISO } from "@/lib/format";
import { ProgressBar } from "@/components/ProgressBar";
import { Sheet } from "@/components/Sheet";
import { categoryPath } from "@/components/CategorySelect";
import type { Budget, Category } from "@/lib/types";

export default function BudgetsPage() {
  const [month, setMonth] = useState(monthStartISO());
  const [cats, setCats] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [spent, setSpent] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{
    budget_id?: string;
    category_id: string;
    limit: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(m = month) {
    const [c, b, t] = await Promise.all([
      fetchCategories(),
      fetchBudgetsForMonth(m),
      fetchTransactionsForMonth(m),
    ]);
    setCats(c);
    setBudgets(b);
    setSpent(spentByCategory(t));
    setLoading(false);
  }

  useEffect(() => {
    setLoading(true);
    load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const budgetedIds = new Set(budgets.map((b) => b.category_id));
  const unbudgeted = cats.filter(
    (c) => c.kind === "expense" && !budgetedIds.has(c.id)
  );

  const totalLimit = budgets.reduce((s, b) => s + b.limit_amount, 0);
  const totalSpent = budgets.reduce(
    (s, b) => s + (spent.get(b.category_id) ?? 0),
    0
  );

  function startNew(categoryId: string) {
    setEditing({ category_id: categoryId, limit: "" });
    setOpen(true);
  }

  function startEdit(b: Budget) {
    setEditing({
      budget_id: b.id,
      category_id: b.category_id,
      limit: String(b.limit_amount),
    });
    setOpen(true);
  }

  async function save() {
    if (!editing) return;
    const limit = parseFloat(editing.limit);
    if (!limit || limit <= 0) return;
    setBusy(true);
    const supabase = createClient();
    if (editing.budget_id) {
      await supabase
        .from("budgets")
        .update({ limit_amount: limit })
        .eq("id", editing.budget_id);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("budgets").insert({
        user_id: user!.id,
        category_id: editing.category_id,
        month,
        limit_amount: limit,
      });
    }
    setBusy(false);
    setOpen(false);
    load();
  }

  async function remove() {
    if (!editing?.budget_id) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("budgets").delete().eq("id", editing.budget_id);
    setBusy(false);
    setOpen(false);
    load();
  }

  async function copyLastMonth() {
    setBusy(true);
    const supabase = createClient();
    const prev = await fetchBudgetsForMonth(addMonths(month, -1));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const missing = prev.filter((p) => !budgetedIds.has(p.category_id));
    if (missing.length > 0) {
      await supabase.from("budgets").insert(
        missing.map((p) => ({
          user_id: user!.id,
          category_id: p.category_id,
          month,
          limit_amount: p.limit_amount,
        }))
      );
    }
    setBusy(false);
    load();
  }

  const editingCat = editing ? catById.get(editing.category_id) : null;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <button
          className="btn btn-ghost !px-3"
          onClick={() => setMonth(addMonths(month, -1))}
          aria-label="Previous month"
        >
          ←
        </button>
        <h1 className="font-display text-lg font-semibold">
          {monthLabel(month)}
        </h1>
        <button
          className="btn btn-ghost !px-3"
          onClick={() => setMonth(addMonths(month, 1))}
          aria-label="Next month"
        >
          →
        </button>
      </div>

      {budgets.length > 0 && (
        <div className="card p-5">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium">Monthly plan</span>
            <span className="muted">
              {money(totalSpent)} / {money(totalLimit)}
            </span>
          </div>
          <ProgressBar spent={totalSpent} limit={totalLimit} />
        </div>
      )}

      {loading ? (
        <p className="faint mt-6 text-center text-sm">Loading…</p>
      ) : (
        <>
          {budgets.length === 0 && (
            <div className="card p-8 text-center">
              <p className="text-3xl">🎯</p>
              <p className="muted mt-2 text-sm">
                No budgets for {monthLabel(month)} yet. Pick a category below
                to set your first limit
                {addMonths(month, -1) && " — or copy last month's plan."}
              </p>
              <button
                className="btn btn-ghost mt-4"
                onClick={copyLastMonth}
                disabled={busy}
              >
                Copy last month
              </button>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[...budgets]
              .sort((a, b) =>
                (categoryPath(cats, a.category_id)?.label ?? "").localeCompare(
                  categoryPath(cats, b.category_id)?.label ?? ""
                )
              )
              .map((b) => {
                const path = categoryPath(cats, b.category_id);
                const s = spent.get(b.category_id) ?? 0;
                const left = b.limit_amount - s;
                return (
                  <button
                    key={b.id}
                    onClick={() => startEdit(b)}
                    className="card p-5 text-left"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">
                        {path?.icon} {path?.label ?? "Category"}
                      </span>
                      <span className="muted shrink-0">
                        {money(s)} / {money(b.limit_amount)}
                      </span>
                    </div>
                    <ProgressBar spent={s} limit={b.limit_amount} />
                    <p
                      className="mt-1.5 text-xs"
                      style={{
                        color: left < 0 ? "var(--over)" : "var(--text-faint)",
                      }}
                    >
                      {left >= 0
                        ? `${money(left)} left`
                        : `${money(-left)} over`}
                    </p>
                  </button>
                );
              })}
          </div>

          {unbudgeted.length > 0 && (
            <div>
              <p className="faint mb-2 mt-2 text-xs font-semibold uppercase tracking-wide">
                Not budgeted yet
              </p>
              <div className="flex flex-wrap gap-2">
                {unbudgeted.map((c) => (
                  <button
                    key={c.id}
                    className="btn btn-ghost !py-1.5 !text-sm"
                    onClick={() => startNew(c.id)}
                  >
                    {categoryPath(cats, c.id)?.icon}{" "}
                    {categoryPath(cats, c.id)?.label} +
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={
          editing?.budget_id
            ? `Edit budget — ${editingCat?.name ?? ""}`
            : `New budget — ${editingCat?.name ?? ""}`
        }
      >
        {editing && (
          <div className="grid gap-4">
            <div>
              <label className="label">
                Monthly limit for {editingCat?.icon} {editingCat?.name}
              </label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min="1"
                step="1"
                placeholder="e.g. 600"
                value={editing.limit}
                onChange={(e) =>
                  setEditing({ ...editing, limit: e.target.value })
                }
              />
            </div>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save budget"}
            </button>
            {editing.budget_id && (
              <button className="btn btn-danger" onClick={remove} disabled={busy}>
                Remove budget
              </button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
