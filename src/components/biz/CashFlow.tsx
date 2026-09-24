"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchRecurring } from "@/lib/data";
import { fetchInvoices, uid } from "@/lib/bizdata";
import { forecastCash, type Invoice } from "@/lib/cashflow";
import type { QuarterEstimate } from "@/lib/business";
import { money, shortDate, todayISO } from "@/lib/format";
import { useApp } from "@/lib/i18n";
import type { RecurringItem } from "@/lib/types";

export function CashFlow({ quarters }: { quarters: QuarterEstimate[] }) {
  const { t } = useApp();
  const today = todayISO();
  const [cash, setCash] = useState<string>("");
  const [cashDate, setCashDate] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [recurring, setRecurring] = useState<RecurringItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openWeek, setOpenWeek] = useState<number | null>(0);

  useEffect(() => {
    (async () => {
      const [inv, rec, { data: prof }] = await Promise.all([
        fetchInvoices(),
        fetchRecurring(),
        createClient().from("profiles").select("business_cash,business_cash_date").single(),
      ]);
      setInvoices(inv);
      setRecurring(rec);
      if (prof?.business_cash != null) setCash(String(Number(prof.business_cash)));
      setCashDate(prof?.business_cash_date ?? null);
      setLoaded(true);
    })();
  }, []);

  async function saveCash() {
    const me = await uid();
    if (!me) return;
    const v = Number(cash.replace(/[^0-9.-]/g, ""));
    await createClient()
      .from("profiles")
      .update({ business_cash: isNaN(v) ? null : v, business_cash_date: today })
      .eq("id", me);
    setCashDate(today);
  }

  const start = Number(cash.replace(/[^0-9.-]/g, "")) || 0;
  const taxes = quarters
    .filter((q) => q.status !== "upcoming" || q.estimate > 0)
    .map((q) => ({ due: q.due, amount: q.estimate, label: t("Estimated taxes Q{q}", { q: q.q }) }));
  const fc = useMemo(
    () => forecastCash({ startCash: start, today, invoices, recurring, taxes }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [start, today, invoices, recurring, JSON.stringify(taxes)]
  );
  const hasNeg = fc.weeks.some((w) => w.balance < 0);
  const maxAbs = Math.max(1, ...fc.weeks.map((w) => Math.abs(w.balance)), Math.abs(start));
  const nothing = loaded && invoices.filter((i) => i.status === "sent").length === 0 && recurring.filter((r) => r.active).length === 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Cash in the business today")}</p>
        <div className="mt-3 flex items-end gap-2">
          <input
            className="input flex-1"
            inputMode="decimal"
            placeholder="$0"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            onBlur={saveCash}
          />
          <button className="btn btn-ghost" onClick={saveCash}>
            {t("Save")}
          </button>
        </div>
        <p className="faint mt-2 text-xs">
          {cashDate
            ? t("Last updated {d}. Update it now and then — it's where the forecast starts.", { d: shortDate(cashDate) })
            : t("What's in the business bank account right now. The forecast starts here.")}
        </p>
        <div className="divider my-4" />
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="muted">{t("Lowest point (13 weeks)")}</span>
            <span className="font-semibold tabular-nums" style={{ color: fc.low < 0 ? "var(--over)" : undefined }}>
              {money(fc.low)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="muted">{t("In 13 weeks")}</span>
            <span className="font-semibold tabular-nums">{money(fc.weeks[fc.weeks.length - 1]?.balance ?? start)}</span>
          </div>
        </div>
        {fc.firstNegative !== null && (
          <p className="mt-4 rounded-2xl p-3 text-sm" style={{ background: "var(--over-soft)", color: "var(--over)" }}>
            {t("Heads up: cash runs out the week of {d}. Chase an invoice, move a payment, or plan a transfer.", {
              d: shortDate(fc.weeks[fc.firstNegative].start),
            })}
          </p>
        )}
        {nothing && (
          <p className="muted mt-4 text-sm">
            {t("Add open invoices and your business's recurring income and bills (Forecast) to see what's coming.")}
          </p>
        )}
      </div>

      <div className="card p-6 lg:col-span-2">
        <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Next 13 weeks")}</p>
        <div className="mt-4 flex h-40 items-center gap-1">
          {fc.weeks.map((w, i) => {
            const h = (Math.abs(w.balance) / maxAbs) * 100; // % of each half
            const neg = w.balance < 0;
            const bar = (
              <div
                className="mx-auto w-full max-w-[28px]"
                style={{
                  height: `${h}%`,
                  borderRadius: neg ? "0 0 6px 6px" : "6px 6px 0 0",
                  background: neg ? "var(--over)" : "var(--chart-income)",
                  opacity: openWeek === i ? 1 : 0.7,
                }}
              />
            );
            return (
              <button
                key={w.start}
                className="flex h-full flex-1 flex-col"
                onClick={() => setOpenWeek(i)}
                title={`${shortDate(w.start)}: ${money(w.balance)}`}
              >
                <div
                  className={`flex w-full flex-col justify-end border-b ${hasNeg ? "h-1/2" : "h-full"}`}
                  style={{ borderColor: "var(--border)" }}
                >
                  {!neg && bar}
                </div>
                {hasNeg && <div className="flex h-1/2 w-full flex-col justify-start">{neg && bar}</div>}
              </button>
            );
          })}
        </div>
        <div className="faint mt-1 flex justify-between text-[11px]">
          <span>{shortDate(fc.weeks[0]?.start ?? today)}</span>
          <span>{shortDate(fc.weeks[fc.weeks.length - 1]?.end ?? today)}</span>
        </div>

        <div className="mt-4 grid gap-1">
          {fc.weeks.map((w, i) => (
            <div key={w.start} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
              <button className="flex w-full items-center justify-between py-2 text-sm" onClick={() => setOpenWeek(openWeek === i ? null : i)}>
                <span className="muted">
                  {t("Week of {d}", { d: shortDate(w.start) })}
                </span>
                <span className="flex gap-3 tabular-nums">
                  {w.inflow > 0 && <span style={{ color: "var(--mint)" }}>+{money(w.inflow)}</span>}
                  {w.outflow > 0 && <span className="muted">−{money(w.outflow)}</span>}
                  <span className="w-24 text-right font-semibold" style={{ color: w.balance < 0 ? "var(--over)" : undefined }}>
                    {money(w.balance)}
                  </span>
                </span>
              </button>
              {openWeek === i && w.items.length > 0 && (
                <div className="grid gap-1 pb-3 pl-3 text-xs">
                  {w.items.map((it, k) => (
                    <div key={k} className="flex justify-between">
                      <span className="faint">
                        {shortDate(it.date)} · {it.label}
                      </span>
                      <span className="tabular-nums" style={{ color: it.amount > 0 ? "var(--mint)" : undefined }}>
                        {it.amount > 0 ? "+" : "−"}
                        {money(Math.abs(it.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
