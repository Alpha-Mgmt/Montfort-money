"use client";

import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useApp } from "@/lib/i18n";
import { Wordmark } from "@/components/Logo";
import { MfaSetup } from "@/components/MfaSetup";
import { MfaCodeCard } from "@/components/MfaGate";
import { mfaStatus } from "@/lib/mfa";
import { openPlaidLink } from "@/lib/plaid-link";
import { analyze, type Analysis, type Found, type Question, type SetupCat, type SetupItem, type SetupTx, type Spend } from "@/lib/setup-analyze";
import { whenFor } from "@/components/WhenPicker";
import { occurrenceDates } from "@/lib/recurring";
import { money, todayISO } from "@/lib/format";
import type { Frequency, Kind } from "@/lib/types";

/* ---------------------------------------------------------------- types */

type Msg = { id: number; who: "ai" | "me"; text?: string; node?: ReactNode };
type Row = Found & { status: "new" | "already" | "off" };
type Extra = {
  key: string;
  title: string;
  kind: Kind;
  amount: number;
  freq: Frequency;
  anchor: string;
  catName?: string;
  catId?: string | null;
  section: "income" | "fixed" | "debt";
  tag?: string;
};
type OutDebt = { name: string; balance: number; apr: number; payment: number; day: number | null };
type Recat = { txIds: string[]; catId?: string | null; catName?: string; catKind: Kind };

const COLORS = ["#14996c", "#1d6fa5", "#f5a524", "#7c5cff", "#e85fa8", "#0ea5b7", "#cc3f3f", "#8a9bb0"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const perMonth = (f: Frequency) => (f === "weekly" ? 52 / 12 : f === "biweekly" ? 26 / 12 : f === "semimonthly" ? 2 : f === "monthly" ? 1 : 0);
const m0 = (n: number) => money(Math.round(n));

/** **bold** → <b> */
function rich(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>));
}

/* ------------------------------------------------------------ component */

