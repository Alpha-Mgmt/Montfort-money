import { NextResponse } from "next/server";
import { adminDb, mapAccountType, plaid, plaidConfigured, syncItem } from "@/lib/plaid";
import { currentUser } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { public_token, institution_name }
export async function POST(req: Request) {
  if (!plaidConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  // bank connections require two-step verification in this session
  if (!me.mfa) return NextResponse.json({ error: "mfa_required" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (typeof body?.public_token !== "string")
    return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    const ex: any = await plaid("/item/public_token/exchange", { public_token: body.public_token });
    const db = adminDb();
    const { data: item, error } = await db
      .from("plaid_items")
      .insert({
        user_id: me.id,
        space: me.space,
        item_id: ex.item_id,
        access_token: ex.access_token,
        institution_name: String(body.institution_name ?? "").slice(0, 120) || null,
      })
      .select("id,user_id,space,access_token,cursor")
      .single();
    if (error || !item) throw new Error(error?.message ?? "save_failed");

    const acc: any = await plaid("/accounts/get", { access_token: ex.access_token });
    for (const a of acc.accounts ?? []) {
      await db.from("accounts").insert({
        user_id: me.id,
        space: me.space,
        name: `${a.name}${a.mask ? ` ··${a.mask}` : ""}`.slice(0, 80),
        type: mapAccountType(a.type, a.subtype),
        source: "plaid",
        external_id: a.account_id,
        plaid_item_id: item.id,
        mask: a.mask ?? null,
        current_balance: a.balances?.current ?? null,
        currency: a.balances?.iso_currency_code ?? "USD",
      });
    }

    // first pull (Plaid may still be preparing history — later syncs catch up)
    let counts = { added: 0, updated: 0, removed: 0 };
    try {
      counts = await syncItem(item as any);
    } catch {}
    return NextResponse.json({ ok: true, ...counts });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "plaid_error" }, { status: 502 });
  }
}
