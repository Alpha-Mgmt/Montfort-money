"use client";

import { useRef, useState } from "react";
import type { MonthProjection } from "@/lib/recurring";
import { money } from "@/lib/format";

const M = { top: 12, right: 8, bottom: 26, left: 8 };

function monthTick(monthISO: string): string {
  const [y, m] = monthISO.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

/**
 * Paired-bar chart: income vs expenses per month, next 12 months.
 * Design-system colors via --chart-income / --chart-expense (validated
 * for both themes). Hover shows a tooltip with exact values + net.
 */
export function ForecastChart({ data }: { data: MonthProjection[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    i: number;
    x: number;
    y: number;
  } | null>(null);

  const W = 720;
  const H = 240;
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const slot = innerW / data.length;
  const barW = Math.min(14, (slot - 10) / 2);

  const y = (v: number) => M.top + innerH - (v / max) * innerH;

  // recessive gridlines: 3 steps
  const gridVals = [max, max / 2, 0];

  function onMove(e: React.MouseEvent, i: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ i, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  return (
    <div className="relative" ref={wrapRef}>
      {/* legend — 2 series, always present */}
      <div className="mb-2 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--chart-income)" }}
          />
          <span className="muted">Income</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: "var(--chart-expense)" }}
          />
          <span className="muted">Expenses</span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Projected income and expenses for the next 12 months"
      >
        {gridVals.map((v, gi) => (
          <line
            key={gi}
            x1={M.left}
            x2={W - M.right}
            y1={y(v)}
            y2={y(v)}
            stroke="var(--border)"
            strokeWidth="1"
          />
        ))}

        {data.map((d, i) => {
          const cx = M.left + slot * i + slot / 2;
          const baseline = y(0);
          return (
            <g key={d.month}>
              {/* hover hit target: full column */}
              <rect
                x={M.left + slot * i}
                y={M.top}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseMove={(e) => onMove(e, i)}
                onMouseLeave={() => setHover(null)}
              />
              {/* income bar */}
              <rect
                x={cx - barW - 1}
                y={y(d.income)}
                width={barW}
                height={Math.max(0, baseline - y(d.income))}
                rx="3"
                fill="var(--chart-income)"
                pointerEvents="none"
              />
              {/* expense bar (2px surface gap between the pair) */}
              <rect
                x={cx + 1}
                y={y(d.expense)}
                width={barW}
                height={Math.max(0, baseline - y(d.expense))}
                rx="3"
                fill="var(--chart-expense)"
                pointerEvents="none"
              />
              <text
                x={cx}
                y={H - 8}
                fontSize="9.5"
                textAnchor="middle"
                fill={hover?.i === i ? "var(--text)" : "var(--text-faint)"}
              >
                {monthTick(d.month)}
              </text>
            </g>
          );
        })}

        {/* axis labels last so bars never cover them; halo for legibility */}
        {gridVals.map(
          (v, gi) =>
            v > 0 && (
              <text
                key={`t${gi}`}
                x={M.left + 2}
                y={y(v) - 4}
                fontSize="9"
                fill="var(--text-faint)"
                paintOrder="stroke"
                stroke="var(--surface)"
                strokeWidth="3"
                pointerEvents="none"
              >
                {money(v)}
              </text>
            )
        )}
      </svg>

      {hover && data[hover.i] && (
        <div
          className="chart-tip"
          style={{
            left: Math.min(hover.x + 12, (wrapRef.current?.clientWidth ?? 300) - 150),
            top: hover.y - 10,
          }}
        >
          <p className="font-semibold">{monthTick(data[hover.i].month)}</p>
          <p>
            <span style={{ color: "var(--chart-income)" }}>●</span> Income{" "}
            {money(data[hover.i].income)}
          </p>
          <p>
            <span style={{ color: "var(--chart-expense)" }}>●</span> Expenses{" "}
            {money(data[hover.i].expense)}
          </p>
          <p className="muted">
            Net {data[hover.i].net >= 0 ? "+" : "−"}
            {money(Math.abs(data[hover.i].net))}
          </p>
        </div>
      )}
    </div>
  );
}
