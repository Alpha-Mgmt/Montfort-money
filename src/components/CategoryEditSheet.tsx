"use client";

import { useState } from "react";
import { tr } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { Sheet } from "@/components/Sheet";
import type { Category } from "@/lib/types";

/** Rename a category and choose the big group it lives in (or make a new group). */
export function CategoryEditSheet({
  cat,
  cats,
  onClose,
  onSaved,
}: {
  cat: Category;
  cats: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(cat.name);
  const isGroup = cats.some((c) => c.parent_id === cat.id);
  const [group, setGroup] = useState<string>(cat.parent_id ?? "");
  const [newGroup, setNewGroup] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const groups = cats.filter((c) => c.kind === cat.kind && !c.parent_id && c.id !== cat.id);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    const supabase = createClient();
    let parent: string | null = group || null;
    if (group === "__new") {
      if (!newGroup.trim()) {
        setBusy(false);
        setErr(tr("Name the new group"));
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("categories")
        .insert({ user_id: user!.id, name: newGroup.trim(), icon: "", kind: cat.kind, parent_id: null })
        .select("id")
        .single();
      if (error || !data) {
        setBusy(false);
        setErr(error?.message ?? tr("Couldn't save"));
        return;
      }
      parent = data.id as string;
    }
    const patch: Record<string, unknown> = { name: name.trim() };
    if (!isGroup) patch.parent_id = parent;
    const { error } = await supabase.from("categories").update(patch).eq("id", cat.id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onSaved();
  }

  return (
    <Sheet open onClose={onClose} title={isGroup ? tr("Edit group") : tr("Edit category")}>
      <div className="grid gap-4">
        <label className="grid gap-1.5">
          <span className="faint text-xs font-semibold">{tr("Name")}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        {isGroup ? (
          <p className="faint text-xs">
            {tr("This is a group: {list}.", {
              list: cats
                .filter((c) => c.parent_id === cat.id)
                .map((c) => c.name)
                .join(", "),
            })}
          </p>
        ) : (
          <label className="grid gap-1.5">
            <span className="faint text-xs font-semibold">{tr("Group")}</span>
            <select className="input" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">{tr("No group (its own block)")}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
              <option value="__new">{tr("+ New group…")}</option>
            </select>
            {group === "__new" && (
              <input
                className="input"
                placeholder={tr("e.g. Daily life")}
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
              />
            )}
          </label>
        )}
        {err && (
          <p className="text-xs" style={{ color: "var(--over)" }}>
            {err}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>
            {tr("Cancel")}
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? tr("Saving…") : tr("Save")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
