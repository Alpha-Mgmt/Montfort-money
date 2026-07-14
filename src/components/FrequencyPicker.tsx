"use client";

import { frequencyHints, frequencyLabels } from "@/lib/recurring";
import type { Frequency } from "@/lib/types";

type Value = "none" | Frequency;

const order: Frequency[] = [
  "monthly",
  "semimonthly",
  "biweekly",
  "weekly",
  "yearly",
];

/**
 * Pill-based repeat picker with a plain-language hint for the selection.
 * `allowNone` adds a "One-time" pill (for the add-transaction flow).
 */
export function FrequencyPicker({
  value,
  onChange,
  allowNone = false,
}: {
  value: Value;
  onChange: (v: Value) => void;
  allowNone?: boolean;
}) {
  const pills: { v: Value; label: string }[] = [
    ...(allowNone ? [{ v: "none" as Value, label: "One-time" }] : []),
    ...order.map((f) => ({ v: f as Value, label: frequencyLabels[f] })),
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {pills.map((p) => (
          <button
            key={p.v}
            type="button"
            className={`btn !px-3.5 !py-1.5 !text-sm ${value === p.v ? "btn-primary" : "btn-ghost"}`}
            onClick={() => onChange(p.v)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="faint mt-1.5 text-xs">
        {value === "none"
          ? "Logged once, just in this month."
          : frequencyHints[value as Frequency]}
      </p>
    </div>
  );
}
