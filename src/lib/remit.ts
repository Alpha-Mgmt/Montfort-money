/**
 * Remittance providers + destination currencies.
 * AFFILIATE: when an affiliate program approves you (Impact, CJ, or direct),
 * put the tracking link in `url` — nothing else changes.
 */
export const REMIT_PROVIDERS: { key: string; name: string; url: string }[] = [
  { key: "wise", name: "Wise", url: "https://wise.com/" },
  { key: "remitly", name: "Remitly", url: "https://www.remitly.com/" },
  { key: "xoom", name: "Xoom", url: "https://www.xoom.com/" },
  { key: "westernunion", name: "Western Union", url: "https://www.westernunion.com/" },
  { key: "worldremit", name: "WorldRemit", url: "https://www.worldremit.com/" },
  { key: "moneygram", name: "MoneyGram", url: "https://www.moneygram.com/" },
  { key: "ria", name: "Ria", url: "https://www.riamoneytransfer.com/" },
  { key: "sendwave", name: "Sendwave", url: "https://www.sendwave.com/" },
];

export const REMIT_CURRENCIES: { code: string; country: string; countryEs: string }[] = [
  { code: "MXN", country: "Mexico", countryEs: "México" },
  { code: "GTQ", country: "Guatemala", countryEs: "Guatemala" },
  { code: "HNL", country: "Honduras", countryEs: "Honduras" },
  { code: "DOP", country: "Dominican Republic", countryEs: "República Dominicana" },
  { code: "COP", country: "Colombia", countryEs: "Colombia" },
  { code: "NIO", country: "Nicaragua", countryEs: "Nicaragua" },
  { code: "PEN", country: "Peru", countryEs: "Perú" },
  { code: "BRL", country: "Brazil", countryEs: "Brasil" },
  { code: "PHP", country: "Philippines", countryEs: "Filipinas" },
  { code: "INR", country: "India", countryEs: "India" },
  { code: "USD", country: "El Salvador / Ecuador (USD)", countryEs: "El Salvador / Ecuador (USD)" },
];

export type RemitQuote = {
  provider: string;
  fee: number;
  rate: number;
  received: number;
  eta: string | null; // e.g. "PT1H" ISO-8601 duration, or null
  url: string | null;
  logo: string | null;
};

export function providerUrl(name: string): string | null {
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  const p = REMIT_PROVIDERS.find((x) => n.includes(x.key));
  return p?.url ?? null;
}

/** "PT1H30M" → { hours: 1.5 }. Returns hours or null. */
export function isoDurationHours(d: string | null | undefined): number | null {
  if (!d) return null;
  const m = /P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?/.exec(d);
  if (!m) return null;
  const [, days, h, min, s] = m;
  return Number(days ?? 0) * 24 + Number(h ?? 0) + Number(min ?? 0) / 60 + Number(s ?? 0) / 3600;
}

/**
 * Parse Wise's public comparison response defensively. Shape (v4):
 * { providers: [{ name, alias, logos?: { normal?: { svgUrl, pngUrl } },
 *   quotes: [{ rate, fee, receivedAmount, deliveryEstimation?: { duration?: { min, max } } }] }] }
 */
export function parseWiseComparison(json: any): RemitQuote[] {
  const out: RemitQuote[] = [];
  for (const p of Array.isArray(json?.providers) ? json.providers : []) {
    const q = Array.isArray(p?.quotes) ? p.quotes[0] : null;
    if (!q || typeof q.receivedAmount !== "number") continue;
    const name = String(p.name ?? p.alias ?? "").trim();
    if (!name) continue;
    out.push({
      provider: name,
      fee: Number(q.fee ?? 0),
      rate: Number(q.rate ?? 0),
      received: Number(q.receivedAmount),
      eta: q.deliveryEstimation?.duration?.max ?? q.deliveryEstimation?.duration?.min ?? null,
      url: providerUrl(name),
      logo: p.logos?.normal?.svgUrl ?? p.logos?.normal?.pngUrl ?? p.logo ?? null,
    });
  }
  return out.sort((a, b) => b.received - a.received);
}
