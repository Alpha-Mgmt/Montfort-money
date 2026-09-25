import { createClient as createAdmin } from "@supabase/supabase-js";
import { categorize, normMerchant, OWN_TRANSFER } from "@/lib/categorize";

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
export async function syncItem(
  item: {
    id: string;
    user_id: string;
    space: string;
    access_token: string;
    cursor: string | null;
  },
  opts: { full?: boolean } = {}
) {
  const db = adminDb();
  // full = re-read the whole history (used to re-categorize)
  let cursor = opts.full ? undefined : item.cursor ?? undefined;
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
  // what the user already chose for each merchant (most recent wins)
  const learned = new Map<string, { id: string; kind: string }>();
  const { data: past } = await db
    .from("transactions")
    .select("note,kind,category_id,tx_date")
    .eq("user_id", item.user_id)
    .eq("space", item.space)
    .not("category_id", "is", null)
    .not("note", "is", null)
    .order("tx_date", { ascending: false })
    .limit(5000);
  for (const r of ((past ?? []) as any[]).reverse()) learned.set(`${r.kind}|${normMerchant(r.note)}`, { id: r.category_id, kind: r.kind });
  const pickCat = (t: any, kind: "income" | "expense") =>
    categorize(t, kind, (cats ?? []) as any[], learned);
  const isOwnTransfer = (t: any) => OWN_TRANSFER.has(t?.personal_finance_category?.detailed ?? "");

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

  // money moving between the user's own accounts (e.g. paying the credit card)
  // is not income or spending — leave it out so nothing is counted twice
  const all = [...added, ...modified].filter((t) => Number(t.amount) !== 0);
  const transfers = all.filter(isOwnTransfer).map((t) => t.transaction_id);
  const upserts = all.filter((t) => !isOwnTransfer(t));
  const ids = upserts.map((t) => t.transaction_id);
  const existing = new Map<string, string>();
  const uncategorized = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .from("transactions")
      .select("id,external_id,category_id")
      .eq("user_id", item.user_id)
      .in("external_id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as any[]) {
      existing.set(r.external_id, r.id);
      if (!r.category_id) uncategorized.add(r.external_id);
    }
  }
  const inserts = upserts.filter((t) => !existing.has(t.transaction_id)).map(toRow);
  for (let i = 0; i < inserts.length; i += 500) {
    await db.from("transactions").insert(inserts.slice(i, i + 500));
  }
  for (const t of upserts.filter((x) => existing.has(x.transaction_id))) {
    // keep the user's own category if they changed it: only refresh money fields
    const r = toRow(t);
    const patch: Record<string, unknown> = { amount: r.amount, kind: r.kind, tx_date: r.tx_date, note: r.note, pending: r.pending };
    // only fill a category if it's still empty — never overwrite the user's choice
    if (uncategorized.has(t.transaction_id) && r.category_id) patch.category_id = r.category_id;
    await db.from("transactions").update(patch).eq("id", existing.get(t.transaction_id)!);
  }
  const removedIds = [...removed.map((r: any) => r.transaction_id), ...transfers].filter(Boolean);
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
