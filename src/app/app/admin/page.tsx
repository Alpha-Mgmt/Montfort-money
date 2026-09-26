"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MfaCodeCard } from "@/components/MfaGate";

type Row = {
  id: string;
  email: string | null;
  name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  mfa: boolean;
  lang: string | null;
  onboarded: boolean;
  business: boolean;
  remit: boolean;
  couple: boolean;
  banks: number;
  bank_errors: number;
  bank_names: string[];
  last_bank_sync: string | null;
  owner: boolean;
  ai_calls: number;
  ai_cost: number;
};
type AiUsage = {
  month: { cost: number; calls: number; asks: number; insights: number; inputTokens: number; outputTokens: number; projected: number };
  today: { cost: number; calls: number };
  lastMonth: { cost: number; calls: number };
  days: { day: string; cost: number }[];
};
const usd = (n: number) =>
  "$" + (n < 1 ? n.toFixed(3) : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const tok = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n));
type Feedback = { user_id: string; email: string | null; message: string; page: string | null; created_at: string };

const DAY = 86400000;
const ago = (iso: string | null) => {
  if (!iso) return "nunca";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 30) return `hace ${d} días`;
  if (d < 60) return "hace 1 mes";
  if (d < 365) return `hace ${Math.floor(d / 30)} meses`;
  return `hace ${Math.floor(d / 365)} años`;
};
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

