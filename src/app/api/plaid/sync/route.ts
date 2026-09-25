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
  const total = { added: 0, updated: 0, removed: 0, errors: 0, filled: 0, left: 0, seen: 0, created: [] as string[], messages: [] as string[] };
  for (const it of (items ?? []) as any[]) {
    try {
      const c = await syncItem(it, { full });
      total.added += c.added;
      total.updated += c.updated;
      total.removed += c.removed;
      total.filled += c.filled;
      total.left += c.left;
      total.seen += c.seen;
      total.created.push(...c.created);
    } catch (e: any) {
      total.errors++;
      total.messages.push(String(e?.code || e?.message || "error"));
      console.error("[plaid] sync failed", it.id, e?.code || e?.message);
      await db.from("plaid_items").update({ error: e?.code || e?.message || "error" }).eq("id", it.id);
    }
  }
  return NextResponse.json(total);
}
