"use client";

import { useEffect, useState } from "react";

type Insight = { tone: "warn" | "good" | "tip"; text: string };
type Result = { headline: string; insights: Insight[]; generated?: boolean };

const toneColor: Record<string, string> = {
  warn: "var(--over)",
  good: "var(--mint)",
  tip: "var(--chart-expense)",
};

function Sparkle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3z"
        fill="currentColor"
      />
      <path
        d="M18.5 15l.8 2.1 2.2.8-2.2.8-.8 2.1-.8-2.1-2.2-.8 2.2-.8.8-2.1z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  );
}

/** On-demand "read my month" card powered by the /api/insights route. */
export function InsightsCard({ month }: { month: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState(false);

  // a new month = a fresh analysis
  useEffect(() => {
    setResult(null);
    setError(false);
  }, [month]);

  async function generate() {
    setLoading(true);
    setError(false);
    try {
      const r = await fetch("/api/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as Result;
      setResult(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="grid h-7 w-7 place-items-center rounded-full"
            style={{ background: "var(--mint-soft)", color: "var(--mint)" }}
          >
            <Sparkle />
          </span>
          <h2 className="font-display font-semibold">Tu mes con IA</h2>
        </div>
        {result && !loading && (
          <button className="faint text-xs hover:underline" onClick={generate}>
            Volver a analizar
          </button>
        )}
      </div>

      {!result && !loading && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="muted text-sm">
            Un vistazo rápido: en qué te pasas, qué pagos vienen y cómo van tus
            metas.
          </p>
          <button className="btn btn-primary !py-2 !text-sm" onClick={generate}>
            Analizar mi mes
          </button>
        </div>
      )}

      {loading && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span
            className="inline-block h-3 w-3 animate-spin rounded-full border-2"
            style={{
              borderColor: "var(--mint)",
              borderTopColor: "transparent",
            }}
          />
          <span className="muted">Leyendo tu mes…</span>
        </div>
      )}

      {error && !loading && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" style={{ color: "var(--over)" }}>
            No pude generar el análisis. Intenta de nuevo.
          </p>
          <button className="btn btn-ghost !py-2 !text-sm" onClick={generate}>
            Reintentar
          </button>
        </div>
      )}

      {result && !loading && (
        <div className="mt-3">
          <p className="font-display text-base font-semibold">
            {result.headline}
          </p>
          <div className="mt-2 grid gap-2.5">
            {result.insights.map((it, i) => (
              <div key={i} className="flex gap-2.5">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: toneColor[it.tone] ?? "var(--mint)" }}
                />
                <p className="text-sm leading-relaxed">{it.text}</p>
              </div>
            ))}
          </div>
          {result.generated && (
            <p className="faint mt-3 text-xs">
              Generado con IA a partir de tus datos · puede equivocarse, tú
              decides.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
