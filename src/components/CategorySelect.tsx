"use client";

import { buildCategoryTree } from "@/lib/data";
import type { Category, Kind } from "@/lib/types";

export function CategorySelect({
  cats,
  kind,
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = "No category",
}: {
  cats: Category[];
  kind: Kind;
  value: string;
  onChange: (id: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const { groups, standalone } = buildCategoryTree(cats, kind);
  return (
    <select
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {groups.map((g) => (
        <optgroup key={g.id} label={`${g.icon} ${g.name}`}>
          <option value={g.id}>
            {g.icon} {g.name} (general)
          </option>
          {g.children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </optgroup>
      ))}
      {standalone.map((c) => (
        <option key={c.id} value={c.id}>
          {c.icon} {c.name}
        </option>
      ))}
    </select>
  );
}

/** "Group → Child" display name for a category id */
export function categoryPath(
  cats: Category[],
  id: string | null | undefined
): { icon: string; label: string } | null {
  if (!id) return null;
  const byId = new Map(cats.map((c) => [c.id, c]));
  const cat = byId.get(id);
  if (!cat) return null;
  const parent = cat.parent_id ? byId.get(cat.parent_id) : null;
  return {
    icon: cat.icon,
    label: parent ? `${parent.name} → ${cat.name}` : cat.name,
  };
}
