"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import "./landing.css";

type L = "en" | "es";

const T = {
  en: {
    how: "How it works",
    price: "Pricing",
    signin: "Sign in",
    start: "Start free",
    pill: "Free · no card · ready in 2 minutes",
    h1a: "Your money,",
    h1b: "on autopilot.",
    lead: "Connect your bank and Montfort AI does the rest: it builds your budget, sorts every expense and tells you how much you'll have on the 30th. You don't fill in a thing.",
    cta: "Start free →",
    see: "▶ See how it works",
    trust: ["Secure connection with Plaid", "Bank-level encryption", "We never sell your data"],
    working: "Montfort AI at work",
    endLabel: "On the 30th you'll have",
    sorted: "Already sorted",
    sortedUnit: "expenses",
    forgot: "Subscriptions you forgot",
    perMo: "$47/mo",
    sorting: "sorting…",
    ai: [
      "Found your pay: $3,240 every 2 weeks.",
      "You have 3 subscriptions. One unused since July.",
      "Rent goes out on the 1st. It's on your calendar.",
      "You're $120 under your usual on food. Nice.",
      "Done: your month is ready.",
    ],
    cats: { Pay: "Pay", Home: "Home", Food: "Food", Sub: "Subscription", Car: "Car", Shop: "Shopping" },
    stepsEye: "How it works",
    stepsH: "Three steps. Zero spreadsheets.",
    stepsSub: "Other apps make you build it yourself. Here the AI does the heavy lifting and only asks what it can't figure out.",
    steps: [
      ["Connect your bank", "12,000+ banks and cards through Plaid. Takes 30 seconds."],
      ["The AI sorts it out", "It finds your pay, your fixed bills and your subscriptions. If something doesn't add up, it asks you."],
      ["See your month before it happens", "A calendar with what comes in, what goes out and what's left every single day."],
    ],
    connected: "● Connected in 30 s",
    stats: [
      [12000, "+", "", "banks and cards"],
      [2, " min", "", "to get your budget"],
      [0, "", "$", "during beta"],
      [24, "/7", "", "your AI money coach"],
    ] as [number, string, string, string][],
    featEye: "All in one place",
    featH: "What it does for you, every day",
    feats: [
      ["Your money calendar", "Every day with what comes in, what goes out and your balance. Know your tight days before they arrive."],
      ["Where your money goes", "Automatic categories. No tagging by hand."],
      ["Get out of debt faster", "It tells you what to pay first and the date you're free."],
      ["Ask it anything", "“Can I afford the trip?” Montfort AI answers with your numbers."],
      ["Trips and couples", "Plan expenses with friends or your partner — and who owes who."],
    ],
    chatQ: "Can I afford Cancún in December?",
    chatA: "Yes. Put aside $210 per paycheck and you'll have $1,260.",
    free: "Debt-free Mar 2028",
    tripName: "Italy 2027",
    tripMeta: "4 people · $2,840 / $4,000",
    priceEye: "Pricing",
    priceText: "Free during beta. Early members keep a founder price forever.",
    checks: ["Bank connection", "Budget built by AI", "Calendar and 12-month forecast", "Debt payoff plan", "Montfort AI included"],
    priceCta: "Create my free account →",
    finalA: "Stop guessing.",
    finalB: "Know your month today.",
    finalSub: "2 minutes. No card. The AI does the rest.",
    privacy: "Privacy",
    terms: "Terms",
  },
  es: {
    how: "Cómo funciona",
    price: "Precio",
    signin: "Entrar",
    start: "Empieza gratis",
    pill: "Gratis · sin tarjeta · listo en 2 minutos",
    h1a: "Tu dinero,",
    h1b: "en piloto automático.",
    lead: "Conecta tu banco y Montfort AI hace el resto: arma tu presupuesto, acomoda cada gasto y te dice cuánto vas a tener el día 30. Tú no llenas nada.",
    cta: "Empieza gratis →",
    see: "▶ Ver cómo funciona",
    trust: ["Conexión segura con Plaid", "Cifrado nivel banco", "Nunca vendemos tus datos"],
    working: "Montfort AI trabajando",
    endLabel: "El día 30 vas a tener",
    sorted: "Ya clasifiqué",
    sortedUnit: "gastos",
    forgot: "Suscripciones que olvidaste",
    perMo: "$47/mes",
    sorting: "clasificando…",
    ai: [
      "Encontré tu sueldo: $3,240 cada 2 semanas.",
      "Tienes 3 suscripciones. Una no la usas desde julio.",
      "Tu renta sale el 1. Ya la puse en tu calendario.",
      "Vas $120 abajo en comida vs. tu promedio. Bien.",
      "Listo: tu mes está armado.",
    ],
    cats: { Pay: "Sueldo", Home: "Casa", Food: "Comida", Sub: "Suscripción", Car: "Carro", Shop: "Compras" },
    stepsEye: "Cómo funciona",
    stepsH: "Tres pasos. Cero hojas de cálculo.",
    stepsSub: "Otras apps te piden que lo armes tú. Aquí la AI hace el trabajo pesado y solo te pregunta lo que no sabe.",
    steps: [
      ["Conecta tu banco", "Más de 12,000 bancos y tarjetas con Plaid. Toma 30 segundos."],
      ["La AI lo acomoda", "Encuentra tu sueldo, tus pagos fijos y tus suscripciones. Si algo no le cuadra, te pregunta."],
      ["Ves tu mes antes de que pase", "Un calendario con lo que entra, lo que sale y cuánto te queda cada día."],
    ],
    connected: "● Conectado en 30 s",
    stats: [
      [12000, "+", "", "bancos y tarjetas"],
      [2, " min", "", "para tener tu presupuesto"],
      [0, "", "$", "durante la beta"],
      [24, "/7", "", "tu AI financiera"],
    ] as [number, string, string, string][],
    featEye: "Todo en un lugar",
    featH: "Lo que hace por ti, todos los días",
    feats: [
      ["Calendario de tu dinero", "Cada día con lo que entra, lo que sale y tu saldo. Sabes qué día vas a estar apretado antes de que llegue."],
      ["A dónde se va tu dinero", "Categorías automáticas, sin etiquetar nada a mano."],
      ["Sal de deudas más rápido", "Te dice qué pagar primero y la fecha en que quedas libre."],
      ["Pregúntale lo que sea", "“¿Me alcanza para el viaje?” Montfort AI te contesta con tus números."],
      ["Viajes y pareja", "Planea gastos con amigos o tu pareja, y quién le debe a quién."],
    ],
    chatQ: "¿Me alcanza para Cancún en dic?",
    chatA: "Sí. Si apartas $210 por quincena llegas con $1,260.",
    free: "Libre en mar 2028",
    tripName: "Italia 2027",
    tripMeta: "4 personas · $2,840 / $4,000",
    priceEye: "Precio",
    priceText: "Gratis durante la beta. Los primeros usuarios se quedan con precio de fundador para siempre.",
    checks: ["Conexión con tu banco", "Presupuesto armado por la AI", "Calendario y proyección de 12 meses", "Plan para salir de deudas", "Montfort AI incluido"],
    priceCta: "Crear mi cuenta gratis →",
    finalA: "Deja de adivinar.",
    finalB: "Conoce tu mes hoy.",
    finalSub: "2 minutos. Sin tarjeta. La AI hace el resto.",
    privacy: "Privacidad",
    terms: "Términos",
  },
};

