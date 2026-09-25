"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sheet } from "@/components/Sheet";
import { FrequencyPicker } from "@/components/FrequencyPicker";
import { whenFor } from "@/components/WhenPicker";
import { todayISO } from "@/lib/format";
import type { Account, Category, Frequency, Kind } from "@/lib/types";
import { tr } from "@/lib/i18n";

export type TxDraft = {
  id?: string;
  kind: Kind;
  amount: string;
  category_id: string;
  account_id: string;
  tx_date: string;
  note: string;
};

export function emptyTxDraft(
  kind: Kind,
  cats: Category[],
  accts: Account[],
  date = todayISO()
): TxDraft {
  return {
    kind,
    amount: "",
    category_id: cats.find((c) => c.kind === kind && !c.parent_id)?.id ?? "",
    account_id: accts[0]?.id ?? "",
    tx_date: date,
    note: "",
  };
}

const NEW_CAT = "__new__";

/**
 * Shared add/edit sheet for income & expenses.
 * - Create a category on the fly (with optional group)
 * - "Repeats" toggle on new entries -> also creates a recurring_item
 */
export function TxSheet({
  open,
  onClose,
  draft,
  setDraft,
  cats,
  accts,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  draft: TxDraft | null;
  setDraft: (d: TxDraft) => void;
  cats: Category[];
  accts: Account[];
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState({ name: "", icon: "", parent_id: "" });
  const [repeat, setRepeat] = useState<"none" | Frequency>("none");
  const [repeatEnd, setRepeatEnd] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNewCat({ name: "", icon: "", parent_id: "" });
      setRepeat("none");
      setRepeatEnd("");
      setError(null);
    }
  }, [open]);

  if (!draft) return null;

  const creatingCat = draft.category_id === NEW_CAT;

  async function save() {
    if (!draft) return;
    const amount = parseFloat(draft.amount);
    if (!amount || amount <= 0) {
      setError(tr("Enter an amount."));
      return;
    }
    if (creatingCat && !newCat.name.trim()) {
      setError(tr("Give the new category a name."));
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let categoryId: string | null = draft.category_id || null;
    if (creatingCat) {
      const { data: created, error: catErr } = await supabase
        .from("categories")
        .insert({
          user_id: user!.id,
          name: newCat.name.trim(),
          icon: "",
          kind: draft.kind,
          parent_id: newCat.parent_id || null,
        })
        .select("id")
        .single();
      if (catErr || !created) {
        setError(
          tr("Couldn't create that category — maybe the name already exists.")
        );
        setBusy(false);
        return;
      }
      categoryId = created.id;
    }

    const row = {
      kind: draft.kind,
      amount,
      category_id: categoryId,
      account_id: draft.account_id || null,
      tx_date: draft.tx_date,
      note: draft.note.trim() || null,
    };

    if (draft.id) {
      await supabase.from("transactions").update(row).eq("id", draft.id);
    } else {
      await supabase
        .from("transactions")
        .insert({ ...row, user_id: user!.id, source: "manual" });
      if (repeat !== "none") {
        await supabase.from("recurring_items").insert({
          user_id: user!.id,
          title:
            draft.note.trim() ||
            cats.find((c) => c.id === categoryId)?.name ||
            (draft.kind === "income" ? tr("Income") : tr("Expense")),
          kind: draft.kind,
          amount,
          category_id: categoryId,
          account_id: draft.account_id || null,
          frequency: repeat,
          start_date: whenFor(repeat, draft.tx_date).start_date,
          schedule: whenFor(repeat, draft.tx_date).schedule,
          end_date: repeatEnd || null,
        });
      }
    }
    setBusy(false);
    onClose();
    onSaved();
  }

  async function remove() {
    if (!draft?.id) return;
    setBusy(true);
    const supabase = createClient();
    // delete_transaction also reverses debt/investment/goal balances;
    // fall back to a plain delete if the function isn't there yet
    const { error: rpcErr } = await supabase.rpc("delete_transaction", {
      p_tx_id: draft.id,
    });
    if (rpcErr) {
      const { error: delErr } = await supabase
        .from("transactions")
        .delete()
        .eq("id", draft.id);
      if (delErr) {
        setError(tr("Couldn't delete: {v0}", { v0: delErr.message }));
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    onClose();
    onSaved();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        draft.id
          ? tr("Edit entry")
          : draft.kind === "income"
            ? tr("Add income")
            : tr("Add expense")
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-2">
          {(["expense", "income"] as Kind[]).map((k) => (
            <button
              key={k}
              className={`btn ${draft.kind === k ? "btn-primary" : "btn-ghost"}`}
              onClick={() =>
                setDraft({
                  ...draft,
                  kind: k,
                  category_id:
                    cats.find((c) => c.kind === k && !c.parent_id)?.id ?? "",
                })
              }
            >
              {k === "expense" ? tr("Expense") : tr("Income")}
            </button>
          ))}
        </div>

        <div>
          <label className="label">{tr("Amount")}</label>
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
              placeholder="0.00"
              value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className="label">{tr("Category")}</label>
          <select
            className="input"
            value={draft.category_id}
            onChange={(e) =>
              setDraft({ ...draft, category_id: e.target.value })
            }
          >
            <CategoryOptions cats={cats} kind={draft.kind} />
            <option value={NEW_CAT}>{tr("＋ New category…")}</option>
          </select>
        </div>

        {creatingCat && (
          <div className="card-soft grid gap-3 p-4">
            <div>
              <label className="label">{tr("Name")}</label>
              <input
                className="input"
                placeholder={
                  draft.kind === "income" ? tr("e.g. Rents") : tr("e.g. Mercedes")
                }
                value={newCat.name}
                onChange={(e) =>
                  setNewCat({ ...newCat, name: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label">{tr("Inside a group — optional")}</label>
              <select
                className="input"
                value={newCat.parent_id}
                onChange={(e) =>
                  setNewCat({ ...newCat, parent_id: e.target.value })
                }
              >
                <option value="">{tr("Top level")}</option>
                {cats
                  .filter((c) => c.kind === draft.kind && !c.parent_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        )}

        {accts.length > 0 && (
          <div>
            <label className="label">{tr("Account")}</label>
            <select
              className="input"
              value={draft.account_id}
              onChange={(e) =>
                setDraft({ ...draft, account_id: e.target.value })
              }
            >
              {accts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{tr("Date")}</label>
            <input
              className="input"
              type="date"
              value={draft.tx_date}
              onChange={(e) => setDraft({ ...draft, tx_date: e.target.value })}
            />
          </div>
          <div>
            <label className="label">{tr("Note")}</label>
            <input
              className="input"
              placeholder={tr("e.g. Costco")}
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            />
          </div>
        </div>

        {!draft.id && (
          <div className="card-soft grid gap-3 p-4">
            <div>
              <label className="label">{tr("Repeats?")}</label>
              <FrequencyPicker value={repeat} onChange={setRepeat} allowNone />
            </div>
            {repeat !== "none" && (
              <div>
                <label className="label">{tr("Until — optional")}</label>
                <input
                  className="input"
                  type="date"
                  value={repeatEnd}
                  onChange={(e) => setRepeatEnd(e.target.value)}
                />
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm" style={{ color: "var(--over)" }}>
            {error}
          </p>
        )}

        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? tr("Saving…") : draft.id ? tr("Save changes") : tr("Add")}
        </button>
        {draft.id && (
          <button className="btn btn-danger" onClick={remove} disabled={busy}>
            {tr("Delete")}
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** plain <option> list (optgroups) reused by the select above */
function CategoryOptions({ cats, kind }: { cats: Category[]; kind: Kind }) {
  const pool = cats.filter((c) => c.kind === kind);
  const groups = pool.filter(
    (c) => !c.parent_id && pool.some((x) => x.parent_id === c.id)
  );
  const standalone = pool.filter(
    (c) => !c.parent_id && !pool.some((x) => x.parent_id === c.id)
  );
  return (
    <>
      {groups.map((g) => (
        <optgroup key={g.id} label={g.name}>
          <option value={g.id}>{g.name} — {tr("general")}</option>
          {pool
            .filter((c) => c.parent_id === g.id)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
      {standalone.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </>
  );
}
