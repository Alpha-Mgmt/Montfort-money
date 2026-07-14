"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Sheet } from "@/components/Sheet";
import { money, monthStartISO } from "@/lib/format";
import { checksPerMonth, frequencyLabels } from "@/lib/recurring";
import type { Frequency, Goal } from "@/lib/types";

export type GoalDraft = {
  id?: string;
  name: string;
  target_amount: string;
  target_date: string;
  saved: string;
};

export const emptyGoalDraft = (): GoalDraft => ({
  name: "",
  target_amount: "",
  target_date: "",
  saved: "",
});

export function goalToDraft(g: Goal): GoalDraft {
  return {
    id: g.id,
    name: g.name,
    target_amount: String(g.target_amount),
    target_date: g.target_date ?? "",
    saved: String(g.saved),
  };
}

export function monthsUntil(dateISO: string): number {
  const [y, m] = monthStartISO().split("-").map(Number);
  const [ty, tm] = dateISO.split("-").map(Number);
  return Math.max(1, (ty - y) * 12 + (tm - m));
}

export function goalMath(
  target: number,
  saved: number,
  targetDate: string | null,
  paycheckFreq: Frequency
) {
  const remaining = Math.max(0, target - saved);
  if (!targetDate || remaining === 0) return { remaining, perMonth: null, perCheck: null, months: null };
  const months = monthsUntil(targetDate);
  const perMonth = remaining / months;
  const perCheck = perMonth / checksPerMonth(paycheckFreq);
  return { remaining, perMonth, perCheck, months };
}

export function GoalSheet({
  open,
  onClose,
  draft,
  setDraft,
  paycheckFreq,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  draft: GoalDraft | null;
  setDraft: (d: GoalDraft) => void;
  paycheckFreq: Frequency;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!draft) return null;
    const target = parseFloat(draft.target_amount);
    const saved = parseFloat(draft.saved || "0") || 0;
    if (!target || !draft.target_date) return null;
    const m = goalMath(target, saved, draft.target_date, paycheckFreq);
    if (m.perMonth === null) return "Target reached 🎯";
    return `${money(m.perMonth)}/month — that's ~${money(m.perCheck!)} from each paycheck (${frequencyLabels[paycheckFreq].toLowerCase()}) for ${m.months} months.`;
  }, [draft, paycheckFreq]);

  if (!draft) return null;

  async function save() {
    if (!draft) return;
    const target = parseFloat(draft.target_amount);
    if (!draft.name.trim() || !target || target <= 0) {
      setError("Name and target amount are required.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const saved = parseFloat(draft.saved || "0") || 0;
    const row = {
      name: draft.name.trim(),
      target_amount: target,
      target_date: draft.target_date || null,
      saved,
    };
    if (draft.id) {
      await supabase.from("goals").update(row).eq("id", draft.id);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("goals").insert({ ...row, user_id: user!.id });
    }
    setBusy(false);
    onClose();
    onSaved();
  }

  async function archive() {
    if (!draft?.id) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("goals").update({ archived: true }).eq("id", draft.id);
    setBusy(false);
    onClose();
    onSaved();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={draft.id ? "Edit goal" : "New goal"}
    >
      <div className="grid gap-4">
        <div>
          <label className="label">What are you saving for?</label>
          <input
            className="input"
            placeholder="e.g. House down payment, Rolex, Japan trip"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Target amount</label>
            <input
              className="input"
              type="number"
              inputMode="decimal"
              min="1"
              step="0.01"
              placeholder="e.g. 60000"
              value={draft.target_amount}
              onChange={(e) =>
                setDraft({ ...draft, target_amount: e.target.value })
              }
            />
          </div>
          <div>
            <label className="label">By when — optional</label>
            <input
              className="input"
              type="date"
              value={draft.target_date}
              onChange={(e) =>
                setDraft({ ...draft, target_date: e.target.value })
              }
            />
          </div>
        </div>
        <div>
          <label className="label">Already saved — optional</label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={draft.saved}
            onChange={(e) => setDraft({ ...draft, saved: e.target.value })}
          />
        </div>

        {preview && <div className="card-soft p-4 text-sm">{preview}</div>}

        {error && (
          <p className="text-sm" style={{ color: "var(--over)" }}>
            {error}
          </p>
        )}
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : draft.id ? "Save changes" : "Create goal"}
        </button>
        {draft.id && (
          <button className="btn btn-danger" onClick={archive} disabled={busy}>
            Archive goal
          </button>
        )}
      </div>
    </Sheet>
  );
}