export function AiSetup() {
  const router = useRouter();
  const { lang } = useApp();
  const es = lang === "es";
  const S = (en: string, sp: string) => (es ? sp : en);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [pending, setPending] = useState<ReactNode>(null);
  const [step, setStep] = useState(1);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const listRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const idc = useRef(0);
  const chatHist = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

  // everything the live plan shows (mutated by the script, then force())
  const P = useRef({
    name: "",
    cats: [] as SetupCat[],
    items: [] as (SetupItem & { category_id: string | null })[],
    rows: [] as Row[],
    spend: [] as (Spend & { already: boolean })[],
    extras: [] as Extra[],
    debts: [] as OutDebt[],
    recats: [] as Recat[],
    cancel: [] as Row[],
    cash: null as number | null,
    scan: -1,
    log: [] as string[],
    status: "" as string,
    end: null as number | null,
    saved: false,
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing, pending]);

  /* ---------- chat primitives ---------- */
  const push = (m: Omit<Msg, "id">) => setMsgs((xs) => [...xs, { ...m, id: ++idc.current }]);
  async function say(text: string, wait = 450) {
    setTyping(true);
    await sleep(wait + Math.min(1400, text.length * 9));
    setTyping(false);
    push({ who: "ai", text });
  }
  const me = (text: string) => push({ who: "me", text });

  function choose(opts: string[], opt: { primary?: number } = {}): Promise<string> {
    return new Promise((res) => {
      setPending(
        <div className="flex flex-wrap gap-2">
          {opts.map((o, i) => (
            <button
              key={o}
              className={`setup-chip ${i === (opt.primary ?? 0) ? "setup-chip-p" : ""}`}
              onClick={() => {
                setPending(null);
                me(o);
                res(o);
              }}
            >
              {o}
            </button>
          ))}
        </div>
      );
    });
  }

  function widget<T>(render: (done: (v: T) => void) => ReactNode): Promise<T> {
    return new Promise((res) => {
      setPending(
        render((v) => {
          setPending(null);
          res(v);
        })
      );
    });
  }

  /* ---------- data ---------- */
  async function loadBase() {
    const supabase = createClient();
    const [{ data: prof }, { data: cats }, { data: items }, { data: accts }] = await Promise.all([
      supabase.from("profiles").select("full_name").single(),
      supabase.from("categories").select("id,name,kind"),
      supabase.from("recurring_items").select("title,kind,amount,category_id,active"),
      supabase.from("accounts").select("type,current_balance,archived"),
    ]);
    P.current.name = ((prof as any)?.full_name || "").split(" ")[0] || "";
    P.current.cats = (cats ?? []) as SetupCat[];
    P.current.items = ((items ?? []) as any[]).map((i) => ({ ...i, amount: Number(i.amount) }));
    const bal = ((accts ?? []) as any[]).filter((a) => !a.archived && ["checking", "savings", "cash"].includes(a.type) && a.current_balance != null);
    P.current.cash = bal.length ? bal.reduce((s, a) => s + Number(a.current_balance), 0) : null;
  }

  async function loadTxs(): Promise<SetupTx[]> {
    const from = new Date(Date.now() - 185 * 86400000).toISOString().slice(0, 10);
    const { data } = await createClient()
      .from("transactions")
      .select("id,kind,amount,tx_date,note,category_id")
      .eq("source", "plaid")
      .gte("tx_date", from)
      .order("tx_date", { ascending: false })
      .limit(4000);
    return ((data ?? []) as any[]).map((t) => ({ ...t, amount: Number(t.amount) }));
  }

  async function plaidItems(): Promise<{ configured: boolean; names: string[] }> {
    try {
      const j = await fetch("/api/plaid/items").then((r) => r.json());
      return { configured: !!j.configured, names: (j.items ?? []).map((i: any) => i.institution_name || "tu banco") };
    } catch {
      return { configured: false, names: [] };
    }
  }

  /* ---------- category helpers ---------- */
  const findCat = (rx: RegExp, kind: Kind) => P.current.cats.find((c) => c.kind === kind && rx.test(c.name)) ?? null;
  const catName = (id: string | null) => (id ? P.current.cats.find((c) => c.id === id)?.name ?? "" : "");
  const BUCKET: Record<string, [RegExp, string, string]> = {
    family: [/famil/i, "Family", "Familia"],
    debt: [/debt|deuda|loan|pr[eé]stamo/i, "Debts", "Deudas"],
    housing: [/housing|rent\b|renta|vivienda|casa|home/i, "Housing", "Vivienda"],
    business: [/business|negocio/i, "Business", "Negocio"],
    transfers: [/transfer/i, "Transfers", "Transferencias"],
    insurance: [/insur|seguro/i, "Insurance", "Seguros"],
    car: [/car\b|carro|coche|auto|transport/i, "Car", "Carro"],
    fees: [/fee|comisi/i, "Bank fees", "Comisiones"],
    shopping: [/shop|compras/i, "Shopping", "Compras"],
    education: [/educa|school|escuela/i, "Education", "Educación"],
    pets: [/pet|mascota/i, "Pets", "Mascotas"],
    groceries: [/grocer|super|s[uú]per|comida|food|despensa/i, "Groceries", "Súper"],
  };
  /** an existing category for this bucket, or the name to create */
  function bucket(b: string): { catId: string | null; name: string } {
    const [rx, en, sp] = BUCKET[b];
    const hit = findCat(rx, "expense");
    return hit ? { catId: hit.id, name: hit.name } : { catId: null, name: es ? sp : en };
  }

  /* ---------- the live plan ---------- */
  function totals() {
    const p = P.current;
    let inc = 0;
    let out = 0;
    for (const r of p.rows) {
      if (r.status === "off") continue;
      if (r.kind === "income") inc += r.monthly;
      else out += r.monthly;
    }
    for (const s of p.spend) out += s.monthly;
    for (const e of p.extras) (e.kind === "income" ? (inc += e.amount * perMonth(e.freq)) : (out += e.amount * perMonth(e.freq)));
    for (const d of p.debts) out += d.payment;
    return { inc, out, left: inc - out };
  }

  function projectEnd(): number | null {
    const p = P.current;
    if (p.cash == null) return null;
    const today = todayISO();
    const t = new Date();
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0);
    const lastISO = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
    const tomorrow = new Date(t.getTime() + 86400000).toISOString().slice(0, 10);
    if (tomorrow > lastISO) return p.cash;
    let v = p.cash;
    const add = (kind: Kind, amount: number, freq: Frequency, anchor: string) => {
      const w = whenFor(freq, anchor);
      const n = occurrenceDates({ frequency: freq, start_date: w.start_date, end_date: null, schedule: w.schedule }, tomorrow, lastISO).length;
      v += (kind === "income" ? 1 : -1) * amount * n;
    };
    for (const r of p.rows) if (r.status !== "off") add(r.kind, r.amount, r.freq, anchorOf(r.freq, r.last, r.day));
    for (const e of p.extras) add(e.kind, e.amount, e.freq, e.anchor);
    const daysLeft = last.getDate() - t.getDate();
    for (const s of p.spend) v -= (s.monthly * daysLeft) / last.getDate();
    void today;
    return v;
  }

  /* ---------- the conversation ---------- */
  async function connectFlow(): Promise<boolean> {
    // bank data needs two-step verification in this session
    const m = await mfaStatus().catch(() => null);
    if (!m || !m.enrolled) {
      await say(
        S(
          "To protect your bank data, first turn on **two-step verification**. It takes a minute with any authenticator app (Google Authenticator, 1Password…).",
          "Para proteger tus datos del banco, primero activa la **verificación en dos pasos**. Toma un minuto con cualquier app de códigos (Google Authenticator, 1Password…)."
        )
      );
      await widget<void>((done) => (
        <div className="setup-card w-full">
          <MfaSetup onDone={() => done()} />
        </div>
      ));
    } else if (!m.verifiedNow) {
      await say(S("Enter the code from your authenticator app so I can connect your bank.", "Pon el código de tu app de autenticación para conectar tu banco."));
      await widget<void>((done) => (
        <div className="setup-card w-full">
          <MfaCodeCard onDone={() => done()} />
        </div>
      ));
    }
    await say(S("Opening Plaid…", "Abriendo Plaid…"), 150);
    const r = await openPlaidLink(es ? "es" : "en", () => {
      P.current.status = S("Connecting…", "Conectando…");
      force();
    });
    if (r.ok) {
      me(`✓ ${r.institution ?? S("Bank", "Banco")} ${S("connected", "conectado")}`);
      return true;
    }
    await say(
      r.cancelled
        ? S("No problem, it wasn't completed. Want to try again?", "No pasa nada, no se completó. ¿Lo intentamos otra vez?")
        : S(`The bank didn't connect (${r.error}). Want to try again?`, `No se pudo conectar (${r.error}). ¿Lo intentamos otra vez?`)
    );
    const c = await choose([S("Try again", "Intentar otra vez"), S("I'll tell you myself", "Prefiero contarte yo")]);
    if (c === S("Try again", "Intentar otra vez")) return connectFlow();
    return false;
  }

  async function scan(): Promise<Analysis> {
    const p = P.current;
    p.scan = 0;
    p.status = S("Reading…", "Leyendo…");
    p.log = [];
    force();
    const lines = es
      ? ["→ pidiendo tus movimientos al banco…", "→ agrupando por comercio…", "→ buscando pagos que se repiten…", "→ separando sueldo, pagos fijos y gasto diario…", "→ calculando promedios del mes…"]
      : ["→ asking your bank for movements…", "→ grouping by merchant…", "→ finding payments that repeat…", "→ separating pay, bills and everyday spending…", "→ working out monthly averages…"];
    const anim = (async () => {
      for (let i = 0; i <= 100; i += 2) {
        p.scan = i;
        if (i % 20 === 0) p.log = [lines[Math.min(lines.length - 1, i / 20)], ...p.log].slice(0, 3);
        force();
        await sleep(55);
      }
    })();
    await fetch("/api/plaid/sync", { method: "POST" }).catch(() => null);
    const [txs] = await Promise.all([loadTxs(), anim]);
    const a = analyze(txs, p.cats, p.items, todayISO(), p.name);
    p.log = [S(`→ ✓ ${a.txCount} movements, ${Math.round(a.days)} days`, `→ ✓ ${a.txCount} movimientos, ${Math.round(a.days)} días`), ...p.log].slice(0, 3);
    p.scan = 100;
    force();
    return a;
  }

  async function reveal(a: Analysis): Promise<Analysis> {
    const p = P.current;
    const shown = new Set(p.rows.map((r) => r.key));
    const fresh = a.found.filter((f) => !shown.has(f.key));
    const add = async (list: Found[], gap = 260) => {
      for (const f of list) {
        p.rows.push({ ...f, status: f.already ? "already" : "new" });
        force();
        await sleep(gap);
      }
    };

    // paychecks
    const inc = fresh.filter((f) => f.group === "income");
    await add(inc, 420);
    if (inc.length) {
      const top = inc[0];
      const fq = { weekly: S("every week", "cada semana"), biweekly: S("every 2 weeks", "cada 2 semanas"), monthly: S("every month", "cada mes") } as Record<string, string>;
      await say(
        S(
          `I found your pay: **${money(top.amount)} ${fq[top.freq] ?? ""}** from ${top.title}. That's about **${m0(top.monthly)} a month**${top.freq === "biweekly" ? " (some months have 3 checks)" : ""}.`,
          `Encontré tu ingreso: **${money(top.amount)} ${fq[top.freq] ?? ""}** de ${top.title}. Eso es como **${m0(top.monthly)} al mes**${top.freq === "biweekly" ? " (hay meses con 3 pagos)" : ""}.`
        ) + (inc.length > 1 ? S(` Plus ${inc.length - 1} more income.`, ` Y ${inc.length - 1} ingreso(s) más.`) : "")
      );
    } else if (!p.rows.some((r) => r.kind === "income") && !p.extras.some((e) => e.kind === "income")) {
      await say(
        S(
          "I don't see a regular paycheck here. Do you get paid into another account (Cash App, another bank)?",
          "No veo un sueldo fijo aquí. ¿Te pagan en otra cuenta (Cash App, otro banco)?"
        )
      );
      const other = S("Connect that account", "Conectar esa cuenta");
      const c1 = await choose([other, S("I'll tell you how much", "Te digo cuánto")]);
      if (c1 === other && (await connectFlow())) {
        const a2 = await scan();
        return reveal(a2);
      }
      await say(S("How much do you get paid, and how often?", "¿Cuánto te pagan y cada cuándo?"));
      const pay = await widget<{ amount: number; freq: Frequency; date: string } | null>((done) => <PayForm es={es} onDone={done} />);
      if (pay) {
        me(`${money(pay.amount)} · ${pay.freq}`);
        const sal = findCat(/salary|sueldo|n[oó]mina|payroll|wage/i, "income");
        p.extras.push({ key: "pay", title: S("Paycheck", "Sueldo"), kind: "income", amount: pay.amount, freq: pay.freq, anchor: pay.date, catId: sal?.id ?? null, catName: sal ? undefined : S("Salary", "Sueldo"), section: "income" });
        force();
        await say(S("Got it, it's in your plan.", "Listo, ya está en tu plan."));
      } else me(S("Skip for now", "Lo dejo para después"));
    }

    // bills, debts, subscriptions
    const fixed = fresh.filter((f) => f.group === "fixed");
    const debt = fresh.filter((f) => f.group === "debt");
    const subs = fresh.filter((f) => f.group === "sub");
    await add(fixed);
    await add(debt);
    await add(subs, 200);

    // everyday spending
    const already = new Set(p.items.filter((i) => i.active && i.kind === "expense" && i.category_id).map((i) => i.category_id));
    p.spend = a.spend.slice(0, 6).map((s) => ({ ...s, name: s.category_id ? s.name : S("Other", "Otros"), already: !!s.category_id && already.has(s.category_id) }));
    p.status = S("Building…", "Armando…");
    force();

    const nAlready = fresh.filter((f) => f.already).length;
    const parts: string[] = [];
    if (fixed.length) parts.push(S(`**${fixed.length} fixed bills**`, `**${fixed.length} pagos fijos**`));
    if (debt.length) parts.push(S(`**${debt.length} debt payments**`, `**${debt.length} pagos de deudas**`));
    if (subs.length) parts.push(S(`**${subs.length} subscriptions**`, `**${subs.length} suscripciones**`));
    const sp = p.spend.reduce((s, x) => s + x.monthly, 0);
    await say(
      (parts.length ? S(`I found ${parts.join(", ")}`, `Encontré ${parts.join(", ")}`) : S("I didn't find many repeating bills yet", "Todavía no veo muchos pagos que se repitan")) +
        (sp ? S(`, and you spend about **${m0(sp)} a month** day to day.`, `, y en el día a día gastas como **${m0(sp)} al mes**.`) : ".") +
        (nAlready ? S(` ${nAlready} of them were already in your plan, so I won't duplicate them.`, ` ${nAlready} ya estaban en tu plan, no los duplico.`) : "")
    );
    if (a.days < 45)
      await say(
        S(
          "Your bank is still sending older history (it can take a few minutes). I'll keep refining as it arrives.",
          "Tu banco todavía está mandando el historial más viejo (a veces tarda unos minutos). Voy a afinar conforme llegue."
        )
      );    return a;
  }

  async function askQuestions(a: Analysis) {
    const p = P.current;
    const qs = a.questions;
    if (!qs.length) return;
    setStep(3);
    await say(
      S(
        `Before I finish, **${qs.length} quick question${qs.length > 1 ? "s" : ""}** so I categorize things right.`,
        `Antes de cerrar, **${qs.length} pregunta${qs.length > 1 ? "s" : ""} rápida${qs.length > 1 ? "s" : ""}** para acomodar bien todo.`
      )
    );
    for (const q of qs) await askOne(q);
    void p;
  }

  async function askOne(q: Question) {
    const p = P.current;
    const meta = S(
      `${q.count} time${q.count > 1 ? "s" : ""} · ~${m0(q.monthly)}/mo · last ${q.last}`,
      `${q.count} ${q.count > 1 ? "veces" : "vez"} · ~${m0(q.monthly)}/mes · último ${q.last}`
    );
    const card = (text: string) =>
      push({
        who: "ai",
        node: (
          <div>
            <p className="mb-2">{rich(text)}</p>
            <div className="setup-q">
              <b>{q.merchant}</b>
              <span>{meta}</span>
            </div>
          </div>
        ),
      });

    if (q.type === "person") {
      setTyping(true);
      await sleep(700);
      setTyping(false);
      card(
        q.self
          ? S(`You move about **${m0(q.monthly)} a month** here. Is it another account of yours?`, `Mueves como **${m0(q.monthly)} al mes** aquí. ¿Es otra cuenta tuya?`)
          : S(`You send money to this person (~**${m0(q.monthly)}/mo**). What is it?`, `Le mandas dinero a esta persona (~**${m0(q.monthly)}/mes**). ¿Qué es?`)
      );
      const opts = [S("Family", "Familia"), S("A loan I pay", "Préstamo que pago"), S("Rent", "Renta"), S("Business", "Negocio"), S("Another account of mine", "Es otra cuenta mía"), S("Something else", "Otra cosa")];
      if (q.self) opts.unshift(opts.splice(4, 1)[0]);
      const c = await choose(opts);
      const map: Record<string, string> = {
        [S("Family", "Familia")]: "family",
        [S("A loan I pay", "Préstamo que pago")]: "debt",
        [S("Rent", "Renta")]: "housing",
        [S("Business", "Negocio")]: "business",
        [S("Another account of mine", "Es otra cuenta mía")]: "transfers",
      };
      const b = map[c];
      if (!b) return say(S("Ok, I'll leave it as is.", "Va, lo dejo como está."));
      const cat = bucket(b);
      p.recats.push({ txIds: q.txIds, catId: cat.catId, catName: cat.name, catKind: "expense" });
      if (b === "transfers") return say(S("Got it — that's your own money moving, not spending.", "Entendido: es tu dinero moviéndose, no un gasto."));
      if (q.repeats) {
        p.extras.push({
          key: q.id,
          title: q.merchant,
          kind: "expense",
          amount: Math.round(q.monthly),
          freq: "monthly",
          anchor: anchorOf("monthly", q.last, Number(q.last.slice(8, 10))),
          catId: cat.catId,
          catName: cat.name,
          section: b === "debt" ? "debt" : "fixed",
          tag: S("new", "nuevo"),
        });
        force();
        return say(
          S(`Saved as **${cat.name}** and added **${m0(q.monthly)}/mo** to your plan. Next time I'll sort it on my own.`, `Lo guardé como **${cat.name}** y agregué **${m0(q.monthly)}/mes** a tu plan. La próxima vez lo acomodo solo.`)
        );
      }
      return say(S(`Saved as **${cat.name}**.`, `Lo guardé como **${cat.name}**.`));
    }

    if (q.type === "other" || q.type === "mixed") {
      setTyping(true);
      await sleep(700);
      setTyping(false);
      card(
        q.type === "mixed"
          ? S(`What do you mostly buy here?`, `¿Qué compras más aquí?`)
          : S(`This is in "Other". Where should it go?`, `Esto está en "Otros". ¿Dónde lo pongo?`)
      );
      const options: { label: string; catId: string | null; name: string }[] = [];
      const addOpt = (o: { catId: string | null; name: string }) => {
        if (!options.some((x) => x.name.toLowerCase() === o.name.toLowerCase())) options.push({ ...o, label: o.name });
      };
      if (q.type === "mixed") ["groceries", "shopping", "housing"].forEach((b) => addOpt(bucket(b)));
      else {
        if (q.suggest && BUCKET[q.suggest]) addOpt(bucket(q.suggest));
        // the user's most-used spending categories
        const used = new Map<string, number>();
        for (const it of p.items) if (it.kind === "expense" && it.category_id) used.set(it.category_id, (used.get(it.category_id) ?? 0) + 1);
        const top = p.cats
          .filter((c) => c.kind === "expense" && !/^\s*(other|otros?|misc|varios)\s*$/i.test(c.name))
          .sort((x, y) => (used.get(y.id) ?? 0) - (used.get(x.id) ?? 0))
          .slice(0, 3);
        top.forEach((c) => addOpt({ catId: c.id, name: c.name }));
      }
      const keep = S("Leave it in Other", "Déjalo en Otros");
      const c = await choose([...options.map((o) => o.label), keep]);
      const o = options.find((x) => x.label === c);
      if (!o) return say(S("Ok.", "Va."));
      p.recats.push({ txIds: q.txIds, catId: o.catId, catName: o.name, catKind: "expense" });
      if (q.repeats && q.type === "other" && q.monthly >= 20) {
        p.extras.push({
          key: q.id,
          title: q.merchant,
          kind: "expense",
          amount: Math.round(q.monthly),
          freq: "monthly",
          anchor: anchorOf("monthly", q.last, Number(q.last.slice(8, 10))),
          catId: o.catId,
          catName: o.name,
          section: "fixed",
          tag: S("new", "nuevo"),
        });
        force();
      }
      return say(S(`Done — **${q.merchant}** goes to **${o.name}** from now on.`, `Listo: **${q.merchant}** va a **${o.name}** de aquí en adelante.`));
    }
  }

  async function reviewSubs() {
    const p = P.current;
    const subs = p.rows.filter((r) => r.group === "sub" && r.status === "new");
    if (subs.length < 2) return;
    const total = subs.reduce((s, r) => s + r.monthly, 0);
    await say(
      S(
        `You pay **${subs.length} subscriptions** (${m0(total)}/mo). Tap the ones you **don't use anymore** and I'll remind you to cancel them.`,
        `Pagas **${subs.length} suscripciones** (${m0(total)}/mes). Toca las que **ya no usas** y te recuerdo cancelarlas.`
      )
    );
    const off = await widget<string[]>((done) => <SubsPicker es={es} subs={subs} onDone={done} />);
    if (!off.length) {
      me(S("I use them all", "Las uso todas"));
      return;
    }
    const gone = subs.filter((s) => off.includes(s.key));
    me(gone.map((g) => g.title).join(", "));
    for (const g of gone) {
      g.status = "off";
      p.cancel.push(g);
    }
    force();
    const yr = gone.reduce((s, g) => s + g.monthly * 12, 0);
    await say(S(`Marked to cancel. That's **${m0(yr)} a year** back in your pocket. I'll add a reminder to your tasks.`, `Marcadas para cancelar. Son **${m0(yr)} al año** de regreso. Te dejo un recordatorio en tus pendientes.`));
  }

  async function outsideDebts(): Promise<"done" | "bank"> {
    const p = P.current;
    setStep(4);
    await say(
      S(
        "One last thing: do you have debts or payments **outside this bank**? A card from another bank, a car loan, student loans…",
        "Una última cosa: ¿tienes deudas o pagos **fuera de este banco**? Una tarjeta de otro banco, préstamo de carro, estudiantil…"
      )
    );
    for (;;) {
      const add = S("Yes, add one", "Sí, agregar una");
      const bank = S("Connect another bank", "Conectar otro banco");
      const c = await choose([S("No, that's all", "No, eso es todo"), add, bank], { primary: 0 });
      if (c === bank) return "bank";
      if (c !== add) return "done";
      const d = await widget<OutDebt | null>((done) => <DebtForm es={es} onDone={done} />);
      if (!d) {
        me(S("Never mind", "Mejor no"));
        continue;
      }
      me(`${d.name} · ${money(d.balance)}${d.apr ? ` · ${d.apr}%` : ""}`);
      p.debts.push(d);
      force();
      const extra = 100;
      const months = payoffMonths(d.balance, d.apr, d.payment);
      const months2 = payoffMonths(d.balance, d.apr, d.payment + extra);
      await say(
        months && months2 && months - months2 >= 2
          ? S(
              `Added. At ${money(d.payment)}/mo you're done in **${months} months**; with ${money(extra)} extra, in **${months2}**. Anything else?`,
              `Agregada. Con ${money(d.payment)}/mes terminas en **${months} meses**; con ${money(extra)} extra, en **${months2}**. ¿Algo más?`
            )
          : S("Added. Anything else?", "Agregada. ¿Algo más?")
      );
    }
  }

  async function save() {
    const p = P.current;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const uid = user.id;
    const made = new Map<string, string>();
    async function ensure(name: string, kind: Kind): Promise<string | null> {
      const k = `${kind}|${name.toLowerCase()}`;
      const hit = p.cats.find((c) => c.kind === kind && c.name.toLowerCase() === name.toLowerCase());
      if (hit) return hit.id;
      if (made.has(k)) return made.get(k)!;
      const { data } = await supabase.from("categories").insert({ user_id: uid, name, icon: "", kind }).select("id").single();
      const id = (data as any)?.id ?? null;
      if (id) {
        made.set(k, id);
        p.cats.push({ id, name, kind });
      }
      return id;
    }
    const debtCat = async () => (findCat(/debt|deuda|loan|pr[eé]stamo/i, "expense")?.id ?? (await ensure(S("Debts", "Deudas"), "expense")));

    // 1) the answers: move those movements to the right category
    for (const r of p.recats) {
      const cid = r.catId ?? (r.catName ? await ensure(r.catName, r.catKind) : null);
      if (!cid) continue;
      for (let i = 0; i < r.txIds.length; i += 150) await supabase.from("transactions").update({ category_id: cid }).in("id", r.txIds.slice(i, i + 150));
    }

    // 2) plan lines
    const rows: any[] = [];
    const line = (title: string, kind: Kind, amount: number, freq: Frequency, anchor: string, category_id: string | null) => {
      const w = whenFor(freq, anchor);
      rows.push({ user_id: uid, title: title.slice(0, 80), kind, amount: Math.round(amount * 100) / 100, category_id, account_id: null, frequency: freq, start_date: w.start_date, schedule: w.schedule });
    };
    for (const r of p.rows) {
      if (r.status !== "new") continue;
      const cid = r.group === "debt" ? (r.category_id && /debt|deuda|loan|pr[eé]stamo/i.test(catName(r.category_id)) ? r.category_id : await debtCat()) : r.category_id;
      line(r.title, r.kind, r.amount, r.freq, anchorOf(r.freq, r.last, r.day), cid);
    }
    for (const e of p.extras) {
      const cid = e.catId ?? (e.catName ? await ensure(e.catName, e.kind) : null);
      line(e.title, e.kind, e.amount, e.freq, e.anchor, cid);
    }
    // everyday spending as a weekly budget line per category (spreads it over the month)
    for (const s of p.spend) {
      if (s.already || !s.category_id) continue;
      line(s.name, "expense", Math.round((s.monthly * 12) / 52), "weekly", todayISO(), s.category_id);
    }
    if (rows.length) await supabase.from("recurring_items").insert(rows);

    // 3) debts outside the bank
    if (p.debts.length)
      await supabase.from("debts").insert(
        p.debts.map((d) => ({ user_id: uid, name: d.name, debt_type: "credit_card", balance: d.balance, apr: d.apr, planned_payment: d.payment, payment_due_day: d.day }))
      );

    // 4) reminders to cancel subscriptions
    for (const s of p.cancel)
      await supabase.from("tasks").insert({
        user_id: uid,
        title: S(`Cancel ${s.title}`, `Cancelar ${s.title}`),
        kind: "expense",
        amount: null,
        category_id: null,
        account_id: null,
        due_date: todayISO(),
        recurrence: "none",
      });

    await supabase.from("profiles").update({ onboarded: true }).eq("id", uid);
    p.saved = true;
    window.dispatchEvent(new Event("mf:changed"));
  }

  async function finish() {
    const p = P.current;
    setStep(5);
    p.status = S("Saving…", "Guardando…");
    force();
    await say(S("Saving your plan…", "Guardando tu plan…"), 100);
    await save();
    p.end = projectEnd();
    p.status = S("✓ Plan ready", "✓ Plan listo");
    force();
    const t = totals();
    const lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    await say(
      S(
        `**Your month is ready.** About ${m0(t.inc)} comes in and ${m0(t.out)} goes out — **${m0(t.left)} left** each month.`,
        `**Tu mes está listo.** Entran como ${m0(t.inc)} y salen ${m0(t.out)}: te quedan **${m0(t.left)}** al mes.`
      ) +
        (p.end != null
          ? S(` If everything goes to plan, on the ${lastDay}th you'll have **${m0(p.end)}**.`, ` Si todo sigue el plan, el ${lastDay} vas a tener **${m0(p.end)}**.`)
          : "")
    );
    await say(S("You can change any line from your month. Want to see it?", "Cualquier línea la puedes cambiar desde tu mes. ¿Lo vemos?"));
    await choose([S("See my month →", "Ver mi mes →")]);
    router.push("/app");
    router.refresh();
  }

  async function run() {
    await loadBase();
    const p = P.current;
    const hi = p.name ? S(`Hi ${p.name}! `, `¡Hola ${p.name}! `) : S("Hi! ", "¡Hola! ");
    await say(hi + S("I'm **Montfort AI**. I'll build your whole budget for you — you just correct me if something's off.", "Soy **Montfort AI**. Te voy a armar tu presupuesto completo: tú solo me corriges si algo no cuadra."), 200);

    const bank = await plaidItems();
    if (!bank.configured) {
      await say(S("Bank connections aren't available right now. Let's do it by hand — it takes 3 minutes.", "La conexión con bancos no está disponible ahorita. Hagámoslo a mano, son 3 minutos."));
      await choose([S("Continue", "Continuar")]);
      return router.push("/app/welcome/manual");
    }
    if (bank.names.length) {
      await say(S(`You already have **${bank.names.join(", ")}** connected.`, `Ya tienes **${bank.names.join(", ")}** conectado.`));
      await say(
        S(
          "Do you get money in another account too — **Cash App**, another bank, a card? Connect it so I see the whole picture.",
          "¿Recibes dinero en otra cuenta también — **Cash App**, otro banco, una tarjeta? Conéctala para que vea todo completo."
        )
      );
      const more = S("Connect another account", "Conectar otra cuenta");
      const c0 = await choose([S("No, just that one", "No, solo esa"), more]);
      if (c0 === more) await connectFlow();
    } else {
      await say(
        S(
          "The fastest way: connect your bank and I'll read your last months to find your pay, your bills and where your money goes. **I can only look — I can never move money.**",
          "Lo más rápido: conecta tu banco y leo tus últimos meses para encontrar tu sueldo, tus pagos y en qué gastas. **Solo puedo ver, nunca mover dinero.**"
        )
      );
      for (;;) {
        const connect = S("Connect my bank", "Conectar mi banco");
        const safe = S("Is it safe?", "¿Es seguro?");
        const c = await choose([connect, S("I'd rather tell you myself", "Prefiero contarte yo"), safe]);
        if (c === safe) {
          await say(
            S(
              "Yes. The connection runs through **Plaid**, the same one Venmo and many banks use. I never see your bank password, access is read-only, and you can disconnect anytime from Settings.",
              "Sí. La conexión es con **Plaid**, la misma que usan Venmo y muchos bancos. Nunca veo tu contraseña del banco, el acceso es de solo lectura y lo desconectas cuando quieras desde Más."
            )
          );
          continue;
        }
        if (c !== connect) {
          await say(S("Sure — I'll take you to the quick form.", "Va, te llevo al formulario rápido."));
          await sleep(600);
          return router.push("/app/welcome/manual");
        }
        const ok = await connectFlow();
        if (!ok) {
          await say(S("Sure — I'll take you to the quick form.", "Va, te llevo al formulario rápido."));
          await sleep(600);
          return router.push("/app/welcome/manual");
        }
        break;
      }
    }

    setStep(2);
    await say(S("Let me read your movements. Watch your plan fill in →", "Déjame leer tus movimientos. Mira cómo se llena tu plan →"), 200);
    let a = await scan();
    a = await reveal(a);
    await askQuestions(a);
    await reviewSubs();
    for (;;) {
      const r = await outsideDebts();
      if (r === "done") break;
      const ok = await connectFlow();
      if (ok) {
        a = await scan();
        a = await reveal(a);
        await askQuestions(a);
      }
    }
    await finish();
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- free chat with the AI at any moment ---------- */
  async function send() {
    const q = input.trim();
    if (!q || asking) return;
    setInput("");
    me(q);
    chatHist.current.push({ role: "user", content: q });
    setAsking(true);
    setTyping(true);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lang, messages: chatHist.current.slice(-8) }),
      });
      const j = await r.json();
      const reply: string = j?.reply ?? S("Sorry, I couldn't answer that.", "Perdón, no pude contestar eso.");
      chatHist.current.push({ role: "assistant", content: reply });
      const actions: { action: any; summary: string }[] = Array.isArray(j?.actions) ? j.actions : [];
      setTyping(false);
      push({ who: "ai", node: <AiReply text={reply} actions={actions} es={es} /> });
    } catch {
      setTyping(false);
      push({ who: "ai", text: S("Something went wrong. Try again.", "Algo falló. Intenta otra vez.") });
    } finally {
      setAsking(false);
    }
  }

  /* ---------- render ---------- */
  const p = P.current;
  const t = totals();
  const sec = (g: string) => p.rows.filter((r) => r.group === g);
  const ex = (s: Extra["section"]) => p.extras.filter((e) => e.section === s);
  const spendTotal = p.spend.reduce((s, x) => s + x.monthly, 0);
  const lastDay = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const monthName = new Date().toLocaleDateString(es ? "es-MX" : "en-US", { month: "long" }).replace(/^./, (c) => (es ? c : c.toUpperCase()));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "var(--bg)" }}>
      <div className="mx-auto max-w-[1240px] px-4 pb-10 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          <Wordmark />
          <div className="flex items-center gap-3">
            <span className="faint hidden text-xs sm:inline">{S(`Step ${step} of 5`, `Paso ${step} de 5`)}</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <i key={i} className="block h-1.5 w-6 rounded-full transition-colors" style={{ background: i <= step ? "linear-gradient(90deg,var(--grad-from),var(--grad-to))" : "var(--surface-2)" }} />
              ))}
            </div>
            <Link href="/app/welcome/manual" className="faint hidden text-xs hover:underline md:inline">
              {S("Do it by hand", "Hacerlo a mano")}
            </Link>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          {/* chat */}
          <div className="card flex flex-col overflow-hidden !p-0 lg:h-[calc(100dvh-6.5rem)]">
            <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
              <span className="grid h-9 w-9 place-items-center rounded-xl font-display font-bold text-white" style={{ background: "linear-gradient(135deg,var(--grad-from),var(--grad-to))" }}>
                M
              </span>
              <div className="leading-tight">
                <b className="text-sm">Montfort AI</b>
                <div className="text-xs font-semibold" style={{ color: "var(--mint)" }}>
                  {typing ? S("typing…", "escribiendo…") : S("online", "en línea")}
                </div>
              </div>
              <div className="ml-auto text-right text-[11px] leading-tight lg:hidden">
                <div className="faint">{S("Left / mo", "Te queda / mes")}</div>
                <b className="tabnum" style={{ color: t.left >= 0 ? "var(--mint)" : "var(--over)" }}>
                  {m0(t.left)}
                </b>
              </div>
            </div>
            <div ref={listRef} className="flex max-h-[62dvh] min-h-[320px] flex-1 flex-col gap-3 overflow-y-auto p-4 lg:max-h-none">
              {msgs.map((m) => (
                <div key={m.id} className={`setup-msg ${m.who === "me" ? "setup-me" : "setup-ai"}`}>
                  {m.node ?? rich(m.text ?? "")}
                </div>
              ))}
              {typing && (
                <div className="setup-msg setup-ai setup-typing">
                  <i />
                  <i />
                  <i />
                </div>
              )}
              {pending && <div className="setup-in">{pending}</div>}
            </div>
            <form
              className="flex gap-2 border-t p-3"
              style={{ borderColor: "var(--border)" }}
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <input className="input flex-1" placeholder={S("Ask or tell me anything…", "Pregúntame o dime lo que quieras…")} value={input} onChange={(e) => setInput(e.target.value)} />
              <button className="btn btn-primary" disabled={asking || !input.trim()}>
                {S("Send", "Enviar")}
              </button>
            </form>
          </div>

          {/* live plan */}
          <div className="card !p-5 lg:h-[calc(100dvh-6.5rem)] lg:overflow-y-auto">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">{S(`Your ${monthName} plan`, `Tu plan de ${monthName}`)}</h2>
                <p className="faint text-xs">{S("Fills in while you chat", "Se va llenando mientras platicamos")}</p>
              </div>
              {p.status && (
                <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "var(--mint-soft)", color: "var(--mint)" }}>
                  {p.status}
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Kpi label={S("In / mo", "Entra / mes")} value={t.inc} color="var(--mint)" />
              <Kpi label={S("Out / mo", "Sale / mes")} value={t.out} color="var(--over)" />
              <Kpi label={S("Left", "Te queda")} value={t.left} />
            </div>

            {p.cash != null && (
              <div
                className="mt-3 flex items-center justify-between rounded-2xl p-4 text-white transition-opacity duration-700"
                style={{ background: "linear-gradient(120deg,var(--grad-from),var(--grad-to))", opacity: p.end != null ? 1 : 0.55 }}
              >
                <div>
                  <div className="text-xs opacity-90">
                    {p.end != null ? S(`On the ${lastDay}th you'll have`, `El ${lastDay} vas a tener`) : S("In your bank today", "Hoy en tu banco")}
                  </div>
                  <div className="font-display text-3xl font-bold tabnum">
                    <Counter value={p.end ?? p.cash} />
                  </div>
                </div>
                <svg width="110" height="40" viewBox="0 0 110 40" aria-hidden>
                  <path d="M2,28 L18,34 L34,30 L50,12 L66,18 L82,22 L98,6 L108,10" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" className={p.end != null ? "setup-draw" : ""} opacity={p.end != null ? 1 : 0.4} />
                </svg>
              </div>
            )}

            {p.scan >= 0 && p.scan < 100 && (
              <div className="mt-3 rounded-2xl border border-dashed p-3 text-xs" style={{ borderColor: "var(--border)" }}>
                <b>{S("Reading your bank", "Leyendo tu banco")}</b>
                <div className="my-2 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${p.scan}%`, background: "linear-gradient(90deg,var(--grad-from),var(--grad-to))" }} />
                </div>
                <div className="faint font-mono leading-5">
                  {p.log.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              </div>
            )}

            <Section title={S("Comes in", "Lo que entra")} empty={S("Your pay will show here", "Aquí aparecerá tu sueldo")} n={sec("income").length + ex("income").length}>
              {sec("income").map((r) => (
                <Line key={r.key} r={r} es={es} color="var(--mint)" />
              ))}
              {ex("income").map((e) => (
                <ExtraLine key={e.key} e={e} es={es} color="var(--mint)" />
              ))}
            </Section>
            <Section title={S("Fixed bills", "Pagos fijos")} empty={S("Rent, car, power…", "Renta, carro, luz…")} n={sec("fixed").length + ex("fixed").length}>
              {sec("fixed").map((r) => (
                <Line key={r.key} r={r} es={es} color="#1d6fa5" />
              ))}
              {ex("fixed").map((e) => (
                <ExtraLine key={e.key} e={e} es={es} color="#1d6fa5" />
              ))}
            </Section>
            <Section title={S("Debts", "Deudas")} empty={S("Cards, loans…", "Tarjetas, préstamos…")} n={sec("debt").length + ex("debt").length + p.debts.length}>
              {sec("debt").map((r) => (
                <Line key={r.key} r={r} es={es} color="var(--over)" />
              ))}
              {ex("debt").map((e) => (
                <ExtraLine key={e.key} e={e} es={es} color="var(--over)" />
              ))}
              {p.debts.map((d, i) => (
                <div key={i} className="setup-line">
                  <span className="setup-dot" style={{ background: "var(--over)" }} />
                  <div className="min-w-0">
                    <div className="truncate">{d.name}</div>
                    <div className="faint text-xs">
                      {S("owes", "debe")} {money(d.balance)}
                      {d.apr ? ` · ${d.apr}%` : ""}
                    </div>
                  </div>
                  <span className="setup-tag">{S("new", "nuevo")}</span>
                  <b className="tabnum">{money(d.payment)}</b>
                </div>
              ))}
            </Section>
            <Section title={S("Subscriptions", "Suscripciones")} empty="Netflix, Spotify…" n={sec("sub").length}>
              {sec("sub").map((r) => (
                <Line key={r.key} r={r} es={es} color="#7c5cff" />
              ))}
            </Section>
            <Section title={S("Everyday spending (monthly average)", "Gasto del día a día (promedio al mes)")} empty={S("Food, gas, shopping…", "Comida, gasolina, compras…")} n={p.spend.length} right={spendTotal ? m0(spendTotal) : ""}>
              <div className="grid grid-cols-[110px_1fr] items-center gap-4">
                <Donut parts={p.spend.map((s, i) => [s.monthly, COLORS[i % COLORS.length]])} total={spendTotal} />
                <div className="grid gap-1.5 text-sm">
                  {p.spend.map((s, i) => (
                    <div key={s.name + i} className="setup-land flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <i className="block h-2.5 w-2.5 shrink-0 rounded" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="truncate">{s.name}</span>
                        {s.already && <span className="faint text-[10px]">{S("in plan", "en plan")}</span>}
                      </span>
                      <b className="tabnum">{m0(s.monthly)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ helpers */

/** the date a new plan line starts from */
function anchorOf(freq: Frequency, last: string, day: number): string {
  if (freq !== "monthly") return last;
  const t = new Date();
  const dim = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(Math.min(day, dim)).padStart(2, "0")}`;
}

function payoffMonths(balance: number, apr: number, pay: number): number | null {
  let b = balance;
  const r = apr / 100 / 12;
  for (let m = 1; m <= 600; m++) {
    b = b * (1 + r) - pay;
    if (b <= 0) return m;
  }
  return null;
}

function Counter({ value }: { value: number }) {
  const [v, setV] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      setV(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{money(Math.round(v))}</>;
}

function Kpi({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-2xl p-3" style={{ background: "var(--surface-2)" }}>
      <div className="faint text-[11px]">{label}</div>
      <div className="font-display text-lg font-semibold tabnum sm:text-2xl" style={{ color: color ?? (value < 0 ? "var(--over)" : "var(--text)") }}>
        <Counter value={value} />
      </div>
    </div>
  );
}

function Section({ title, empty, n, right, children }: { title: string; empty: string; n: number; right?: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <div className="faint mb-2 flex justify-between text-[11px] font-bold uppercase tracking-[0.1em]">
        <span>{title}</span>
        <span>{right}</span>
      </div>
      {n === 0 ? (
        <div className="faint rounded-xl border border-dashed px-3 py-2.5 text-sm" style={{ borderColor: "var(--border)" }}>
          {empty}
        </div>
      ) : (
        <div className="grid gap-1.5">{children}</div>
      )}
    </div>
  );
}

const FQ = (f: Frequency, es: boolean, day: number) =>
  f === "weekly" ? (es ? "cada semana" : "weekly") : f === "biweekly" ? (es ? "cada 2 semanas" : "every 2 weeks") : es ? `cada mes · el ${day}` : `monthly · on the ${day}`;

function Line({ r, es, color }: { r: Row; es: boolean; color: string }) {
  return (
    <div className={`setup-line setup-land ${r.status === "off" ? "opacity-50" : ""}`}>
      <span className="setup-dot" style={{ background: color }} />
      <div className="min-w-0">
        <div className={`truncate ${r.status === "off" ? "line-through" : ""}`}>{r.title}</div>
        <div className="faint text-xs">
          {FQ(r.freq, es, r.day)}
          {r.varies ? (es ? " · varía" : " · varies") : ""}
        </div>
      </div>
      {r.status === "already" ? (
        <span className="faint text-[10px] font-semibold">{es ? "ya en tu plan" : "already in plan"}</span>
      ) : r.status === "off" ? (
        <span className="setup-tag" style={{ color: "var(--over)" }}>
          {es ? "cancelar" : "cancel"}
        </span>
      ) : (
        <span />
      )}
      <b className="tabnum">{money(r.amount)}</b>
    </div>
  );
}

function ExtraLine({ e, es, color }: { e: Extra; es: boolean; color: string }) {
  return (
    <div className="setup-line setup-land">
      <span className="setup-dot" style={{ background: color }} />
      <div className="min-w-0">
        <div className="truncate">{e.title}</div>
        <div className="faint text-xs">{FQ(e.freq, es, Number(e.anchor.slice(8, 10)))}</div>
      </div>
      {e.tag ? <span className="setup-tag">{e.tag}</span> : <span />}
      <b className="tabnum">{money(e.amount)}</b>
    </div>
  );
}

function Donut({ parts, total }: { parts: [number, string][]; total: number }) {
  let off = 25;
  return (
    <svg viewBox="0 0 42 42" width="110" height="110" aria-hidden>
      <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--surface-2)" strokeWidth="6" />
      {total > 0 &&
        parts.map(([v, c], i) => {
          const pct = (v / total) * 100;
          const el = <circle key={i} cx="21" cy="21" r="15.9" fill="none" stroke={c} strokeWidth="6" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={off} style={{ transition: "all .6s" }} />;
          off -= pct;
          return el;
        })}
      <text x="21" y="22.6" textAnchor="middle" fontSize="5" fontWeight="700" fill="var(--text)" className="font-display">
        {total ? money(total) : ""}
      </text>
    </svg>
  );
}

function PayForm({ es, onDone }: { es: boolean; onDone: (v: { amount: number; freq: Frequency; date: string } | null) => void }) {
  const [amount, setAmount] = useState("");
  const [freq, setFreq] = useState<Frequency>("biweekly");
  const [date, setDate] = useState(todayISO());
  return (
    <div className="setup-card grid w-full gap-2">
      <div className="grid grid-cols-2 gap-2">
        <input className="input" type="number" inputMode="decimal" placeholder={es ? "Cuánto te cae ($)" : "Take-home ($)"} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="input" value={freq} onChange={(e) => setFreq(e.target.value as Frequency)}>
          <option value="weekly">{es ? "Cada semana" : "Weekly"}</option>
          <option value="biweekly">{es ? "Cada 2 semanas" : "Every 2 weeks"}</option>
          <option value="semimonthly">{es ? "Dos veces al mes" : "Twice a month"}</option>
          <option value="monthly">{es ? "Cada mes" : "Monthly"}</option>
        </select>
      </div>
      <label className="faint text-xs">
        {es ? "Fecha de tu próximo o último pago" : "Date of your next or last check"}
        <input className="input mt-1" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1" onClick={() => onDone(null)}>
          {es ? "Después" : "Later"}
        </button>
        <button className="btn btn-primary flex-[2]" disabled={!(parseFloat(amount) > 0)} onClick={() => onDone({ amount: parseFloat(amount), freq, date })}>
          {es ? "Agregar" : "Add"}
        </button>
      </div>
    </div>
  );
}

function DebtForm({ es, onDone }: { es: boolean; onDone: (v: OutDebt | null) => void }) {
  const [f, setF] = useState({ name: "", balance: "", apr: "", payment: "", day: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const ok = f.name.trim() && parseFloat(f.balance) > 0 && parseFloat(f.payment) > 0;
  return (
    <div className="setup-card grid w-full gap-2">
      <input className="input" placeholder={es ? "Nombre (ej. Discover, préstamo carro)" : "Name (e.g. Discover, car loan)"} value={f.name} onChange={set("name")} />
      <div className="grid grid-cols-2 gap-2">
        <input className="input" type="number" inputMode="decimal" placeholder={es ? "Cuánto debes ($)" : "Balance ($)"} value={f.balance} onChange={set("balance")} />
        <input className="input" type="number" inputMode="decimal" placeholder={es ? "Interés % (opcional)" : "APR % (optional)"} value={f.apr} onChange={set("apr")} />
        <input className="input" type="number" inputMode="decimal" placeholder={es ? "Pago al mes ($)" : "Monthly payment ($)"} value={f.payment} onChange={set("payment")} />
        <input className="input" type="number" inputMode="numeric" placeholder={es ? "Día de pago (opcional)" : "Due day (optional)"} value={f.day} onChange={set("day")} />
      </div>
      <div className="flex gap-2">
        <button className="btn btn-ghost flex-1" onClick={() => onDone(null)}>
          {es ? "Cancelar" : "Cancel"}
        </button>
        <button
          className="btn btn-primary flex-[2]"
          disabled={!ok}
          onClick={() => {
            const day = parseInt(f.day, 10);
            onDone({ name: f.name.trim(), balance: parseFloat(f.balance), apr: parseFloat(f.apr) || 0, payment: parseFloat(f.payment), day: day >= 1 && day <= 31 ? day : null });
          }}
        >
          {es ? "Agregar deuda" : "Add debt"}
        </button>
      </div>
    </div>
  );
}

function SubsPicker({ es, subs, onDone }: { es: boolean; subs: Row[]; onDone: (keys: string[]) => void }) {
  const [off, setOff] = useState<string[]>([]);
  return (
    <div className="grid w-full gap-2">
      <div className="flex flex-wrap gap-2">
        {subs.map((s) => {
          const on = off.includes(s.key);
          return (
            <button key={s.key} className={`setup-chip ${on ? "setup-chip-off" : ""}`} onClick={() => setOff(on ? off.filter((k) => k !== s.key) : [...off, s.key])}>
              {on ? "✕ " : ""}
              {s.title.includes("($") ? s.title : `${s.title} · ${money(s.amount)}`}
            </button>
          );
        })}
      </div>
      <div>
        <button className="setup-chip setup-chip-p" onClick={() => onDone(off)}>
          {off.length ? (es ? `Listo (${off.length} para cancelar)` : `Done (${off.length} to cancel)`) : es ? "Las uso todas" : "I use them all"}
        </button>
      </div>
    </div>
  );
}

function AiReply({ text, actions, es }: { text: string; actions: { action: any; summary: string }[]; es: boolean }) {
  const [state, setState] = useState<"" | "busy" | "done" | "fail">("");
  async function apply() {
    setState("busy");
    try {
      const r = await fetch("/api/ask/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actions: actions.map((a) => a.action) }),
      });
      const j = await r.json().catch(() => ({}));
      setState(r.ok && (j.results ?? []).every((x: any) => x.ok) ? "done" : "fail");
      window.dispatchEvent(new Event("mf:changed"));
    } catch {
      setState("fail");
    }
  }
  return (
    <div>
      <div className="whitespace-pre-wrap">{rich(text)}</div>
      {actions.length > 0 && (
        <div className="mt-2 grid gap-1.5">
          {actions.map((a, i) => (
            <div key={i} className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: "var(--surface)" }}>
              {a.summary}
            </div>
          ))}
          {state === "done" ? (
            <span className="text-xs font-semibold" style={{ color: "var(--mint)" }}>
              ✓ {es ? "Aplicado" : "Applied"}
            </span>
          ) : (
            <button className="setup-chip setup-chip-p justify-self-start" disabled={state === "busy"} onClick={apply}>
              {state === "busy" ? "…" : state === "fail" ? (es ? "Reintentar" : "Retry") : es ? "Aplicar" : "Apply"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
