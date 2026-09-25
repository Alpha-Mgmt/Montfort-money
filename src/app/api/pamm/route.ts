import { NextResponse } from "next/server";
import { adminDb } from "@/lib/plaid";
import { ownerGuard } from "@/lib/owner-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → every PAMM client (owner only)
export async function GET() {
  const g = await ownerGuard();
  if (g.error) return g.error;
  const { data, error } = await adminDb().from("pamm_clients").select("id,data");
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ clients: data ?? [] });
}

// PUT { id, data } → save one client's record
export async function PUT(req: Request) {
  const g = await ownerGuard();
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  const data = body?.data;
  const ok =
    /^[a-z0-9][a-z0-9-]{0,80}$/.test(id) &&
    data && typeof data === "object" &&
    typeof data.name === "string" &&
    Array.isArray(data.months) && data.months.length === 12 &&
    JSON.stringify(data).length < 200_000;
  if (!ok) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { error } = await adminDb()
    .from("pamm_clients")
    .upsert({ id, data, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
