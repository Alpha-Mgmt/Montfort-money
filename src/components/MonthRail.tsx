"use client";

import { useMemo, useState } from "react";
import { tr } from "@/lib/i18n";
import { money, shortDate, monthLabel, longDate, monthShort } from "@/lib/format";
import { toISO } from "@/lib/recurring";

/** One line that moves money on a day: logged (done) or still planned. + in, − out */
export type RailLine = { date: string; title: string; amount: number; done: boolean };
export type RailSlice = { name: string; actual: number; plan: number };
export type RailTrend = { month: string; income: number; expense: number; planned: boolean };
export type RailDetail = {
  cash: number;
  invested: number;
  debt: number;
  goalsSaved: number;
  incomeDone: number;
  incomePlan: number;
  outDone: number;
  outPlan: number;
  debtPaid: number;
  endOfMonth: number | null;
  in12: number;
};

const PALETTE = ["#2bb584", "#5aa9e6", "#b78af0", "#f0a53c", "#ef8fb5", "#3fbdb8", "#f0825a", "#8a9bb0", "#c9b458", "#6d7fd9"];

const short = (v: number) => {
  const a = Math.abs(v);
  const t = a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : `${Math.round(a)}`;
  return (v < 0 ? "−" : "") + t;
};
const signed = (v: number) => `${v < 0 ? "−" : "+"}${money(Math.abs(v))}`;

function Icon({ name }: { name: "cal" | "detail" | "charts" }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "cal")
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" {...p}>
        <rect x="3.5" y="5" width="17" height="15" rx="3" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </svg>
    );
  if (name === "detail")
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" {...p}>
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
      </svg>
    );
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" {...p}>
      <path d="M12 3a9 9 0 1 0 9 9h-9z" />
      <path d="M15 3.5A9 9 0 0 1 20.5 9H15z" />
    </svg>
  );
}

export function MonthRail(props: {
  month: string;
  today: string;
  curMonth: string;
  isPast: boolean;
  low: number;
  lines: RailLine[];
  balances: Map<string, number>;
  detail: RailDetail;
  slices: RailSlice[];
  trend: RailTrend[];
  badDays: number;
  firstBad: string | null;
}) {
  const [tab, setTab] = useState<"cal" | "detail" | "charts">("cal");
  const tabs: { k: "cal" | "detail" | "charts"; label: string }[] = [
    { k: "cal", label: tr("Calendar") },
    { k: "detail", label: tr("Detail") },
    { k: "charts", label: tr("Charts") },
  ];
  return (
    <div className="grid gap-3">
      <div className="card grid grid-cols-3 gap-1 p-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.k}
            role="tab"
            aria-selected={tab === t.k}
            onClick={() => setTab(t.k)}
            className="flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition"
            style={
              tab === t.k
                ? { background: "var(--text)", color: "var(--surface)" }
                : { color: "var(--text-soft)" }
            }
          >
            <Icon name={t.k} />
            {t.label}
          </button>
        ))}
      </div>
      {tab === "cal" && <CalendarTab {...props} />}
      {tab === "detail" && <DetailTab {...props} />}
      {tab === "charts" && <ChartsTab {...props} />}
    </div>
  );
}

/* ---------------------------------- Calendar ---------------------------------- */

