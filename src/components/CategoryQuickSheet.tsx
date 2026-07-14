"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sheet } from "@/components/Sheet";
import type { Frequency, Kind } from "@/lib/types";

type LineDraft = { name: string; amount: string; freq: "once" | Frequency };
type CatDraft = { name: string; lines: LineDraft[] };

const emptyLine = (): LineDraft => ({ name: "", amount: "", freq: "monthly" });
const emptyCat = (): CatDraft => ({ name: "", lines: [] });

const freqOptions: { v: "once" | Frequency; label: string }[] = [
  { v: "monthly", label: "Monthly" },
  { v: "once", label: "This month only" },
  { v: "semimonthly", label: "Twice a month" },
  { v: "biweekly", label: "Every 2 weeks" },
  { v: "weekly", label: "Weekly" },
  { v: "yearly", label: "Yearly" },
];

function LineEditor({
  line,
  kind,
  onChange,
  onRemove,
}: {
  line: LineDraft;
  kind: Kind;
  onChange: (patch: Partial<LineDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        className="input !min-w-24 !flex-1 !px-2 !py-1 text-sm"
        placeholder={kind === "income" ? "e.g. Salary" : "e.g. Netflix"}
        value={line.name}
        onChange={(e) => onChange({ name: e.target.value })}
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
          value={line.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
        />
      </span>
      <select
        className="input !w-auto !px-2 !py-1 text-sm"
        value={line.freq}
        onChange={(e) => onChange({ freq: e.target.value as any })}
      >
        {freqOptions.map((o) => (
          <option key={o.v} value={o.v}>
            {o.label}
          </option>
        ))}
      </select>
      <button aria-label="Remove line" className="faint px-1" onClick={onRemove}>
        ×
      </button>
    </div>
  );
}

/**
 * The fast builder: name a category (or a whole group), add several
 * categories at once, and optionally plan line items under each —
 * all in one save, no window-hopping.
 */
export function CategoryQuickSheet({
  open,
  onClose,
  kind,
  onSaved,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  kind: Kind;
  onSaved: () => void;
  defaultDate: string;
}) {
  const [name, setName] = useState("");
  const [bulk, setBulk] = useState(false);
  const [children, setChildren] = useState<CatDraft[]>([]);
  const [ownLines, setOwnLines] = useState<LineDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setBulk(false);
      setChildren([]);
      setOwnLines([]);
      setError(null);
    }
  }, [open]);

  function setChild(i: number, patch: Partial<CatDraft>) {
    setChildren((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }
  function setChildLine(i: number, k: number, patch: Partial<LineDraft>) {
    setChildren((cs) =>
      cs.map((c, j) =>
        j === i
          ? {
              ...c,
              lines: c.lines.map((l, m) => (m === k ? { ...l, ...patch } : l)),
            }
          : c
      )
    );
  }

  async function save() {
    if (!name.trim()) {
      setError("Give it a name.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // 1) the main category (a group if it gets children)
    const { data: parent, error: parentErr } = await supabase
      .from("categories")
      .insert({ user_id: user!.id, name: name.trim(), icon: "", kind })
      .select("id")
      .single();
    if (parentErr || !parent) {
      setError("Couldn't create it — maybe that name already exists.");
      setBusy(false);
      return;
    }

    const itemRows: any[] = [];
    const pushLines = (lines: LineDraft[], categoryId: string) => {
      for (const l of lines) {
        const amount = parseFloat(l.amount);
        if (!l.name.trim() || !(amount > 0)) continue;
        itemRows.push({
          user_id: user!.id,
          title: l.name.trim(),
          kind,
          amount,
          category_id: categoryId,
          frequency: l.freq,
          start_date: defaultDate,
        });
      }
    };
    pushLines(ownLines, parent.id);

    // 2) child categories + their line items
    for (const child of children) {
      if (!child.name.trim()) continue;
      const { data: c } = await supabase
        .from("categories")
        .insert({
          user_id: user!.id,
          name: child.name.trim(),
          icon: "",
          kind,
          parent_id: parent.id,
        })
        .select("id")
        .single();
      if (c) pushLines(child.lines, c.id);
    }

    // 3) all plan line items in one insert
    if (itemRows.length > 0) {
      await supabase.from("recurring_items").insert(itemRows);
    }

    setBusy(false);
    onSaved();
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={kind === "income" ? "New income category" : "New expense category"}
    >
      <div className="grid gap-4">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            placeholder={
              kind === "income"
                ? "e.g. My job, Rents, Montfort"
                : "e.g. Housing, Vehicles, Subscriptions"
            }
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        {/* line items directly under the main category */}
        {ownLines.length > 0 && (
          <div className="grid gap-1.5">
            <p className="label !mb-0">Plan line items in {name || "it"}</p>
            {ownLines.map((l, k) => (
              <LineEditor
                key={k}
                line={l}
                kind={kind}
                onChange={(patch) =>
                  setOwnLines((ls) =>
                    ls.map((x, m) => (m === k ? { ...x, ...patch } : x))
                  )
                }
                onRemove={() =>
                  setOwnLines((ls) => ls.filter((_, m) => m !== k))
                }
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 text-sm">
          <button
            className="btn btn-ghost !px-3 !py-1 !text-xs"
            onClick={() => setOwnLines((ls) => [...ls, emptyLine()])}
          >
            + line item
          </button>
          {!bulk && (
            <button
              className="btn btn-ghost !px-3 !py-1 !text-xs"
              onClick={() => {
                setBulk(true);
                setChildren([emptyCat(), emptyCat(), emptyCat()]);
              }}
            >
              + categories inside (make it a group)
            </button>
          )}
        </div>

        {bulk && (
          <div className="grid gap-3">
            {children.map((c, i) => (
              <div key={i} className="card-soft grid gap-2 p-3">
                <div className="flex items-center gap-2">
                  <input
                    className="input !flex-1 !px-2 !py-1.5 text-sm"
                    placeholder={`Category ${i + 1} — e.g. ${
                      kind === "income" ? "Bonus" : "Utilities"
                    }`}
                    value={c.name}
                    onChange={(e) => setChild(i, { name: e.target.value })}
                  />
                  <button
                    aria-label="Remove category"
                    className="faint px-1"
                    onClick={() =>
                      setChildren((cs) => cs.filter((_, j) => j !== i))
                    }
                  >
                    ×
                  </button>
                </div>
                {c.lines.map((l, k) => (
                  <LineEditor
                    key={k}
                    line={l}
                    kind={kind}
                    onChange={(patch) => setChildLine(i, k, patch)}
                    onRemove={() =>
                      setChild(i, { lines: c.lines.filter((_, m) => m !== k) })
                    }
                  />
                ))}
                <button
                  className="faint w-fit text-xs underline underline-offset-4"
                  onClick={() =>
                    setChild(i, { lines: [...c.lines, emptyLine()] })
                  }
                >
                  + line items below
                </button>
              </div>
            ))}
            <button
              className="btn btn-ghost !py-1.5 !text-sm"
              onClick={() => setChildren((cs) => [...cs, emptyCat()])}
            >
              + another category
            </button>
          </div>
        )}

        {error && (
          <p className="text-sm" style={{ color: "var(--over)" }}>
            {error}
          </p>
        )}
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save everything"}
        </button>
        <p className="faint text-xs">
          Empty rows are skipped. Line items become plan amounts you fill up
          with the ✓ as money actually moves.
        </p>
      </div>
    </Sheet>
  );
}
