"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, shortDate, todayISO } from "@/lib/format";
import { useApp } from "@/lib/i18n";
import { Sheet } from "@/components/Sheet";
import {
  REMIT_CURRENCIES,
  REMIT_PROVIDERS,
  isoDurationHours,
  type RemitQuote,
} from "@/lib/remit";

type Remit = {
  id: string;
  sent_on: string;
  amount: number;
  fee: number;
  currency: string;
  fx_rate: number | null;
  received_amount: number | null;
  provider: string | null;
  recipient: string | null;
  country: string | null;
};

const num = (s: string) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;

export default function RemittancesPage() {
  const { t, lang } = useApp();
  const today = todayISO();
  const [rows, setRows] = useState<Remit[]>([]);
  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState<number | null>(null);
  const [goalDraft, setGoalDraft] = useState("");
  const [err, setErr] = useState(false);

  // comparator
  const [cmpAmt, setCmpAmt] = useState("500");
  const [cmpTo, setCmpTo] = useState("MXN");
  const [quotes, setQuotes] = useState<RemitQuote[] | null>(null);
  const [live, setLive] = useState(true);
  const [quoting, setQuoting] = useState(false);

  // log sheet
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    sent_on: today,
    amount: "",
    fee: "",
    currency: "MXN",
    fx_rate: "",
    provider: "",
    recipient: "",
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    const supabase = createClient();
    const [{ data, error }, { data: prof }] = await Promise.all([
      supabase
        .from("remittances")
        .select("id,sent_on,amount,fee,currency,fx_rate,received_amount,provider,recipient,country")
        .order("sent_on", { ascending: false })
        .limit(200),
      supabase.from("profiles").select("remit_goal").single(),
    ]);
    if (error) setErr(true);
    setRows(
      ((data ?? []) as any[]).map((r) => ({
        ...r,
        amount: Number(r.amount),
        fee: Number(r.fee),
        fx_rate: r.fx_rate == null ? null : Number(r.fx_rate),
        received_amount: r.received_amount == null ? null : Number(r.received_amount),
      }))
    );
    const g = prof?.remit_goal == null ? null : Number(prof.remit_goal);
    setGoal(g);
    setGoalDraft(g ? String(g) : "");
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function compare() {
    setQuoting(true);
    try {
      const r = await fetch(`/api/remit/quote?amount=${num(cmpAmt)}&to=${cmpTo}`);
      const j = await r.json();
      setQuotes(j.quotes ?? []);
      setLive(!!j.live);
    } catch {
      setQuotes([]);
      setLive(false);
    }
    setQuoting(false);
  }

  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const stats = useMemo(() => {
    const m = rows.filter((r) => r.sent_on.startsWith(month));
    const y = rows.filter((r) => r.sent_on.startsWith(year));
    return {
      month: m.reduce((s, r) => s + r.amount, 0),
      year: y.reduce((s, r) => s + r.amount, 0),
      feesYear: y.reduce((s, r) => s + r.fee, 0),
      countYear: y.length,
    };
  }, [rows, month, year]);

  async function saveGoal() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const v = num(goalDraft);
    await supabase.from("profiles").update({ remit_goal: v > 0 ? v : null }).eq("id", user.id);
    setGoal(v > 0 ? v : null);
  }

  function openLog(prefill?: Partial<typeof draft>) {
    setDraft({
      sent_on: today,
      amount: "",
      fee: "",
      currency: cmpTo,
      fx_rate: "",
      provider: "",
      recipient: "",
      ...prefill,
    });
    setOpen(true);
  }

  async function saveLog() {
    const amount = num(draft.amount);
    if (!amount) return;
    setSaving(true);
    const rate = num(draft.fx_rate);
    const country = REMIT_CURRENCIES.find((c) => c.code === draft.currency);
    const { error } = await createClient().rpc("record_remittance", {
      p_sent_on: draft.sent_on,
      p_amount: amount,
      p_fee: num(draft.fee),
      p_currency: draft.currency,
      p_fx_rate: rate || null,
      p_received: null,
      p_provider: draft.provider.trim(),
      p_recipient: draft.recipient.trim(),
      p_country: country ? (lang === "es" ? country.countryEs : country.country) : null,
      p_lang: lang,
    });
    setSaving(false);
    if (error) {
      alert(t("Couldn't record it. Try again."));
      return;
    }
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm(t("Delete this transfer and its expense?"))) return;
    await createClient().rpc("delete_remittance", { p_id: id });
    load();
  }

  const best = quotes && quotes.length ? quotes[0] : null;
  const worst = quotes && quotes.length > 1 ? quotes[quotes.length - 1] : null;

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <div className="flex flex-wrap items-end justify-between gap-3 lg:col-span-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t("Remittances")}</h1>
          <p className="muted text-sm">
            {t("Track what you send home, and find the provider that delivers the most.")}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => openLog()}>
          {t("Log a transfer")}
        </button>
      </div>

      {err && (
        <div className="card p-5 text-sm lg:col-span-3" style={{ borderColor: "var(--warn)" }}>
          {t("Remittances need a database update (migration 15). Run it in Supabase and reload.")}
        </div>
      )}

      {/* stats + goal */}
      <div className="card glow-mint p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">{t("This month")}</p>
        <p className="font-display mt-1 text-3xl font-semibold tabular-nums">
          {loading ? "—" : money(stats.month)}
        </p>
        {goal ? (
          <>
            <div className="progress-track mt-3">
              <div
                className="progress-fill"
                style={{ width: `${Math.min((stats.month / goal) * 100, 100)}%` }}
              />
            </div>
            <p className="muted mt-1.5 text-sm">
              {stats.month >= goal
                ? t("Goal reached — {goal} sent this month.", { goal: money(goal) })
                : t("{left} to go for your {goal} monthly goal.", {
                    left: money(goal - stats.month),
                    goal: money(goal),
                  })}
            </p>
          </>
        ) : (
          <p className="muted mt-2 text-sm">{t("Set a monthly goal to track your sending.")}</p>
        )}
        <div className="mt-4 flex items-end gap-2">
          <label className="grid flex-1 gap-1">
            <span className="label">{t("Monthly goal")}</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder="$0"
              value={goalDraft}
              onChange={(e) => setGoalDraft(e.target.value)}
            />
          </label>
          <button className="btn btn-ghost" onClick={saveGoal}>
            {t("Save")}
          </button>
        </div>
        <div className="divider my-4" />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="faint text-xs">{t("Sent this year")}</p>
            <p className="font-semibold tabular-nums">{money(stats.year)}</p>
          </div>
          <div>
            <p className="faint text-xs">{t("Fees this year")}</p>
            <p className="font-semibold tabular-nums">{money(stats.feesYear)}</p>
          </div>
        </div>
      </div>

      {/* comparator */}
      <div className="card p-6 lg:col-span-2">
        <p className="faint text-xs font-semibold uppercase tracking-wide">
          {t("Compare before you send")}
        </p>
        <div className="mt-3 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <label className="grid gap-1">
            <span className="label">{t("You send (USD)")}</span>
            <input className="input" inputMode="decimal" value={cmpAmt} onChange={(e) => setCmpAmt(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="label">{t("They receive in")}</span>
            <select className="input" value={cmpTo} onChange={(e) => setCmpTo(e.target.value)}>
              {REMIT_CURRENCIES.filter((c) => c.code !== "USD").map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {lang === "es" ? c.countryEs : c.country}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" onClick={compare} disabled={quoting || num(cmpAmt) < 10}>
            {quoting ? "…" : t("Compare")}
          </button>
        </div>

        {quotes && quotes.length > 0 && (
          <>
            {best && worst && best.received > worst.received && (
              <p className="mt-4 text-sm">
                {t("Best option delivers {diff} {cur} more than the most expensive.", {
                  diff: Math.round(best.received - worst.received).toLocaleString(),
                  cur: cmpTo,
                })}
              </p>
            )}
            <div className="mt-3 grid gap-2">
              {quotes.slice(0, 8).map((q, i) => {
                const h = isoDurationHours(q.eta);
                return (
                  <div
                    key={q.provider}
                    className="card-soft flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3"
                    style={i === 0 ? { outline: "1.5px solid var(--mint)" } : undefined}
                  >
                    <div className="min-w-[8rem]">
                      <p className="font-semibold">
                        {q.provider}
                        {i === 0 && (
                          <span className="chip ml-2 !py-0 text-[11px]" style={{ background: "var(--mint)", color: "#06130d", borderColor: "var(--mint)" }}>
                            {t("Best")}
                          </span>
                        )}
                      </p>
                      <p className="faint text-xs">
                        {t("Fee")} {money(q.fee)} · 1 USD = {q.rate.toFixed(q.rate >= 100 ? 1 : 3)} {cmpTo}
                        {h !== null && ` · ${h < 1 ? t("minutes") : h < 48 ? t("~{n}h", { n: Math.round(h) }) : t("~{n} days", { n: Math.round(h / 24) })}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-display text-lg font-semibold tabular-nums">
                        {Math.round(q.received).toLocaleString()} {cmpTo}
                      </p>
                      {q.url && (
                        <a className="btn btn-ghost !px-3 !py-1 text-xs" href={q.url} target="_blank" rel="noopener noreferrer sponsored">
                          {t("Go")} ↗
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="faint mt-3 text-xs">
              {t("Live quotes from Wise's public comparison; totals can change at checkout. Some links may be affiliate links.")}
            </p>
          </>
        )}

        {quotes && quotes.length === 0 && (
          <div className="mt-4">
            <p className="muted text-sm">
              {live
                ? t("No quotes for this amount.")
                : t("Live rates aren't available right now. Check these providers directly:")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {REMIT_PROVIDERS.map((p) => (
                <a key={p.key} className="chip" href={p.url} target="_blank" rel="noopener noreferrer sponsored">
                  {p.name} ↗
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* history */}
      <div className="card p-6 lg:col-span-3">
        <p className="faint text-xs font-semibold uppercase tracking-wide">{t("History")}</p>
        {rows.length === 0 ? (
          <p className="muted mt-3 text-sm">
            {loading ? "…" : t("No transfers yet. Log one and it's added to your budget automatically.")}
          </p>
        ) : (
          <div className="mt-3 grid gap-1">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-0" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {r.recipient || t("Transfer")}
                    {r.provider && <span className="faint"> · {r.provider}</span>}
                  </p>
                  <p className="faint text-xs">
                    {shortDate(r.sent_on)}
                    {r.country && ` · ${r.country}`}
                    {r.fee > 0 && ` · ${t("Fee")} ${money(r.fee)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{money(r.amount)}</p>
                    {r.received_amount != null && (
                      <p className="faint text-xs tabular-nums">
                        {Math.round(r.received_amount).toLocaleString()} {r.currency}
                      </p>
                    )}
                  </div>
                  <button className="faint text-xs hover:underline" onClick={() => remove(r.id)} aria-label={t("Delete")}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={t("Log a transfer")}>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="label">{t("Amount sent (USD)")}</span>
              <input className="input" inputMode="decimal" placeholder="$0" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
            </label>
            <label className="grid gap-1">
              <span className="label">{t("Fee")}</span>
              <input className="input" inputMode="decimal" placeholder="$0" value={draft.fee} onChange={(e) => setDraft({ ...draft, fee: e.target.value })} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="label">{t("Currency received")}</span>
              <select className="input" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
                {REMIT_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="label">{t("Exchange rate")}</span>
              <input className="input" inputMode="decimal" placeholder={t("optional")} value={draft.fx_rate} onChange={(e) => setDraft({ ...draft, fx_rate: e.target.value })} />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="label">{t("Recipient")}</span>
            <input className="input" placeholder={t("e.g. Mom")} value={draft.recipient} onChange={(e) => setDraft({ ...draft, recipient: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1">
              <span className="label">{t("Provider")}</span>
              <input className="input" list="remit-providers" value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })} />
              <datalist id="remit-providers">
                {REMIT_PROVIDERS.map((p) => (
                  <option key={p.key} value={p.name} />
                ))}
              </datalist>
            </label>
            <label className="grid gap-1">
              <span className="label">{t("Date")}</span>
              <input className="input" type="date" value={draft.sent_on} onChange={(e) => setDraft({ ...draft, sent_on: e.target.value })} />
            </label>
          </div>
          <p className="faint text-xs">{t("Amount + fee is added to your personal budget under Remittances.")}</p>
          <button className="btn btn-primary" disabled={saving || !num(draft.amount)} onClick={saveLog}>
            {saving ? "…" : t("Save transfer")}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
