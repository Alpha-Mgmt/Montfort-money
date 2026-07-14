"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FrequencyPicker } from "@/components/FrequencyPicker";
import { Wordmark } from "@/components/Logo";
import { monthStartISO, todayISO } from "@/lib/format";
import type { Category, Frequency } from "@/lib/types";

type AcctType = "cash" | "checking" | "savings" | "credit" | "loan" | "other";
const acctTypes: AcctType[] = ["checking", "savings", "credit", "cash", "loan", "other"];

type ExpenseRow = { name: string; amount: string; freq: Frequency; categoryId: string };
type AcctRow = { name: string; type: AcctType; dueDay: string; closeDay: string };

const STEPS = ["Welcome", "Income", "Bills", "Accounts", "Goal"];

export default function WelcomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [cats, setCats] = useState<Category[]>([]);

  // step drafts
  const [income, setIncome] = useState({
    source: "Salary",
    amount: "",
    freq: "biweekly" as Frequency,
    date: todayISO(),
  });
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [accounts, setAccounts] = useState<AcctRow[]>([
    { name: "", type: "checking", dueDay: "", closeDay: "" },
  ]);
  const [goal, setGoal] = useState({ name: "", target: "", date: "" });

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [{ data: profile }, { data: c }] = await Promise.all([
        supabase.from("profiles").select("full_name,onboarded").single(),
        supabase.from("categories").select("id,name,icon,kind,parent_id,pinned").order("name"),
      ]);
      if (profile?.onboarded) {
        router.replace("/app");
        return;
      }
      setName((profile?.full_name ?? "").split(" ")[0] ?? "");
      const categories = (c ?? []) as Category[];
      setCats(categories);
      // seed two expense rows pointed at sensible default categories
      const byName = (n: string) =>
        categories.find((x) => x.kind === "expense" && x.name.toLowerCase() === n)?.id;
      const firstExpense = categories.find((x) => x.kind === "expense")?.id ?? "";
      setExpenses([
        { name: "Rent", amount: "", freq: "monthly", categoryId: byName("housing") ?? firstExpense },
        { name: "", amount: "", freq: "monthly", categoryId: byName("subscriptions") ?? firstExpense },
      ]);
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const incomeCatId = useMemo(() => {
    const salary = cats.find((c) => c.kind === "income" && /salary/i.test(c.name));
    return salary?.id ?? cats.find((c) => c.kind === "income")?.id ?? null;
  }, [cats]);
  const expenseCats = useMemo(
    () => cats.filter((c) => c.kind === "expense"),
    [cats]
  );

  async function userId() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user!.id;
  }

  async function saveIncome() {
    const amt = parseFloat(income.amount);
    if (!amt || amt <= 0 || !incomeCatId) return;
    const supabase = createClient();
    await supabase.from("recurring_items").insert({
      user_id: await userId(),
      title: income.source.trim() || "Income",
      kind: "income",
      amount: amt,
      category_id: incomeCatId,
      account_id: null,
      frequency: income.freq,
      start_date: income.date || todayISO(),
    });
  }

  async function saveExpenses() {
    const rows = expenses.filter((e) => e.name.trim() && parseFloat(e.amount) > 0);
    if (rows.length === 0) return;
    const uid = await userId();
    const supabase = createClient();
    await supabase.from("recurring_items").insert(
      rows.map((e) => ({
        user_id: uid,
        title: e.name.trim(),
        kind: "expense",
        amount: parseFloat(e.amount),
        category_id: e.categoryId || expenseCats[0]?.id || null,
        account_id: null,
        frequency: e.freq,
        start_date: monthStartISO(),
      }))
    );
  }

  async function saveAccounts() {
    const rows = accounts.filter((a) => a.name.trim());
    if (rows.length === 0) return;
    const uid = await userId();
    const supabase = createClient();
    const day = (v: string) => {
      const n = parseInt(v, 10);
      return n >= 1 && n <= 31 ? n : null;
    };
    await supabase.from("accounts").insert(
      rows.map((a) => ({
        user_id: uid,
        name: a.name.trim(),
        type: a.type,
        payment_due_day: a.type === "credit" || a.type === "loan" ? day(a.dueDay) : null,
        statement_close_day:
          a.type === "credit" || a.type === "loan" ? day(a.closeDay) : null,
      }))
    );
  }

  async function saveGoal() {
    const target = parseFloat(goal.target);
    if (!goal.name.trim() || !target || target <= 0) return;
    const supabase = createClient();
    await supabase.from("goals").insert({
      user_id: await userId(),
      name: goal.name.trim(),
      target_amount: target,
      target_date: goal.date || null,
      saved: 0,
    });
  }

  async function finish() {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("profiles").update({ onboarded: true }).eq("id", await userId());
    router.push("/app");
    router.refresh();
  }

  async function next() {
    setBusy(true);
    try {
      if (step === 1) await saveIncome();
      if (step === 2) await saveExpenses();
      if (step === 3) await saveAccounts();
      if (step === 4) {
        await saveGoal();
        await finish();
        return;
      }
      setStep((s) => s + 1);
    } finally {
      setBusy(false);
    }
  }

  function skipStep() {
    if (step === 4) {
      finish();
      return;
    }
    setStep((s) => s + 1);
  }

  if (!ready) {
    return (
      <div
        className="fixed inset-0 z-50 grid place-items-center"
        style={{ background: "var(--bg)" }}
      >
        <p className="faint text-sm">Getting things ready…</p>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: "var(--bg)" }}
    >
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-5 py-8">
        <div className="flex items-center justify-between">
          <Wordmark />
          {step > 0 && (
            <button className="faint text-sm hover:underline" onClick={finish}>
              Skip for now
            </button>
          )}
        </div>

        {/* progress */}
        {step > 0 && (
          <div className="mt-6 flex gap-1.5">
            {STEPS.slice(1).map((_, i) => (
              <span
                key={i}
                className="h-1 flex-1 rounded-full"
                style={{
                  background:
                    i + 1 <= step ? "var(--mint)" : "var(--surface-2)",
                }}
              />
            ))}
          </div>
        )}

        <div className="card mt-6 p-6">
          {step === 0 && (
            <div className="grid gap-4">
              <span className="chip w-fit">Welcome</span>
              <h1 className="font-display text-2xl font-semibold">
                Hey {name || "there"}, let&apos;s set up your money.
              </h1>
              <p className="muted text-sm leading-relaxed">
                Two minutes to get your paycheck, your regular bills and a goal
                in — then your whole month plans itself. You can skip any step
                and add things later.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4">
              <h2 className="font-display text-xl font-semibold">
                How do you get paid?
              </h2>
              <p className="muted text-sm">
                This powers your paycheck math, runway and goals.
              </p>
              <div>
                <label className="label">Source</label>
                <input
                  className="input"
                  placeholder="e.g. Salary, My job"
                  value={income.source}
                  onChange={(e) => setIncome({ ...income, source: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Amount per paycheck</label>
                  <div className="relative">
                    <span className="faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                      $
                    </span>
                    <input
                      className="input !pl-7"
                      type="number"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={income.amount}
                      onChange={(e) => setIncome({ ...income, amount: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Next paycheck on</label>
                  <input
                    className="input"
                    type="date"
                    value={income.date}
                    onChange={(e) => setIncome({ ...income, date: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="label">How often?</label>
                <FrequencyPicker
                  value={income.freq}
                  onChange={(v) => setIncome({ ...income, freq: v as Frequency })}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4">
              <h2 className="font-display text-xl font-semibold">
                Your regular bills
              </h2>
              <p className="muted text-sm">
                Rent, subscriptions, insurance — whatever repeats. Add a few or
                skip.
              </p>
              <div className="grid gap-2">
                {expenses.map((e, i) => (
                  <div key={i} className="card-soft grid gap-2 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        className="input !flex-1 !py-1.5 text-sm"
                        placeholder="e.g. Rent"
                        value={e.name}
                        onChange={(ev) =>
                          setExpenses((xs) =>
                            xs.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x))
                          )
                        }
                      />
                      <span className="relative">
                        <span className="faint pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm">
                          $
                        </span>
                        <input
                          className="input !w-24 !py-1.5 !pl-6 !pr-2 text-sm"
                          type="number"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={e.amount}
                          onChange={(ev) =>
                            setExpenses((xs) =>
                              xs.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x))
                            )
                          }
                        />
                      </span>
                      {expenses.length > 1 && (
                        <button
                          aria-label="Remove"
                          className="faint px-1"
                          onClick={() =>
                            setExpenses((xs) => xs.filter((_, j) => j !== i))
                          }
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        className="input !flex-1 !py-1.5 text-sm"
                        value={e.categoryId}
                        onChange={(ev) =>
                          setExpenses((xs) =>
                            xs.map((x, j) => (j === i ? { ...x, categoryId: ev.target.value } : x))
                          )
                        }
                      >
                        {expenseCats.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        className="input !w-auto !py-1.5 text-sm"
                        value={e.freq}
                        onChange={(ev) =>
                          setExpenses((xs) =>
                            xs.map((x, j) =>
                              j === i ? { ...x, freq: ev.target.value as Frequency } : x
                            )
                          )
                        }
                      >
                        <option value="monthly">Monthly</option>
                        <option value="semimonthly">Twice a month</option>
                        <option value="biweekly">Every 2 weeks</option>
                        <option value="weekly">Weekly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="faint w-fit text-sm underline underline-offset-4"
                onClick={() =>
                  setExpenses((xs) => [
                    ...xs,
                    { name: "", amount: "", freq: "monthly", categoryId: expenseCats[0]?.id ?? "" },
                  ])
                }
              >
                + add another
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4">
              <h2 className="font-display text-xl font-semibold">
                Where does your money live?
              </h2>
              <p className="muted text-sm">
                Your checking, cash, credit cards. For cards, add the due and
                statement-close days so payment reminders work.
              </p>
              <div className="grid gap-2">
                {accounts.map((a, i) => (
                  <div key={i} className="card-soft grid gap-2 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        className="input !flex-1 !py-1.5 text-sm"
                        placeholder="e.g. Chase checking"
                        value={a.name}
                        onChange={(ev) =>
                          setAccounts((xs) =>
                            xs.map((x, j) => (j === i ? { ...x, name: ev.target.value } : x))
                          )
                        }
                      />
                      <select
                        className="input !w-auto !py-1.5 text-sm"
                        value={a.type}
                        onChange={(ev) =>
                          setAccounts((xs) =>
                            xs.map((x, j) =>
                              j === i ? { ...x, type: ev.target.value as AcctType } : x
                            )
                          )
                        }
                      >
                        {acctTypes.map((t) => (
                          <option key={t} value={t}>
                            {t[0].toUpperCase() + t.slice(1)}
                          </option>
                        ))}
                      </select>
                      {accounts.length > 1 && (
                        <button
                          aria-label="Remove"
                          className="faint px-1"
                          onClick={() =>
                            setAccounts((xs) => xs.filter((_, j) => j !== i))
                          }
                        >
                          ×
                        </button>
                      )}
                    </div>
                    {(a.type === "credit" || a.type === "loan") && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="input !py-1.5 text-sm"
                          type="number"
                          min="1"
                          max="31"
                          placeholder="Due day (1-31)"
                          value={a.dueDay}
                          onChange={(ev) =>
                            setAccounts((xs) =>
                              xs.map((x, j) => (j === i ? { ...x, dueDay: ev.target.value } : x))
                            )
                          }
                        />
                        <input
                          className="input !py-1.5 text-sm"
                          type="number"
                          min="1"
                          max="31"
                          placeholder="Close day"
                          value={a.closeDay}
                          onChange={(ev) =>
                            setAccounts((xs) =>
                              xs.map((x, j) => (j === i ? { ...x, closeDay: ev.target.value } : x))
                            )
                          }
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                className="faint w-fit text-sm underline underline-offset-4"
                onClick={() =>
                  setAccounts((xs) => [
                    ...xs,
                    { name: "", type: "checking", dueDay: "", closeDay: "" },
                  ])
                }
              >
                + add another
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-4">
              <h2 className="font-display text-xl font-semibold">
                Set a goal (optional)
              </h2>
              <p className="muted text-sm">
                A house, a car, a trip. I&apos;ll show you exactly what each
                paycheck needs to give.
              </p>
              <div>
                <label className="label">What are you saving for?</label>
                <input
                  className="input"
                  placeholder="e.g. House down payment"
                  value={goal.name}
                  onChange={(e) => setGoal({ ...goal, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Target amount</label>
                  <div className="relative">
                    <span className="faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
                      $
                    </span>
                    <input
                      className="input !pl-7"
                      type="number"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={goal.target}
                      onChange={(e) => setGoal({ ...goal, target: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">By when?</label>
                  <input
                    className="input"
                    type="date"
                    value={goal.date}
                    onChange={(e) => setGoal({ ...goal, date: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}

          {/* footer */}
          <div className="mt-6 flex items-center justify-between gap-3">
            {step === 0 ? (
              <button className="faint text-sm hover:underline" onClick={finish}>
                Skip setup
              </button>
            ) : (
              <button
                className="faint text-sm hover:underline"
                onClick={skipStep}
                disabled={busy}
              >
                Skip this
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={step === 0 ? () => setStep(1) : next}
              disabled={busy}
            >
              {busy
                ? "Saving…"
                : step === 0
                  ? "Get started"
                  : step === 4
                    ? "Finish"
                    : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
