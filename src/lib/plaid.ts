import { createClient as createAdmin } from "@supabase/supabase-js";

/**
 * Plaid over plain fetch (no SDK). Server-only.
 * Env: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV (sandbox | production),
 *      SUPABASE_SERVICE_ROLE_KEY (to read/write the locked plaid_items table).
 */
export function plaidConfigured() {
  return !!(
    process.env.PLAID_CLIENT_ID &&
    process.env.PLAID_SECRET &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function base() {
  const env = process.env.PLAID_ENV || "sandbox";
  return env === "production"
    ? "https://production.plaid.com"
    : "https://sandbox.plaid.com";
}

export async function plaid<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  const r = await fetch(base() + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      ...body,
    }),
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok) {
    const err = new Error(j?.error_message || `plaid ${path} ${r.status}`) as Error & { code?: string };
    err.code = j?.error_code;
    throw err;
  }
  return j as T;
}

export function adminDb() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

const TYPE_MAP: Record<string, string> = {
  depository: "checking",
  credit: "credit",
  loan: "loan",
  investment: "investment",
};

export function mapAccountType(type: string, subtype?: string | null): string {
  if (type === "depository" && subtype === "savings") return "savings";
  return TYPE_MAP[type] ?? "other";
}

/**
 * Pull new/changed/removed transactions for one item with /transactions/sync
 * and mirror them into our tables. Returns counts.
 */
export async function syncItem(item: {
  id: string;
  user_id: string;
  space: string;
  access_token: string;
  cursor: string | null;
}) {
  const db = adminDb();
  let cursor = item.cursor ?? undefined;
  let added: any[] = [];
  let modified: any[] = [];
  let removed: any[] = [];
  let hasMore = true;
  let guard = 0;
  while (hasMore && guard++ < 20) {
    const page: any = await plaid("/transactions/sync", {
      access_token: item.access_token,
      cursor,
      count: 500,
    });
    added = added.concat(page.added ?? []);
    modified = modified.concat(page.modified ?? []);
    removed = removed.concat(page.removed ?? []);
    hasMore = !!page.has_more;
    cursor = page.next_cursor;
  }

  // our account ids by Plaid account id
  const { data: accts } = await db
    .from("accounts")
    .select("id,external_id")
    .eq("user_id", item.user_id)
    .eq("plaid_item_id", item.id);
  const acctId = new Map((accts ?? []).map((a: any) => [a.external_id, a.id]));

  // user's categories in this space, to auto-categorize by Plaid's category
  const { data: cats } = await db
    .from("categories")
    .select("id,name,kind")
    .eq("user_id", item.user_id)
    .eq("space", item.space);
  const pickCat = (t: any, kind: "income" | "expense") =>
    guessCategory(t?.personal_finance_category?.primary, kind, (cats ?? []) as any[]);

  const toRow = (t: any) => {
    // Plaid: positive amount = money out
    const kind: "income" | "expense" = t.amount < 0 ? "income" : "expense";
    return {
      user_id: item.user_id,
      space: item.space,
      account_id: acctId.get(t.account_id) ?? null,
      category_id: pickCat(t, kind),
      kind,
      amount: Math.abs(Number(t.amount)),
      tx_date: t.date,
      note: (t.merchant_name || t.name || "").slice(0, 200) || null,
      source: "plaid",
      external_id: t.transaction_id,
      pending: !!t.pending,
    };
  };

  const upserts = [...added, ...modified].filter((t) => Number(t.amount) !== 0);
  const ids = upserts.map((t) => t.transaction_id);
  const existing = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .from("transactions")
      .select("id,external_id")
      .eq("user_id", item.user_id)
      .in("external_id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as any[]) existing.set(r.external_id, r.id);
  }
  const inserts = upserts.filter((t) => !existing.has(t.transaction_id)).map(toRow);
  for (let i = 0; i < inserts.length; i += 500) {
    await db.from("transactions").insert(inserts.slice(i, i + 500));
  }
  for (const t of upserts.filter((x) => existing.has(x.transaction_id))) {
    // keep the user's own category if they changed it: only refresh money fields
    const r = toRow(t);
    await db
      .from("transactions")
      .update({ amount: r.amount, kind: r.kind, tx_date: r.tx_date, note: r.note, pending: r.pending })
      .eq("id", existing.get(t.transaction_id)!);
  }
  const removedIds = removed.map((r: any) => r.transaction_id).filter(Boolean);
  if (removedIds.length) {
    await db.from("transactions").delete().eq("user_id", item.user_id).in("external_id", removedIds);
  }

  // refresh balances
  try {
    const bal: any = await plaid("/accounts/balance/get", { access_token: item.access_token });
    for (const a of bal.accounts ?? []) {
      await db
        .from("accounts")
        .update({ current_balance: a.balances?.current ?? null })
        .eq("user_id", item.user_id)
        .eq("external_id", a.account_id);
    }
  } catch {
    // balance refresh is best-effort
  }

  await db
    .from("plaid_items")
    .update({ cursor, last_synced_at: new Date().toISOString(), error: null })
    .eq("id", item.id);

  return { added: inserts.length, updated: upserts.length - inserts.length, removed: removedIds.length };
}

/** Plaid personal_finance_category.primary → one of the user's category names */
const PFC_HINTS: Record<string, RegExp> = {
  INCOME: /salary|income|sales|ingres|salario|ventas|pay/i,
  FOOD_AND_DRINK: /dining|restaurant|comida|food|groceries|super/i,
  GENERAL_MERCHANDISE: /shopping|compras|supplies|material/i,
  TRANSPORTATION: /transport|gas|vehicle|fuel|auto|gasolina/i,
  TRAVEL: /travel|viaje|transport/i,
  RENT_AND_UTILITIES: /utilit|servicios|rent|housing|vivienda|renta/i,
  ENTERTAINMENT: /entertain|entreten|subscri|suscrip/i,
  MEDICAL: /health|salud|medical/i,
  PERSONAL_CARE: /health|personal|salud/i,
  GENERAL_SERVICES: /subscri|suscrip|software|services|servicios/i,
  LOAN_PAYMENTS: /debt|loan|deuda|préstamo/i,
  BANK_FEES: /fee|bank|comisi/i,
  GOVERNMENT_AND_NON_PROFIT: /tax|impuest/i,
  HOME_IMPROVEMENT: /housing|home|vivienda|casa/i,
};

export function guessCategory(
  primary: string | undefined,
  kind: "income" | "expense",
  cats: { id: string; name: string; kind: string }[]
): string | null {
  if (!primary || primary === "TRANSFER_IN" || primary === "TRANSFER_OUT") return null;
  const re = PFC_HINTS[primary];
  if (!re) return null;
  const hit = cats.find((c) => c.kind === kind && re.test(c.name));
  return hit?.id ?? null;
}
