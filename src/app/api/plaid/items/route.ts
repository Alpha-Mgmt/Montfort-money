import { NextResponse } from "next/server";
import { adminDb, plaid, plaidConfigured } from "@/lib/plaid";
import { currentUser } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → the user's bank connections (never the access token)
export async function GET() {
  if (!plaidConfigured()) return NextResponse.json({ configured: false, items: [] });
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const { data } = await adminDb()
    .from("plaid_items")
    .select("id,space,institution_name,last_synced_at,error,created_at")
    .eq("user_id", me.id)
    .order("created_at");
  return NextResponse.json({ configured: true, items: data ?? [] });
}

// DELETE { id } → disconnect (keeps past transactions)
export async function DELETE(req: Request) {
  if (!plaidConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const db = adminDb();
  const { data: it } = await db
    .from("plaid_items")
    .select("id,access_token")
    .eq("id", body?.id ?? "")
    .eq("user_id", me.id)
    .single();
  if (!it) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    await plaid("/item/remove", { access_token: (it as any).access_token });
  } catch {}
  await db.from("accounts").update({ archived: true }).eq("plaid_item_id", it.id);
  await db.from("plaid_items").delete().eq("id", it.id);
  return NextResponse.json({ ok: true });
}
