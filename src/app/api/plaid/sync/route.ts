import { NextResponse } from "next/server";
import { adminDb, plaidConfigured, syncItem } from "@/lib/plaid";
import { currentUser } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST → sync every connection of the signed-in user
// body { recategorize: true } re-reads the full history and fills empty categories
export async function POST(req: Request) {
  if (!plaidConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const full = body?.recategorize === true;
  const db = adminDb();
  const { data: items } = await db
    .from("plaid_items")
    .select("id,user_id,space,access_token,cursor")
    .eq("user_id", me.id);
  const total = { added: 0, updated: 0, removed: 0, errors: 0 };
  for (const it of (items ?? []) as any[]) {
    try {
      const c = await syncItem(it, { full });
      total.added += c.added;
      total.updated += c.updated;
      total.removed += c.removed;
    } catch (e: any) {
      total.errors++;
      await db.from("plaid_items").update({ error: e?.code || e?.message || "error" }).eq("id", it.id);
    }
  }
  return NextResponse.json(total);
}
