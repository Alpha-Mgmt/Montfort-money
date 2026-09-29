"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { tr } from "@/lib/i18n";
import { money, todayISO, monthStartISO } from "@/lib/format";
import { fetchCategories, fetchRecurring } from "@/lib/data";
import { occurrencesInMonth } from "@/lib/recurring";
import { Sheet } from "@/components/Sheet";
import { CategorySelect } from "@/components/CategorySelect";
import type { Category, Kind, RecurringItem } from "@/lib/types";

/** Open the quick logger from anywhere: window.dispatchEvent(new Event("mf:quicklog")) */
export const openQuickLog = () => window.dispatchEvent(new Event("mf:quicklog"));

/**
 * Log money that actually moved, in two taps: amount → Save.
 * Optional: pick the plan line it belongs to (fills name + category), or a category.
 * After saving it fires "mf:changed" so open pages reload.
 */
export function QuickLog() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("expense");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [catId, setCatId] = useState("");
  const [itemId, setItemId] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const on = () => {
      setOpen(true);
      setDone(null);
      setDate(todayISO());
      Promise.all([fetchCategories(), fetchRecurring()]).then(([c, r]) => {
        setCats(c);
        const m = monthStartISO();
        setItems(r.filter((it) => it.active && occurrencesInMonth(it.frequency, it.start_date, it.end_date, m, it.schedule) > 0));
      });
      setTimeout(() => amountRef.current?.focus(), 80);
    };
    window.addEventListener("mf:quicklog", on);
    return () => window.removeEventListener("mf:quicklog", on);
  }, []);

  function reset() {
    setAmount("");
    setNote("");
    setCatId("");
    setItemId(null);
  }

  async function save() {
    const a = parseFloat(amount);
    if (!(a > 0)) {
      amountRef.current?.focus();
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("transactions").insert({
      user_id: user!.id,
      kind,
      amount: a,
      category_id: catId || null,
      tx_date: date,
      note: note.trim() || null,
      source: "manual",
      recurring_item_id: itemId,
    });
    setBusy(false);
    if (error) {
      setDone(error.message);
      return;
    }
    window.dispatchEvent(new Event("mf:changed"));
    setDone(tr(kind === "expense" ? "Saved: {amt} out" : "Saved: {amt} in", { amt: money(a) }));
    reset();
    setTimeout(() => amountRef.current?.focus(), 50);
  }

  const suggestions = items.filter((it) => it.kind === kind).slice(0, 8);
  const color = kind === "expense" ? "var(--over)" : "var(--mint)";

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title={tr("Log money")}>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: "var(--surface-2)" }}>
          {(["expense", "income"] as Kind[]).map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setCatId("");
                setItemId(null);
              }}
              className="rounded-lg py-2 text-sm font-semibold"
              style={kind === k ? { background: "var(--surface)", color: k === "expense" ? "var(--over)" : "var(--mint)", boxShadow: "0 1px 2px rgba(0,0,0,.08)" } : { color: "var(--text-soft)" }}
            >
              {k === "expense" ? tr("Money out") : tr("Money in")}
            </button>
          ))}
        </div>

        <div className="relative">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-display text-3xl font-semibold" style={{ color }}>
            $
          </span>
          <input
            ref={amountRef}
            className="input !py-3 !pl-10 font-display !text-3xl font-semibold tabnum"
            style={{ color }}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </div>

        {suggestions.length > 0 && (
          <div>
            <p className="faint mb-1.5 text-xs font-semibold">{tr("From your plan")}</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((it) => {
                const on = itemId === it.id;
                return (
                  <button
                    key={it.id}
                    onClick={() => {
                      if (on) {
                        setItemId(null);
                        return;
                      }
                      setItemId(it.id);
                      setNote(it.title);
                      setCatId(it.category_id ?? "");
                      if (!amount) setAmount(String(it.amount));
                    }}
                    className="rounded-full border px-3 py-1 text-xs font-semibold"
                    style={on ? { borderColor: color, background: kind === "expense" ? "var(--over-soft)" : "var(--mint-soft)", color } : { borderColor: "var(--border)", color: "var(--text-soft)" }}
                  >
                    {on ? "✓ " : ""}
                    {it.title} · {money(it.amount)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <input className="input" placeholder={kind === "expense" ? tr("What was it? (optional)") : tr("From where? (optional)")} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <CategorySelect cats={cats} kind={kind} value={catId} onChange={setCatId} allowEmpty emptyLabel={tr("No category")} />
          <input className="input !w-40" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {done && (
          <p className="text-xs font-semibold" style={{ color: done.startsWith(tr("Saved").slice(0, 4)) ? "var(--mint)" : "var(--over)" }}>
            {done}
          </p>
        )}

        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => setOpen(false)}>
            {tr("Close")}
          </button>
          <button className="btn btn-primary flex-[2]" onClick={save} disabled={busy}>
            {busy ? tr("Saving…") : tr("Save")}
          </button>
        </div>
        <p className="faint text-center text-[11px]">{tr("It stays open so you can log several in a row.")}</p>
      </div>
    </Sheet>
  );
}
