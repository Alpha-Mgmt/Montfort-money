"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The two-second logger: a "+" that flips into a small amount input.
 * Enter (or ✓) saves, Esc closes. No sheets, no questions.
 * variant="withdraw" renders a "−" button for taking money out.
 */
export function QuickAdd({
  onSubmit,
  label = "amount",
  variant = "add",
}: {
  onSubmit: (amount: number, note: string) => Promise<void> | void;
  label?: string;
  variant?: "add" | "withdraw";
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function submit() {
    const amount = parseFloat(value);
    if (!amount || amount <= 0) return;
    setBusy(true);
    await onSubmit(amount, "");
    setBusy(false);
    setValue("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        aria-label={`Quick ${variant === "withdraw" ? "withdraw" : "add"} ${label}`}
        onClick={() => setOpen(true)}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-semibold"
        style={
          variant === "withdraw"
            ? { background: "var(--over-soft)", color: "var(--over)" }
            : { background: "var(--mint-soft)", color: "var(--mint)" }
        }
      >
        {variant === "withdraw" ? "−" : "+"}
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
          placeholder="0.00"
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") {
              setOpen(false);
              setValue("");
            }
          }}
        />
      </span>
      <button
        aria-label="Save"
        onClick={submit}
        disabled={busy}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold"
        style={
          variant === "withdraw"
            ? { background: "var(--over)", color: "#fff" }
            : { background: "var(--mint)", color: "#06130d" }
        }
      >
        ✓
      </button>
      <button
        aria-label="Cancel"
        onClick={() => {
          setOpen(false);
          setValue("");
        }}
        className="faint px-1 text-sm"
      >
        ×
      </button>
    </span>
  );
}
