"use client";

import { useState } from "react";
import { tr } from "@/lib/i18n";
import { money } from "@/lib/format";
import { CategoryDot } from "@/components/CategoryDot";
import { ConfirmPay } from "@/components/ConfirmPay";
import { ProgressBar } from "@/components/ProgressBar";

/**
 * THE one line for anything money: a plan item, a logged expense, a debt,
 * an investment, a goal. Same anatomy everywhere:
 *   [dot] Name · subtitle      $done / $plan   [✓ pay]  [× delete]
 * - tap the name  → onOpen (the sheet with everything + Delete)
 * - tap the plan  → onPlanTap (quick change of this month's plan) when given
 * - ✓             → log money moving (prefilled with what's left of the plan)
 * - ×             → one-tap confirm, then onDelete
 */
export function MoneyRow({
  name,
  subtitle,
  done = 0,
  plan = 0,
  tone = "out",
  bold = false,
  onOpen,
  onPay,
  payLabel,
  onPlanTap,
  onDelete,
  deleteLabel,
  children,
}: {
  name: string;
  subtitle?: React.ReactNode;
  done?: number;
  plan?: number;
  tone?: "in" | "out" | "neutral";
  bold?: boolean;
  onOpen?: () => void;
  onPay?: (amount: number) => Promise<void> | void;
  payLabel?: string;
  onPlanTap?: () => void;
  onDelete?: () => Promise<void> | void;
  deleteLabel?: string;
  children?: React.ReactNode;
}) {
  const [confirm, setConfirm] = useState(false);
  const color = tone === "in" ? "var(--mint)" : tone === "out" ? "var(--over)" : "var(--text)";
  const left = Math.max(0, plan - done);
  const hasPlan = plan > 0;
  const doneCls = done > 0 ? "" : "faint";
  return (
    <div className="group py-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
          onClick={onOpen}
          title={onOpen ? tr("Open") : undefined}
        >
          <span className="mt-1.5">
            <CategoryDot name={name} />
          </span>
          <span className="min-w-0">
            <span className={`block truncate text-sm ${bold ? "font-semibold" : "font-medium"}`}>{name}</span>
            {subtitle && <span className="faint block truncate text-xs">{subtitle}</span>}
          </span>
        </button>

        <span className="shrink-0 whitespace-nowrap text-right text-sm tabular-nums">
          <span className={doneCls} style={done > 0 ? { color } : undefined}>
            {money(done)}
          </span>
          {hasPlan && (
            <>
              <span className="faint"> / </span>
              {onPlanTap ? (
                <button type="button" className="muted font-medium underline-offset-4 hover:underline" onClick={onPlanTap} title={tr("Change this month's plan")}>
                  {money(plan)}
                </button>
              ) : (
                <button type="button" className="muted font-medium" onClick={onOpen}>
                  {money(plan)}
                </button>
              )}
            </>
          )}
        </span>

        {onPay && (
          <ConfirmPay amount={left > 0 ? left : plan || 0} onConfirm={onPay} label={payLabel ?? tr("Add to {v0}", { v0: name })} />
        )}

        {onDelete && (
          <button
            type="button"
            aria-label={deleteLabel ?? tr("Delete")}
            title={confirm ? tr("Tap again to delete") : deleteLabel ?? tr("Delete")}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm"
            style={
              confirm
                ? { background: "var(--over)", color: "#fff" }
                : { color: "var(--text-faint)" }
            }
            onClick={async () => {
              if (!confirm) {
                setConfirm(true);
                setTimeout(() => setConfirm(false), 3000);
                return;
              }
              setConfirm(false);
              await onDelete();
            }}
          >
            {confirm ? "✓" : "×"}
          </button>
        )}
      </div>
      {hasPlan && (
        <div className="mt-1.5 pl-5">
          <ProgressBar spent={tone === "in" ? Math.min(done, plan) : done} limit={plan} />
        </div>
      )}
      {children}
    </div>
  );
}
