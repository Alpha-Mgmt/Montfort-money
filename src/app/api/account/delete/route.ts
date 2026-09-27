import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { deleteUserEverywhere } from "@/lib/delete-user";
import { isOwner } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { confirm: "<my email>" } → delete MY account and all my data
export async function POST(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (String(body?.confirm ?? "").trim().toLowerCase() !== (user.email ?? "").toLowerCase())
    return NextResponse.json({ error: "confirm_mismatch" }, { status: 400 });
  if (isOwner(user.email)) return NextResponse.json({ error: "owner_account" }, { status: 400 });
  // accounts with two-step verification must confirm with the code first
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2")
    return NextResponse.json({ error: "mfa_required" }, { status: 403 });
  const res = await deleteUserEverywhere(user.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}
