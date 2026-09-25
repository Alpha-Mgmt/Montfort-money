import { NextResponse } from "next/server";
import { isOwner } from "@/lib/admin";
import { currentUser } from "@/app/api/plaid/_auth";

/** Owner + two-step verification in this session, or an error response. */
export async function ownerGuard() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return { error: NextResponse.json({ error: "not_configured" }, { status: 503 }) };
  const me = await currentUser();
  if (!me) return { error: NextResponse.json({ error: "not_authenticated" }, { status: 401 }) };
  if (!isOwner(me.email)) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  if (!me.mfa) return { error: NextResponse.json({ error: "mfa_required" }, { status: 403 }) };
  return { me };
}
