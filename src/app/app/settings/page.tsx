"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { buildCategoryTree, fetchAccounts, fetchCategories } from "@/lib/data";
import { Sheet } from "@/components/Sheet";
import type { Account, Category, Kind } from "@/lib/types";

const accountTypes: Account["type"][] = [
  "cash",
  "checking",
  "savings",
  "credit",
  "loan",
  "other",
];

export default function SettingsPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accts, setAccts] = useState<Account[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [showDebts, setShowDebts] = useState(true);
  const [showInvs, setShowInvs] = useState(true);

  const [acctOpen, setAcctOpen] = useState(false);
  const [acctDraft, setAcctDraft] = useState<{
    id?: string;
    name: string;
    type: Account["type"];
    payment_due_day: string;
    statement_close_day: string;
  } | null>(null);

  const [catOpen, setCatOpen] = useState(false);
  const [catDraft, setCatDraft] = useState<{
    name: string;
    icon: string;
    kind: Kind;
    parent_id: string;
  } | null>(null);

  // danger zone
  const [resetMonth, setResetMonth] = useState(() =>
    new Date().toISOString().slice(0, 7)
  );
  const [armMonth, setArmMonth] = useState(false);
  const [armAll, setArmAll] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

  async function load() {
    const supabase = createClient();
    const [{ data: profile }, { data: userData }, a, c] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name,show_debts,show_investments")
        .single(),
      supabase.auth.getUser(),
      fetchAccounts(),
      fetchCategories(),
    ]);
    setName(profile?.full_name ?? "");
    setShowDebts(profile?.show_debts ?? true);
    setShowInvs(profile?.show_investments ?? true);
    setEmail(userData.user?.email ?? "");
    setAccts(a);
    setCats(c);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleSection(
    field: "show_debts" | "show_investments",
    value: boolean
  ) {
    if (field === "show_debts") setShowDebts(value);
    else setShowInvs(value);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase
      .from("profiles")
      .update({ [field]: value })
      .eq("id", user!.id);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function saveAccount() {
    if (!acctDraft?.name.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const day = (v: string) => {
      const n = parseInt(v, 10);
      return n >= 1 && n <= 31 ? n : null;
    };
    const row = {
      name: acctDraft.name.trim(),
      type: acctDraft.type,
      payment_due_day: day(acctDraft.payment_due_day),
      statement_close_day: day(acctDraft.statement_close_day),
    };
    if (acctDraft.id) {
      await supabase.from("accounts").update(row).eq("id", acctDraft.id);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("accounts").insert({ ...row, user_id: user!.id });
    }
    setBusy(false);
    setAcctOpen(false);
    load();
  }

  async function archiveAccount() {
    if (!acctDraft?.id) return;
    setBusy(true);
    const supabase = createClient();
    await supabase
      .from("accounts")
      .update({ archived: true })
      .eq("id", acctDraft.id);
    setBusy(false);
    setAcctOpen(false);
    load();
  }

  async function saveCategory() {
    if (!catDraft?.name.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("categories").insert({
      user_id: user!.id,
      name: catDraft.name.trim(),
      icon: "",
      kind: catDraft.kind,
      parent_id: catDraft.parent_id || null,
    });
    setBusy(false);
    setCatOpen(false);
    load();
  }

  async function deleteCategory(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      setResetMsg(`Couldn't delete that category: ${error.message}`);
      return;
    }
    load();
  }

  async function clearMonth() {
    if (!armMonth) {
      setArmMonth(true);
      setTimeout(() => setArmMonth(false), 5000);
      return;
    }
    setArmMonth(false);
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const from = `${resetMonth}-01`;
    const [y, m] = resetMonth.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    await supabase
      .from("transactions")
      .delete()
      .eq("user_id", user!.id)
      .gte("tx_date", from)
      .lt("tx_date", next);
    await supabase
      .from("budgets")
      .delete()
      .eq("user_id", user!.id)
      .eq("month", from);
    setBusy(false);
    setResetMsg(`Cleared ${resetMonth} — transactions and plans for that month are gone.`);
  }

  async function resetEverything() {
    if (!armAll) {
      setArmAll(true);
      setTimeout(() => setArmAll(false), 5000);
      return;
    }
    setArmAll(false);
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const uid = user!.id;
    // order matters: transactions first (they link to everything else)
    for (const t of [
      "transactions",
      "tasks",
      "recurring_items",
      "budgets",
      "debts",
      "investments",
      "goals",
    ]) {
      await supabase.from(t).delete().eq("user_id", uid);
    }
    setBusy(false);
    setResetMsg("Everything wiped — categories and accounts kept. Fresh start.");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <h1 className="font-display text-2xl font-semibold lg:col-span-2">
        More
      </h1>

      {/* Profile */}
      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">
          Account
        </p>
        <p className="mt-2 font-medium">{name || "—"}</p>
        <p className="muted text-sm">{email}</p>
        <button className="btn btn-ghost mt-4" onClick={signOut}>
          Sign out
        </button>
      </div>

      {/* Home sections */}
      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">
          Home sections
        </p>
        <p className="muted mt-1 text-sm">
          Hide what you don't use — bring it back anytime.
        </p>
        <div className="mt-3 grid gap-2">
          {(
            [
              ["Debts", "show_debts", showDebts],
              ["Investments", "show_investments", showInvs],
            ] as const
          ).map(([label, field, value]) => (
            <div key={field} className="flex items-center justify-between">
              <span className="text-sm font-medium">{label}</span>
              <button
                role="switch"
                aria-checked={value}
                aria-label={`Toggle ${label}`}
                onClick={() => toggleSection(field, !value)}
                className="relative h-6 w-11 rounded-full transition-colors"
                style={{
                  background: value ? "var(--mint)" : "var(--surface-2)",
                }}
              >
                <span
                  className="absolute top-0.5 h-5 w-5 rounded-full transition-all"
                  style={{
                    left: value ? "1.4rem" : "0.15rem",
                    background: value ? "#06130d" : "var(--text-faint)",
                  }}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Accounts */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <p className="faint text-xs font-semibold uppercase tracking-wide">
            Accounts
          </p>
          <button
            className="faint text-sm"
            onClick={() => {
              setAcctDraft({
                name: "",
                type: "checking",
                payment_due_day: "",
                statement_close_day: "",
              });
              setAcctOpen(true);
            }}
          >
            + Add
          </button>
        </div>
        {accts.length === 0 ? (
          <p className="muted mt-3 text-sm">
            Add the places your money lives — cash, debit, credit card. Bank
            connections arrive in a future update; the shape is already here.
          </p>
        ) : (
          <div className="mt-3 grid gap-1">
            {accts.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setAcctDraft({
                    id: a.id,
                    name: a.name,
                    type: a.type,
                    payment_due_day: a.payment_due_day
                      ? String(a.payment_due_day)
                      : "",
                    statement_close_day: a.statement_close_day
                      ? String(a.statement_close_day)
                      : "",
                  });
                  setAcctOpen(true);
                }}
                className="flex items-center justify-between py-2 text-left text-sm"
              >
                <span className="font-medium">{a.name}</span>
                <span className="faint capitalize">
                  {a.type}
                  {a.payment_due_day && ` · due day ${a.payment_due_day}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Categories */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <p className="faint text-xs font-semibold uppercase tracking-wide">
            Categories
          </p>
          <button
            className="faint text-sm"
            onClick={() => {
              setCatDraft({ name: "", icon: "", kind: "expense", parent_id: "" });
              setCatOpen(true);
            }}
          >
            + Add
          </button>
        </div>
        {(["expense", "income"] as Kind[]).map((k) => {
          const { groups, standalone } = buildCategoryTree(cats, k);
          return (
            <div key={k} className="mt-4">
              <p className="faint text-xs font-semibold uppercase tracking-wide">
                {k === "expense" ? "Expenses" : "Income"}
              </p>
              <div className="mt-2 grid gap-2">
                {groups.map((g) => (
                  <div key={g.id} className="card-soft p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">
                        {g.name}
                      </span>
                      <button
                        aria-label={`Delete ${g.name}`}
                        className="faint"
                        onClick={() => deleteCategory(g.id)}
                      >
                        ×
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {g.children.map((c) => (
                        <span
                          key={c.id}
                          className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm"
                        >
                          {c.name}
                          <button
                            aria-label={`Delete ${c.name}`}
                            className="faint ml-0.5"
                            onClick={() => deleteCategory(c.id)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <button
                        className="faint rounded-full border px-3 py-1 text-sm"
                        onClick={() => {
                          setCatDraft({
                            name: "",
                            icon: "",
                            kind: k,
                            parent_id: g.id,
                          });
                          setCatOpen(true);
                        }}
                      >
                        + add inside
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  {standalone.map((c) => (
                    <span
                      key={c.id}
                      className="card-soft flex items-center gap-1.5 px-3 py-1.5 text-sm"
                    >
                      {c.name}
                      <button
                        aria-label={`Delete ${c.name}`}
                        className="faint ml-1"
                        onClick={() => deleteCategory(c.id)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        <p className="faint mt-3 text-xs">
          Tip: any category can become a group — just add categories inside it
          (e.g. Cars → Mercedes). Deleting a category keeps its transactions;
          they become uncategorized. Deleting a group deletes what's inside.
        </p>
      </div>

      {/* Danger zone */}
      <div className="card p-6" style={{ borderColor: "var(--over-soft)" }}>
        <p
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--over)" }}
        >
          Danger zone
        </p>

        <div className="mt-3">
          <p className="text-sm font-medium">Clear one month</p>
          <p className="muted mt-0.5 text-sm">
            Deletes every transaction and plan amount in that month so you can
            start it from zero. Debt balances and goal progress already
            recorded stay as they are.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              className="input !w-40"
              type="month"
              value={resetMonth}
              disabled={busy}
              onChange={(e) => {
                setResetMonth(e.target.value);
                setArmMonth(false);
              }}
              aria-label="Month to clear"
            />
            <button
              className={`btn ${armMonth ? "btn-danger" : "btn-ghost"}`}
              onClick={clearMonth}
              disabled={busy || !resetMonth}
            >
              {armMonth ? "Tap again to confirm" : "Clear month"}
            </button>
          </div>
        </div>

        <div className="divider mt-4 pt-4">
          <p className="text-sm font-medium">Reset everything</p>
          <p className="muted mt-0.5 text-sm">
            Wipes all transactions, plans, debts, investments, goals and tasks.
            Your categories, accounts and login stay. This can't be undone.
          </p>
          <button
            className={`btn mt-2 ${armAll ? "btn-danger" : "btn-ghost"}`}
            onClick={resetEverything}
            disabled={busy}
          >
            {armAll ? "Tap again to wipe it all" : "Reset everything"}
          </button>
        </div>

        {resetMsg && (
          <p className="mt-3 text-sm" style={{ color: "var(--mint)" }}>
            {resetMsg}
          </p>
        )}
      </div>

      {/* About */}
      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">
          About
        </p>
        <p className="muted mt-2 text-sm leading-relaxed">
          Montfort Money · private beta. Tip: on iPhone, open this site in
          Safari and use Share → “Add to Home Screen” to install it like an
          app.
        </p>
      </div>

      {/* Account sheet */}
      <Sheet
        open={acctOpen}
        onClose={() => setAcctOpen(false)}
        title={acctDraft?.id ? "Edit account" : "Add account"}
      >
        {acctDraft && (
          <div className="grid gap-4">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                placeholder="e.g. Chase checking"
                value={acctDraft.name}
                onChange={(e) =>
                  setAcctDraft({ ...acctDraft, name: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label">Type</label>
              <select
                className="input"
                value={acctDraft.type}
                onChange={(e) =>
                  setAcctDraft({
                    ...acctDraft,
                    type: e.target.value as Account["type"],
                  })
                }
              >
                {accountTypes.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            {(acctDraft.type === "credit" || acctDraft.type === "loan") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Payment due day (1-31)</label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="31"
                    placeholder="e.g. 15"
                    value={acctDraft.payment_due_day}
                    onChange={(e) =>
                      setAcctDraft({
                        ...acctDraft,
                        payment_due_day: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">Statement close day</label>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="31"
                    placeholder="e.g. 21"
                    value={acctDraft.statement_close_day}
                    onChange={(e) =>
                      setAcctDraft({
                        ...acctDraft,
                        statement_close_day: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            )}
            <button
              className="btn btn-primary"
              onClick={saveAccount}
              disabled={busy}
            >
              {busy ? "Saving…" : "Save"}
            </button>
            {acctDraft.id && (
              <button
                className="btn btn-danger"
                onClick={archiveAccount}
                disabled={busy}
              >
                Archive account
              </button>
            )}
          </div>
        )}
      </Sheet>

      {/* Category sheet */}
      <Sheet
        open={catOpen}
        onClose={() => setCatOpen(false)}
        title="Add category"
      >
        {catDraft && (
          <div className="grid gap-4">
            <div>
              <label className="label">Name</label>
              <input
                className="input"
                placeholder="e.g. Travel"
                value={catDraft.name}
                onChange={(e) =>
                  setCatDraft({ ...catDraft, name: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["expense", "income"] as Kind[]).map((k) => (
                <button
                  key={k}
                  className={`btn ${catDraft.kind === k ? "btn-primary" : "btn-ghost"}`}
                  onClick={() =>
                    setCatDraft({ ...catDraft, kind: k, parent_id: "" })
                  }
                >
                  {k === "expense" ? "Expense" : "Income"}
                </button>
              ))}
            </div>
            <div>
              <label className="label">
                Inside a group — optional (e.g. Mercedes inside Cars)
              </label>
              <select
                className="input"
                value={catDraft.parent_id}
                onChange={(e) =>
                  setCatDraft({ ...catDraft, parent_id: e.target.value })
                }
              >
                <option value="">Top level (it can be a group itself)</option>
                {cats
                  .filter((c) => c.kind === catDraft.kind && !c.parent_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <button
              className="btn btn-primary"
              onClick={saveCategory}
              disabled={busy}
            >
              {busy ? "Saving…" : "Add category"}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
