"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchBizTx, fetchCounterparties, fetchInvoices, uid, type BizTx, type Counterparty } from "@/lib/bizdata";
import type { Invoice } from "@/lib/cashflow";
import { normalizeMerchant } from "@/lib/subscriptions";
import { money, todayISO } from "@/lib/format";
import { useApp } from "@/lib/i18n";
import { Sheet } from "@/components/Sheet";

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function Counterparties() {
  const { t } = useApp();
  const year = todayISO().slice(0, 4);
  const [cps, setCps] = useState<Counterparty[] | null>(null);
  const [inv, setInv] = useState<Invoice[]>([]);
  const [txs, setTxs] = useState<BizTx[]>([]);
  const [draft, setDraft] = useState<(Partial<Counterparty> & { kind: "client" | "vendor" }) | null>(null);

  async function load() {
    const [c, i, tx] = await Promise.all([
      fetchCounterparties(),
      fetchInvoices(),
      fetchBizTx(`${year}-01-01`, `${Number(year) + 1}-01-01`),
    ]);
    setCps(c);
    setInv(i);
    setTxs(tx);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clients = useMemo(
    () =>
      (cps ?? [])
        .filter((c) => c.kind === "client")
        .map((c) => {
          const mine = inv.filter((i) => i.client_id === c.id && i.status !== "void" && i.issue_date.startsWith(year));
          const paid = txs.filter((x) => x.kind === "income" && x.counterparty_id === c.id).reduce((a, x) => a + x.amount, 0);
          const open = mine.filter((i) => i.status === "sent").reduce((a, i) => a + i.amount, 0);
          return { ...c, paid, open, count: mine.length };
        })
        .sort((a, b) => b.paid + b.open - (a.paid + a.open)),
    [cps, inv, txs, year]
  );
  const vendors = useMemo(
    () =>
      (cps ?? [])
        .filter((c) => c.kind === "vendor")
        .map((c) => {
          const mine = txs.filter((x) => x.kind === "expense" && x.counterparty_id === c.id);
          return { ...c, spent: mine.reduce((a, x) => a + x.amount, 0), count: mine.length };
        })
        .sort((a, b) => b.spent - a.spent),
    [cps, txs]
  );
  const totalIncome = clients.reduce((a, c) => a + c.paid, 0) || 1;

  // spending with a merchant name but no vendor yet → suggestions
  const suggestions = useMemo(() => {
    const m = new Map<string, { name: string; ids: string[]; total: number }>();
    for (const x of txs) {
      if (x.kind !== "expense" || x.counterparty_id || !x.note) continue;
      const key = normalizeMerchant(x.note);
      if (!key) continue;
      const g = m.get(key) ?? { name: title(key), ids: [], total: 0 };
      g.ids.push(x.id);
      g.total += x.amount;
      m.set(key, g);
    }
    return [...m.values()].filter((g) => g.ids.length >= 2).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [txs]);

  async function save() {
    if (!draft?.name?.trim()) return;
    const supabase = createClient();
    const row = {
      kind: draft.kind,
      name: draft.name.trim(),
      email: draft.email?.trim() || null,
      phone: draft.phone?.trim() || null,
      notes: draft.notes?.trim() || null,
    };
    if (draft.id) await supabase.from("counterparties").update(row).eq("id", draft.id);
    else await supabase.from("counterparties").insert({ ...row, user_id: await uid() });
    setDraft(null);
    load();
  }

  async function archive() {
    if (!draft?.id) return;
    await createClient().from("counterparties").update({ archived: true }).eq("id", draft.id);
    setDraft(null);
    load();
  }

  async function adopt(g: { name: string; ids: string[] }) {
    const supabase = createClient();
    const { data } = await supabase
      .from("counterparties")
      .insert({ user_id: await uid(), kind: "vendor", name: g.name })
      .select("id")
      .single();
    if (data?.id) await supabase.from("transactions").update({ counterparty_id: data.id }).in("id", g.ids);
    load();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Clients")} · {year}</p>
          <button className="btn btn-ghost !px-3 !py-1 text-xs" onClick={() => setDraft({ kind: "client" })}>
            {t("+ Add")}
          </button>
        </div>
        {clients.length === 0 ? (
          <p className="muted mt-3 text-sm">{cps ? t("No clients yet. They're also created when you make an invoice.") : t("Loading…")}</p>
        ) : (
          <div className="mt-3 grid gap-3">
            {clients.map((c) => (
              <button key={c.id} className="text-left" onClick={() => setDraft(c)}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="tabular-nums">
                    {money(c.paid)}
                    {c.open > 0 && <span className="faint"> · {t("{amt} open", { amt: money(c.open) })}</span>}
                  </span>
                </div>
                <div className="progress-track mt-1">
                  <div className="progress-fill" style={{ width: `${(c.paid / totalIncome) * 100}%`, background: "var(--chart-income)" }} />
                </div>
                <p className="faint mt-0.5 text-[11px]">
                  {t("{pct}% of collected income", { pct: Math.round((c.paid / totalIncome) * 100) })}
                </p>
              </button>
            ))}
          </div>
        )}
        {clients.length > 0 && clients[0].paid / totalIncome > 0.5 && (
          <p className="mt-4 rounded-2xl p-3 text-xs" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
            {t("More than half your income comes from one client. Worth diversifying.")}
          </p>
        )}
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between">
          <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Vendors")} · {year}</p>
          <button className="btn btn-ghost !px-3 !py-1 text-xs" onClick={() => setDraft({ kind: "vendor" })}>
            {t("+ Add")}
          </button>
        </div>
        {vendors.length === 0 ? (
          <p className="muted mt-3 text-sm">{cps ? t("No vendors yet.") : t("Loading…")}</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {vendors.map((v) => (
              <button key={v.id} className="flex items-center justify-between text-left text-sm" onClick={() => setDraft(v)}>
                <span className="font-medium">{v.name}</span>
                <span className="tabular-nums">
                  {money(v.spent)} <span className="faint">· {v.count}×</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {suggestions.length > 0 && (
          <>
            <div className="divider my-4" />
            <p className="faint text-xs">{t("Found in your expenses — make them vendors to track them:")}</p>
            <div className="mt-2 grid gap-2">
              {suggestions.map((g) => (
                <div key={g.name} className="flex items-center justify-between text-sm">
                  <span>
                    {g.name} <span className="faint">· {money(g.total)}</span>
                  </span>
                  <button className="btn btn-ghost !px-3 !py-0.5 text-xs" onClick={() => adopt(g)}>
                    {t("+ Vendor")}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Sheet
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? draft.name ?? "" : draft?.kind === "vendor" ? t("New vendor") : t("New client")}
      >
        {draft && (
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="label">{t("Name")}</span>
              <input className="input" value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1">
                <span className="label">Email</span>
                <input className="input" type="email" value={draft.email ?? ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </label>
              <label className="grid gap-1">
                <span className="label">{t("Phone")}</span>
                <input className="input" value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </label>
            </div>
            <label className="grid gap-1">
              <span className="label">{t("Note")}</span>
              <input className="input" value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
            </label>
            <button className="btn btn-primary" onClick={save} disabled={!draft.name?.trim()}>
              {t("Save")}
            </button>
            {draft.id && (
              <button className="btn btn-ghost" onClick={archive}>
                {t("Archive")}
              </button>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}
