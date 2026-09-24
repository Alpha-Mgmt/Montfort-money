"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, monthStartISO, todayISO } from "@/lib/format";
import { useApp } from "@/lib/i18n";

type MonthRow = { user_id: string; full_name: string; income: number; expense: number };

export default function CouplePage() {
  const { t, lang, space, switchSpace, household, refreshHousehold, ready } = useApp();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rows, setRows] = useState<MonthRow[]>([]);
  const [amt, setAmt] = useState("");
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  const [armLeave, setArmLeave] = useState(false);

  const alone = !household || household.members.length < 2;

  useEffect(() => {
    if (household) setName(household.name);
  }, [household]);

  async function loadMonth() {
    const { data } = await createClient().rpc("household_month", { p_month: monthStartISO() });
    setRows(((data ?? []) as any[]).map((r) => ({ ...r, income: Number(r.income), expense: Number(r.expense) })));
  }

  useEffect(() => {
    if (household) loadMonth();
  }, [household]);

  async function makeInvite() {
    setBusy(true);
    const { data, error } = await createClient().rpc("create_household_invite");
    setBusy(false);
    if (error) {
      setMsg(t("Couldn't create the invite. Try again."));
      return;
    }
    setCode(String(data));
    await refreshHousehold();
  }

  const link = code && typeof window !== "undefined" ? `${window.location.origin}/app/join?code=${code}` : "";

  async function share() {
    const text = t("Join me on Montfort Money so we can manage our shared money together:");
    try {
      if (navigator.share) {
        await navigator.share({ title: "Montfort Money", text, url: link });
        return;
      }
    } catch {}
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function contribute() {
    const v = Number(amt.replace(/[^0-9.]/g, ""));
    if (!v) return;
    setBusy(true);
    const { error } = await createClient().rpc("contribute_shared", { p_amount: v, p_date: todayISO(), p_lang: lang });
    setBusy(false);
    if (error) {
      setMsg(t("Couldn't record it. Try again."));
      return;
    }
    setAmt("");
    setMsg(t("Done — {amt} moved from your personal money to the shared pot.", { amt: money(v) }));
    loadMonth();
  }

  async function rename() {
    if (!name.trim() || name === household?.name) return;
    await createClient().rpc("rename_household", { p_name: name });
    refreshHousehold();
  }

  async function leave() {
    if (!armLeave) {
      setArmLeave(true);
      return;
    }
    await createClient().rpc("leave_household");
    window.location.href = "/app";
  }

  const totalIn = rows.reduce((a, r) => a + r.income, 0);
  const totalOut = rows.reduce((a, r) => a + r.expense, 0);

  if (!ready) return <p className="faint mt-6 text-center text-sm">{t("Loading…")}</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="lg:col-span-2">
        <h1 className="font-display text-2xl font-semibold">{t("Couple")}</h1>
        <p className="muted text-sm">
          {t("A shared space for the money you manage together. Each of you keeps your personal money private.")}
        </p>
      </div>

      {/* members + invite */}
      <div className="card glow-mint p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">
          {household ? household.name : t("Your household")}
        </p>
        {household && (
          <div className="mt-3 flex flex-wrap gap-2">
            {household.members.map((m) => (
              <span key={m.user_id} className="chip">
                {m.full_name}
                {m.is_me && ` (${t("you")})`}
              </span>
            ))}
          </div>
        )}

        {alone && (
          <>
            <p className="mt-3 text-sm">
              {t("Invite your partner with a link. When they join, you'll both see a Couple space with its own plan, goals and history.")}
            </p>
            {!code ? (
              <button className="btn btn-primary mt-4" onClick={makeInvite} disabled={busy}>
                {busy ? "…" : t("Create invite link")}
              </button>
            ) : (
              <div className="mt-4 grid gap-2">
                <div className="card-soft break-all rounded-2xl px-4 py-3 text-sm">{link}</div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-primary" onClick={share}>
                    {copied ? t("Copied ✓") : t("Share link")}
                  </button>
                  <span className="faint self-center text-xs">
                    {t("Code {code} · valid 14 days", { code })}
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {household && !alone && space !== "shared" && (
          <button className="btn btn-primary mt-4" onClick={() => switchSpace("shared")}>
            {t("Open our shared space")}
          </button>
        )}
      </div>

      {/* this month together */}
      {household && !alone && (
        <div className="card p-6">
          <p className="faint text-xs font-semibold uppercase tracking-wide">{t("This month together")}</p>
          <div className="mt-3 grid gap-3">
            {rows.map((r) => (
              <div key={r.user_id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{r.full_name}</span>
                  <span className="muted tabular-nums">
                    {t("put in {a} · spent {b}", { a: money(r.income), b: money(r.expense) })}
                  </span>
                </div>
                <div className="progress-track mt-1">
                  <div
                    className="progress-fill"
                    style={{ width: `${totalIn ? (r.income / totalIn) * 100 : 0}%`, background: "var(--chart-income)" }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="divider my-4" />
          <div className="flex items-center justify-between text-sm">
            <span className="muted">{t("Shared pot this month")}</span>
            <span className="font-semibold tabular-nums" style={{ color: totalIn - totalOut < 0 ? "var(--over)" : "var(--mint)" }}>
              {money(totalIn - totalOut)}
            </span>
          </div>
        </div>
      )}

      {/* contribute */}
      {household && !alone && (
        <div className="card p-6">
          <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Put money in")}</p>
          <p className="muted mt-1 text-sm">
            {t("Moves money from your personal space to the shared pot: an expense for you, a contribution for the couple.")}
          </p>
          <div className="mt-3 flex items-end gap-2">
            <label className="grid flex-1 gap-1">
              <span className="label">{t("Amount")}</span>
              <input className="input" inputMode="decimal" placeholder="$0" value={amt} onChange={(e) => setAmt(e.target.value)} />
            </label>
            <button className="btn btn-primary" onClick={contribute} disabled={busy || !amt}>
              {t("Put in")}
            </button>
          </div>
        </div>
      )}

      {msg && <p className="muted text-sm lg:col-span-2">{msg}</p>}

      {/* settings */}
      {household && (
        <div className="card p-6">
          <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Household settings")}</p>
          <label className="mt-3 grid gap-1">
            <span className="label">{t("Name")}</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={rename} />
          </label>
          <button
            className="btn btn-ghost mt-4"
            style={armLeave ? { color: "var(--over)", borderColor: "var(--over)" } : undefined}
            onClick={leave}
          >
            {armLeave ? t("Tap again to leave") : t("Leave household")}
          </button>
          <p className="faint mt-2 text-xs">
            {t("If you leave, the shared space stays with your partner. Your personal money is never shared.")}
          </p>
        </div>
      )}
    </div>
  );
}
