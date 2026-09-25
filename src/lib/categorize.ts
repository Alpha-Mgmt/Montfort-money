/**
 * Auto-categorization for bank (Plaid) transactions.
 * Order: 1) what the user did before with the same merchant,
 *        2) well-known merchants, 3) Plaid's category (detailed → primary),
 *        4) the user's "Other" category. Works with English or Spanish names.
 */
type Cat = { id: string; name: string; kind: string };
type Kind = "income" | "expense";

// buckets → how a user's category name may look (EN / ES)
const B: Record<string, RegExp> = {
  groceries: /grocer|supermarket|super\b|súper|despensa|mandado/i,
  dining: /dining|restaurant|eat(ing)? out|comida|food|coffee|caf[eé]|restaurante/i,
  housing: /housing|rent\b|renta|vivienda|mortgage|hipoteca|home\b|casa/i,
  utilities: /utilit|servicios|bills?\b|luz|electric|internet|phone|tel[eé]fono|agua|water/i,
  transport: /transport|gas\b|gasolina|fuel|auto\b|car\b|coche|carro|veh[ií]cul/i,
  travel: /travel|viaje|vacation|vacacion/i,
  subscriptions: /subscri|suscrip|streaming|membres/i,
  software: /software|tools|herramientas|saas|apps?\b/i,
  marketing: /marketing|ads\b|advertis|publicidad|anuncios/i,
  health: /health|salud|medical|m[eé]dic|doctor|pharm|farmacia|dental/i,
  care: /personal care|cuidado personal|beauty|belleza|gym|gimnasio|fitness/i,
  shopping: /shopping|compras|merch|ropa|cloth|store/i,
  entertainment: /entertain|entreten|fun\b|ocio|diversi|leisure/i,
  education: /educat|school|escuela|colegiatura|tuition|cursos?/i,
  insurance: /insur|seguro/i,
  debt: /debt|deuda|loan|pr[eé]stamo|credit card|tarjeta/i,
  fees: /fee|comisi|bank charges|cargos/i,
  taxes: /tax|impuest/i,
  gifts: /gift|regalo|donat|donaci|charity|caridad/i,
  pets: /pet|mascota/i,
  kids: /child|kids|niñ|hij|daycare|guarder/i,
  remit: /remesa|remit/i,
  salary: /salary|salario|sueldo|payroll|n[oó]mina|wages?|paycheck/i,
  sales: /sales|ventas|revenue|ingresos por venta/i,
  services: /services\b|servicios profesionales|consult/i,
  interest: /interest|inter[eé]s|dividend|investment income|rendimiento/i,
  other_income: /other income|otros ingresos|misc.*income/i,
  other: /^\s*(other|others|otro|otros|misc|miscellaneous|varios|general)\s*$/i,
};

// Plaid detailed/primary category → buckets to try, in order
const PFC: Record<string, string[]> = {
  INCOME_WAGES: ["salary"],
  INCOME_DIVIDENDS: ["interest", "other_income"],
  INCOME_INTEREST_EARNED: ["interest", "other_income"],
  INCOME_RETIREMENT_PENSION: ["other_income"],
  INCOME_TAX_REFUND: ["taxes", "other_income"],
  INCOME_UNEMPLOYMENT: ["other_income"],
  INCOME: ["sales", "salary", "other_income"],
  FOOD_AND_DRINK_GROCERIES: ["groceries", "dining"],
  FOOD_AND_DRINK: ["dining", "groceries"],
  GENERAL_MERCHANDISE_SUPERSTORES: ["groceries", "shopping"],
  GENERAL_MERCHANDISE_PET_SUPPLIES: ["pets", "shopping"],
  GENERAL_MERCHANDISE: ["shopping"],
  HOME_IMPROVEMENT: ["housing", "shopping"],
  RENT_AND_UTILITIES_RENT: ["housing"],
  RENT_AND_UTILITIES: ["utilities", "housing"],
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: ["housing", "debt"],
  LOAN_PAYMENTS_CAR_PAYMENT: ["debt", "transport"],
  LOAN_PAYMENTS: ["debt"],
  TRANSPORTATION: ["transport"],
  TRAVEL: ["travel", "transport"],
  ENTERTAINMENT_TV_AND_MOVIES: ["subscriptions", "entertainment"],
  ENTERTAINMENT: ["entertainment"],
  MEDICAL: ["health"],
  PERSONAL_CARE: ["care", "health"],
  GENERAL_SERVICES_INSURANCE: ["insurance"],
  GENERAL_SERVICES_EDUCATION: ["education"],
  GENERAL_SERVICES_CHILDCARE: ["kids"],
  GENERAL_SERVICES_AUTOMOTIVE: ["transport"],
  GENERAL_SERVICES: ["subscriptions", "software", "utilities"],
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: ["gifts"],
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: ["taxes"],
  GOVERNMENT_AND_NON_PROFIT: ["taxes"],
  BANK_FEES: ["fees"],
  TRANSFER_OUT: ["remit"],
};

