"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

type L = "en" | "es";

const T = {
  en: {
    signin: "Sign in",
    start: "Start free",
    h1a: "Know your month",
    h1b: "before it happens.",
    sub: "Montfort Money lays out your whole month day by day — what comes in, what goes out, and the exact days you'd come up short — so you fix it before it happens.",
    beta: "Free during beta · no card needed",
    cash: "Cash",
    onThe: "On the 30th you'd have",
    tight: "Oct 12 is tight — move the car insurance to the 15th?",
    featuresTitle: "Everything your money needs, on one page",
    f: [
      ["Your month, day by day", "A calendar with your balance on every day. Green is fine, amber is tight, red means you'd come up short — weeks before it happens."],
      ["Montfort AI plans with you", "Ask “can I afford $500 more this month?” or tell it “add a $120 car registration in November” — it shows the change before it makes it."],
      ["Debts with an end date", "Cards, cars, loans and people, grouped. See the month each one dies and what an extra $100 does."],
      ["Goals and investments", "Save for the house, grow the brokerage account, and see your net worth 12 months out if the plan holds."],
      ["Trips with friends", "Flights, hotels and confirmation numbers in one itinerary. Everyone adds expenses and it tells you who owes who."],
      ["Budget as a couple", "Share a space with your partner for the bills you split, and keep your own money private."],
    ],
    howTitle: "How it works",
    how: [
      ["Tell it your month", "Your paycheck, rent, bills and debts — by chat with Montfort AI or in a few taps."],
      ["See every day ahead", "The calendar shows where you land each day and warns you about the tight ones."],
      ["Log in one tap", "Tap + when money moves. Bank sync through Plaid is rolling out."],
    ],
    priceTitle: "Free while we're in beta",
    priceText: "Use everything today at no cost. Early members keep a founder price when paid plans arrive.",
    safeTitle: "Your money, private",
    safe: ["Two-step verification for bank and sensitive actions", "Bank connections through Plaid — we never see your bank password", "We never sell your data"],
    final: "Start planning your next month tonight.",
    family: "Montfort Money is part of the Montfort family.",
    privacy: "Privacy",
    terms: "Terms",
  },
  es: {
    signin: "Iniciar sesión",
    start: "Empieza gratis",
    h1a: "Conoce tu mes",
    h1b: "antes de que pase.",
    sub: "Montfort Money te muestra tu mes completo día por día — lo que entra, lo que sale y los días exactos en que no te alcanzaría — para que lo arregles antes.",
    beta: "Gratis durante el beta · sin tarjeta",
    cash: "Cash",
    onThe: "Al 30 tendrías",
    tight: "El 12 de oct está apretado — ¿mueves el seguro del carro al 15?",
    featuresTitle: "Todo lo que tu dinero necesita, en una sola página",
    f: [
      ["Tu mes, día por día", "Un calendario con tu saldo en cada día. Verde va bien, ámbar está apretado, rojo es que no te alcanza — semanas antes de que pase."],
      ["Montfort AI planea contigo", "Pregúntale “¿me alcanza para $500 más este mes?” o dile “agrega el registro del carro de $120 en noviembre” — te enseña el cambio antes de hacerlo."],
      ["Deudas con fecha de fin", "Tarjetas, carros, préstamos y personas, agrupados. Ve el mes en que se acaba cada una y qué hacen $100 extra."],
      ["Metas e inversiones", "Ahorra para la casa, haz crecer tus inversiones y ve tu patrimonio en 12 meses si sigues el plan."],
      ["Viajes con amigos", "Vuelos, hoteles y números de confirmación en un solo itinerario. Todos agregan gastos y te dice quién le debe a quién."],
      ["Presupuesto en pareja", "Comparte un espacio con tu pareja para los gastos que dividen, y tu dinero personal sigue siendo tuyo."],
    ],
    howTitle: "Cómo funciona",
    how: [
      ["Cuéntale tu mes", "Tu sueldo, renta, cuentas y deudas — platicando con Montfort AI o en unos toques."],
      ["Ve cada día que viene", "El calendario te dice cómo terminas cada día y te avisa de los apretados."],
      ["Registra en un toque", "Toca + cuando se mueve dinero. La conexión con tu banco vía Plaid está en lanzamiento."],
    ],
    priceTitle: "Gratis mientras estamos en beta",
    priceText: "Usa todo hoy sin costo. Los primeros miembros conservan un precio de fundador cuando lleguen los planes de pago.",
    safeTitle: "Tu dinero, privado",
    safe: ["Verificación en dos pasos para el banco y acciones sensibles", "Conexión bancaria vía Plaid — nunca vemos la contraseña de tu banco", "Nunca vendemos tus datos"],
    final: "Empieza a planear tu próximo mes hoy.",
    family: "Montfort Money es parte de la familia Montfort.",
    privacy: "Privacidad",
    terms: "Términos",
  },
} as const;

const ICONS = [
  <path key="0" d="M4 5h16v15H4zM4 10h16M9 3v4M15 3v4" />,
  <path key="1" d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />,
  <path key="2" d="M4 17 9 11l4 4 7-8M15 7h5v5" />,
  <path key="3" d="M12 3v18M5 8l7-5 7 5M6 21h12" />,
  <path key="4" d="M2.5 19h19M3.5 13.5 7 15l4-2-6.5-5.5 2-1 8.5 4 4-2a2 2 0 0 1 2 3.4L9 17.5l-5-2z" />,
  <path key="5" d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 2.2-5 5-5s5 2 5 5M11 20c0-3 2.2-5 5-5s5 2 5 5" />,
];

