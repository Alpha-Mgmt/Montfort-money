"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/Logo";
import { monthStartISO, todayISO } from "@/lib/format";
import type { Category, Frequency } from "@/lib/types";

type Line = { name: string; amount: string; freq: Frequency };
type CatBlock = { name: string; lines: Line[] };
type DebtRow = { name: string; balance: string; apr: string; payment: string; dueDay: string };
type InvRow = { name: string; balance: string; apr: string; monthly: string };

const STEPS = ["Welcome", "Income", "Expenses", "Debts", "Investments", "Goal"];

const freqOptions: { v: Frequency; label: string }[] = [
  { v: "monthly", label: "Monthly" },
  { v: "semimonthly", label: "Twice a month" },
  { v: "biweekly", label: "Every 2 weeks" },
  { v: "weekly", label: "Weekly" },
  { v: "yearly", label: "Yearly" },
  { v: "once", label: "One-time" },
];

const emptyLine = (): Line => ({ name: "", amount: "", freq: "monthly" });
const emptyBlock = (): CatBlock => ({ name: "", lines: [emptyLine()] });

// ---------- small building blocks (module-level so inputs keep focus) ----------

function MoneyInput({
  value,
  onChange,
  placeholder = "0.00",
  w = "!w-24",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  w?: string;
}) {
  return (
    <span className="relative">
      <span className="faint pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm">
        $
      </span>
      <input
        className={`input ${w} !py-1.5 !pl-6 !pr-2 text-sm`}
        type="number"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </span>
  );
}

