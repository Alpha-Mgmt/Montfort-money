import { NextResponse } from "next/server";
import { adminDb, plaid } from "@/lib/plaid";
import { isOwner } from "@/lib/admin";
import { currentUser } from "../plaid/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function guard() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    return { error: NextResponse.json({ error: "not_configured" }, { status: 503 }) };
  const me = await currentUser();
  if (!me) return { error: NextResponse.json({ error: "not_authenticated" }, { status: 401 }) };
  if (!isOwner(me.email)) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  if (!me.mfa) return { error: NextResponse.json({ error: "mfa_required" }, { status: 403 }) };
  return { me };
}

/**
 * GET → owner overview. Only account-level facts and counts:
 * never transactions, amounts, balances or notes of any user.
 */
export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  const db = adminDb();

  const users: any[] = [];
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    users.push(...(data?.users ?? []));
    if (!data || data.users.length < 1000) break;
  }

  const [{ data: profiles }, { data: items }, { data: members }, { data: feedback }] =
    await Promise.all([
      db.from("profiles").select("id,full_name,lang,feature_business,feature_remit,onboarded"),
      db.from("plaid_items").select("user_id,institution_name,last_synced_at,error"),
      db.from("household_members").select("user_id"),
      db.from("feedback").select("user_id,message,page,created_at").order("created_at", { ascending: false }).limit(30),
    ]);

  const prof = new Map((profiles ?? []).map((p: any) => [p.id, p]));
  const couple = new Set((members ?? []).map((m: any) => m.user_id));
  const banks = new Map<string, { n: number; errors: number; last: string | null; names: string[] }>();
  for (const it of (items ?? []) as any[]) {
    const b = banks.get(it.user_id) ?? { n: 0, errors: 0, last: null, names: [] };
    b.n++;
    if (it.error) b.errors++;
    if (it.institution_name) b.names.push(it.institution_name);
    if (it.last_synced_at && (!b.last || it.last_synced_at > b.last)) b.last = it.last_synced_at;
    banks.set(it.user_id, b);
  }
  const emailOf = new Map(users.map((u) => [u.id, u.email]));

  const rows = users.map((u) => {
    const p: any = prof.get(u.id) ?? {};
    const b = banks.get(u.id);
    return {
      id: u.id,
      email: u.email ?? null,
      name: p.full_name ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      confirmed: !!u.email_confirmed_at,
      mfa: (u.factors ?? []).some((f: any) => f.status === "verified"),
      lang: p.lang ?? null,
      onboarded: !!p.onboarded,
      business: !!p.feature_business,
      remit: !!p.feature_remit,
      couple: couple.has(u.id),
      banks: b?.n ?? 0,
      bank_errors: b?.errors ?? 0,
      bank_names: b?.names ?? [],
      last_bank_sync: b?.last ?? null,
      owner: isOwner(u.email),
    };
  });

  return NextResponse.json({
    users: rows,
    feedback: (feedback ?? []).map((f: any) => ({ ...f, email: emailOf.get(f.user_id) ?? null })),
  });
}

/**
 * DELETE { id, confirm } → permanently delete a user's account and all their data.
 * `confirm` must equal the user's email. Revokes Plaid, removes receipt files,
 * then deletes the auth user (every table cascades on auth.users).
 */
export async function DELETE(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  const db = adminDb();
  const { data: got, error } = await db.auth.admin.getUserById(id);
  const user = got?.user;
  if (error || !user) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (id === g.me!.id || isOwner(user.email))
    return NextResponse.json({ error: "cannot_delete_owner" }, { status: 400 });
  if (String(body?.confirm ?? "").trim().toLowerCase() !== (user.email ?? "").toLowerCase())
    return NextResponse.json({ error: "confirm_mismatch" }, { status: 400 });

  // 1) revoke bank connections with Plaid
  const { data: items } = await db.from("plaid_items").select("id,access_token").eq("user_id", id);
  for (const it of (items ?? []) as any[]) {
    try {
      await plaid("/item/remove", { access_token: it.access_token });
    } catch {}
  }
  // 2) receipt files (receipts/<user id>/...)
  try {
    const { data: files } = await db.storage.from("receipts").list(id, { limit: 1000 });
    const paths = (files ?? []).map((f: any) => `${id}/${f.name}`);
    if (paths.length) await db.storage.from("receipts").remove(paths);
  } catch {}
  // 3) the account itself — all app tables cascade
  const { error: delErr } = await db.auth.admin.deleteUser(id);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 502 });
  return NextResponse.json({ ok: true, revoked_banks: (items ?? []).length });
}
