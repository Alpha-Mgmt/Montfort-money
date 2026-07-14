"use client";

import { useEffect, useRef, useState } from "react";
import type { Frequency } from "@/lib/types";

export type LineItemFreq = "none" | Frequency;

const freqOptions: { v: LineItemFreq; label: string }[] = [
  { v: "none", label: "Just log it" },
  { v: "once", label: "Plan · this month" },
  { v: "monthly", label: "Plan · monthly" },
  { v: "semimonthly", label: "Plan · twice a month" },
  { v: "biweekly", label: "Plan · every 2 weeks" },
  { v: "weekly", label: "Plan · weekly" },
  { v: "yearly", label: "Plan · yearly" },
];

/**
 * The no-window line-item logger: "+" flips into
 * [what] [amount] [one-time ▾] [✓] — Enter saves, Esc closes.
 */
export function LineItemAdd({
  onSubmit,
  placeholder = "what was it?",
  defaultDate,
}: {
  onSubmit: (
    amount: number,
    note: string,
    freq: LineItemFreq,
    date: string
  ) => Promise<void> | void;
  placeholder?: string;
  defaultDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [freq, setFreq] = useState<LineItemFreq>("none");
  const [date, setDate] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  const noteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDate(defaultDate);
      noteRef.current?.focus();
    }
  }, [open, defaultDate]);

  function reset() {
    setOpen(false);
    setNote("");
    setAmount("");
    setFreq("none");
  }

  async function submit() {
    const n = parseFloat(amount);
    if (!n || n <= 0) return;
    setBusy(true);
    await onSubmit(n, note.trim(), freq, date);
    setBusy(false);
    reset();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") reset();
  }

  if (!open) {
    return (
      <button
        aria-label="Quick add line item"
        onClick={() => setOpen(true)}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold"
        style={{ background: "var(--mint-soft)", color: "var(--mint)" }}
      >
        +
      </button>
    );
  }

  return (
    <div className="mt-1 flex w-full flex-wrap items-center gap-1.5">
      <input
        ref={noteRef}
        className="input !min-w-28 !flex-1 !px-2 !py-1 text-sm"
        placeholder={placeholder}
        value={note}
        disabled={busy}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={onKey}
      />
      <span className="relative">
        <span className="faint pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm">
          $
        </span>
        <input
          className="input !w-24 !py-1 !pl-6 !pr-2 text-sm"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          placeholder="0.00"
          value={amount}
          disabled={busy}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={onKey}
        />
      </span>
      <input
        className="input !w-32 !px-2 !py-1 text-sm"
        type="date"
        value={date}
        disabled={busy}
        onChange={(e) => setDate(e.target.value)}
        onKeyDown={onKey}
        aria-label="Date"
      />
      <select
        className="input !w-auto !px-2 !py-1 text-sm"
        value={freq}
        disabled={busy}
        onChange={(e) => setFreq(e.target.value as LineItemFreq)}
      >
        {freqOptions.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        aria-label="Save"
        onClick={submit}
        disabled={busy}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold"
        style={{ background: "var(--mint)", color: "#06130d" }}
      >
        ✓
      </button>
      <button aria-label="Cancel" onClick={reset} className="faint px-1 text-sm">
        ×
      </button>
    </div>
  );
}