function CategoryLinesBuilder({
  kind,
  blocks,
  setBlocks,
}: {
  kind: "income" | "expense";
  blocks: CatBlock[];
  setBlocks: (b: CatBlock[]) => void;
}) {
  const catPlaceholder = kind === "income" ? "e.g. IBM, My business, Rentals" : "e.g. Housing, Cars, Subscriptions";
  const linePlaceholder = kind === "income" ? "e.g. Salary, Bonus, PTO" : "e.g. Rent, Netflix";

  const setBlock = (i: number, patch: Partial<CatBlock>) =>
    setBlocks(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const setLine = (i: number, k: number, patch: Partial<Line>) =>
    setBlock(i, {
      lines: blocks[i].lines.map((l, m) => (m === k ? { ...l, ...patch } : l)),
    });

  return (
    <div className="grid gap-3">
      {blocks.map((b, i) => (
        <div key={i} className="card-soft grid gap-2 p-3">
          <div className="flex items-center gap-2">
            <input
              className="input !flex-1 !py-1.5 text-sm font-semibold"
              placeholder={catPlaceholder}
              value={b.name}
              onChange={(e) => setBlock(i, { name: e.target.value })}
            />
            {blocks.length > 1 && (
              <button
                aria-label="Remove category"
                className="faint px-1"
                onClick={() => setBlocks(blocks.filter((_, j) => j !== i))}
              >
                ×
              </button>
            )}
          </div>
          {b.name && (
            <p className="faint text-xs">Add what falls under {b.name}:</p>
          )}
          {b.lines.map((l, k) => (
            <div key={k} className="flex flex-wrap items-center gap-1.5 pl-2">
              <input
                className="input !min-w-24 !flex-1 !py-1.5 !px-2 text-sm"
                placeholder={linePlaceholder}
                value={l.name}
                onChange={(e) => setLine(i, k, { name: e.target.value })}
              />
              <MoneyInput value={l.amount} onChange={(v) => setLine(i, k, { amount: v })} />
              <select
                className="input !w-auto !py-1.5 !px-2 text-sm"
                value={l.freq}
                onChange={(e) => setLine(i, k, { freq: e.target.value as Frequency })}
              >
                {freqOptions.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </select>
              {b.lines.length > 1 && (
                <button
                  aria-label="Remove line"
                  className="faint px-1"
                  onClick={() =>
                    setBlock(i, { lines: b.lines.filter((_, m) => m !== k) })
                  }
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            className="faint w-fit pl-2 text-xs underline underline-offset-4"
            onClick={() => setBlock(i, { lines: [...b.lines, emptyLine()] })}
          >
            + add line
          </button>
        </div>
      ))}
      <button
        className="btn btn-ghost !py-1.5 !text-sm"
        onClick={() => setBlocks([...blocks, emptyBlock()])}
      >
        + add {kind === "income" ? "income source" : "category"}
      </button>
    </div>
  );
}

// ---------------------------------- page ----------------------------------

export default function WelcomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [cats, setCats] = useState<Category[]>([]);

  const [income, setIncome] = useState<CatBlock[]>([emptyBlock()]);
  const [expenses, setExpenses] = useState<CatBlock[]>([emptyBlock()]);
  const [debts, setDebts] = useState<DebtRow[]>([
    { name: "", balance: "", apr: "", payment: "", dueDay: "" },
  ]);
  const [invs, setInvs] = useState<InvRow[]>([
    { name: "", balance: "", apr: "", monthly: "" },
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
      setCats((c ?? []) as Category[]);
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function userId() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user!.id;
  }

  // reuse an existing category (seeded or made earlier) or create it
  async function saveCategoryBlocks(blocks: CatBlock[], kind: "income" | "expense") {
    const uid = await userId();
    const supabase = createClient();
    const existing = new Map<string, string>(
      cats
        .filter((c) => c.kind === kind)
        .map((c) => [c.name.trim().toLowerCase(), c.id] as [string, string])
    );
    const itemRows: any[] = [];
    for (const b of blocks) {
      const cname = b.name.trim();
      const lines = b.lines.filter((l) => l.name.trim() && parseFloat(l.amount) > 0);
      if (!cname || lines.length === 0) continue;
      let catId: string | undefined = existing.get(cname.toLowerCase());
      if (!catId) {
        const { data: created } = await supabase
          .from("categories")
          .insert({ user_id: uid, name: cname, icon: "", kind })
          .select("id")
          .single();
        const newId = created?.id as string | undefined;
        if (!newId) continue;
        catId = newId;
        existing.set(cname.toLowerCase(), newId);
      }
      if (!catId) continue;
      for (const l of lines) {
        itemRows.push({
          user_id: uid,
          title: l.name.trim(),
          kind,
          amount: parseFloat(l.amount),
          category_id: catId,
          account_id: null,
          frequency: l.freq,
          start_date: kind === "income" ? todayISO() : monthStartISO(),
        });
      }
    }
    if (itemRows.length) await supabase.from("recurring_items").insert(itemRows);
  }

  async function saveDebts() {
    const uid = await userId();
    const supabase = createClient();
    const rows = debts.filter((d) => d.name.trim() && parseFloat(d.balance) >= 0 && parseFloat(d.payment) > 0);
    if (rows.length === 0) return;
    const day = (v: string) => {
      const n = parseInt(v, 10);
      return n >= 1 && n <= 31 ? n : null;
    };
    await supabase.from("debts").insert(
      rows.map((d) => ({
        user_id: uid,
        name: d.name.trim(),
        debt_type: "credit_card",
        balance: parseFloat(d.balance) || 0,
        apr: parseFloat(d.apr) || 0,
        planned_payment: parseFloat(d.payment),
        payment_due_day: day(d.dueDay),
      }))
    );
  }

  async function saveInvestments() {
    const uid = await userId();
    const supabase = createClient();
    const rows = invs.filter((i) => i.name.trim() && parseFloat(i.balance) >= 0);
    if (rows.length === 0) return;
    await supabase.from("investments").insert(
      rows.map((i) => {
        const monthly = parseFloat(i.monthly) || 0;
        return {
          user_id: uid,
          name: i.name.trim(),
          inv_type: "brokerage",
          balance: parseFloat(i.balance) || 0,
          expected_apr: parseFloat(i.apr) || 0,
          monthly_amount: monthly > 0 ? monthly : 0,
          monthly_kind: "deposit",
        };
      })
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
      if (step === 1) await saveCategoryBlocks(income, "income");
      if (step === 2) await saveCategoryBlocks(expenses, "expense");
      if (step === 3) await saveDebts();
      if (step === 4) await saveInvestments();
      if (step === 5) {
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
    if (step === 5) {
      finish();
      return;
    }
    setStep((s) => s + 1);
  }

  if (!ready) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center" style={{ background: "var(--bg)" }}>
        <p className="faint text-sm">Getting things ready…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "var(--bg)" }}>
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-5 py-8">
        <div className="flex items-center justify-between">
          <Wordmark />
          {step > 0 && (
            <button className="faint text-sm hover:underline" onClick={finish}>
              Skip for now
            </button>
          )}
        </div>

        {step > 0 && (
          <div className="mt-6 flex gap-1.5">
            {STEPS.slice(1).map((_, i) => (
              <span
                key={i}
                className="h-1 flex-1 rounded-full"
                style={{ background: i + 1 <= step ? "var(--mint)" : "var(--surface-2)" }}
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
                A couple of minutes to get your income, bills, debts, investments
                and a goal in — then your whole month plans itself. Skip anything
                and add it later.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4">
              <h2 className="font-display text-xl font-semibold">Your income</h2>
              <p className="muted text-sm">
                Add where your money comes from — an employer, your business,
                rentals — then the pieces inside it (Salary, Bonus, PTO…). Each
                one is tracked on its own.
              </p>
              <CategoryLinesBuilder kind="income" blocks={income} setBlocks={setIncome} />
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4">
              <h2 className="font-display text-xl font-semibold">Your expenses</h2>
              <p className="muted text-sm">
                Group them how you think — a category (Housing, Cars) and the
                lines inside it (Rent, insurance, tires). Add a few or skip.
              </p>
              <CategoryLinesBuilder kind="expense" blocks={expenses} setBlocks={setExpenses} />
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4">
              <h2 className="font-display text-xl font-semibold">Debts</h2>
              <p className="muted text-sm">
                Cards and loans. I&apos;ll tell you exactly when each one dies.
                Skip if none.
              </p>
              <div className="grid gap-3">
                {debts.map((d, i) => (
                  <div key={i} className="card-soft grid gap-2 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        className="input !flex-1 !py-1.5 text-sm"
                        placeholder="e.g. Amex Gold"
                        value={d.name}
                        onChange={(e) =>
                          setDebts(debts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                        }
                      />
                      {debts.length > 1 && (
                        <button
                          aria-label="Remove"
                          className="faint px-1"
                          onClick={() => setDebts(debts.filter((_, j) => j !== i))}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="faint w-full text-xs">Balance · APR% · monthly payment · due day</span>
                      <MoneyInput
                        value={d.balance}
                        onChange={(v) => setDebts(debts.map((x, j) => (j === i ? { ...x, balance: v } : x)))}
                        placeholder="balance"
                      />
                      <input
                        className="input !w-16 !py-1.5 !px-2 text-sm"
                        type="number"
                        placeholder="APR"
                        value={d.apr}
                        onChange={(e) => setDebts(debts.map((x, j) => (j === i ? { ...x, apr: e.target.value } : x)))}
                      />
                      <MoneyInput
                        value={d.payment}
                        onChange={(v) => setDebts(debts.map((x, j) => (j === i ? { ...x, payment: v } : x)))}
                        placeholder="pay"
                      />
                      <input
                        className="input !w-16 !py-1.5 !px-2 text-sm"
                        type="number"
                        min="1"
                        max="31"
                        placeholder="day"
                        value={d.dueDay}
                        onChange={(e) => setDebts(debts.map((x, j) => (j === i ? { ...x, dueDay: e.target.value } : x)))}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="btn btn-ghost !py-1.5 !text-sm"
                onClick={() => setDebts([...debts, { name: "", balance: "", apr: "", payment: "", dueDay: "" }])}
              >
                + add debt
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-4">
              <h2 className="font-display text-xl font-semibold">Investments</h2>
              <p className="muted text-sm">
                Brokerage, retirement, crypto, a house fund. Add a monthly
                contribution if you put money in regularly. Skip if none.
              </p>
              <div className="grid gap-3">
                {invs.map((v, i) => (
                  <div key={i} className="card-soft grid gap-2 p-3">
                    <div className="flex items-center gap-2">
                      <input
                        className="input !flex-1 !py-1.5 text-sm"
                        placeholder="e.g. Charles Schwab"
                        value={v.name}
                        onChange={(e) => setInvs(invs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      />
                      {invs.length > 1 && (
                        <button
                          aria-label="Remove"
                          className="faint px-1"
                          onClick={() => setInvs(invs.filter((_, j) => j !== i))}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="faint w-full text-xs">Balance · expected return% · monthly deposit (optional)</span>
                      <MoneyInput
                        value={v.balance}
                        onChange={(val) => setInvs(invs.map((x, j) => (j === i ? { ...x, balance: val } : x)))}
                        placeholder="balance"
                      />
                      <input
                        className="input !w-16 !py-1.5 !px-2 text-sm"
                        type="number"
                        placeholder="%/yr"
                        value={v.apr}
                        onChange={(e) => setInvs(invs.map((x, j) => (j === i ? { ...x, apr: e.target.value } : x)))}
                      />
                      <MoneyInput
                        value={v.monthly}
                        onChange={(val) => setInvs(invs.map((x, j) => (j === i ? { ...x, monthly: val } : x)))}
                        placeholder="/mo"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="btn btn-ghost !py-1.5 !text-sm"
                onClick={() => setInvs([...invs, { name: "", balance: "", apr: "", monthly: "" }])}
              >
                + add investment
              </button>
            </div>
          )}

          {step === 5 && (
            <div className="grid gap-4">
              <h2 className="font-display text-xl font-semibold">Set a goal (optional)</h2>
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

          <div className="mt-6 flex items-center justify-between gap-3">
            {step === 0 ? (
              <button className="faint text-sm hover:underline" onClick={finish}>
                Skip setup
              </button>
            ) : (
              <button className="faint text-sm hover:underline" onClick={skipStep} disabled={busy}>
                Skip this
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={step === 0 ? () => setStep(1) : next}
              disabled={busy}
            >
              {busy ? "Saving…" : step === 0 ? "Get started" : step === 5 ? "Finish" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
