import { NextResponse } from "next/server";
import { plaid, plaidConfigured } from "@/lib/plaid";
import { currentUser } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!plaidConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  // bank connections require two-step verification in this session
  if (!me.mfa) return NextResponse.json({ error: "mfa_required" }, { status: 403 });
  let lang = me.lang;
  try {
    const b = await req.json();
    if (b?.lang === "es" || b?.lang === "en") lang = b.lang;
  } catch {}
  try {
    const j: any = await plaid("/link/token/create", {
      user: { client_user_id: me.id },
      client_name: "Montfort Money",
      products: ["transactions"],
      transactions: { days_requested: 400 },
      country_codes: ["US"],
      language: lang === "es" ? "es" : "en",
    });
    return NextResponse.json({ link_token: j.link_token });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "plaid_error" }, { status: 502 });
  }
}
