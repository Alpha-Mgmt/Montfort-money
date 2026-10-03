import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { adminDb } from "@/lib/plaid";
import { currentUser } from "../../plaid/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULTS: Record<string, [string, "expense" | "income"][]> = {
  en: [
    ["Housing", "expense"], ["Groceries", "expense"], ["Dining out", "expense"], ["Transport", "expense"],
    ["Utilities", "expense"], ["Subscriptions", "expense"], ["Insurance", "expense"], ["Debts", "expense"],
    ["Health", "expense"], ["Shopping", "expense"], ["Entertainment", "expense"], ["Other", "expense"],
    ["Salary", "income"], ["Other income", "income"],
  ],
  es: [
    ["Vivienda", "expense"], ["Súper", "expense"], ["Restaurantes", "expense"], ["Transporte", "expense"],
    ["Servicios", "expense"], ["Suscripciones", "expense"], ["Seguros", "expense"], ["Deudas", "expense"],
    ["Salud", "expense"], ["Compras", "expense"], ["Entretenimiento", "expense"], ["Otros", "expense"],
    ["Sueldo", "income"], ["Otros ingresos", "income"],
  ],
};

/**
 * Fresh start for the active space: wipes movements, plan, debts, goals,
 * investments, tasks and categories (back to the defaults), keeps the bank
 * connections and asks the bank for the full history again on the next sync.
 */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  let lang = me.lang === "es" ? "es" : "en";
  try {
    const b = await req.json();
    if (b?.lang === "es" || b?.lang === "en") lang = b.lang;
  } catch {}
  const db = createServerSupabase(); // RLS: only this user's active space
  for (const t of ["transactions", "tasks", "recurring_items", "budgets", "debts", "investments", "goals"]) {
    const { error } = await db.from(t).delete().eq("user_id", me.id);
    if (error) return NextResponse.json({ error: `${t}: ${error.message}` }, { status: 500 });
  }
  // categories: children first, then the rest
  await db.from("categories").delete().eq("user_id", me.id).not("parent_id", "is", null);
  const { error: ce } = await db.from("categories").delete().eq("user_id", me.id);
  if (ce) return NextResponse.json({ error: `categories: ${ce.message}` }, { status: 500 });
  await db.from("categories").insert(DEFAULTS[lang].map(([name, kind]) => ({ user_id: me.id, name, icon: "", kind })));
  await db.from("profiles").update({ onboarded: false, cash_on_hand: {} }).eq("id", me.id);

  // bank: next sync re-downloads the whole history (and re-categorizes it fresh)
  let banks = 0;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data } = await adminDb()
      .from("plaid_items")
      .update({ cursor: null })
      .eq("user_id", me.id)
      .eq("space", me.space)
      .select("id");
    banks = data?.length ?? 0;
  }
  return NextResponse.json({ ok: true, banks });
}
