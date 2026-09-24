"use client";

import { useState } from "react";
import { useApp, type Space } from "@/lib/i18n";

/** Personal | Business segmented control. Switching reloads every screen. */
export function SpaceSwitcher({ compact = false }: { compact?: boolean }) {
  const { space, switchSpace, t, ready, features, household } = useApp();
  const [busy, setBusy] = useState<Space | null>(null);

  async function go(s: Space) {
    if (s === space || busy) return;
    setBusy(s);
    await switchSpace(s);
    setBusy(null);
  }

  const opts: [Space, string][] = [["personal", t("Personal")]];
  if (features.business || space === "business") opts.push(["business", t("Business")]);
  if (household || space === "shared") opts.push(["shared", t("Couple")]);
  // only one space → nothing to switch
  if (opts.length < 2) return null;

  return (
    <div
      role="tablist"
      aria-label={t("Space")}
      className={`grid rounded-full p-1 ${compact ? "text-xs" : "text-sm"}`}
      style={{
        gridTemplateColumns: `repeat(${opts.length}, minmax(0, 1fr))`,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        opacity: ready ? 1 : 0.6,
      }}
    >
      {opts.map(([key, label]) => {
        const on = space === key;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={on}
            onClick={() => go(key)}
            className={`whitespace-nowrap rounded-full font-semibold transition-colors ${
              compact ? (opts.length > 2 ? "px-1.5 py-1 text-[11px]" : "px-2.5 py-1") : "px-4 py-1.5"
            }`}
            style={{
              background: on ? "var(--mint)" : "transparent",
              color: on ? "#06130d" : "var(--text-soft)",
            }}
          >
            {busy === key ? "…" : label}
          </button>
        );
      })}
    </div>
  );
}

export function LangToggle() {
  const { lang, setLang } = useApp();
  return (
    <div
      className="grid grid-cols-2 rounded-full p-0.5 text-xs"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
      aria-label="Language / Idioma"
    >
      {(["en", "es"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className="rounded-full px-2.5 py-1 font-semibold uppercase"
          style={{
            background: lang === l ? "var(--mint)" : "transparent",
            color: lang === l ? "#06130d" : "var(--text-soft)",
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