export default function AdminPage() {
  const [state, setState] = useState<"loading" | "ok" | "forbidden" | "mfa" | "error">("loading");
  const [rows, setRows] = useState<Row[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [ai, setAi] = useState<AiUsage | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "bank" | "inactive" | "issues">("all");
  const [del, setDel] = useState<Row | null>(null);
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/admin", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.status === 403 && j.error === "mfa_required") return setState("mfa");
    if (r.status === 403 || r.status === 401) return setState("forbidden");
    if (!r.ok) return setState("error");
    setRows(j.users ?? []);
    setFeedback(j.feedback ?? []);
    setAi(j.ai ?? null);
    setState("ok");
  }
  useEffect(() => {
    load();
  }, []);

  const kpi = useMemo(() => {
    const now = Date.now();
    const within = (iso: string | null, days: number) => !!iso && now - new Date(iso).getTime() <= days * DAY;
    const users = rows.filter((r) => !r.owner);
    return {
      total: users.length,
      new7: users.filter((r) => within(r.created_at, 7)).length,
      active7: users.filter((r) => within(r.last_sign_in_at, 7)).length,
      active30: users.filter((r) => within(r.last_sign_in_at, 30)).length,
      bank: users.filter((r) => r.banks > 0).length,
      mfa: users.filter((r) => r.mfa).length,
      business: users.filter((r) => r.business).length,
      couple: users.filter((r) => r.couple).length,
      remit: users.filter((r) => r.remit).length,
      issues: rows.filter((r) => r.bank_errors > 0).length,
    };
  }, [rows]);

  // sign-ups per week, last 8 weeks
  const weeks = useMemo(() => {
    const out: { label: string; n: number }[] = [];
    const start = Date.now() - 8 * 7 * DAY;
    for (let i = 0; i < 8; i++) {
      const a = start + i * 7 * DAY;
      const b = a + 7 * DAY;
      out.push({
        label: new Date(a).toLocaleDateString("es-MX", { day: "numeric", month: "short" }),
        n: rows.filter((r) => {
          const t = new Date(r.created_at).getTime();
          return !r.owner && t >= a && t < b;
        }).length,
      });
    }
    return out;
  }, [rows]);
  const maxWeek = Math.max(1, ...weeks.map((w) => w.n));

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => !s || (r.email ?? "").toLowerCase().includes(s) || (r.name ?? "").toLowerCase().includes(s))
      .filter((r) =>
        filter === "bank"
          ? r.banks > 0
          : filter === "inactive"
          ? !r.last_sign_in_at || Date.now() - new Date(r.last_sign_in_at).getTime() > 30 * DAY
          : filter === "issues"
          ? r.bank_errors > 0 || !r.confirmed
          : true
      )
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [rows, q, filter]);

  async function doDelete() {
    if (!del) return;
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/admin", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: del.id, confirm }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setMsg(
        j.error === "confirm_mismatch"
          ? "El correo no coincide."
          : j.error === "cannot_delete_owner"
          ? "No puedes borrar la cuenta del dueño."
          : `No se pudo borrar: ${j.error ?? r.status}`
      );
      return;
    }
    setMsg(`Cuenta de ${del.email} borrada${j.revoked_banks ? ` (${j.revoked_banks} banco(s) desconectado(s) en Plaid)` : ""}.`);
    setDel(null);
    setConfirm("");
    load();
  }

  if (state === "loading") return <p className="muted p-6 text-sm">Cargando…</p>;
  if (state === "forbidden")
    return (
      <div className="card p-6">
        <p className="font-medium">Esta página es solo para el dueño.</p>
        <Link href="/app" className="btn btn-ghost mt-4 inline-flex">Volver</Link>
      </div>
    );
  if (state === "mfa")
    return (
      <div className="card p-6">
        <MfaCodeCard reason="El panel muestra datos de todos los usuarios; confirma con tu código." onDone={load} />
      </div>
    );
  if (state === "error")
    return (
      <div className="card p-6">
        <p className="font-medium">No se pudo cargar el panel.</p>
        <button className="btn btn-ghost mt-4" onClick={load}>Reintentar</button>
      </div>
    );

  const Stat = ({ label, value, sub }: { label: string; value: number | string; sub?: string }) => (
    <div className="card-soft rounded-2xl px-4 py-3">
      <p className="faint text-xs">{label}</p>
      <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="faint text-[11px]">{sub}</p>}
    </div>
  );
  const pct = (n: number) => (kpi.total ? `${Math.round((n / kpi.total) * 100)}% de usuarios` : "");

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Panel del dueño</h1>
        <p className="muted text-sm">
          Solo cuentas y actividad. Aquí no se ven transacciones, montos ni saldos de nadie.
        </p>
      </div>

      {msg && <div className="card-soft rounded-2xl px-4 py-3 text-sm">{msg}</div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Usuarios" value={kpi.total} sub={`+${kpi.new7} esta semana`} />
        <Stat label="Activos 7 días" value={kpi.active7} sub={`${kpi.active30} en 30 días`} />
        <Stat label="Con banco conectado" value={kpi.bank} sub={pct(kpi.bank)} />
        <Stat label="Con 2FA" value={kpi.mfa} sub={pct(kpi.mfa)} />
      </div>

      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">Registros por semana</p>
        <div className="mt-4 flex h-28 items-end gap-2">
          {weeks.map((w) => (
            <div key={w.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="faint text-[11px] tabular-nums">{w.n || ""}</span>
              <div
                className="w-full rounded-t-md"
                style={{ height: `${Math.max(3, (w.n / maxWeek) * 80)}px`, background: "var(--mint)", opacity: w.n ? 1 : 0.25 }}
              />
              <span className="faint truncate text-[10px]">{w.label}</span>
            </div>
          ))}
        </div>
        <div className="divider my-4" />
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="chip">Negocio: {kpi.business}</span>
          <span className="chip">Pareja: {kpi.couple}</span>
          <span className="chip">Remesas: {kpi.remit}</span>
          {kpi.issues > 0 && (
            <span className="chip" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>
              Bancos con error: {kpi.issues}
            </span>
          )}
        </div>
      </div>

      {ai && (
        <div className="card p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="faint text-xs font-semibold uppercase tracking-wide">Consumo de Montfort AI</p>
            <a className="faint text-xs underline underline-offset-4" href="https://console.anthropic.com/settings/limits" target="_blank" rel="noreferrer">
              Límites de gasto en Anthropic →
            </a>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Este mes" value={usd(ai.month.cost)} sub={`~${usd(ai.month.projected)} al cierre del mes`} />
            <Stat label="Hoy" value={usd(ai.today.cost)} sub={`${ai.today.calls} ${ai.today.calls === 1 ? "llamada" : "llamadas"}`} />
            <Stat label="Llamadas este mes" value={ai.month.calls} sub={`${ai.month.asks} preguntas · ${ai.month.insights} insights`} />
            <Stat label="Mes pasado" value={usd(ai.lastMonth.cost)} sub={`${ai.lastMonth.calls} ${ai.lastMonth.calls === 1 ? "llamada" : "llamadas"}`} />
          </div>
          <div className="mt-5 flex h-20 items-end gap-[3px]" role="img" aria-label="Costo por día este mes">
            {(() => {
              const max = Math.max(0.0001, ...ai.days.map((d) => d.cost));
              return ai.days.map((d) => (
                <div
                  key={d.day}
                  className="flex-1 rounded-t-[3px]"
                  title={`${d.day}: ${usd(d.cost)}`}
                  style={{ height: `${Math.max(2, (d.cost / max) * 80)}px`, background: "var(--mint)", opacity: d.cost ? 1 : 0.2 }}
                />
              ));
            })()}
          </div>
          <p className="faint mt-2 text-[11px]">
            Costo por día · {tok(ai.month.inputTokens)} tokens de entrada, {tok(ai.month.outputTokens)} de salida este mes. Estimado con el precio del modelo; tu factura real está en console.anthropic.com.
          </p>
          {rows.some((r) => r.ai_calls > 0) && (
            <div className="mt-4 grid gap-1.5">
              <p className="text-sm font-semibold">Quién más la usa</p>
              {[...rows].filter((r) => r.ai_calls > 0).sort((a, b) => b.ai_cost - a.ai_cost).slice(0, 8).map((r) => (
                <div key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{r.email}</span>
                  <span className="shrink-0 tabular-nums"><span className="faint text-xs">{r.ai_calls} llamadas · </span><b>{usd(r.ai_cost)}</b></span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="faint text-xs font-semibold uppercase tracking-wide">Usuarios ({list.length})</p>
          <div className="flex flex-wrap gap-2">
            <input
              className="input !py-1.5 text-sm sm:!w-56"
              placeholder="Buscar correo o nombre"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select className="input !py-1.5 text-sm sm:!w-auto" value={filter} onChange={(e) => setFilter(e.target.value as any)}>
              <option value="all">Todos</option>
              <option value="bank">Con banco</option>
              <option value="inactive">Inactivos 30+ días</option>
              <option value="issues">Con problemas</option>
            </select>
          </div>
        </div>
        <div className="mt-3 grid gap-2">
          {list.map((r) => (
            <div key={r.id} className="card-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {r.email}
                  {r.owner && <span className="chip ml-2 !py-0 text-[11px]">dueño</span>}
                </p>
                <p className="faint text-xs">
                  {r.name ? `${r.name} · ` : ""}Registro {fmtDate(r.created_at)} · Último acceso {ago(r.last_sign_in_at)}
                  {r.lang ? ` · ${r.lang.toUpperCase()}` : ""}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                  {!r.confirmed && (
                    <span className="chip !py-0" style={{ color: "var(--warn)", borderColor: "var(--warn)" }}>correo sin confirmar</span>
                  )}
                  {r.mfa && <span className="chip !py-0">2FA</span>}
                  {r.banks > 0 && (
                    <span className="chip !py-0" title={r.bank_names.join(", ")}>
                      {r.banks} banco{r.banks > 1 ? "s" : ""} · sync {ago(r.last_bank_sync)}
                    </span>
                  )}
                  {r.bank_errors > 0 && (
                    <span className="chip !py-0" style={{ color: "var(--over)", borderColor: "var(--over)" }}>error de banco</span>
                  )}
                  {r.business && <span className="chip !py-0">Negocio</span>}
                  {r.couple && <span className="chip !py-0">Pareja</span>}
                  {r.remit && <span className="chip !py-0">Remesas</span>}
                  {r.ai_calls > 0 && <span className="chip !py-0">AI: {r.ai_calls} · {usd(r.ai_cost)}</span>}
                  {!r.onboarded && <span className="chip !py-0">sin terminar bienvenida</span>}
                </div>
              </div>
              {!r.owner && (
                <button
                  className="btn btn-ghost !px-3 !py-1 text-xs"
                  style={{ color: "var(--over)" }}
                  onClick={() => {
                    setDel(r);
                    setConfirm("");
                    setMsg("");
                  }}
                >
                  Borrar cuenta
                </button>
              )}
            </div>
          ))}
          {list.length === 0 && <p className="muted text-sm">No hay usuarios con ese filtro.</p>}
        </div>
      </div>

      {del && (
        <div className="card p-6" style={{ borderColor: "var(--over)" }}>
          <p className="font-semibold">Borrar la cuenta de {del.email}</p>
          <p className="muted mt-1 text-sm">
            Se borra para siempre: su cuenta, todos sus datos financieros y recibos, y se desconectan sus bancos en Plaid.
            Úsalo cuando el usuario te lo pida (tu política promete hacerlo en 30 días). No se puede deshacer.
          </p>
          <p className="mt-3 text-sm">Escribe su correo para confirmar:</p>
          <input className="input mt-1 w-full max-w-sm" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={del.email ?? ""} />
          <div className="mt-3 flex gap-2">
            <button
              className="btn btn-primary"
              style={{ background: "var(--over)" }}
              disabled={busy || confirm.trim().toLowerCase() !== (del.email ?? "").toLowerCase()}
              onClick={doDelete}
            >
              {busy ? "Borrando…" : "Borrar para siempre"}
            </button>
            <button className="btn btn-ghost" onClick={() => setDel(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="card p-6">
        <p className="faint text-xs font-semibold uppercase tracking-wide">Sugerencias recientes</p>
        <div className="mt-3 grid gap-2">
          {feedback.map((f, i) => (
            <div key={i} className="card-soft rounded-2xl px-4 py-3">
              <p className="text-sm">{f.message}</p>
              <p className="faint mt-1 text-xs">
                {f.email ?? "—"} · {fmtDate(f.created_at)}{f.page ? ` · ${f.page}` : ""}
              </p>
            </div>
          ))}
          {feedback.length === 0 && <p className="muted text-sm">Todavía no hay sugerencias.</p>}
        </div>
      </div>
    </div>
  );
}
