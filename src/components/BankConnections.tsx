"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/i18n";
import { mfaStatus } from "@/lib/mfa";
import { MfaSetup } from "@/components/MfaSetup";

type Item = {
  id: string;
  space: string;
  institution_name: string | null;
  last_synced_at: string | null;
  error: string | null;
};

declare global {
  interface Window {
    Plaid?: {
      create: (cfg: {
        token: string;
        onSuccess: (public_token: string, metadata: any) => void;
        onExit?: (err: any) => void;
      }) => { open: () => void };
    };
  }
}

function loadPlaidScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Plaid) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script"));
    document.head.appendChild(s);
  });
}

export function BankConnections() {
  const { t, lang, space } = useApp();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<"" | "link" | "sync" | "recat">("");
  const [msg, setMsg] = useState("");
  const [needMfa, setNeedMfa] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/plaid/items");
      const j = await r.json();
      setConfigured(!!j.configured);
      setItems(j.items ?? []);
    } catch {
      setConfigured(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function connect() {
    setMsg("");
    const m = await mfaStatus().catch(() => null);
    if (!m || !m.enrolled || !m.verifiedNow) {
      setNeedMfa(true);
      return;
    }
    setBusy("link");
    try {
      const [{ link_token, error }] = await Promise.all([
        fetch("/api/plaid/link-token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lang }),
        }).then((r) => r.json()),
        loadPlaidScript(),
      ]);
      if (!link_token || !window.Plaid) throw new Error(error || "link");
      const handler = window.Plaid.create({
        token: link_token,
        onSuccess: async (public_token, metadata) => {
          setMsg(t("Connecting and importing…"));
          const r = await fetch("/api/plaid/exchange", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ public_token, institution_name: metadata?.institution?.name }),
          });
          const j = await r.json();
          setMsg(
            r.ok
              ? t("Connected. {n} transactions imported — more may arrive in a few minutes.", { n: j.added ?? 0 })
              : t("Couldn't connect: {e}", { e: j.error ?? "error" })
          );
          setBusy("");
          load();
        },
        onExit: () => setBusy(""),
      });
      handler.open();
    } catch (e: any) {
      setMsg(t("Couldn't start the bank connection."));
      setBusy("");
    }
  }

  async function sync() {
    setBusy("sync");
    const r = await fetch("/api/plaid/sync", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? t("Synced: {a} new, {u} updated.", { a: j.added ?? 0, u: j.updated ?? 0 }) : t("Sync failed."));
    setBusy("");
    load();
  }

  async function recategorize() {
    setBusy("recat");
    const r = await fetch("/api/plaid/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recategorize: true }),
    });
    setMsg(r.ok ? t("Done. Bank transactions without a category were sorted again.") : t("Sync failed."));
    setBusy("");
    load();
  }

  async function disconnect(id: string) {
    if (!confirm(t("Disconnect this bank? Past transactions stay."))) return;
    await fetch("/api/plaid/items", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <div className="card p-6">
      <p className="faint text-xs font-semibold uppercase tracking-wide">{t("Bank connections")}</p>
      <p className="muted mt-1 text-sm">
        {t("Connect your bank and transactions come in by themselves. Read-only — we can't move money.")}
      </p>
      {configured === false && (
        <p className="mt-3 text-sm" style={{ color: "var(--warn)" }}>
          {t("Coming soon.")}
        </p>
      )}
      {configured && (
        <>
          {items.length > 0 && (
            <div className="mt-3 grid gap-2">
              {items.map((it) => (
                <div key={it.id} className="card-soft flex items-center justify-between gap-2 rounded-2xl px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{it.institution_name || t("Bank")}</p>
                    <p className="faint text-xs">
                      {it.space === "business" ? t("Business") : t("Personal")}
                      {it.last_synced_at && ` · ${t("synced")} ${new Date(it.last_synced_at).toLocaleDateString(lang === "es" ? "es-US" : "en-US")}`}
                      {it.error && ` · ${t("needs attention")}`}
                    </p>
                  </div>
                  <button className="faint text-xs hover:underline" onClick={() => disconnect(it.id)}>
                    {t("Disconnect")}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={connect} disabled={!!busy}>
              {busy === "link" ? "…" : t("Connect a bank")}
            </button>
            {items.length > 0 && (
              <button className="btn btn-ghost" onClick={sync} disabled={!!busy}>
                {busy === "sync" ? "…" : t("Sync now")}
              </button>
            )}
            {items.length > 0 && (
              <button className="btn btn-ghost" onClick={recategorize} disabled={!!busy}>
                {busy === "recat" ? "…" : t("Re-categorize")}
              </button>
            )}
          </div>
          <p className="faint mt-2 text-xs">
            {t("New connections go to your {space} space.", { space: space === "business" ? t("Business") : t("Personal") })}
          </p>
        </>
      )}
      {needMfa && (
        <div className="mt-4">
          <p className="mb-3 text-sm" style={{ color: "var(--warn)" }}>
            {t("To protect your bank data, turn on two-step verification first.")}
          </p>
          <MfaSetup
            onDone={() => {
              setNeedMfa(false);
              setMsg(t("Done. Now tap Connect a bank."));
            }}
          />
        </div>
      )}
      {msg && <p className="muted mt-3 text-sm">{msg}</p>}
    </div>
  );
}