function CalendarTab({ month, today, curMonth, isPast, low, lines, balances, badDays, firstBad }: Parameters<typeof MonthRail>[0]) {
  const inMonth = today.slice(0, 7) === month.slice(0, 7);
  const [sel, setSel] = useState<string>(inMonth ? today : month);
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday first
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, k) => toISO(new Date(y, m - 1, k + 1)))];
  const byDay = useMemo(() => {
    const mp = new Map<string, { inn: number; out: number; list: RailLine[] }>();
    for (const l of lines) {
      const d = mp.get(l.date) ?? { inn: 0, out: 0, list: [] };
      if (l.amount >= 0) d.inn += l.amount;
      else d.out += -l.amount;
      d.list.push(l);
      mp.set(l.date, d);
    }
    return mp;
  }, [lines]);
  const wd = [tr("Mon"), tr("Tue"), tr("Wed"), tr("Thu"), tr("Fri"), tr("Sat"), tr("Sun")].map((d) => d.slice(0, 1));
  const selDay = byDay.get(sel);
  const selBal = balances.get(sel);
  const selLabel = longDate(sel);
  return (
    <div className="card p-3.5">
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <h3 className="font-display text-sm font-semibold first-letter:uppercase">{monthLabel(month)}</h3>
        {month > curMonth && <span className="faint text-[11px]">{tr("estimate")}</span>}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {wd.map((d, k) => (
          <div key={k} className="faint pb-0.5 text-center text-[10.5px] font-semibold">{d}</div>
        ))}
        {cells.map((iso, k) => {
          if (!iso) return <div key={k} />;
          const v = balances.get(iso);
          const f = byDay.get(iso);
          const past = iso < today;
          const isSel = iso === sel;
          const isToday = iso === today;
          const tone = v == null || past ? null : v < 0 ? "over" : v < low ? "warn" : "mint";
          const bg = tone ? `var(--${tone}-soft)` : "var(--surface-2)";
          return (
            <button
              key={k}
              onClick={() => setSel(iso)}
              className="flex min-h-[58px] flex-col items-stretch rounded-lg px-1 py-1 text-left leading-tight transition hover:brightness-95"
              style={{
                background: bg,
                outline: isSel ? "2px solid var(--text)" : isToday ? "1.5px dashed var(--text-soft)" : undefined,
                outlineOffset: -1,
              }}
              aria-label={shortDate(iso)}
            >
              <span className="text-[11px] font-semibold" style={{ color: past ? "var(--text-faint)" : "var(--text)" }}>
                {Number(iso.slice(8, 10))}
              </span>
              <span className="mt-auto grid text-[9px] tabnum">
                {f && f.inn > 0 && <span style={{ color: "var(--mint)" }}>+{short(f.inn)}</span>}
                {f && f.out > 0 && <span style={{ color: "var(--over)" }}>−{short(f.out)}</span>}
                {v != null && (
                  <span
                    className="font-semibold"
                    style={{ color: tone ? `var(--${tone})` : "var(--text-faint)" }}
                  >
                    {short(v)}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="faint mt-2 flex flex-wrap gap-x-3 gap-y-1 px-0.5 text-[10.5px]">
        <span><b style={{ color: "var(--mint)" }}>+</b> {tr("comes in")}</span>
        <span><b style={{ color: "var(--over)" }}>−</b> {tr("goes out")}</span>
        <span><b>$</b> {tr("balance at day end")}</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: "var(--warn-soft)" }} />{tr("under {amt}", { amt: money(low) })}</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: "var(--over-soft)" }} />{tr("not enough")}</span>
      </div>
      {!isPast && badDays > 0 && firstBad && (
        <p className="mt-2 px-0.5 text-xs" style={{ color: "var(--over)" }}>
          {tr("{n} days you wouldn't cover everything — first one: {d}", { n: badDays, d: shortDate(firstBad) })}
        </p>
      )}

      {/* the tapped day, broken down */}
      <div className="mt-3 rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">{selLabel}</p>
          {sel === today && <span className="chip !py-0 text-[10px]">{tr("Today")}</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs tabnum">
          <span style={{ color: "var(--mint)" }}>+{money(selDay?.inn ?? 0)}</span>
          <span style={{ color: "var(--over)" }}>−{money(selDay?.out ?? 0)}</span>
          {selBal != null && (
            <span className="muted">
              {tr("ends with")}{" "}
              <b style={{ color: selBal < 0 ? "var(--over)" : selBal < low ? "var(--warn)" : "var(--text)" }}>
                {selBal < 0 ? "−" : ""}
                {money(Math.abs(selBal))}
              </b>
            </span>
          )}
        </div>
        {!selDay || selDay.list.length === 0 ? (
          <p className="faint mt-2 text-xs">{tr("Nothing moves this day.")}</p>
        ) : (
          <ul className="mt-2 grid gap-1.5">
            {[...selDay.list]
              .sort((a, b) => b.amount - a.amount)
              .map((l, i) => (
                <li key={i} className="flex items-center gap-2 text-[13px]">
                  <span
                    className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px]"
                    style={
                      l.done
                        ? { background: l.amount >= 0 ? "var(--mint)" : "var(--over)", color: "#fff" }
                        : { border: `1.5px solid ${l.amount >= 0 ? "var(--mint)" : "var(--over)"}` }
                    }
                    title={l.done ? tr("Already happened") : tr("Planned")}
                  >
                    {l.done ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{l.title}</span>
                  {!l.done && <span className="faint text-[10.5px]">{tr("plan")}</span>}
                  <span className="tabnum font-medium" style={{ color: l.amount >= 0 ? "var(--mint)" : "var(--over)" }}>
                    {signed(l.amount)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- Detail ---------------------------------- */

function DetailTab({ detail: d, badDays, month }: Parameters<typeof MonthRail>[0]) {
  const nw = d.cash + d.invested - d.debt;
  const parts = [
    { label: "Cash", v: d.cash, c: "var(--mint)" },
    { label: tr("Investments"), v: d.invested, c: "#5aa9e6" },
    { label: tr("Debts"), v: -d.debt, c: "var(--over)" },
  ];
  const pos = Math.max(1, d.cash + d.invested);
  const keep = d.incomePlan > 0 ? (d.incomePlan - d.outPlan) / d.incomePlan : 0;
  const Row = ({ label, now, plan, color }: { label: string; now: number; plan: number; color: string }) => (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="muted">{label}</span>
        <span className="tabnum">
          <b style={{ color }}>{money(now)}</b> <span className="faint">/ {money(plan)}</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
        <div className="h-full rounded-full" style={{ width: `${plan > 0 ? Math.min(100, (now / plan) * 100) : 0}%`, background: color }} />
      </div>
    </div>
  );
  return (
    <div className="grid gap-3">
      <div className="card p-4">
        <p className="faint text-xs font-semibold uppercase tracking-wide">{tr("Net worth")}</p>
        <p className="font-display text-3xl font-semibold tabnum" style={{ color: nw < 0 ? "var(--over)" : undefined }}>
          {nw < 0 ? "−" : ""}
          {money(Math.abs(nw))}
        </p>
        <p className="faint text-xs">{tr("Cash + investments − debts")}</p>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
          <div style={{ width: `${(Math.max(0, d.cash) / pos) * 100}%`, background: "var(--mint)" }} />
          <div style={{ width: `${(d.invested / pos) * 100}%`, background: "#5aa9e6" }} />
        </div>
        <div className="mt-3 grid gap-1.5">
          {parts.map((p) => (
            <div key={p.label} className="flex items-center gap-2 text-sm">
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: p.c }} />
              <span className="muted flex-1">{p.label}</span>
              <span className="tabnum font-medium">{p.v < 0 ? "−" : ""}{money(Math.abs(p.v))}</span>
            </div>
          ))}
          {d.goalsSaved > 0 && (
            <p className="faint text-[11px]">{tr("Saved in goals: {amt} (already in your cash)", { amt: money(d.goalsSaved) })}</p>
          )}
        </div>
        <div className="mt-3 flex items-baseline justify-between border-t pt-2 text-sm" style={{ borderColor: "var(--border)" }}>
          <span className="muted">{tr("In 12 months, if the plan holds")}</span>
          <b className="tabnum" style={{ color: d.in12 < 0 ? "var(--over)" : "var(--mint)" }}>
            {d.in12 < 0 ? "−" : ""}
            {money(Math.abs(d.in12))}
          </b>
        </div>
      </div>
      <div className="card grid gap-3 p-4">
        <p className="font-display text-sm font-semibold first-letter:uppercase">{monthLabel(month)}</p>
        <Row label={tr("Money in")} now={d.incomeDone} plan={d.incomePlan} color="var(--mint)" />
        <Row label={tr("Money out")} now={d.outDone} plan={d.outPlan} color="var(--over)" />
        <div className="grid grid-cols-2 gap-2 text-center">
          <Stat label={tr("You keep (plan)")} value={`${Math.round(keep * 100)}%`} tone={keep < 0 ? "over" : "mint"} />
          <Stat label={tr("Debt paid down")} value={money(d.debtPaid)} tone="mint" />
          <Stat
            label={tr("Month ends with")}
            value={d.endOfMonth == null ? "—" : `${d.endOfMonth < 0 ? "−" : ""}${money(Math.abs(d.endOfMonth))}`}
            tone={d.endOfMonth != null && d.endOfMonth < 0 ? "over" : "text"}
          />
          <Stat label={tr("Tight days")} value={String(badDays)} tone={badDays > 0 ? "over" : "mint"} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "mint" | "over" | "text" }) {
  return (
    <div className="rounded-xl px-2 py-2.5" style={{ background: "var(--surface-2)" }}>
      <p className="font-display text-lg font-semibold tabnum" style={{ color: `var(--${tone})` }}>{value}</p>
      <p className="faint text-[11px]">{label}</p>
    </div>
  );
}

/* ---------------------------------- Charts ---------------------------------- */

function ChartsTab({ slices, trend }: Parameters<typeof MonthRail>[0]) {
  const hasActual = slices.some((s) => s.actual > 0);
  const [mode, setMode] = useState<"actual" | "plan">(hasActual ? "actual" : "plan");
  const [hi, setHi] = useState<number | null>(null);
  const data = slices
    .map((s) => ({ name: s.name, v: mode === "actual" ? s.actual : s.plan }))
    .filter((s) => s.v > 0.5)
    .sort((a, b) => b.v - a.v);
  const top = data.slice(0, 7);
  const rest = data.slice(7).reduce((a, s) => a + s.v, 0);
  if (rest > 0) top.push({ name: tr("Everything else"), v: rest });
  const total = top.reduce((a, s) => a + s.v, 0);

  // donut arcs
  const R = 62, r = 40, C = 80;
  let acc = 0;
  const arcs = top.map((s, i) => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    acc += s.v;
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad: number, ang: number) => `${C + rad * Math.cos(ang)} ${C + rad * Math.sin(ang)}`;
    const d =
      top.length === 1
        ? `M${C} ${C - R}A${R} ${R} 0 1 1 ${C - 0.01} ${C - R}L${C - 0.01} ${C - r}A${r} ${r} 0 1 0 ${C} ${C - r}Z`
        : `M${p(R, a0)}A${R} ${R} 0 ${big} 1 ${p(R, a1)}L${p(r, a1)}A${r} ${r} 0 ${big} 0 ${p(r, a0)}Z`;
    return { d, color: PALETTE[i % PALETTE.length], i };
  });
  const shown = hi != null ? top[hi] : null;

  // trend bars
  const maxV = Math.max(1, ...trend.flatMap((t) => [t.income, t.expense]));
  const W = 300, H = 120, bw = W / Math.max(1, trend.length);
  const yOf = (v: number) => H - (v / maxV) * (H - 8);
  const mShort = monthShort;

  return (
    <div className="grid gap-3">
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <p className="font-display text-sm font-semibold">{tr("Where the money goes")}</p>
          <div className="flex rounded-full p-0.5 text-[11px] font-semibold" style={{ background: "var(--surface-2)" }}>
            {(["actual", "plan"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                className="rounded-full px-2.5 py-0.5"
                style={mode === k ? { background: "var(--surface)", boxShadow: "0 1px 2px rgba(0,0,0,.08)" } : { color: "var(--text-faint)" }}
              >
                {k === "actual" ? tr("Actual") : tr("Plan")}
              </button>
            ))}
          </div>
        </div>
        {total <= 0 ? (
          <p className="faint mt-3 text-xs">{mode === "actual" ? tr("Nothing spent yet this month.") : tr("No plan for this month yet.")}</p>
        ) : (
          <div className="mt-3 flex items-center gap-4">
            <svg viewBox="0 0 160 160" className="h-36 w-36 shrink-0" role="img" aria-label={tr("Where the money goes")}>
              {arcs.map((a) => (
                <path
                  key={a.i}
                  d={a.d}
                  fill={a.color}
                  opacity={hi == null || hi === a.i ? 1 : 0.3}
                  onMouseEnter={() => setHi(a.i)}
                  onMouseLeave={() => setHi(null)}
                  onClick={() => setHi(hi === a.i ? null : a.i)}
                  style={{ cursor: "pointer", transition: "opacity .15s" }}
                />
              ))}
              <text x={C} y={C - 2} textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--text)">
                {money(shown ? shown.v : total)}
              </text>
              <text x={C} y={C + 14} textAnchor="middle" fontSize="9.5" fill="var(--text-faint)">
                {shown ? `${Math.round((shown.v / total) * 100)}%` : tr("total")}
              </text>
            </svg>
            <ul className="grid min-w-0 flex-1 gap-1 text-xs">
              {top.map((s, i) => (
                <li
                  key={s.name}
                  className="flex cursor-pointer items-center gap-1.5"
                  onMouseEnter={() => setHi(i)}
                  onMouseLeave={() => setHi(null)}
                  style={{ opacity: hi == null || hi === i ? 1 : 0.45 }}
                >
                  <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="faint tabnum">{Math.round((s.v / total) * 100)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card p-4">
        <p className="font-display text-sm font-semibold">{tr("In vs out by month")}</p>
        <p className="faint text-[11px]">{tr("Solid = what happened · light = the plan")}</p>
        <svg viewBox={`0 0 ${W} ${H + 18}`} className="mt-2 w-full" role="img" aria-label={tr("In vs out by month")}>
          <line x1="0" x2={W} y1={H} y2={H} stroke="var(--border)" />
          {trend.map((t, i) => {
            const x = i * bw + bw * 0.18;
            const w = (bw * 0.64) / 2;
            const op = t.planned ? 0.35 : 1;
            return (
              <g key={t.month}>
                <rect x={x} y={yOf(t.income)} width={w - 1} height={H - yOf(t.income)} rx="2" fill="var(--mint)" opacity={op}>
                  <title>{`${mShort(t.month)} · ${tr("in")} ${money(t.income)}`}</title>
                </rect>
                <rect x={x + w} y={yOf(t.expense)} width={w - 1} height={H - yOf(t.expense)} rx="2" fill="var(--over)" opacity={op}>
                  <title>{`${mShort(t.month)} · ${tr("out")} ${money(t.expense)}`}</title>
                </rect>
                <text x={x + w} y={H + 12} textAnchor="middle" fontSize="9" fill="var(--text-faint)">
                  {mShort(t.month)}
                </text>
              </g>
            );
          })}
        </svg>
        {(() => {
          const past = trend.filter((t) => !t.planned && (t.income > 0 || t.expense > 0));
          if (past.length < 2) return null;
          const avgKeep = past.reduce((a, t) => a + (t.income - t.expense), 0) / past.length;
          return (
            <p className="muted mt-1 text-xs">
              {tr("On average you keep {amt} a month", { amt: `${avgKeep < 0 ? "−" : ""}${money(Math.abs(avgKeep))}` })}
            </p>
          );
        })()}
      </div>
    </div>
  );
}