// well-known merchants → buckets (checked against merchant + description)
const MERCHANTS: [RegExp, string[]][] = [
  [/uber ?eats|doordash|grubhub|postmates/i, ["dining"]],
  [/netflix|spotify|hulu|disney|hbo|\bmax\b|youtube|prime video|paramount|peacock|audible|apple\.com|icloud|google (one|storage)/i, ["subscriptions", "entertainment"]],
  [/adobe|openai|chatgpt|anthropic|claude\.ai|microsoft|dropbox|notion|canva|github|vercel|supabase|zoom|slack|godaddy|squarespace|shopify/i, ["software", "subscriptions"]],
  [/facebk|meta ads|facebook ads|google ads|linkedin ads|tiktok ads/i, ["marketing"]],
  [/walmart|costco|kroger|safeway|trader joe|whole foods|aldi|fry'?s|sprouts|h-?e-?b|albertsons|sam'?s club|food city|bashas|smart ?& ?final|99 ranch|ranch market/i, ["groceries"]],
  [/starbucks|mcdonald|dutch bros|chick-?fil|taco bell|chipotle|kfc|subway|wendy|burger king|domino|pizza|panera|in-n-out|five guys|sonic|jack in the box|dunkin/i, ["dining"]],
  [/\buber\b|lyft|shell|chevron|exxon|circle k|quiktrip|\bqt\b|arco|valero|\bbp\b|mobil|parking|toll/i, ["transport"]],
  [/united airlines|american airlines|delta|southwest air|spirit air|frontier|volaris|aeromexico|airbnb|marriott|hilton|hyatt|expedia|booking\.com/i, ["travel", "transport"]],
  [/\baps\b|\bsrp\b|southwest gas|at&t|\batt\b|verizon|t-?mobile|comcast|xfinity|\bcox\b|spectrum|cricket/i, ["utilities"]],
  [/amazon|amzn|target|best buy|home depot|lowe'?s|ikea|ebay|etsy|shein|temu/i, ["shopping"]],
  [/cvs|walgreens|pharmacy|clinic|hospital|dental|dr\. /i, ["health"]],
  [/planet fitness|la fitness|gym|barber|salon/i, ["care", "health"]],
  [/geico|progressive|state farm|allstate|insurance/i, ["insurance"]],
  [/remitly|western union|\bwise\b|xoom|\bria\b|moneygram|sendwave|intermex/i, ["remit"]],
];

/** Plaid categories that are money moving between the user's own accounts. */
export const OWN_TRANSFER = new Set([
  "TRANSFER_IN_ACCOUNT_TRANSFER",
  "TRANSFER_OUT_ACCOUNT_TRANSFER",
  "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT",
]);

export function normMerchant(s?: string | null) {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
}

function pick(buckets: string[], kind: Kind, cats: Cat[]): string | null {
  const mine = cats.filter((c) => c.kind === kind);
  for (const b of buckets) {
    const re = B[b];
    if (!re) continue;
    const hit = mine.find((c) => re.test(c.name));
    if (hit) return hit.id;
  }
  return null;
}

export function categorize(
  t: { merchant_name?: string | null; name?: string | null; personal_finance_category?: { primary?: string; detailed?: string } | null },
  kind: Kind,
  cats: Cat[],
  learned: Map<string, { id: string; kind: string }>
): string | null {
  // 1) the user's own previous choice for this merchant
  const key = normMerchant(t.merchant_name || t.name);
  const prev = key ? learned.get(`${kind}|${key}`) : undefined;
  if (prev && cats.some((c) => c.id === prev.id)) return prev.id;

  // 2) well-known merchants
  const text = `${t.merchant_name || ""} ${t.name || ""}`;
  for (const [re, buckets] of MERCHANTS) {
    if (re.test(text)) {
      const id = pick(buckets, kind, cats);
      if (id) return id;
    }
  }

  // 3) Plaid's category — detailed first, then its primary
  const det = t.personal_finance_category?.detailed || "";
  const pri = t.personal_finance_category?.primary || "";
  const tries = [PFC[det], PFC[pri]].filter(Boolean) as string[][];
  for (const buckets of tries) {
    const id = pick(buckets, kind, cats);
    if (id) return id;
  }

  // 4) fall back to the user's catch-all
  return kind === "income" ? pick(["other_income", "other"], kind, cats) : pick(["other"], kind, cats);
}
