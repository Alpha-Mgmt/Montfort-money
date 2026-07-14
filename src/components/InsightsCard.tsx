"use client";

import { useEffect, useRef, useState } from "react";

type Insight = { tone: "warn" | "good" | "tip"; text: string };
type Analysis = { headline: string; insights: Insight[]; generated?: boolean };
type ChatMsg = { role: "user" | "assistant"; content: string };

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

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2"
      style={{ borderColor: "var(--mint)", borderTopColor: "transparent" }}
    />
  );
}

/** Montfort AI: on-demand month insights + free-form chat over your data. */
export function InsightsCard({ month }: { month: string }) {
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [insightsError, setInsightsError] = useState(false);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // a new month = fresh analysis and chat
  useEffect(() => {
    setAnalysis(null);
    setInsightsError(false);
    setMessages([]);
    setInput("");
  }, [month]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, asking]);

  async function generateInsights() {
    setLoadingInsights(true);
    setInsightsError(false);
    try {
      const r = await fetch("/api/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setAnalysis((await r.json()) as Analysis);
    } catch {
      setInsightsError(true);
    } finally {
      setLoadingInsights(false);
    }
  }

  async function ask() {
    const q = input.trim();
    if (!q || asking) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setInput("");
    setAsking(true);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month, messages: next }),
      });
      const data = await r.json();
      setMessages([
        ...next,
        {
          role: "assistant",
          content: data?.reply ?? "Sorry, I couldn't answer that.",
        },
      ]);
    } catch {
      setMessages([
        ...next,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setAsking(false);
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
          <h2 className="font-display font-semibold">Montfort AI</h2>
        </div>
        {analysis && !loadingInsights && (
          <button
            className="faint text-xs hover:underline"
            onClick={generateInsights}
          >
            Refresh
          </button>
        )}
      </div>

      {/* ---- month insights ---- */}
      {!analysis && !loadingInsights && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="muted text-sm">
            A quick read on your month: where you&apos;re over, what&apos;s
            coming up, and how your goals are tracking.
          </p>
          <button
            className="btn btn-primary !py-2 !text-sm"
            onClick={generateInsights}
          >
            Analyze this month
          </button>
        </div>
      )}

      {loadingInsights && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Spinner />
          <span className="muted">Reading your month…</span>
        </div>
      )}

      {insightsError && !loadingInsights && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm" style={{ color: "var(--over)" }}>
            Couldn&apos;t generate the analysis.
          </p>
          <button
            className="btn btn-ghost !py-2 !text-sm"
            onClick={generateInsights}
          >
            Retry
          </button>
        </div>
      )}

      {analysis && !loadingInsights && (
        <div className="mt-3">
          <p className="font-display text-base font-semibold">
            {analysis.headline}
          </p>
          <div className="mt-2 grid gap-2.5">
            {analysis.insights.map((it, i) => (
              <div key={i} className="flex gap-2.5">
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: toneColor[it.tone] ?? "var(--mint)" }}
                />
                <p className="text-sm leading-relaxed">{it.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- chat ---- */}
      <div className="divider mt-4 pt-4">
        {messages.length > 0 && (
          <div
            ref={threadRef}
            className="mb-3 grid max-h-80 gap-2 overflow-y-auto"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex"}
              >
                <div
                  className="max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
                  style={
                    m.role === "user"
                      ? { background: "var(--mint-soft)", color: "var(--text)" }
                      : { background: "var(--surface-2)" }
                  }
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))}
            {asking && (
              <div className="flex items-center gap-2 text-sm">
                <Spinner />
                <span className="muted">Thinking…</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            className="input !py-2 text-sm"
            placeholder="Ask anything about your money…"
            value={input}
            disabled={asking}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ask()}
          />
          <button
            className="btn btn-primary !px-4 !py-2 !text-sm"
            onClick={ask}
            disabled={asking || !input.trim()}
          >
            Ask
          </button>
        </div>
        {messages.length === 0 && (
          <p className="faint mt-2 text-xs">
            e.g. &ldquo;How much have I spent on Cars this year?&rdquo; ·
            &ldquo;Can I afford $500 more this month?&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}
