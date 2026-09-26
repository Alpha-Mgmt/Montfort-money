"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchCategories, fetchDebts, fetchGoals, fetchInvestments, fetchRecurring } from "@/lib/data";
import { simulateFuture, type FutureMonth } from "@/lib/future";
import { addMonths, money, monthLabel, monthStartISO } from "@/lib/format";
import { tr } from "@/lib/i18n";
import type { Category, Debt, Goal, Investment, RecurringItem } from "@/lib/types";

const HORIZON = 120; // 10 years
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const shortMonth = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
};

const SERIES = [
  { key: "cash", label: "Cash & savings", color: "var(--fut-cash)" },
  { key: "invest", label: "Investments", color: "var(--fut-inv)" },
  { key: "debt", label: "Debt", color: "var(--fut-debt)" },
  { key: "netWorth", label: "Net worth", color: "var(--text)" },
] as const;

/** Line chart of the four balances with a hover crosshair and a marker on the chosen month. */
function FutureChart({ rows, marker }: { rows: FutureMonth[]; marker: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(760);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(300, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 260, L = 58, R = 28, T = 12, B = 26;
  const vals = rows.flatMap((r) => [r.cash, r.invest, r.debt, r.netWorth]);
  const lo = Math.min(0, ...vals), hi = Math.max(1, ...vals);
  const step = (() => {
    const raw = (hi - lo) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    return [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => raw / s <= 1) ?? mag * 10;
  })();
  const y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
  const X = (i: number) => L + (i / Math.max(1, rows.length - 1)) * (w - L - R);
  const Y = (v: number) => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B);
  const k = (v: number) => {
    const a = Math.abs(v);
    return (v < 0 ? "−$" : "$") + (a >= 1e6 ? (a / 1e6).toFixed(1) + "M" : a >= 1e3 ? Math.round(a / 1e3) + "k" : Math.round(a));
  };
  const ticks: number[] = [];
  for (let v = y0; v <= y1 + 1e-6; v += step) ticks.push(v);
  const every = Math.max(1, Math.ceil(rows.length / Math.max(2, (w - L) / 70)));
  const hv = hover != null ? rows[hover] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height: H }}>
      <svg width={w} height={H} role="img" aria-label={tr("Balances over time")}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left - L) / (w - L - R)) * (rows.length - 1));
          setHover(i >= 0 && i < rows.length ? i : null);
        }}
        onPointerLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeWidth={v === 0 ? 1.5 : 1} />
            <text x={L - 8} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-faint)">{k(v)}</text>
          </g>
        ))}
        {rows.map((r, i) => (i % every === 0 || (i === rows.length - 1 && (rows.length - 1) % every > every / 2) ? (
          <text key={r.month} x={X(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text-faint)">{i === 0 ? tr("Today") : shortMonth(r.month)}</text>
        ) : null))}
        {marker > 0 && marker < rows.length && (
          <line x1={X(marker)} x2={X(marker)} y1={T} y2={H - B} stroke="var(--text-faint)" strokeDasharray="4 4" />
        )}
        {SERIES.map((s) => (
          <polyline key={s.key} fill="none" stroke={s.color} strokeWidth={s.key === "netWorth" ? 2.5 : 2}
            strokeLinejoin="round" strokeLinecap="round"
            points={rows.map((r, i) => `${X(i).toFixed(1)},${Y((r as any)[s.key]).toFixed(1)}`).join(" ")} />
        ))}
        {hv && hover != null && (
          <g>
            <line x1={X(hover)} x2={X(hover)} y1={T} y2={H - B} stroke="var(--text-faint)" />
            {SERIES.map((s) => (
              <circle key={s.key} cx={X(hover)} cy={Y((hv as any)[s.key])} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hv && hover != null && (
        <div className="card pointer-events-none absolute top-2 z-10 px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(X(hover) + 12, 0), w - 190), minWidth: 170 }}>
          <p className="mb-1 font-semibold">{hover === 0 ? tr("Today") : monthLabel(hv.month)}</p>
          {SERIES.map((s) => (
            <p key={s.key} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />{tr(s.label)}</span>
              <b className="tabular-nums">{money((hv as any)[s.key])}</b>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FuturePage() {
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [invs, setInvs] = useState<Investment[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [prof, setProf] = useState<{ debt_extra: number; debt_strategy: "avalanche" | "snowball" }>({ debt_extra: 0, debt_strategy: "avalanche" });
  const [acctCash, setAcctCash] = useState(0);
  const [cashOverride, setCashOverride] = useState<string>("");
  const [ahead, setAhead] = useState(12);
  const [extraDebt, setExtraDebt] = useState("");
  const [raisePct, setRaisePct] = useState("");
  const [raiseFrom, setRaiseFrom] = useState(addMonths(monthStartISO(), 1));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { setCashOverride(localStorage.getItem("mf-future-cash") ?? ""); } catch {}
    const supabase = createClient();
    Promise.all([
      fetchCategories(), fetchRecurring(), fetchDebts(), fetchInvestments(), fetchGoals(),
      supabase.from("profiles").select("debt_extra,debt_strategy").single(),
      supabase.from("accounts").select("type,current_balance,archived"),
    ]).then(([c, r, d, i, g, p, a]) => {
      setCats(c); setItems(r); setDebts(d); setInvs(i); setGoals(g);
      if (p.data) setProf({ debt_extra: Number((p.data as any).debt_extra ?? 0), debt_strategy: (p.data as any).debt_strategy === "snowball" ? "snowball" : "avalanche" });
      const cash = ((a.data ?? []) as any[])
        .filter((x) => !x.archived && ["cash", "checking", "savings"].includes(x.type))
        .reduce((s, x) => s + Number(x.current_balance ?? 0), 0);
      setAcctCash(cash);
      setReady(true);
    });
  }, []);

  const startCash = cashOverride !== "" ? parseFloat(cashOverride) || 0 : acctCash;
  const sim = useMemo(
    () =>
      simulateFuture({
        recurring: items, debts, investments: invs, goals, categories: cats,
        startCash, debtExtra: prof.debt_extra, strategy: prof.debt_strategy, months: HORIZON,
        scenario: { extraDebt: parseFloat(extraDebt) || 0, raisePct: parseFloat(raisePct) || 0, raiseFrom: (parseFloat(raisePct) || 0) !== 0 ? raiseFrom : null },
      }),
    [items, debts, invs, goals, cats, startCash, prof, extraDebt, raisePct, raiseFrom]
  );
  const now = sim.rows[0];
  const at = sim.rows[ahead];
  const chartRows = sim.rows.slice(0, Math.max(ahead, 12) + 1);
  const liveDebts = debts.filter((d) => !d.archived && d.balance > 0);
  const lastPayoff = Math.max(1, ...liveDebts.map((d) => {
    const m = sim.debtFree[d.id];
    return m ? sim.rows.findIndex((r) => r.month === m) : HORIZON;
  }));
  const delta = (a: number, b: number, invert = false) => {
    const d = a - b;
    if (Math.abs(d) < 1) return null;
    const good = invert ? d < 0 : d > 0;
    return <span className="text-[11px] font-semibold" style={{ color: good ? "var(--mint)" : "var(--over)" }}>{d > 0 ? "+" : "−"}{money(Math.abs(d))} {tr("vs today")}</span>;
  };
  const chips = [6, 12, 24, 60, 120];

  if (!ready) return <p className="muted p-6 text-sm">{tr("Loading…")}</p>;

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">{tr("Future")}</h1>
        <p className="muted text-sm">{tr("Where your plan takes you — pick any month up to 10 years ahead.")}</p>
      </div>

      {/* month picker */}
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-display text-xl font-semibold">{cap(monthLabel(at.month))}</p>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <button key={c} className={`btn !px-3 !py-1 !text-xs ${ahead === c ? "btn-primary" : "btn-ghost"}`} onClick={() => setAhead(c)}>
                {c < 12 ? tr("{n} months", { n: c }) : c === 12 ? tr("1 year") : tr("{n} years", { n: c / 12 })}
              </button>
            ))}
          </div>
        </div>
        <input type="range" min={1} max={HORIZON} value={ahead} onChange={(e) => setAhead(Number(e.target.value))}
          className="mt-4 w-full" aria-label={tr("Months ahead")} style={{ accentColor: "var(--mint)" }} />
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: tr("Cash & savings"), v: at.cash, d: delta(at.cash, now.cash), c: "var(--fut-cash)" },
            { label: tr("Investments"), v: at.invest, d: delta(at.invest, now.invest), c: "var(--fut-inv)" },
            { label: tr("Debt"), v: at.debt, d: delta(at.debt, now.debt, true), c: "var(--fut-debt)" },
            { label: tr("Net worth"), v: at.netWorth, d: delta(at.netWorth, now.netWorth), c: "var(--text)" },
          ].map((x) => (
            <div key={x.label}>
              <p className="faint flex items-center gap-1.5 text-xs"><span className="inline-block h-2 w-2 rounded-full" style={{ background: x.c }} />{x.label}</p>
              <p className="font-display text-2xl font-semibold tabular-nums" style={x.v < 0 ? { color: "var(--over)" } : undefined}>{money(x.v)}</p>
              {x.d}
            </div>
          ))}
        </div>
      </div>

      {/* chart */}
      <div className="card p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="faint text-xs font-semibold uppercase tracking-wide">{tr("Balances over time")}</p>
          <div className="flex flex-wrap gap-3 text-xs">
            {SERIES.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color, height: s.key === "netWorth" ? 3 : 2 }} />{tr(s.label)}
              </span>
            ))}
          </div>
        </div>
        <FutureChart rows={chartRows} marker={ahead} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* investments */}
        <div className="card p-6">
          <p className="faint text-xs font-semibold uppercase tracking-wide">{tr("Investments")}</p>
          {invs.filter((i) => !i.archived).length === 0 ? (
            <p className="muted mt-3 text-sm">{tr("Add your accounts (e.g. Charles Schwab) in Investments with their balance, expected return and monthly contribution.")}</p>
          ) : (
            <div className="mt-3 grid gap-2">
              {invs.filter((i) => !i.archived).map((i) => (
                <div key={i.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{i.name}<span className="faint text-xs"> · {i.expected_apr}% · {money(i.monthly_amount)}/{tr("mo")}</span></span>
                  <span className="shrink-0 tabular-nums"><span className="faint text-xs">{money(i.balance)} → </span><b>{money(at.inv[i.id] ?? 0)}</b></span>
                </div>
              ))}
            </div>
          )}
          {goals.filter((g) => !g.archived).length > 0 && (
            <>
              <p className="faint mt-6 text-xs font-semibold uppercase tracking-wide">{tr("Goals")}</p>
              <div className="mt-3 grid gap-2">
                {goals.filter((g) => !g.archived).map((g) => (
                  <div key={g.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium">{g.name}</span>
                    <span className="shrink-0 tabular-nums"><b>{money(at.goalSaved[g.id] ?? 0)}</b><span className="faint text-xs"> / {money(g.target_amount)}</span></span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* debts + timeline */}
        <div className="card p-6">
          <div className="flex items-baseline justify-between gap-2">
            <p className="faint text-xs font-semibold uppercase tracking-wide">{tr("Debt timeline")}</p>
            {sim.allDebtFree && <p className="text-xs font-semibold" style={{ color: "var(--mint)" }}>{tr("Debt-free in {m}", { m: monthLabel(sim.allDebtFree) })}</p>}
          </div>
          {liveDebts.length === 0 ? (
            <p className="muted mt-3 text-sm">{tr("No debts — or add your car loan / mortgage in Debt payoff to see them here.")}</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {liveDebts.map((d) => {
                const free = sim.debtFree[d.id];
                const idx = free ? sim.rows.findIndex((r) => r.month === free) : HORIZON;
                const left = at.debts[d.id] ?? 0;
                return (
                  <div key={d.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium">{d.name}</span>
                      <span className="shrink-0 tabular-nums">
                        {left > 0.5 ? <><span className="faint text-xs">{tr("left")} </span><b>{money(left)}</b></> : <b style={{ color: "var(--mint)" }}>{tr("paid off ✓")}</b>}
                      </span>
                    </div>
                    <div className="relative mt-1.5 h-2.5 rounded-full" style={{ background: "var(--surface-2)" }}>
                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (idx / lastPayoff) * 100)}%`, background: "var(--fut-debt)", opacity: 0.85 }} />
                      <div className="absolute -top-1 bottom-[-4px] w-0.5" style={{ left: `${Math.min(100, (ahead / lastPayoff) * 100)}%`, background: "var(--text)" }} title={monthLabel(at.month)} />
                    </div>
                    <p className="faint mt-1 text-[11px]">
                      {free ? tr("Paid off {m}", { m: monthLabel(free) }) : tr("Not paid off within 10 years at this payment")}
                      {" · "}{d.apr}% · {money(d.planned_payment)}/{tr("mo")}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* scenario + assumptions */}
      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">{tr("What if…")}</p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <label className="grid gap-1">
            <span className="faint text-xs">{tr("Extra to debts / month")}</span>
            <input className="input !w-32" type="number" inputMode="decimal" min="0" placeholder="$0" value={extraDebt} onChange={(e) => setExtraDebt(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="faint text-xs">{tr("Income change %")}</span>
            <input className="input !w-28" type="number" inputMode="decimal" placeholder="0" value={raisePct} onChange={(e) => setRaisePct(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="faint text-xs">{tr("Starting")}</span>
            <select className="input !w-auto" value={raiseFrom} onChange={(e) => setRaiseFrom(e.target.value)}>
              {Array.from({ length: 36 }, (_, i) => addMonths(monthStartISO(), i + 1)).map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="faint text-xs">{tr("Cash you have today")}</span>
            <input className="input !w-36" type="number" inputMode="decimal" placeholder={money(acctCash)} value={cashOverride}
              onChange={(e) => { setCashOverride(e.target.value); try { localStorage.setItem("mf-future-cash", e.target.value); } catch {} }} />
          </label>
          {(extraDebt || raisePct) && (
            <button className="btn btn-ghost !px-3 !py-1.5 text-sm" onClick={() => { setExtraDebt(""); setRaisePct(""); }}>{tr("Reset")}</button>
          )}
        </div>
        <p className="faint mt-4 text-xs leading-relaxed">
          {tr("Based on your plan (take-home income and expenses), your debts' payments and rates ({s}, {x}/mo extra), your investments' expected returns and contributions, and your goals. Estimates, not guarantees.", {
            s: prof.debt_strategy === "snowball" ? "snowball" : "avalanche",
            x: money(prof.debt_extra),
          })}
        </p>
      </div>
    </div>
  );
}
