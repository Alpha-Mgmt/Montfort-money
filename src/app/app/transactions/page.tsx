"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  fetchAccounts,
  fetchCategories,
  fetchTransactionsForMonth,
} from "@/lib/data";
import {
  addMonths,
  money,
  monthLabel,
  monthStartISO,
  shortDate,
} from "@/lib/format";
import { categoryPath } from "@/components/CategorySelect";
import { CategoryDot } from "@/components/CategoryDot";
import { TxSheet, emptyTxDraft, type TxDraft } from "@/components/TxSheet";
import type { Account, Category, Transaction } from "@/lib/types";

function TransactionsInner() {
  const params = useSearchParams();
  const [month, setMonth] = useState(monthStartISO());
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [accts, setAccts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TxDraft | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(m = month) {
    const [t, c, a] = await Promise.all([
      fetchTransactionsForMonth(m),
      fetchCategories(),
      fetchAccounts(),
    ]);
    setTxs(t);
    setCats(c);
    setAccts(a);
    setLoading(false);
    return { c, a };
  }

  useEffect(() => {
    load().then(({ c, a }) => {
      if (params.get("add")) {
        setDraft(emptyTxDraft("expense", c, a));
        setOpen(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLoading(true);
    load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);

  const grouped = useMemo(() => {
    const g = new Map<string, Transaction[]>();
    for (const t of txs) {
      const list = g.get(t.tx_date) ?? [];
      list.push(t);
      g.set(t.tx_date, list);
    }
    return [...g.entries()];
  }, [txs]);

  const totalSpent = txs
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + t.amount, 0);

  function startAdd() {
    setDraft(emptyTxDraft("expense", cats, accts));
    setOpen(true);
  }

  function startEdit(t: Transaction) {
    setDraft({
      id: t.id,
      kind: t.kind,
      amount: String(t.amount),
      category_id: t.category_id ?? "",
      account_id: t.account_id ?? "",
      tx_date: t.tx_date,
      note: t.note ?? "",
    });
    setOpen(true);
  }

  return (
    <div className="grid gap-4">
      {/* Month switcher */}
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

      <div className="card flex items-center justify-between p-5">
        <div>
          <p className="faint text-xs font-semibold uppercase tracking-wide">
            Spent
          </p>
          <p className="font-display text-2xl font-semibold">
            {money(totalSpent)}
          </p>
        </div>
        <button className="btn btn-primary" onClick={startAdd}>
          + Add
        </button>
      </div>

      {loading ? (
        <p className="faint mt-6 text-center text-sm">Loading…</p>
      ) : grouped.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="muted mt-2 text-sm">
            No transactions in {monthLabel(month)}.
          </p>
        </div>
      ) : (
        grouped.map(([date, list]) => (
          <div key={date}>
            <p className="faint mb-1.5 mt-1 text-xs font-semibold uppercase tracking-wide">
              {shortDate(date)}
            </p>
            <div className="card divide-y px-4" style={{ borderColor: "var(--border)" }}>
              {list.map((t) => {
                const cat = t.category_id ? catById.get(t.category_id) : null;
                return (
                  <button
                    key={t.id}
                    onClick={() => startEdit(t)}
                    className="divider flex w-full items-center justify-between py-3 text-left first:border-t-0"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <CategoryDot name={cat?.name ?? "Uncategorized"} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {t.note || cat?.name || "Transaction"}
                        </p>
                        <p className="faint truncate text-xs">
                          {categoryPath(cats, t.category_id)?.label ??
                            "Uncategorized"}
                          {t.source === "task" && " · from task"}
                        </p>
                      </div>
                    </div>
                    <span
                      className="text-sm font-semibold"
                      style={
                        t.kind === "income"
                          ? { color: "var(--mint)" }
                          : undefined
                      }
                    >
                      {t.kind === "income" ? "+" : "−"}
                      {money(t.amount)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Add / edit sheet (shared) */}
      <TxSheet
        open={open}
        onClose={() => setOpen(false)}
        draft={draft}
        setDraft={setDraft}
        cats={cats}
        accts={accts}
        onSaved={() => load()}
      />
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense>
      <TransactionsInner />
    </Suspense>
  );
}
