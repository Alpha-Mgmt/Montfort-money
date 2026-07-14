"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { fetchAccounts, fetchCategories, fetchTasks } from "@/lib/data";
import { money, shortDate, todayISO } from "@/lib/format";
import { Sheet } from "@/components/Sheet";
import { CategorySelect } from "@/components/CategorySelect";
import type {
  Account,
  Category,
  Kind,
  Recurrence,
  Task,
} from "@/lib/types";

type Draft = {
  id?: string;
  title: string;
  amount: string;
  kind: Kind;
  category_id: string;
  account_id: string;
  due_date: string;
  recurrence: Recurrence;
};

const emptyDraft = (cats: Category[], accts: Account[]): Draft => ({
  title: "",
  amount: "",
  kind: "expense",
  category_id: cats.find((c) => c.kind === "expense")?.id ?? "",
  account_id: accts[0]?.id ?? "",
  due_date: "",
  recurrence: "none",
});

const recurrenceLabels: Record<Recurrence, string> = {
  none: "One-time",
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "Every month",
  yearly: "Every year",
};

function TasksInner() {
  const params = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [accts, setAccts] = useState<Account[]>([]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);

  async function load() {
    const [t, c, a] = await Promise.all([
      fetchTasks(),
      fetchCategories(),
      fetchAccounts(),
    ]);
    setTasks(t);
    setCats(c);
    setAccts(a);
    setLoading(false);
    return { c, a };
  }

  useEffect(() => {
    load().then(({ c, a }) => {
      if (params.get("add")) {
        setDraft(emptyDraft(c, a));
        setOpen(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const pending = tasks.filter((t) => t.status === "pending");
  const completed = tasks.filter((t) => t.status === "completed").slice(0, 10);

  async function complete(t: Task) {
    const supabase = createClient();
    const { error } = await supabase.rpc("complete_task", {
      p_task_id: t.id,
    });
    if (!error) {
      if (t.amount != null) {
        const cat = t.category_id ? catById.get(t.category_id) : null;
        setFlash(
          `Done — ${money(t.amount)} logged${cat ? ` to ${cat.name}` : ""}. Budget updated.`
        );
      } else {
        setFlash("Done ✓");
      }
      setTimeout(() => setFlash(null), 3500);
    }
    load();
  }

  async function uncomplete(t: Task) {
    const supabase = createClient();
    await supabase.rpc("uncomplete_task", { p_task_id: t.id });
    load();
  }

  function startAdd() {
    setDraft(emptyDraft(cats, accts));
    setOpen(true);
  }

  function startEdit(t: Task) {
    setDraft({
      id: t.id,
      title: t.title,
      amount: t.amount != null ? String(t.amount) : "",
      kind: t.kind,
      category_id: t.category_id ?? "",
      account_id: t.account_id ?? "",
      due_date: t.due_date ?? "",
      recurrence: t.recurrence,
    });
    setOpen(true);
  }

  async function save() {
    if (!draft || !draft.title.trim()) return;
    const amount = draft.amount ? parseFloat(draft.amount) : null;
    if (amount !== null && (isNaN(amount) || amount <= 0)) return;
    setBusy(true);
    const supabase = createClient();
    const row = {
      title: draft.title.trim(),
      amount,
      kind: draft.kind,
      category_id: amount !== null ? draft.category_id || null : draft.category_id || null,
      account_id: draft.account_id || null,
      due_date: draft.due_date || null,
      recurrence: draft.recurrence,
    };
    if (draft.id) {
      await supabase.from("tasks").update(row).eq("id", draft.id);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("tasks").insert({ ...row, user_id: user!.id });
    }
    setBusy(false);
    setOpen(false);
    load();
  }

  async function remove() {
    if (!draft?.id) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("tasks").delete().eq("id", draft.id);
    setBusy(false);
    setOpen(false);
    load();
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold">Money tasks</h1>
          <p className="muted text-sm">
            Check one off and your budget updates itself.
          </p>
        </div>
        <button className="btn btn-primary" onClick={startAdd}>
          + New
        </button>
      </div>

      {flash && (
        <div className="chip w-full justify-center !py-2.5 text-center">
          {flash}
        </div>
      )}

      {loading ? (
        <p className="faint mt-6 text-center text-sm">Loading…</p>
      ) : pending.length === 0 && completed.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="muted mt-2 text-sm">
            No tasks yet. Try “Pay credit card — $500, monthly” and watch it
            book itself when you complete it.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-2 lg:grid-cols-2">
            {pending.map((t) => {
              const cat = t.category_id ? catById.get(t.category_id) : null;
              const overdue = t.due_date && t.due_date < todayISO();
              return (
                <div key={t.id} className="card flex items-center gap-3 p-4">
                  <button
                    onClick={() => complete(t)}
                    aria-label={`Complete ${t.title}`}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2"
                    style={{ borderColor: "var(--mint)" }}
                  />
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => startEdit(t)}
                  >
                    <p className="truncate text-sm font-medium">{t.title}</p>
                    <p
                      className="text-xs"
                      style={{
                        color: overdue ? "var(--over)" : "var(--text-faint)",
                      }}
                    >
                      {cat && `${cat.name} · `}
                      {t.due_date
                        ? `${overdue ? "overdue — " : ""}${shortDate(t.due_date)}`
                        : "no date"}
                      {t.recurrence !== "none" &&
                        ` · ${recurrenceLabels[t.recurrence].toLowerCase()}`}
                    </p>
                  </button>
                  {t.amount != null && (
                    <span className="chip shrink-0">{money(t.amount)}</span>
                  )}
                </div>
              );
            })}
          </div>

          {completed.length > 0 && (
            <div>
              <p className="faint mb-2 mt-3 text-xs font-semibold uppercase tracking-wide">
                Recently completed
              </p>
              <div className="grid gap-2">
                {completed.map((t) => (
                  <div
                    key={t.id}
                    className="card-soft flex items-center gap-3 p-3 opacity-75"
                  >
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs"
                      style={{ background: "var(--mint)", color: "#06130d" }}
                    >
                      ✓
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm line-through">{t.title}</p>
                      <p className="faint text-xs">
                        {t.amount != null
                          ? `${money(t.amount)} booked`
                          : "completed"}
                      </p>
                    </div>
                    <button
                      className="faint text-xs underline underline-offset-4"
                      onClick={() => uncomplete(t)}
                    >
                      Undo
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={draft?.id ? "Edit task" : "New money task"}
      >
        {draft && (
          <div className="grid gap-4">
            <div>
              <label className="label">What needs to happen?</label>
              <input
                className="input"
                placeholder="e.g. Pay credit card"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            <div>
              <label className="label">
                Amount — optional. With an amount, completing the task records
                it and updates your budget.
              </label>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              />
            </div>
            {draft.amount && (
              <div className="grid grid-cols-2 gap-2">
                {(["expense", "income"] as Kind[]).map((k) => (
                  <button
                    key={k}
                    className={`btn ${draft.kind === k ? "btn-primary" : "btn-ghost"}`}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        kind: k,
                        category_id: cats.find((c) => c.kind === k)?.id ?? "",
                      })
                    }
                  >
                    {k === "expense" ? "Expense" : "Income"}
                  </button>
                ))}
              </div>
            )}
            <div>
              <label className="label">Category</label>
              <CategorySelect
                cats={cats}
                kind={draft.kind}
                value={draft.category_id}
                onChange={(id) => setDraft({ ...draft, category_id: id })}
                allowEmpty
              />
            </div>
            {accts.length > 0 && draft.amount && (
              <div>
                <label className="label">Account</label>
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
                <label className="label">Due date</label>
                <input
                  className="input"
                  type="date"
                  value={draft.due_date}
                  onChange={(e) =>
                    setDraft({ ...draft, due_date: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="label">Repeats</label>
                <select
                  className="input"
                  value={draft.recurrence}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      recurrence: e.target.value as Recurrence,
                    })
                  }
                >
                  {(
                    Object.entries(recurrenceLabels) as [Recurrence, string][]
                  ).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? "Saving…" : draft.id ? "Save changes" : "Create task"}
            </button>
            {draft.id && (
              <button className="btn btn-danger" onClick={remove} disabled={busy}>
                Delete task
              </button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense>
      <TasksInner />
    </Suspense>
  );
}