function MonthCard({ t }: { t: (typeof T)[L] }) {
  const tone = (d: number) => (d < 5 ? "p" : d === 12 ? "o" : [10, 11, 13].includes(d) ? "w" : "g");
  const bg: Record<string, [string, string]> = {
    p: ["var(--surface-2)", "var(--text-faint)"],
    g: ["var(--mint-soft)", "var(--mint)"],
    w: ["var(--warn-soft)", "var(--warn)"],
    o: ["var(--over-soft)", "var(--over)"],
  };
  return (
    <div className="card mx-auto w-full max-w-sm p-6 text-left" style={{ boxShadow: "0 20px 60px rgba(20,30,50,.12)" }}>
      <p className="faint text-xs font-semibold uppercase tracking-wide">{t.cash}</p>
      <p className="font-display text-4xl font-semibold tabnum">$3,482</p>
      <p className="faint text-sm">
        {t.onThe} <b style={{ color: "var(--mint)" }}>$6,451</b>
      </p>
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {Array.from({ length: 21 }, (_, i) => i + 1).map((d) => {
          const [b, c] = bg[tone(d)];
          return (
            <div key={d} className="h-10 rounded-lg p-1 text-[11px] font-semibold" style={{ background: b, color: c }}>
              {d}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex gap-2 rounded-xl p-3 text-[13px]" style={{ background: "var(--surface-2)" }}>
        <span style={{ color: "var(--mint)" }}>✦</span>
        <span className="muted">{t.tight}</span>
      </div>
    </div>
  );
}

export default function Landing() {
  const [lang, setLang] = useState<L>("en");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mf-lang");
      if (saved === "es" || saved === "en") setLang(saved);
      else if (navigator.language?.toLowerCase().startsWith("es")) setLang("es");
    } catch {
      /* private mode */
    }
  }, []);
  const pick = (l: L) => {
    setLang(l);
    try {
      localStorage.setItem("mf-lang", l);
    } catch {}
    document.documentElement.lang = l;
  };
  const t = T[lang];

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 pb-16 sm:px-8">
      <header className="flex items-center justify-between gap-3 py-5">
        <span className="whitespace-nowrap">
          <Wordmark />
        </span>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full p-0.5 text-xs font-semibold" style={{ background: "var(--surface-2)" }}>
            {(["en", "es"] as L[]).map((l) => (
              <button
                key={l}
                onClick={() => pick(l)}
                className="rounded-full px-2.5 py-1 uppercase"
                style={lang === l ? { background: "var(--surface)", boxShadow: "0 1px 2px rgba(0,0,0,.08)" } : { color: "var(--text-faint)" }}
              >
                {l}
              </button>
            ))}
          </div>
          <ThemeToggle />
          <Link href="/login" className="btn btn-ghost max-sm:!hidden">
            {t.signin}
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className="mt-8 grid items-center gap-10 lg:mt-16 lg:grid-cols-2">
        <div className="text-center lg:text-left">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            {t.h1a}
            <br />
            <span className="text-grad">{t.h1b}</span>
          </h1>
          <p className="muted mx-auto mt-5 max-w-xl text-lg lg:mx-0">{t.sub}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
            <Link href="/signup" className="btn btn-primary !px-6 !py-3 text-base">
              {t.start}
            </Link>
            <Link href="/login" className="btn btn-ghost !px-6 !py-3 text-base">
              {t.signin}
            </Link>
          </div>
          <p className="faint mt-3 text-xs">{t.beta}</p>
        </div>
        <MonthCard t={t} />
      </section>

      {/* features */}
      <section className="mt-24">
        <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">{t.featuresTitle}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {t.f.map(([title, text], i) => (
            <div key={title} className="card p-6">
              <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "var(--mint-soft)", color: "var(--mint)" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  {ICONS[i]}
                </svg>
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
              <p className="muted mt-1.5 text-sm leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section className="mt-24">
        <h2 className="text-center font-display text-2xl font-semibold sm:text-3xl">{t.howTitle}</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {t.how.map(([title, text], i) => (
            <li key={title} className="card p-6">
              <span className="font-display text-3xl font-semibold text-grad">{i + 1}</span>
              <h3 className="mt-2 font-display text-lg font-semibold">{title}</h3>
              <p className="muted mt-1.5 text-sm leading-relaxed">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* price + privacy */}
      <section className="mt-24 grid gap-4 lg:grid-cols-2">
        <div className="card p-8">
          <h2 className="font-display text-2xl font-semibold">{t.priceTitle}</h2>
          <p className="muted mt-2">{t.priceText}</p>
          <Link href="/signup" className="btn btn-primary mt-6">
            {t.start}
          </Link>
        </div>
        <div className="card p-8">
          <h2 className="font-display text-2xl font-semibold">{t.safeTitle}</h2>
          <ul className="mt-3 grid gap-2">
            {t.safe.map((s) => (
              <li key={s} className="muted flex gap-2 text-sm">
                <span style={{ color: "var(--mint)" }}>✓</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-24 text-center">
        <h2 className="font-display text-3xl font-semibold">{t.final}</h2>
        <Link href="/signup" className="btn btn-primary mt-6 !px-6 !py-3 text-base">
          {t.start}
        </Link>
      </section>

      <footer className="faint mt-20 text-center text-xs leading-relaxed">
        <div className="mb-2 flex justify-center gap-4">
          <Link href="/privacy" className="hover:underline">
            {t.privacy}
          </Link>
          <Link href="/terms" className="hover:underline">
            {t.terms}
          </Link>
          <a href="mailto:hello@montfortmoney.com" className="hover:underline">
            hello@montfortmoney.com
          </a>
        </div>
        {t.family}
        <br />© {new Date().getFullYear()} Montfort LLC.
      </footer>
    </main>
  );
}
