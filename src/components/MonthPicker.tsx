"use client";

import { useEffect, useRef, useState } from "react";
import { monthLabel } from "@/lib/format";

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Month label that opens a year/month grid — jump straight to December. */
export function MonthPicker({
  value,
  onChange,
}: {
  value: string; // YYYY-MM-01
  onChange: (monthISO: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => Number(value.split("-")[0]));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setYear(Number(value.split("-")[0]));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selMonth = Number(value.split("-")[1]);
  const selYear = Number(value.split("-")[0]);

  return (
    <div className="relative" ref={ref}>
      <button
        className="font-display min-w-36 rounded-full px-3 py-1 text-center font-semibold hover:opacity-80"
        onClick={() => setOpen(!open)}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {monthLabel(value)} ▾
      </button>
      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-64 rounded-2xl p-4"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
            backdropFilter: "none",
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              className="btn btn-ghost !px-2.5 !py-1"
              onClick={() => setYear(year - 1)}
              aria-label="Previous year"
            >
              ‹
            </button>
            <span className="font-display font-semibold">{year}</span>
            <button
              className="btn btn-ghost !px-2.5 !py-1"
              onClick={() => setYear(year + 1)}
              aria-label="Next year"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {monthNames.map((m, i) => {
              const isSel = year === selYear && i + 1 === selMonth;
              return (
                <button
                  key={m}
                  className="rounded-lg py-1.5 text-sm font-medium"
                  style={
                    isSel
                      ? { background: "var(--mint)", color: "#06130d" }
                      : { color: "var(--text-soft)" }
                  }
                  onClick={() => {
                    onChange(
                      `${year}-${String(i + 1).padStart(2, "0")}-01`
                    );
                    setOpen(false);
                  }}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
