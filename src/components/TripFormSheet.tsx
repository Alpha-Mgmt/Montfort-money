"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { tr } from "@/lib/i18n";
import { Sheet } from "@/components/Sheet";
import type { Trip } from "@/lib/trips";

/** create or edit a trip */
export function TripFormSheet({
  trip,
  onClose,
  onSaved,
  onDelete,
  onLeave,
}: {
  trip?: Trip;
  onClose: () => void;
  onSaved: (id: string) => void;
  onDelete?: () => void;
  onLeave?: () => void;
}) {
  const [name, setName] = useState(trip?.name ?? "");
  const [dest, setDest] = useState(trip?.destination ?? "");
  const [start, setStart] = useState(trip?.start_date ?? "");
  const [end, setEnd] = useState(trip?.end_date ?? "");
  const [budget, setBudget] = useState(trip?.budget ? String(trip.budget) : "");
  const [fund, setFund] = useState(trip?.fund_goal ? String(trip.fund_goal) : "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [askDel, setAskDel] = useState(false);

  async function save() {
    if (!name.trim()) {
      setErr(tr("Give the trip a name"));
      return;
    }
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    const row = {
      name: name.trim(),
      destination: dest.trim() || null,
      start_date: start || null,
      end_date: end || null,
      budget: budget ? Number(budget) : null,
      fund_goal: fund ? Number(fund) : null,
    };
    let id = trip?.id;
    if (id) {
      const { error } = await supabase.from("trips").update(row).eq("id", id);
      if (error) return fail(error.message);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("trips")
        .insert({ ...row, owner_id: user!.id })
        .select("id")
        .single();
      if (error || !data) return fail(error?.message ?? tr("Couldn't save"));
      id = data.id as string;
    }
    if (file && id) {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${id}/cover-${Date.now()}.${ext}`;
      const up = await supabase.storage.from("trip-covers").upload(path, file, { upsert: true, contentType: file.type });
      if (!up.error) await supabase.from("trips").update({ cover_path: path }).eq("id", id);
    }
    setBusy(false);
    onSaved(id!);
  }
  function fail(msg: string) {
    setBusy(false);
    setErr(msg);
  }

  return (
    <Sheet open onClose={onClose} title={trip ? tr("Edit trip") : tr("New trip")}>
      <div className="grid gap-3">
        <label className="grid gap-1">
          <span className="faint text-xs font-semibold">{tr("Trip name")}</span>
          <input className="input" placeholder={tr("e.g. Italy with friends")} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="grid gap-1">
          <span className="faint text-xs font-semibold">{tr("Where")}</span>
          <input className="input" placeholder={tr("e.g. Rome, Florence")} value={dest} onChange={(e) => setDest(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="faint text-xs font-semibold">{tr("From")}</span>
            <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="faint text-xs font-semibold">{tr("To")}</span>
            <input className="input" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="faint text-xs font-semibold">{tr("Budget")}</span>
            <input className="input" type="number" inputMode="decimal" min="0" placeholder="$" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="faint text-xs font-semibold">{tr("Trip fund goal")}</span>
            <input className="input" type="number" inputMode="decimal" min="0" placeholder="$" value={fund} onChange={(e) => setFund(e.target.value)} />
          </label>
        </div>
        <label className="grid gap-1">
          <span className="faint text-xs font-semibold">{tr("Cover photo (optional)")}</span>
          <input className="text-sm" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="faint text-[11px]">{tr("No photo? We make a cover with the trip's name.")}</span>
        </label>
        {err && (
          <p className="text-xs" style={{ color: "var(--over)" }}>
            {err}
          </p>
        )}
        <div className="flex items-center gap-2 pt-1">
          {onDelete &&
            (askDel ? (
              <span className="flex items-center gap-2 text-xs">
                <button className="font-semibold" style={{ color: "var(--over)" }} onClick={onDelete}>
                  {tr("Yes, delete trip")}
                </button>
                <button className="faint" onClick={() => setAskDel(false)}>
                  {tr("Cancel")}
                </button>
              </span>
            ) : (
              <button className="text-xs font-semibold" style={{ color: "var(--over)" }} onClick={() => setAskDel(true)}>
                {tr("Delete trip")}
              </button>
            ))}
          {onLeave && (
            <button className="text-xs font-semibold" style={{ color: "var(--over)" }} onClick={onLeave}>
              {tr("Leave trip")}
            </button>
          )}
          <span className="flex-1" />
          <button className="btn btn-ghost" onClick={onClose}>
            {tr("Cancel")}
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? tr("Saving…") : trip ? tr("Save") : tr("Create trip")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
