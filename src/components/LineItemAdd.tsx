"use client";

import { useEffect, useRef, useState } from "react";
import type { Frequency } from "@/lib/types";
import { tr } from "@/lib/i18n";

export type LineItemFreq = "none" | Frequency;

const planOptions: { v: Frequency; label: string }[] = [
  { v: "once", label: "This month only" },
  { v: "monthly", label: "Every month" },
  { v: "semimonthly", label: "Twice a month" },
  { v: "biweekly", label: "Every 2 weeks" },
  { v: "weekly", label: "Every week" },
  { v: "quarterly", label: "Every 3 months" },
  { v: "yearly", label: "Every year" },
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
  // plan first: most adds under a category are "I'll spend this", not "I spent it"
  const [mode, setMode] = useState<"plan" | "log">("plan");
  const [freq, setFreq] = useState<Frequency>("once");
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
    setFreq("once");
    setMode("plan");
  }

  async function submit() {
    const n = parseFloat(amount);
    if (!n || n <= 0) return;
    setBusy(true);
    await onSubmit(n, note.trim(), mode === "log" ? "none" : freq, date);
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
        aria-label={tr("Quick add line item")}
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
      <span className="inline-flex overflow-hidden rounded-full border text-xs" style={{ borderColor: "var(--border)" }}>
        {(["plan", "log"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="px-2.5 py-1 font-semibold"
            style={mode === m ? { background: "var(--mint)", color: "#06130d" } : { color: "var(--text-soft)" }}
          >
            {m === "plan" ? tr("Plan it") : tr("Already paid")}
          </button>
        ))}
      </span>
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
        aria-label={tr("Date")}
      />
      {mode === "plan" && (
        <select
          className="input !w-auto !px-2 !py-1 text-sm"
          value={freq}
          disabled={busy}
          onChange={(e) => setFreq(e.target.value as Frequency)}
        >
          {planOptions.map((o) => (
            <option key={o.v} value={o.v}>
              {tr(o.label)}
            </option>
          ))}
        </select>
      )}
      <button
        aria-label={tr("Save")}
        onClick={submit}
        disabled={busy}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold"
        style={{ background: "var(--mint)", color: "#06130d" }}
      >
        ✓
      </button>
      <button aria-label={tr("Cancel")} onClick={reset} className="faint px-1 text-sm">
        ×
      </button>
    </div>
  );
}
