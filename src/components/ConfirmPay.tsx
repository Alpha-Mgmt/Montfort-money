"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The "palomita": a check button prefilled with the planned amount.
 * Tap ✓ -> shows the amount (editable if it was more or less) -> ✓ logs it.
 */
export function ConfirmPay({
  amount,
  onConfirm,
  label = "Mark as paid",
}: {
  amount: number;
  onConfirm: (amount: number) => Promise<void> | void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(amount));
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(String(amount));
      inputRef.current?.select();
    }
  }, [open, amount]);

  async function submit() {
    const n = parseFloat(value);
    if (!n || n <= 0) return;
    setBusy(true);
    await onConfirm(n);
    setBusy(false);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        aria-label={label}
        onClick={() => setOpen(true)}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-xs font-bold"
        style={{ borderColor: "var(--mint)", color: "var(--mint)" }}
      >
        ✓
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="relative">
        <span className="faint pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm">
          $
        </span>
        <input
          ref={inputRef}
          className="input !w-24 !py-1 !pl-6 !pr-2 text-sm"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") setOpen(false);
          }}
        />
      </span>
      <button
        aria-label="Confirm"
        onClick={submit}
        disabled={busy}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold"
        style={{ background: "var(--mint)", color: "#06130d" }}
      >
        ✓
      </button>
      <button
        aria-label="Cancel"
        onClick={() => setOpen(false)}
        className="faint px-1 text-sm"
      >
        ×
      </button>
    </span>
  );
}
