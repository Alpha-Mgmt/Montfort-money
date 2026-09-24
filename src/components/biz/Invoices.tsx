"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchCounterparties, fetchInvoices, uid, type Counterparty } from "@/lib/bizdata";
import { aging, expectedPayDate, type Invoice } from "@/lib/cashflow";
import { money, shortDate, todayISO } from "@/lib/format";
import { useApp } from "@/lib/i18n";
import { Sheet } from "@/components/Sheet";

type Line = { description: string; qty: string; price: string };
const num = (s: string) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);

export function Invoices() {
  const { t, lang, businessName } = useApp();
  const today = todayISO();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [clients, setClients] = useState<Counterparty[]>([]);
  const [filter, setFilter] = useState<"open" | "paid" | "all">("open");
  const [err, setErr] = useState(false);

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [clientId, setClientId] = useState("");
  const [newClient, setNewClient] = useState("");
  const [issue, setIssue] = useState(today);
  const [due, setDue] = useState(addDays(today, 15));
  const [lines, setLines] = useState<Line[]>([{ description: "", qty: "1", price: "" }]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<Invoice | null>(null);

  async function load() {
    const [inv, cps] = await Promise.all([fetchInvoices(), fetchCounterparties()]);
    const { error } = await createClient().from("invoices").select("id", { head: true, count: "exact" });
    setErr(!!error);
    setInvoices(inv);
    setClients(cps.filter((c) => c.kind === "client"));
  }
  useEffect(() => {
    load();
  }, []);

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? t("No client");
  const ag = useMemo(() => aging(invoices ?? [], today), [invoices, today]);
  const paidYear = (invoices ?? [])
    .filter((i) => i.status === "paid" && (i.paid_on ?? "").startsWith(today.slice(0, 4)))
    .reduce((a, i) => a + i.amount, 0);
  const shown = (invoices ?? []).filter((i) =>
    filter === "all" ? i.status !== "void" : filter === "open" ? i.status === "sent" || i.status === "draft" : i.status === "paid"
  );
  const total = lines.reduce((a, l) => a + num(l.qty || "1") * num(l.price), 0);

  async function startNew() {
    const { data } = await createClient().rpc("next_invoice_number");
    setEditId(null);
    setNumber(String(data ?? "INV-0001"));
    setClientId(clients[0]?.id ?? "");
    setNewClient("");
    setIssue(today);
    setDue(addDays(today, 15));
    setLines([{ description: "", qty: "1", price: "" }]);
    setNotes("");
    setOpen(true);
  }

  function startEdit(inv: Invoice) {
    setEditId(inv.id);
    setNumber(inv.number);
    setClientId(inv.client_id ?? "");
    setNewClient("");
    setIssue(inv.issue_date);
    setDue(inv.due_date ?? addDays(inv.issue_date, 30));
    setLines(
      inv.items.length
        ? inv.items.map((l) => ({ description: l.description, qty: String(l.qty), price: String(l.price) }))
        : [{ description: "", qty: "1", price: String(inv.amount) }]
    );
    setNotes(inv.notes ?? "");
    setView(null);
    setOpen(true);
  }

  async function save(status: "draft" | "sent") {
    if (total <= 0) return;
    setSaving(true);
    const supabase = createClient();
    const me = await uid();
    let cid: string | null = clientId || null;
    if (newClient.trim()) {
      const { data } = await supabase
        .from("counterparties")
        .insert({ user_id: me, kind: "client", name: newClient.trim() })
        .select("id")
        .single();
      cid = data?.id ?? null;
    }
    const row = {
      number: number.trim() || "INV",
      client_id: cid,
      issue_date: issue,
      due_date: due || null,
      items: lines
        .filter((l) => num(l.price) > 0)
        .map((l) => ({ description: l.description.trim(), qty: num(l.qty || "1"), price: num(l.price) })),
      amount: Math.round(total * 100) / 100,
      notes: notes.trim() || null,
      status,
    };
    if (editId) await supabase.from("invoices").update(row).eq("id", editId);
    else await supabase.from("invoices").insert({ ...row, user_id: me });
    setSaving(false);
    setOpen(false);
    load();
  }

  async function markPaid(inv: Invoice) {
    await createClient().rpc("mark_invoice_paid", { p_id: inv.id, p_date: today, p_lang: lang });
    setView(null);
    load();
  }
  async function markUnpaid(inv: Invoice) {
    await createClient().rpc("mark_invoice_unpaid", { p_id: inv.id });
    setView(null);
    load();
  }
  async function voidIt(inv: Invoice) {
    if (!confirm(t("Void this invoice?"))) return;
    await createClient().from("invoices").update({ status: "void" }).eq("id", inv.id);
    setView(null);
    load();
  }

  function statusChip(inv: Invoice) {
    if (inv.status === "paid") return <span className="chip !py-0 text-[11px]" style={{ color: "var(--mint)", borderColor: "var(--mint)" }}>{t("Paid")}</span>;
    if (inv.status === "draft") return <span className="chip !py-0 text-[11px]">{t("Draft")}</span>;
    const late = expectedPayDate(inv) < today;
    return (
      <span className="chip !py-0 text-[11px]" style={late ? { color: "var(--over)", borderColor: "var(--over)" } : undefined}>
        {late ? t("Overdue") : t("Sent")}
      </span>
    );
  }

  function printInvoice(inv: Invoice) {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
    const rows = (inv.items.length ? inv.items : [{ description: inv.number, qty: 1, price: inv.amount }])
      .map((l) => `<tr><td>${esc(l.description || "—")}</td><td style="text-align:right">${l.qty}</td><td style="text-align:right">${money(l.price)}</td><td style="text-align:right">${money(l.qty * l.price)}</td></tr>`)
      .join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.number)}</title>
<style>body{font-family:Inter,system-ui,sans-serif;color:#111;max-width:720px;margin:40px auto;padding:0 24px}
h1{margin:0;font-size:28px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:10px 6px;border-bottom:1px solid #ddd;font-size:14px}
th{text-align:left;color:#666;font-weight:600}.tot{font-size:20px;font-weight:700;text-align:right;margin-top:16px}.muted{color:#666;font-size:13px}</style></head>
<body><div style="display:flex;justify-content:space-between;align-items:flex-start">
<div><h1>${esc(businessName || "Invoice")}</h1><p class="muted">${esc(lang === "es" ? "Factura" : "Invoice")} ${esc(inv.number)}</p></div>
<div class="muted" style="text-align:right">${esc(lang === "es" ? "Fecha" : "Date")}: ${inv.issue_date}<br/>${esc(lang === "es" ? "Vence" : "Due")}: ${inv.due_date ?? "—"}</div></div>
<p><b>${esc(lang === "es" ? "Para" : "Bill to")}:</b> ${esc(clientName(inv.client_id))}</p>
<table><thead><tr><th>${lang === "es" ? "Descripción" : "Description"}</th><th style="text-align:right">${lang === "es" ? "Cant." : "Qty"}</th><th style="text-align:right">${lang === "es" ? "Precio" : "Price"}</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table>
<p class="tot">Total: ${money(inv.amount)}</p>${inv.notes ? `<p class="muted">${esc(inv.notes)}</p>` : ""}
<script>setTimeout(()=>window.print(),300)</script></body></html>`);
    w.document.close();
  }

  return (
    <div className="grid gap-4">
      {err && (
        <div className="card p-5 text-sm" style={{ borderColor: "var(--warn)" }}>
          {t("Invoices need a database update (migration 18). Run it in Supabase and reload.")}
        </div>
      )}
      <div className="card glow-mint grid gap-4 p-6 sm:grid-cols-4">
        <Stat label={t("Owed to you")} value={ag.total} />
        <Stat label={t("Overdue")} value={ag.d1_30 + ag.d31_60 + ag.d60plus} warn />
        <Stat label={t("61+ days late")} value={ag.d60plus} warn />
        <Stat label={t("Collected this year")} value={paidYear} good />
      </div>

      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {(
              [
                ["open", t("Unpaid")],
                ["paid", t("Paid")],
                ["all", t("All")],
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
          <button className="btn btn-primary" onClick={startNew}>
            {t("New invoice")}
          </button>
        </div>
        <div className="mt-4 grid gap-1">
          {invoices === null ? (
            <p className="faint text-sm">{t("Loading…")}</p>
          ) : shown.length === 0 ? (
            <p className="muted text-sm">{t("No invoices here yet. Create one and mark it paid when the money arrives — it's booked as income automatically.")}</p>
          ) : (
            shown.map((inv) => (
              <button
                key={inv.id}
                onClick={() => setView(inv)}
                className="flex items-center justify-between gap-3 border-b py-3 text-left text-sm last:border-0"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {clientName(inv.client_id)} <span className="faint">· {inv.number}</span>
                  </p>
                  <p className="faint text-xs">
                    {inv.status === "paid" && inv.paid_on
                      ? t("paid {d}", { d: shortDate(inv.paid_on) })
                      : t("due {d}", { d: shortDate(expectedPayDate(inv)) })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {statusChip(inv)}
                  <span className="font-semibold tabular-nums">{money(inv.amount)}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* detail */}
      <Sheet open={!!view} onClose={() => setView(null)} title={view ? `${view.number} · ${clientName(view.client_id)}` : ""}>
        {view && (
          <div className="grid gap-3 text-sm">
            <div className="flex items-center justify-between">
              {statusChip(view)}
              <span className="font-display text-2xl font-semibold">{money(view.amount)}</span>
            </div>
            <p className="muted">
              {t("Issued {a} · due {b}", { a: shortDate(view.issue_date), b: shortDate(expectedPayDate(view)) })}
            </p>
            {view.items.map((l, i) => (
              <div key={i} className="flex justify-between">
                <span>{l.description || "—"} × {l.qty}</span>
                <span className="tabular-nums">{money(l.qty * l.price)}</span>
              </div>
            ))}
            {view.status !== "paid" ? (
              <button className="btn btn-primary" onClick={() => markPaid(view)}>
                {t("Mark as paid today")}
              </button>
            ) : (
              <button className="btn btn-ghost" onClick={() => markUnpaid(view)}>
                {t("Mark as unpaid")}
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-ghost" onClick={() => printInvoice(view)}>
                {t("Print / PDF")}
              </button>
              {view.status !== "paid" && (
                <button className="btn btn-ghost" onClick={() => startEdit(view)}>
                  {t("Edit")}
                </button>
              )}
              {view.status !== "paid" && (
                <button className="btn btn-ghost" onClick={() => voidIt(view)}>
                  {t("Void")}
                </button>
              )}
            </div>
          </div>
        )}
      </Sheet>

      {/* create / edit */}
      <Sheet open={open} onClose={() => setOpen(false)} title={editId ? t("Edit invoice") : t("New invoice")}>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="label">{t("Number")}</span>
              <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} />
            </label>
            <label className="grid gap-1">
              <span className="label">{t("Client")}</span>
              <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">{t("No client")}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          </div>
          <input className="input" placeholder={t("…or type a new client")} value={newClient} onChange={(e) => setNewClient(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="label">{t("Issued")}</span>
              <input className="input w-full min-w-0" type="date" value={issue} onChange={(e) => setIssue(e.target.value)} />
            </label>
            <label className="grid gap-1">
              <span className="label">{t("Due")}</span>
              <input className="input w-full min-w-0" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
          </div>
          <p className="label">{t("Items")}</p>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_3.5rem_5.5rem] gap-2">
              <input className="input" placeholder={t("Description")} value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <input className="input" inputMode="decimal" placeholder="1" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
              <input className="input" inputMode="decimal" placeholder="$0" value={l.price} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
            </div>
          ))}
          <button className="muted justify-self-start text-sm" onClick={() => setLines([...lines, { description: "", qty: "1", price: "" }])}>
            {t("+ add line")}
          </button>
          <input className="input" placeholder={t("Notes — optional (payment instructions, thanks…)")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex items-center justify-between">
            <span className="muted text-sm">Total</span>
            <span className="font-display text-xl font-semibold">{money(total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-ghost" disabled={saving || total <= 0} onClick={() => save("draft")}>
              {t("Save draft")}
            </button>
            <button className="btn btn-primary" disabled={saving || total <= 0} onClick={() => save("sent")}>
              {saving ? "…" : t("Save as sent")}
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function Stat({ label, value, warn, good }: { label: string; value: number; warn?: boolean; good?: boolean }) {
  return (
    <div>
      <p className="faint text-xs">{label}</p>
      <p
        className="font-display text-2xl font-semibold tabular-nums"
        style={{ color: warn && value > 0 ? "var(--over)" : good ? "var(--mint)" : undefined }}
      >
        {money(value)}
      </p>
    </div>
  );
}
