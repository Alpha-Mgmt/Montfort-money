"use client";

import { useEffect, useRef, useState } from "react";

type Insight = { tone: "warn" | "good" | "tip"; text: string };
type Analysis = { headline: string; insights: Insight[]; generated?: boolean };
type Msg = { role: "user" | "assistant"; content?: string; analysis?: Analysis };

const toneColor: Record<string, string> = {
  warn: "var(--over)",
  good: "var(--mint)",
  tip: "var(--chart-expense)",
};

const EXAMPLES = [
  "How much have I spent on Cars this year?",
  "Can I afford $500 more this month?",
  "Which bills are coming before my next paycheck?",
];

function Sparkle({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
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

/** Floating Montfort AI assistant: fixed to the viewport, follows scroll,
 *  opens into a chat panel, minimizes back to a pill. */
export function AIAssistant({ month }: { month: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // a new month = fresh conversation
  useEffect(() => {
    setMessages([]);
    setInput("");
  }, [month]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function analyzeMonth() {
    if (busy) return;
    setBusy(true);
    setMessages((m) => [...m, { role: "user", content: "Analyze this month" }]);
    try {
      const r = await fetch("/api/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month }),
      });
      const data = (await r.json()) as Analysis;
      setMessages((m) => [...m, { role: "assistant", analysis: data }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Couldn't analyze right now. Try again." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          month,
          messages: next
            .filter((m) => m.content)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await r.json();
      setMessages([
        ...next,
        { role: "assistant", content: data?.reply ?? "Sorry, I couldn't answer that." },
      ]);
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  // ---- collapsed pill ----
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open Montfort AI"
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg lg:bottom-6 lg:right-6"
        style={{
          background: "linear-gradient(120deg, #2bd396, #25c2b0)",
          color: "#06130d",
          boxShadow: "0 10px 30px rgba(43,211,150,0.35)",
        }}
      >
        <Sparkle />
        Montfort AI
      </button>
    );
  }

  // ---- open panel ----
  return (
    <div
      className="card fixed bottom-20 right-4 z-40 flex w-[min(92vw,380px)] flex-col overflow-hidden lg:bottom-6 lg:right-6"
      style={{ maxHeight: "min(72vh, 560px)" }}
    >
      {/* header */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2">
          <span
            className="grid h-7 w-7 place-items-center rounded-full"
            style={{ background: "var(--mint-soft)", color: "var(--mint)" }}
          >
            <Sparkle />
          </span>
          <span className="font-display font-semibold">Montfort AI</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              className="faint px-2 text-xs hover:underline"
              onClick={() => setMessages([])}
            >
              Clear
            </button>
          )}
          <button
            aria-label="Minimize"
            className="faint grid h-7 w-7 place-items-center rounded-full text-lg"
            onClick={() => setOpen(false)}
            style={{ background: "var(--surface-2)" }}
          >
            –
          </button>
        </div>
      </div>

      {/* thread */}
      <div ref={threadRef} className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="grid gap-3">
            <p className="muted text-sm">
              Ask me anything about your money this month — or get a quick read.
            </p>
            <button
              className="btn btn-primary !py-2 !text-sm"
              onClick={analyzeMonth}
              disabled={busy}
            >
              Analyze this month
            </button>
            <div className="grid gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => send(ex)}
                  disabled={busy}
                  className="card-soft px-3 py-2 text-left text-sm hover:opacity-80"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-2.5">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div
                    className="max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
                    style={{ background: "var(--mint-soft)", color: "var(--text)" }}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex">
                  <div
                    className="max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed"
                    style={{ background: "var(--surface-2)" }}
                  >
                    {m.analysis ? (
                      <div className="grid gap-2">
                        <p className="font-semibold">{m.analysis.headline}</p>
                        {m.analysis.insights.map((it, k) => (
                          <div key={k} className="flex gap-2">
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                              style={{ background: toneColor[it.tone] ?? "var(--mint)" }}
                            />
                            <p className="leading-relaxed">{it.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    )}
                  </div>
                </div>
              )
            )}
            {busy && (
              <div className="flex items-center gap-2 text-sm">
                <Spinner />
                <span className="muted">Thinking…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* input */}
      <div
        className="flex items-center gap-2 border-t px-3 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <input
          ref={inputRef}
          className="input !py-2 text-sm"
          placeholder="Ask about your money…"
          value={input}
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
        />
        <button
          className="btn btn-primary !px-4 !py-2 !text-sm"
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
        >
          Ask
        </button>
      </div>
    </div>
  );
}
