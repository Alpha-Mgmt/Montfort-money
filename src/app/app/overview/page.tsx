"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, monthStartISO } from "@/lib/format";
import { MonthPicker } from "@/components/MonthPicker";
import { useApp, type Space } from "@/lib/i18n";

type Row = {
  space: Space;
  income: number;
  expense: number;
  ytd_income: number;
  ytd_expense: number;
  investments: number;
  debts: number;
  goals_saved: number;
};

const EMPTY: Row = {
  space: "personal",
  income: 0,
  expense: 0,
  ytd_income: 0,
  ytd_expense: 0,
  investments: 0,
  debts: 0,
  goals_saved: 0,
};

export default function OverviewPage() {
  const { t, space, switchSpace, features, household } = useApp();
  const [month, setMonth] = useState(monthStartISO());
  const [rows, setRows] = useState<Record<Space, Row> | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    setRows(null);
    setErr(false);
    createClient()
      .rpc("space_overview", { p_month: month })
      .then(({ data, error }) => {
        if (error) {
          setErr(true);
          return;
        }
        const out: Record<Space, Row> = {
          personal: { ...EMPTY, space: "personal" },
          business: { ...EMPTY, space: "business" },
          shared: { ...EMPTY, space: "shared" },
        };
        for (const r of (data ?? []) as any[]) {
          const s = r.space as Space;
          out[s] = {
            space: s,
            income: Number(r.income),
            expense: Number(r.expense),
            ytd_income: Number(r.ytd_income),
            ytd_expense: Number(r.ytd_expense),
            investments: Number(r.investments),
            debts: Number(r.debts),
            goals_saved: Number(r.goals_saved),
          };
        }
        setRows(out);
      });
  }, [month]);

  const p = rows?.personal ?? EMPTY;
  const b = rows?.business ?? { ...EMPTY, space: "business" as Space };
  const sh = rows?.shared ?? { ...EMPTY, space: "shared" as Space };
  const shown: Row[] = [p];
  if (features.business || b.income || b.expense) shown.push(b);
  if (household) shown.push(sh);
  const sum = (f: (r: Row) => number) => shown.reduce((a, r) => a + f(r), 0);
  const net = (r: Row) => r.income - r.expense;
  const ytdNet = (r: Row) => r.ytd_income - r.ytd_expense;
  const worth = (r: Row) => r.investments + r.goals_saved - r.debts;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t("All together")}</h1>
          <p className="muted text-sm">
            {t("All your spaces side by side — the full picture of your money.")}
          </p>
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {err && (
        <div className="card p-5 text-sm" style={{ borderColor: "var(--warn)" }}>
          {t("Couldn't load the overview. If this is new, the database update (migration 14) may still be pending.")}
        </div>
      )}

      {/* combined headline */}
      <div className="card glow-mint grid gap-4 p-6 sm:grid-cols-3">
        <Stat label={t("Net this month")} value={sum(net)} signed loading={!rows} />
        <Stat label={t("Net this year")} value={sum(ytdNet)} signed loading={!rows} />
        <Stat label={t("Net worth (tracked)")} value={sum(worth)} signed loading={!rows} />
      </div>

      <div className={`grid gap-4 ${shown.length > 2 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        {shown.map((r) => (
          <div key={r.space} className="card p-6">
            <div className="flex items-center justify-between">
              <p className="faint text-xs font-semibold uppercase tracking-wide">
                {r.space === "personal" ? t("Personal") : r.space === "business" ? t("Business") : t("Couple")}
              </p>
              {space !== r.space && (
                <button className="btn btn-ghost !px-3 !py-0.5 text-xs" onClick={() => switchSpace(r.space)}>
                  {t("Open")}
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat small label={t("Income")} value={r.income} loading={!rows} />
              <Stat small label={t("Spent")} value={r.expense} loading={!rows} />
              <Stat small label={t("Net")} value={net(r)} signed loading={!rows} />
            </div>
            <FlowBar income={r.income} expense={r.expense} />
            <div className="divider my-4" />
            <div className="grid gap-1.5 text-sm">
              <Line label={t("Year to date, net")} value={ytdNet(r)} signed />
              <Line label={t("Investments")} value={r.investments} />
              <Line label={t("Saved in goals")} value={r.goals_saved} />
              <Line label={t("Debts")} value={r.debts ? -r.debts : 0} signed />
            </div>
          </div>
        ))}
      </div>
      <p className="faint text-xs">
        {t("Net worth counts what you track here: investments + goal savings − debts. Transfers you pay yourself show as business spending and personal income.")}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  signed,
  small,
  loading,
}: {
  label: string;
  value: number;
  signed?: boolean;
  small?: boolean;
  loading?: boolean;
}) {
  const color = signed ? (value < 0 ? "var(--over)" : "var(--mint)") : undefined;
  return (
    <div>
      <p className="faint text-xs">{label}</p>
      <p
        className={`font-display font-semibold tabular-nums ${small ? "text-lg" : "text-2xl"}`}
        style={{ color }}
      >
        {loading ? "—" : money(value)}
      </p>
    </div>
  );
}

function Line({ label, value, signed }: { label: string; value: number; signed?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="muted">{label}</span>
      <span
        className="font-medium tabular-nums"
        style={{ color: signed && value < 0 ? "var(--over)" : undefined }}
      >
        {money(value)}
      </span>
    </div>
  );
}

function FlowBar({ income, expense }: { income: number; expense: number }) {
  const max = Math.max(income, expense, 1);
  return (
    <div className="mt-4 grid gap-1.5">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${(income / max) * 100}%`, background: "var(--chart-income)" }} />
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${(expense / max) * 100}%`, background: "var(--chart-expense)" }} />
      </div>
    </div>
  );
}
