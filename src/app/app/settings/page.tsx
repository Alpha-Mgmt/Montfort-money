"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { buildCategoryTree, fetchAccounts, fetchCategories } from "@/lib/data";
import { Sheet } from "@/components/Sheet";
import { BankConnections } from "@/components/BankConnections";
import { MfaSetup } from "@/components/MfaSetup";
import { SpaceSwitcher, LangToggle } from "@/components/SpaceSwitcher";
import { visibleTools } from "@/components/nav-items";
import { useApp } from "@/lib/i18n";
import type { Account, Category, Kind } from "@/lib/types";
import { tr } from "@/lib/i18n";

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
  const { features, setFeature, household } = useApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accts, setAccts] = useState<Account[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    fetch("/api/admin/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setIsOwner(!!j?.owner))
      .catch(() => {});
  }, []);
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

  const [feedback, setFeedback] = useState("");
  const [fbSent, setFbSent] = useState(false);

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

  async function sendFeedback() {
    if (!feedback.trim()) return;
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user)
      await supabase.from("feedback").insert({
        user_id: user.id,
        message: feedback.trim(),
        page: "settings",
      });
    setBusy(false);
    setFeedback("");
    setFbSent(true);
  }

  async function replaySetup() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user)
      await supabase
        .from("profiles")
        .update({ onboarded: false })
        .eq("id", user.id);
    router.push("/app/welcome");
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
      setResetMsg(tr("Couldn't delete that category: {v0}", { v0: error.message }));
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
    setResetMsg(tr("Cleared {v0} — transactions and plans for that month are gone.", { v0: resetMonth }));
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
    setResetMsg(tr("Everything wiped — categories and accounts kept. Fresh start."));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <h1 className="font-display text-2xl font-semibold lg:col-span-2">
        {tr("More")}
      </h1>

      {/* Tools — on phones this is how you reach them */}
      <div className="card p-6 lg:col-span-2 lg:hidden">
        <p className="faint text-xs font-semibold uppercase tracking-wide">
          {tr("Tools")}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {visibleTools(features, !!household).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="card-soft flex items-center gap-2.5 rounded-2xl px-3 py-3 text-sm font-medium"
            >
              <span className="h-5 w-5 shrink-0 [&>svg]:h-full [&>svg]:w-full" style={{ color: "var(--mint)" }}>
                {n.icon}
              </span>
              {tr(n.label)}
            </Link>
          ))}
        </div>
      </div>

      {/* Optional features */}
      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">
          {tr("Features")}
        </p>
        <p className="muted mt-1 text-sm">
          {tr("Turn on only what you use.")}
        </p>
        <div className="mt-3 grid gap-3">
          {(
            [
              ["business", tr("Business"), tr("A separate space for your business: P&L, invoices, cash flow, receipts and taxes.")],
              ["remit", tr("Remittances"), tr("Track money you send abroad and compare providers.")],
            ] as const
          ).map(([key, label, hint]) => {
            const on = features[key];
            return (
              <div key={key} className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="faint text-xs">{hint}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={on}
                  aria-label={label}
                  onClick={() => setFeature(key, !on)}
                  className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors"
                  style={{ background: on ? "var(--mint)" : "var(--surface-2)" }}
                >
                  <span
                    className="absolute top-0.5 h-5 w-5 rounded-full transition-all"
                    style={{ left: on ? "1.4rem" : "0.15rem", background: on ? "#06130d" : "var(--text-faint)" }}
                  />
                </button>
              </div>
            );
          })}
          <Link href="/app/couple" className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{tr("Couple")}</p>
              <p className="faint text-xs">
                {household
                  ? tr("Shared with {names}.", { names: household.members.filter((m) => !m.is_me).map((m) => m.full_name).join(", ") || tr("no one yet") })
                  : tr("Invite your partner to a shared space. Your personal money stays private.")}
              </p>
            </div>
            <span className="muted text-sm">→</span>
          </Link>
        </div>
      </div>

      {/* Space + language */}
      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">
          {tr("Space")}
        </p>
        <p className="muted mt-1 text-sm">
          {tr("Keep your business money apart from your personal money. Each space has its own plan, categories and history.")}
        </p>
        <div className="mt-3 max-w-xs">
          <SpaceSwitcher />
        </div>
        <div className="divider my-4" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{tr("Language")}</span>
          <LangToggle />
        </div>
      </div>

      {isOwner && (
        <Link href="/app/admin" className="card flex items-center justify-between p-6 hover:opacity-90">
          <span>
            <span className="block font-semibold">Panel del dueño</span>
            <span className="muted text-sm">Usuarios, actividad y solicitudes de borrado</span>
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}

      <MfaSetup />

      <BankConnections />

      {/* Profile */}
      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">
          {tr("Account")}
        </p>
        <p className="mt-2 font-medium">{name || "—"}</p>
        <p className="muted text-sm">{email}</p>
        <button className="btn btn-ghost mt-4" onClick={signOut}>
          {tr("Sign out")}
        </button>
      </div>

      {/* Home sections */}
      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">
          {tr("Home sections")}
        </p>
        <p className="muted mt-1 text-sm">
          {tr("Hide what you don't use — bring it back anytime.")}
        </p>
        <div className="mt-3 grid gap-2">
          {(
            [
              ["Debts", "show_debts", showDebts],
              ["Investments", "show_investments", showInvs],
            ] as const
          ).map(([label, field, value]) => (
            <div key={field} className="flex items-center justify-between">
              <span className="text-sm font-medium">{tr(label)}</span>
              <button
                role="switch"
                aria-checked={value}
                aria-label={tr("Toggle {v0}", { v0: label })}
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

      {/* Accounts — hidden until bank connections (Plaid/Belvo) arrive */}

      {/* Danger zone */}
      <div className="card p-6" style={{ borderColor: "var(--over-soft)" }}>
        <p
          className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--over)" }}
        >
          {tr("Danger zone")}
        </p>

        <div className="mt-3">
          <p className="text-sm font-medium">{tr("Reset everything")}</p>
          <p className="muted mt-0.5 text-sm">
            {tr("Wipes all transactions, plans, debts, investments, goals and tasks. Your categories, accounts and login stay. This can't be undone.")}
          </p>
          <button
            className={`btn mt-2 ${armAll ? "btn-danger" : "btn-ghost"}`}
            onClick={resetEverything}
            disabled={busy}
          >
            {armAll ? tr("Tap again to wipe it all") : tr("Reset everything")}
          </button>
        </div>

        {resetMsg && (
          <p className="mt-3 text-sm" style={{ color: "var(--mint)" }}>
            {resetMsg}
          </p>
        )}
      </div>

      {/* Feedback */}
      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">
          {tr("Suggestions")}
        </p>
        <p className="muted mt-1 text-sm">
          {tr("We're building Montfort Money with you — this is the moment your ideas shape it most. What would make it better?")}
        </p>
        {fbSent ? (
          <p className="mt-3 text-sm" style={{ color: "var(--mint)" }}>
            {tr("Got it — thank you. Tell us more anytime.")}
          </p>
        ) : (
          <div className="mt-3 grid gap-2">
            <textarea
              className="input min-h-20"
              placeholder={tr("A feature you want, something confusing, anything…")}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <button
              className="btn btn-primary w-fit"
              onClick={sendFeedback}
              disabled={busy || !feedback.trim()}
            >
              {busy ? tr("Sending…") : tr("Send suggestion")}
            </button>
          </div>
        )}
      </div>

      {/* About */}
      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">
          {tr("About")}
        </p>
        <p className="muted mt-2 text-sm leading-relaxed">
          {tr("Montfort Money · early access. Tip: on iPhone, open this site in Safari and use Share → “Add to Home Screen” to install it like an app.")}
        </p>
        <div className="faint mt-3 flex gap-4 text-sm">
          <Link href="/privacy" className="hover:underline">
            {tr("Privacy")}
          </Link>
          <Link href="/terms" className="hover:underline">
            {tr("Terms")}
          </Link>
        </div>
        <button className="btn btn-ghost mt-4" onClick={replaySetup}>
          {tr("Replay setup")}
        </button>
      </div>

      {/* Account sheet */}
      <Sheet
        open={acctOpen}
        onClose={() => setAcctOpen(false)}
        title={acctDraft?.id ? tr("Edit account") : tr("Add account")}
      >
        {acctDraft && (
          <div className="grid gap-4">
            <div>
              <label className="label">{tr("Name")}</label>
              <input
                className="input"
                placeholder={tr("e.g. Chase checking")}
                value={acctDraft.name}
                onChange={(e) =>
                  setAcctDraft({ ...acctDraft, name: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label">{tr("Type")}</label>
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
                    {tr(t[0].toUpperCase() + t.slice(1))}
                  </option>
                ))}
              </select>
            </div>
            {(acctDraft.type === "credit" || acctDraft.type === "loan") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{tr("Payment due day (1-31)")}</label>
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
                  <label className="label">{tr("Statement close day")}</label>
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
              {busy ? tr("Saving…") : tr("Save")}
            </button>
            {acctDraft.id && (
              <button
                className="btn btn-danger"
                onClick={archiveAccount}
                disabled={busy}
              >
                {tr("Archive account")}
              </button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
