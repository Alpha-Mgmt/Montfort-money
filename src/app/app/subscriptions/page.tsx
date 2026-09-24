"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchCategories, fetchRecurring, fetchTransactionsRange } from "@/lib/data";
import { detectSubscriptions, type Subscription } from "@/lib/subscriptions";
import { money, shortDate, todayISO } from "@/lib/format";
import { useApp } from "@/lib/i18n";

export default function SubscriptionsPage() {
  const { t, space } = useApp();
  const today = todayISO();
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  async function load() {
    const d = new Date();
    d.setMonth(d.getMonth() - 13);
    const from = d.toISOString().slice(0, 10);
    const [txs, rec, cats] = await Promise.all([
      fetchTransactionsRange(from, "9999-12-31"),
      fetchRecurring(),
      fetchCategories(),
    ]);
    setSubs(detectSubscriptions(txs, rec, cats, today));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = useMemo(() => (subs ?? []).filter((s) => !s.stale), [subs]);
  const stale = useMemo(() => (subs ?? []).filter((s) => s.stale), [subs]);
  const perMonth = active.reduce((a, s) => a + s.perMonth, 0);
  const perYear = active.reduce((a, s) => a + s.perYear, 0);

  async function addToPlan(s: Subscription) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("recurring_items").insert({
      user_id: user!.id,
      title: s.name,
      kind: "expense",
      amount: s.amount,
      category_id: s.categoryId,
      account_id: null,
      frequency: s.cadence,
      start_date: s.nextDate ?? today,
    });
    setDone({ ...done, [s.key]: error ? t("Couldn't save.") : t("Added to your plan") });
  }

  async function remindCancel(s: Subscription) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let due = today;
    if (s.nextDate) {
      const d = new Date(Date.parse(s.nextDate) - 2 * 86_400_000).toISOString().slice(0, 10);
      due = d > today ? d : today;
    }
    const { error } = await supabase.from("tasks").insert({
      user_id: user!.id,
      title: t("Cancel {name}", { name: s.name }),
      kind: "expense",
      amount: null,
      category_id: null,
      account_id: null,
      due_date: due,
      recurrence: "none",
    });
    setDone({ ...done, [s.key]: error ? t("Couldn't save.") : t("Reminder added to Tasks") });
  }

  const cadenceLabel = (c: Subscription["cadence"]) =>
    c === "weekly" ? t("weekly") : c === "yearly" ? t("yearly") : t("monthly");

  const Row = ({ s }: { s: Subscription }) => (
    <div className="card-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
      <div className="min-w-0">
        <p className="font-semibold">
          {s.name}
          {s.priceUp && (
            <span className="chip ml-2 !py-0 text-[11px]" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>
              {t("Price went up")}
            </span>
          )}
          {!s.inPlan && !s.stale && (
            <span className="chip ml-2 !py-0 text-[11px]">{t("Not in your plan")}</span>
          )}
        </p>
        <p className="faint text-xs">
          {money(s.amount)} {cadenceLabel(s.cadence)}
          {s.source === "detected" && ` · ${t("last charged")} ${shortDate(s.lastDate)}`}
          {s.source === "plan" && ` · ${t("from your plan")}`}
          {s.nextDate && !s.stale && ` · ${t("next ~")}${shortDate(s.nextDate)}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-right">
          <p className="font-display text-lg font-semibold tabular-nums">{money(s.perYear)}</p>
          <p className="faint text-[11px]">{t("per year")}</p>
        </div>
        {done[s.key] ? (
          <span className="muted text-xs">{done[s.key]}</span>
        ) : (
          <>
            {!s.inPlan && !s.stale && (
              <button className="btn btn-ghost !px-3 !py-1 text-xs" onClick={() => addToPlan(s)}>
                {t("Add to plan")}
              </button>
            )}
            {!s.stale && (
              <button className="btn btn-ghost !px-3 !py-1 text-xs" onClick={() => remindCancel(s)}>
                {t("Remind me to cancel")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">{t("Subscriptions")}</h1>
        <p className="muted text-sm">
          {t("Recurring charges found in your history — including the ones you forgot about.")}
          {space === "business" && ` (${t("Business")})`}
        </p>
      </div>

      <div className="card glow-mint grid gap-4 p-6 sm:grid-cols-3">
        <div>
          <p className="faint text-xs">{t("Per month")}</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{subs ? money(perMonth) : "—"}</p>
        </div>
        <div>
          <p className="faint text-xs">{t("Per year")}</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{subs ? money(perYear) : "—"}</p>
        </div>
        <div>
          <p className="faint text-xs">{t("Active subscriptions")}</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{subs ? active.length : "—"}</p>
        </div>
      </div>

      {subs && subs.length === 0 && (
        <div className="card p-6">
          <p className="font-medium">{t("Nothing recurring found yet.")}</p>
          <p className="muted mt-1 text-sm">
            {t("Detection works from your transactions: write the merchant in the note (e.g. \"Netflix\") or use a Subscriptions category. Once your bank is connected, this fills in by itself.")}
          </p>
          <Link href="/app" className="btn btn-ghost mt-4 inline-flex">
            {t("Back to Home")}
          </Link>
        </div>
      )}

      {active.length > 0 && (
        <div className="card p-6">
          <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Active")}</p>
          <div className="mt-3 grid gap-2">
            {active.map((s) => (
              <Row key={s.key} s={s} />
            ))}
          </div>
        </div>
      )}

      {stale.length > 0 && (
        <div className="card p-6">
          <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Stopped charging?")}</p>
          <p className="muted mt-1 text-sm">{t("These used to charge regularly but the last expected charge hasn't shown up.")}</p>
          <div className="mt-3 grid gap-2">
            {stale.map((s) => (
              <Row key={s.key} s={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
