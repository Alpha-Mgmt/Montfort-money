import { NextResponse } from "next/server";
import { adminDb, plaidConfigured, syncItem } from "@/lib/plaid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily: pull new transactions and balances for every bank connection.
// Called by Vercel Cron (vercel.json) with "Authorization: Bearer $CRON_SECRET".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!plaidConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const db = adminDb();
  const { data: items } = await db.from("plaid_items").select("id,user_id,space,access_token,cursor");
  const out = { items: 0, added: 0, errors: 0 };
  for (const it of (items ?? []) as any[]) {
    out.items++;
    try {
      const c = await syncItem(it);
      out.added += c.added;
      await db.from("plaid_items").update({ error: null }).eq("id", it.id);
    } catch (e: any) {
      out.errors++;
      console.error("[plaid cron] sync failed", it.id, e?.code || e?.message);
      await db.from("plaid_items").update({ error: e?.code || e?.message || "error" }).eq("id", it.id);
    }
  }
  return NextResponse.json(out);
}
