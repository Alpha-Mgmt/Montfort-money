"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { tr, useApp } from "@/lib/i18n";

type Insight = { tone: "warn" | "good" | "tip"; text: string };
type Analysis = { headline: string; insights: Insight[]; generated?: boolean };
type Proposal = { action: any; summary: string };
type Msg = {
  role: "user" | "assistant";
  content?: string;
  analysis?: Analysis;
  actions?: Proposal[];
  status?: "pending" | "applying" | "done" | "cancelled" | "failed";
};

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
  const { lang, space } = useApp();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedbackMode, setFeedbackMode] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // a new month = fresh conversation
  useEffect(() => {
    setMessages([]);
    setInput("");
    setFeedbackMode(false);
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
    setMessages((m) => [...m, { role: "user", content: tr("Analyze this month") }]);
    try {
      const r = await fetch("/api/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month, lang, space }),
      });
      const data = (await r.json()) as Analysis;
      setMessages((m) => [...m, { role: "assistant", analysis: data }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: tr("Couldn't analyze right now. Try again.") },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function startFeedback() {
    setFeedbackMode(true);
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        content:
          tr("Love that you want to help shape this. What would make Montfort Money better for you? Type it below and I'll pass it straight to the team."),
      },
    ]);
    inputRef.current?.focus();
  }

  async function saveFeedback(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user)
        await supabase
          .from("feedback")
          .insert({ user_id: user.id, message: q, page: "assistant" });
      setMessages([
        ...next,
        {
          role: "assistant",
          content:
            tr("Got it — thank you. That's exactly the kind of input that makes this better. Anything else? Ask me about your money or drop another idea."),
        },
      ]);
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: tr("Couldn't send that just now — try again.") },
      ]);
    } finally {
      setFeedbackMode(false);
      setBusy(false);
    }
  }

  async function send(text: string) {
    if (feedbackMode) return saveFeedback(text);
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
          lang,
          space,
          messages: next
            .filter((m) => m.content)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await r.json();
      const actions: Proposal[] = Array.isArray(data?.actions) ? data.actions : [];
      setMessages([
        ...next,
        {
          role: "assistant",
          content: data?.reply ?? tr("Sorry, I couldn't answer that."),
          ...(actions.length ? { actions, status: "pending" as const } : {}),
        },
      ]);
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: tr("Something went wrong. Please try again.") },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function applyActions(index: number) {
    const m = messages[index];
    if (!m?.actions?.length || m.status !== "pending") return;
    const mark = (status: Msg["status"]) =>
      setMessages((ms) => ms.map((x, i) => (i === index ? { ...x, status } : x)));
    mark("applying");
    try {
      const r = await fetch("/api/ask/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actions: m.actions.map((a) => a.action) }),
      });
      const j = await r.json().catch(() => ({}));
      const ok = r.ok && (j.results ?? []).every((x: any) => x.ok);
      mark(ok ? "done" : "failed");
      // let the screen reload its numbers
      window.dispatchEvent(new CustomEvent("mf:data-changed"));
    } catch {
      mark("failed");
    }
  }

  // ---- collapsed pill ----
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label={tr("Open Montfort AI")}
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg lg:bottom-6 lg:right-6"
        style={{
          background: "linear-gradient(120deg, #2bd396, #25c2b0)",
          color: "#06130d",
          boxShadow: "0 10px 30px rgba(43,211,150,0.35)",
        }}
      >
        <Sparkle />
        {tr("Montfort AI")}
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
          <span className="font-display font-semibold">{tr("Montfort AI")}</span>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              className="faint px-2 text-xs hover:underline"
              onClick={() => setMessages([])}
            >
              {tr("Clear")}
            </button>
          )}
          <button
            aria-label={tr("Minimize")}
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
              {tr("Ask me anything about your money this month.")}
            </p>
            <div className="grid gap-1.5">
              <button
                onClick={analyzeMonth}
                disabled={busy}
                className="card-soft flex items-center gap-2 px-3 py-2 text-left text-sm hover:opacity-80"
                style={{ color: "var(--mint)" }}
              >
                <Sparkle size={14} />
                {tr("Analyze this month")}
              </button>
              {EXAMPLES.map((ex) => (
                <button
                  key={tr(ex)}
                  onClick={() => send(tr(ex))}
                  disabled={busy}
                  className="card-soft px-3 py-2 text-left text-sm hover:opacity-80"
                >
                  {ex}
                </button>
              ))}
            </div>
            <div
              className="rounded-xl p-3 text-sm"
              style={{ background: "var(--mint-soft)" }}
            >
              <p className="muted">
                {tr("We're building Montfort Money with you — got an idea or something that bugs you?")}
              </p>
              <button
                onClick={startFeedback}
                className="mt-1.5 font-semibold hover:underline"
                style={{ color: "var(--mint)" }}
              >
                {tr("Share a suggestion →")}
              </button>
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
                      <>
                        <p className="whitespace-pre-wrap">{richText(m.content ?? "")}</p>
                        {m.actions?.length ? (
                          <div className="mt-2 grid gap-1.5 rounded-xl p-2.5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                            {m.actions.map((a, k) => (
                              <p key={k} className="text-xs leading-relaxed">• {a.summary}</p>
                            ))}
                            {m.status === "pending" || m.status === "applying" ? (
                              <div className="mt-1 flex gap-2">
                                <button className="btn btn-primary !px-3 !py-1 !text-xs" disabled={m.status === "applying"} onClick={() => applyActions(i)}>
                                  {m.status === "applying" ? tr("Applying…") : tr("Apply")}
                                </button>
                                <button className="btn btn-ghost !px-3 !py-1 !text-xs" disabled={m.status === "applying"}
                                  onClick={() => setMessages((ms) => ms.map((x, j) => (j === i ? { ...x, status: "cancelled" } : x)))}>
                                  {tr("Cancel")}
                                </button>
                              </div>
                            ) : (
                              <p className="mt-1 text-xs font-semibold" style={{ color: m.status === "done" ? "var(--mint)" : m.status === "failed" ? "var(--over)" : undefined }}>
                                {m.status === "done" ? tr("Done ✓") : m.status === "failed" ? tr("Couldn't apply — nothing was changed or only part was.") : tr("Cancelled")}
                              </p>
                            )}
                          </div>
                        ) : (
                          m.content && <ShareReply text={m.content} />
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            )}
            {busy && (
              <div className="flex items-center gap-2 text-sm">
                <Spinner />
                <span className="muted">{tr("Thinking…")}</span>
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
          placeholder={
            feedbackMode ? tr("Type your suggestion…") : tr("Ask about your money…")
          }
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
          {feedbackMode ? tr("Send") : tr("Ask")}
        </button>
      </div>
    </div>
  );
}

/** **bold** → <b>; everything else stays plain text (no HTML injection). */
function richText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : part
  );
}

/** Share (phone share sheet → WhatsApp, Messages…) or copy an answer. */
function ShareReply({ text }: { text: string }) {
  const [done, setDone] = useState("");
  const plain = text.replace(/\*\*/g, "");
  async function share() {
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ text: plain });
        return;
      }
      await navigator.clipboard.writeText(plain);
      setDone(tr("Copied"));
      setTimeout(() => setDone(""), 1800);
    } catch {}
  }
  return (
    <div className="mt-1.5 flex gap-3 text-xs">
      <button className="font-semibold hover:underline" style={{ color: "var(--mint)" }} onClick={share}>
        {tr("Share")}
      </button>
      <a
        className="faint hover:underline"
        href={`https://wa.me/?text=${encodeURIComponent(plain)}`}
        target="_blank"
        rel="noreferrer"
      >
        WhatsApp
      </a>
      {done && <span className="faint">{done}</span>}
    </div>
  );
}
