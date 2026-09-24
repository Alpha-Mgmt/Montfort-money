"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchCategories } from "@/lib/data";
import {
  fetchBizTx,
  fetchCounterparties,
  receiptUrl,
  uid,
  uploadReceipt,
  type BizTx,
  type Counterparty,
} from "@/lib/bizdata";
import { money, shortDate, todayISO } from "@/lib/format";
import { useApp } from "@/lib/i18n";
import type { Category } from "@/lib/types";

const num = (s: string) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;

export function Receipts() {
  const { t } = useApp();
  const today = todayISO();
  const year = today.slice(0, 4);
  const [txs, setTxs] = useState<BizTx[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Counterparty[]>([]);
  const [filter, setFilter] = useState<"all" | "deductible" | "missing">("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  // quick add
  const [file, setFile] = useState<File | null>(null);
  const [amt, setAmt] = useState("");
  const [date, setDate] = useState(today);
  const [catId, setCatId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [note, setNote] = useState("");
  const [deductible, setDeductible] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const [attachFor, setAttachFor] = useState<string | null>(null);

  async function load() {
    const [x, c, v] = await Promise.all([
      fetchBizTx(`${year}-01-01`, `${Number(year) + 1}-01-01`),
      fetchCategories(),
      fetchCounterparties(),
    ]);
    setTxs(x.filter((r) => r.kind === "expense"));
    setCats(c.filter((k) => k.kind === "expense"));
    setVendors(v.filter((k) => k.kind === "vendor"));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catName = (id: string | null) => cats.find((c) => c.id === id)?.name ?? t("Uncategorized");
  const vendorName = (id: string | null) => vendors.find((v) => v.id === id)?.name;
  const ded = (txs ?? []).filter((x) => x.deductible);
  const dedTotal = ded.reduce((a, x) => a + x.amount, 0);
  const missing = ded.filter((x) => !x.receipt_path);
  const shown = useMemo(
    () =>
      (txs ?? []).filter((x) =>
        filter === "all" ? true : filter === "deductible" ? x.deductible : x.deductible && !x.receipt_path
      ),
    [txs, filter]
  );

  async function quickAdd() {
    const amount = num(amt);
    if (!amount) return;
    setSaving(true);
    setMsg("");
    let path: string | null = null;
    if (file) {
      path = await uploadReceipt(file);
      if (!path) setMsg(t("The photo didn't upload (check migration 18). The expense was saved without it."));
    }
    const { error } = await createClient().from("transactions").insert({
      user_id: await uid(),
      kind: "expense",
      amount,
      tx_date: date,
      note: note.trim() || vendorName(vendorId || null) || null,
      category_id: catId || null,
      counterparty_id: vendorId || null,
      deductible,
      receipt_path: path,
      source: "manual",
    });
    setSaving(false);
    if (error) {
      setMsg(t("Couldn't save.") + " " + error.message);
      return;
    }
    setFile(null);
    setAmt("");
    setNote("");
    if (!path || !file) setMsg((m) => m || t("Saved."));
    else setMsg(t("Saved with receipt."));
    load();
  }

  async function toggleDeductible(x: BizTx) {
    setTxs((cur) => (cur ?? []).map((r) => (r.id === x.id ? { ...r, deductible: !r.deductible } : r)));
    await createClient().from("transactions").update({ deductible: !x.deductible }).eq("id", x.id);
  }

  async function attach(f: File) {
    if (!attachFor) return;
    setBusyId(attachFor);
    const path = await uploadReceipt(f);
    if (path) await createClient().from("transactions").update({ receipt_path: path }).eq("id", attachFor);
    setBusyId(null);
    setAttachFor(null);
    load();
  }

  async function view(path: string) {
    const url = await receiptUrl(path);
    if (url) window.open(url, "_blank", "noopener");
  }

  function exportCsv() {
    const rows = [
      ["Date", "Vendor / note", "Category", "Amount", "Receipt"],
      ...ded.map((x) => [
        x.tx_date,
        vendorName(x.counterparty_id) ?? x.note ?? "",
        catName(x.category_id),
        x.amount.toFixed(2),
        x.receipt_path ? "yes" : "no",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `deductible-expenses-${year}.csv`;
    a.click();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      {/* quick add with photo */}
      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Snap a receipt")}</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          className="card-soft mt-3 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-6 text-sm"
          style={{ border: "1.5px dashed var(--border)" }}
          onClick={() => fileRef.current?.click()}
        >
          {file ? file.name : t("Take photo or choose file")}
        </button>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="label">{t("Amount")}</span>
            <input className="input" inputMode="decimal" placeholder="$0" value={amt} onChange={(e) => setAmt(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="label">{t("Date")}</span>
            <input className="input w-full min-w-0" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="mt-3 grid gap-1">
          <span className="label">{t("Category")}</span>
          <select className="input" value={catId} onChange={(e) => setCatId(e.target.value)}>
            <option value="">{t("Uncategorized")}</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="mt-3 grid gap-1">
          <span className="label">{t("Vendor")}</span>
          <select className="input" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
            <option value="">—</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </label>
        <input className="input mt-3" placeholder={t("Note — optional")} value={note} onChange={(e) => setNote(e.target.value)} />
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={deductible} onChange={(e) => setDeductible(e.target.checked)} />
          {t("Tax-deductible")}
        </label>
        <button className="btn btn-primary mt-4 w-full" onClick={quickAdd} disabled={saving || !num(amt)}>
          {saving ? "…" : t("Save expense")}
        </button>
        {msg && <p className="muted mt-2 text-sm">{msg}</p>}
      </div>

      {/* list */}
      <div className="card p-6 lg:col-span-2">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="faint text-xs">{t("Deductible this year")}</p>
            <p className="font-display text-2xl font-semibold tabular-nums" style={{ color: "var(--mint)" }}>
              {money(dedTotal)}
            </p>
          </div>
          <div>
            <p className="faint text-xs">{t("Missing receipts")}</p>
            <p className="font-display text-2xl font-semibold tabular-nums" style={{ color: missing.length ? "var(--warn)" : undefined }}>
              {missing.length}
            </p>
          </div>
          <div className="flex items-end sm:justify-end">
            <button className="btn btn-ghost whitespace-nowrap !px-3 !py-1 text-xs" onClick={exportCsv} disabled={!ded.length}>
              {t("Export for my accountant (CSV)")}
            </button>
          </div>
        </div>
        <div className="mt-4 flex gap-1.5">
          {(
            [
              ["all", t("All")],
              ["deductible", t("Deductible")],
              ["missing", t("Missing receipt")],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              className="chip"
              onClick={() => setFilter(k)}
              style={filter === k ? { background: "var(--mint)", color: "#06130d", borderColor: "var(--mint)" } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          ref={attachRef}
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) attach(f);
            e.target.value = "";
          }}
        />
        <div className="mt-3 grid gap-1">
          {txs === null ? (
            <p className="faint text-sm">{t("Loading…")}</p>
          ) : shown.length === 0 ? (
            <p className="muted text-sm">{t("Nothing here.")}</p>
          ) : (
            shown.slice(0, 200).map((x) => (
              <div key={x.id} className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-0" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <p className="truncate font-medium">{vendorName(x.counterparty_id) ?? x.note ?? catName(x.category_id)}</p>
                  <p className="faint text-xs">
                    {shortDate(x.tx_date)} · {catName(x.category_id)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold tabular-nums">{money(x.amount)}</span>
                  <button
                    className="chip !py-0 text-[11px]"
                    onClick={() => toggleDeductible(x)}
                    style={x.deductible ? { color: "var(--mint)", borderColor: "var(--mint)" } : undefined}
                    title={t("Tax-deductible")}
                  >
                    {x.deductible ? t("Deductible") : t("Not deductible")}
                  </button>
                  {x.receipt_path ? (
                    <button className="btn btn-ghost !px-2.5 !py-0.5 text-xs" onClick={() => view(x.receipt_path!)}>
                      {t("View receipt")}
                    </button>
                  ) : (
                    <button
                      className="btn btn-ghost !px-2.5 !py-0.5 text-xs"
                      disabled={busyId === x.id}
                      onClick={() => {
                        setAttachFor(x.id);
                        attachRef.current?.click();
                      }}
                    >
                      {busyId === x.id ? "…" : t("+ Receipt")}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