const CAT_COLOR: Record<string, [string, string]> = {
  Pay: ["#2bd396", "rgba(43,211,150,.15)"],
  Home: ["#8fd4ff", "rgba(143,212,255,.15)"],
  Food: ["#f5c26b", "rgba(245,194,107,.15)"],
  Sub: ["#f47070", "rgba(244,112,112,.15)"],
  Car: ["#b49cff", "rgba(180,156,255,.15)"],
  Shop: ["#ff9fd0", "rgba(255,159,208,.15)"],
};
const TX: [string, number, keyof typeof CAT_COLOR][] = [
  ["PAYROLL ACME INC", 3240, "Pay"],
  ["TRADER JOE'S #552", -86.4, "Food"],
  ["NETFLIX.COM", -15.49, "Sub"],
  ["SHELL OIL 5741", -52.1, "Car"],
  ["APS ELECTRIC", -138, "Home"],
  ["AMAZON MKTP", -41.99, "Shop"],
  ["SPOTIFY USA", -11.99, "Sub"],
  ["CHIPOTLE 1882", -14.3, "Food"],
  ["TOYOTA FINANCIAL", -412, "Car"],
  ["RENT · ZELLE", -1850, "Home"],
];
const usd = (n: number) => (n < 0 ? "−" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** the balance line for the month, so the hero chart has a real shape */
const PTS = (() => {
  const out: number[] = [];
  let v = 2400;
  for (let i = 0; i <= 30; i++) {
    v += (i === 1 ? -1850 : 0) + (i % 14 === 5 ? 3240 : 0) - 95 + Math.sin(i * 1.7) * 40;
    out.push(v);
  }
  return out;
})();

function useCount(target: number, ms = 700) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const f = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(a + (target - a) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(f);
      else from.current = target;
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function LiveDevice({ t }: { t: (typeof T)["en"] }) {
  const [rows, setRows] = useState<{ i: number; done: boolean; key: number }[]>([]);
  const [p, setP] = useState(0);
  const [ai, setAi] = useState("");
  const [count, setCount] = useState(0);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    let alive = true;
    let key = 0;
    (async () => {
      while (alive) {
        setRows([]);
        setCount(0);
        for (let i = 0; i < TX.length && alive; i++) {
          if (i % 2 === 0) {
            const msg = tRef.current.ai[Math.min(4, i / 2)];
            (async () => {
              for (let c = 0; c <= msg.length && alive; c++) {
                setAi(msg.slice(0, c));
                await sleep(22);
              }
            })();
          }
          const k = ++key;
          setRows((r) => [{ i, done: false, key: k }, ...r].slice(0, 5));
          setP((i + 1) / TX.length);
          await sleep(650);
          setRows((r) => r.map((x) => (x.key === k ? { ...x, done: true } : x)));
          setCount((c) => c + 3 + Math.floor(Math.random() * 20));
          await sleep(700);
        }
        await sleep(3500);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const n = Math.max(1, Math.round(30 * p));
  const mn = Math.min(...PTS);
  const mx = Math.max(...PTS);
  const X = (i: number) => (i / 30) * 400;
  const Y = (v: number) => 110 - ((v - mn) / (mx - mn)) * 96;
  let d = `M0,${Y(PTS[0])}`;
  for (let i = 1; i <= n; i++) d += ` L${X(i).toFixed(1)},${Y(PTS[i]).toFixed(1)}`;
  const bal = useCount(PTS[n]);
  const cnt = useCount(count, 400);

  return (
    <div className="lp-devwrap">
      <div className="lp-float lp-f1">
        {t.sorted}
        <b className="lp-grad">
          {Math.round(cnt)} {t.sortedUnit}
        </b>
      </div>
      <div className="lp-float lp-f2">
        {t.forgot}
        <b style={{ color: "var(--lp-over)" }}>{t.perMo}</b>
      </div>
      <div className="lp-device">
        <div className="lp-dtop">
          <span className="lp-live">{t.working}</span>
        </div>
        <div className="lp-k">{t.endLabel}</div>
        <div className="lp-bign font-display">
          <span className="lp-grad">{usd(bal)}</span>
        </div>
        <svg viewBox="0 0 400 120" preserveAspectRatio="none" className="lp-chart" aria-hidden>
          <defs>
            <linearGradient id="lpg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#4fe3ad" stopOpacity=".35" />
              <stop offset="1" stopColor="#4fe3ad" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lpl" x1="0" x2="1">
              <stop offset="0" stopColor="#4fe3ad" />
              <stop offset="1" stopColor="#8fd4ff" />
            </linearGradient>
          </defs>
          <path d={`${d} L${X(n)},120 L0,120Z`} fill="url(#lpg)" />
          <path d={d} fill="none" stroke="url(#lpl)" strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx={X(n)} cy={Y(PTS[n])} r="5" fill="#8fd4ff" className="lp-pulse" />
        </svg>
        <div className="lp-ai">
          <span className="lp-av">M</span>
          <span>
            {ai}
            <i className="lp-caret" />
          </span>
        </div>
        <div className="lp-txs">
          {rows.map((r) => {
            const [m, a, c] = TX[r.i];
            const [col, bg] = CAT_COLOR[c];
            return (
              <div key={r.key} className="lp-tx">
                <span className="lp-ic">{m[0]}</span>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{m}</div>
                  <div className="lp-c">
                    {r.done ? (
                      <span className="lp-chip" style={{ color: col, background: bg }}>
                        {(t.cats as Record<string, string>)[c]}
                      </span>
                    ) : (
                      <span className="lp-scan">{t.sorting}</span>
                    )}
                  </div>
                </div>
                <b className="tabnum" style={{ color: a > 0 ? "var(--lp-mint)" : undefined }}>
                  {a > 0 ? "+" : ""}
                  {usd(a)}
                </b>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ to, suf, pre, label }: { to: number; suf: string; pre: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [go, setGo] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setGo(true), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const v = useCount(go ? to : 0, 1400);
  return (
    <div ref={ref} className="lp-stat">
      <b className="font-display">
        {pre}
        {Math.round(v).toLocaleString("en-US")}
        {suf}
      </b>
      <span>{label}</span>
    </div>
  );
}

const STEP_VIZ = [
  <svg key="1" viewBox="0 0 300 150" width="100%" height="100%" aria-hidden>
    {["Chase", "BofA", "Wells", "Amex", "Cap One", "Discover"].map((b, i) => (
      <g key={b} transform={`translate(${30 + (i % 3) * 85},${24 + Math.floor(i / 3) * 52})`}>
        <rect width="72" height="36" rx="10" fill="#1a2a3a" stroke="rgba(185,206,221,.14)" />
        <text x="36" y="23" textAnchor="middle" fill="#b9cedd" fontSize="12" fontWeight="600">
          {b}
        </text>
        {i === 0 && <rect width="72" height="36" rx="10" fill="none" stroke="#2bd396" strokeWidth="2" className="lp-blink" />}
      </g>
    ))}
  </svg>,
  <svg key="2" viewBox="0 0 300 150" width="100%" height="100%" aria-hidden>
    {[
      ["AMAZON MKTP", "#ff9fd0"],
      ["APS ELECTRIC", "#8fd4ff"],
      ["SHELL OIL", "#b49cff"],
    ].map(([m, col], i) => (
      <g key={m} transform={`translate(22,${20 + i * 40})`}>
        <rect width="256" height="32" rx="9" fill="#1a2a3a" />
        <text x="12" y="20" fill="#eef4f8" fontSize="12" fontWeight="600">
          {m}
        </text>
        <rect x="186" y="8" width="60" height="16" rx="8" fill={col} fillOpacity=".25" className="lp-tag" style={{ animationDelay: `${i * 0.6}s` }} />
      </g>
    ))}
  </svg>,
  <svg key="3" viewBox="0 0 300 150" width="100%" height="100%" aria-hidden>
    {Array.from({ length: 28 }, (_, i) => {
      const x = 24 + (i % 7) * 38;
      const y = 12 + Math.floor(i / 7) * 33;
      const c = [3, 9, 17].includes(i) ? "#f47070" : [0, 14].includes(i) ? "#2bd396" : "#1a2a3a";
      return (
        <g key={i}>
          <rect x={x} y={y} width="32" height="27" rx="7" fill={c} fillOpacity={c === "#1a2a3a" ? 1 : 0.3} />
          <text x={x + 5} y={y + 12} fill="#7f9bb0" fontSize="8">
            {i + 1}
          </text>
        </g>
      );
    })}
  </svg>,
];

export default function Landing() {
  const [lang, setLang] = useState<L>("en");
  useEffect(() => {
    let l: L | null = null;
    try {
      const s = localStorage.getItem("mf-lang");
      if (s === "es" || s === "en") l = s;
    } catch {}
    if (!l) l = (navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
    setLang(l);
  }, []);
  const switchLang = () => {
    const n: L = lang === "en" ? "es" : "en";
    setLang(n);
    try {
      localStorage.setItem("mf-lang", n);
    } catch {}
  };
  const t = T[lang];

  return (
    <div className="lp">
      <div className="lp-hero">
        <div className="lp-glow" />
        <div className="lp-gridbg" />
        <div className="lp-wrap">
          <nav className="lp-nav">
            <Link href="/" className="flex items-center gap-2.5 whitespace-nowrap font-display text-base font-bold sm:text-lg">
              <LogoMark size={28} />
              Montfort Money
            </Link>
            <div className="lp-navr">
              <a href="#how" className="max-md:!hidden">
                {t.how}
              </a>
              <a href="#price" className="max-md:!hidden">
                {t.price}
              </a>
              <button onClick={switchLang} className="lp-lang">
                {lang === "en" ? "ES" : "EN"}
              </button>
              <Link href="/login">{t.signin}</Link>
              <Link href="/signup" className="lp-btn lp-btn-p lp-btn-sm max-sm:!hidden">
                {t.start}
              </Link>
            </div>
          </nav>

          <div className="lp-hgrid">
            <div>
              <div className="lp-pill">
                <span>{lang === "en" ? "FREE" : "GRATIS"}</span>
                {t.pill.split(" · ").slice(1).join(" · ")}
              </div>
              <h1 className="font-display">
                {t.h1a}
                <br />
                <span className="lp-grad">{t.h1b}</span>
              </h1>
              <p className="lp-lead">{t.lead}</p>
              <div className="lp-ctas">
                <Link href="/signup" className="lp-btn lp-btn-p">
                  {t.cta}
                </Link>
                <a href="#how" className="lp-btn lp-btn-g">
                  {t.see}
                </a>
              </div>
              <div className="lp-trust">
                {t.trust.map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </div>
            </div>
            <LiveDevice t={t} />
          </div>
        </div>
      </div>

      <section id="how" className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-eye">{t.stepsEye}</div>
          <h2 className="font-display">{t.stepsH}</h2>
          <p className="lp-sub">{t.stepsSub}</p>
          <div className="lp-steps">
            {t.steps.map(([h, p], i) => (
              <div key={h} className="lp-step">
                <div className="lp-viz">{STEP_VIZ[i]}</div>
                <div className="lp-n font-display">0{i + 1}</div>
                <h3>{h}</h3>
                <p>{p}</p>
                {i === 0 && <div className="lp-ok">{t.connected}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec !pt-0">
        <div className="lp-wrap">
          <div className="lp-stats">
            {t.stats.map(([to, suf, pre, label]) => (
              <Stat key={label} to={to} suf={suf} pre={pre} label={label} />
            ))}
          </div>
        </div>
      </section>

      <section className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-eye">{t.featEye}</div>
          <h2 className="font-display">{t.featH}</h2>
          <div className="lp-feat">
            <div className="lp-fc lp-wide">
              <div className="lp-viz">
                <svg viewBox="0 0 640 120" width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
                  {Array.from({ length: 30 }, (_, i) => {
                    const x = 12 + i * 20.8;
                    const hIn = i === 5 || i === 19 ? 34 : 0;
                    const hOut = i === 1 ? 40 : 8 + ((i * 7) % 11);
                    return (
                      <g key={i} className="lp-rise" style={{ animationDelay: `${i * 0.03}s` }}>
                        <rect x={x} y={60 - hIn} width="14" height={hIn} rx="3" fill="#2bd396" opacity=".8" />
                        <rect x={x} y="62" width="14" height={hOut} rx="3" fill="#f47070" opacity=".55" />
                      </g>
                    );
                  })}
                  <line x1="0" x2="640" y1="61" y2="61" stroke="rgba(185,206,221,.2)" />
                </svg>
              </div>
              <h4>{t.feats[0][0]}</h4>
              <p>{t.feats[0][1]}</p>
            </div>
            <div className="lp-fc">
              <div className="lp-viz grid place-items-center">
                <svg viewBox="0 0 42 42" width="110" height="110" aria-hidden>
                  <circle cx="21" cy="21" r="15.9" fill="none" stroke="#1a2a3a" strokeWidth="5" />
                  {(() => {
                    let off = 25;
                    return (
                      [
                        [38, "#8fd4ff"],
                        [22, "#f5c26b"],
                        [16, "#b49cff"],
                        [14, "#ff9fd0"],
                        [10, "#f47070"],
                      ] as [number, string][]
                    ).map(([v, c]) => {
                      const el = <circle key={c} cx="21" cy="21" r="15.9" fill="none" stroke={c} strokeWidth="5" strokeDasharray={`${v} ${100 - v}`} strokeDashoffset={off} />;
                      off -= v;
                      return el;
                    });
                  })()}
                  <text x="21" y="23" textAnchor="middle" fill="#eef4f8" fontSize="5" fontWeight="700">
                    $3,410
                  </text>
                </svg>
              </div>
              <h4>{t.feats[1][0]}</h4>
              <p>{t.feats[1][1]}</p>
            </div>
            <div className="lp-fc">
              <div className="lp-viz">
                <svg viewBox="0 0 300 120" width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
                  <path d="M10,20 C90,40 150,70 290,108" fill="none" stroke="#f47070" strokeWidth="2.5" className="lp-line" />
                  <path d="M10,20 C70,55 120,95 200,108" fill="none" stroke="#2bd396" strokeWidth="2.5" className="lp-line" style={{ animationDelay: ".4s" }} />
                  <text x="290" y="92" textAnchor="end" fill="#2bd396" fontSize="11" fontWeight="700">
                    {t.free}
                  </text>
                </svg>
              </div>
              <h4>{t.feats[2][0]}</h4>
              <p>{t.feats[2][1]}</p>
            </div>
            <div className="lp-fc">
              <div className="lp-viz lp-chatviz">
                <div className="lp-q">{t.chatQ}</div>
                <div className="lp-a">{t.chatA}</div>
              </div>
              <h4>{t.feats[3][0]}</h4>
              <p>{t.feats[3][1]}</p>
            </div>
            <div className="lp-fc">
              <div className="lp-viz lp-trip">
                <div>
                  <b className="font-display">{t.tripName}</b>
                  <div>{t.tripMeta}</div>
                </div>
              </div>
              <h4>{t.feats[4][0]}</h4>
              <p>{t.feats[4][1]}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="price" className="lp-sec">
        <div className="lp-wrap">
          <div className="lp-free">
            <div>
              <div className="lp-eye">{t.priceEye}</div>
              <div className="lp-price font-display lp-grad">$0</div>
              <p className="lp-sub">{t.priceText}</p>
            </div>
            <div className="lp-checks">
              {t.checks.map((c) => (
                <div key={c}>{c}</div>
              ))}
              <Link href="/signup" className="lp-btn lp-btn-p mt-2 justify-self-start">
                {t.priceCta}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="lp-final lp-wrap">
        <h2 className="font-display">
          {t.finalA}
          <br />
          <span className="lp-grad">{t.finalB}</span>
        </h2>
        <p className="lp-sub mx-auto mb-7">{t.finalSub}</p>
        <Link href="/signup" className="lp-btn lp-btn-p lp-btn-lg">
          {t.cta}
        </Link>
      </div>

      <footer className="lp-foot">
        <div className="lp-wrap flex flex-wrap items-center gap-4">
          <span>© Montfort Money</span>
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
      </footer>
    </div>
  );
}
