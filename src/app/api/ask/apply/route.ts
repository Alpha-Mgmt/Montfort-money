import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { cleanAction, type AIAction } from "@/lib/ai-actions";
import { defaultSchedule, occurrenceDates, scheduleStart, toISO } from "@/lib/recurring";
import type { Frequency, Taxes } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dayBefore = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return toISO(new Date(y, m - 1, d - 1));
};
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return toISO(new Date(y, m - 1, d + n));
};
/** keep the same effective tax rate when the take-home changes */
function scaleTaxes(t: Taxes | null, oldNet: number, newNet: number): Taxes | null {
  if (!t || !(oldNet > 0)) return t;
  const f = newNet / oldNet;
  const s = (v: any) => (v == null ? v : Math.round(Number(v) * f * 100) / 100);
  return {
    ...t,
    gross: s(t.gross),
    total: s(t.total),
    federal: s(t.federal),
    state: s(t.state),
    social_security: s(t.social_security),
    medicare: s(t.medicare),
    other: (t.other ?? []).map((o) => ({ ...o, amount: s(o.amount) })),
  };
}

// POST { actions: AIAction[] } → run the actions the user confirmed
export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const list: AIAction[] = (Array.isArray(body?.actions) ? body.actions : [])
    .slice(0, 10)
    .map((a: any) => cleanAction(a?.type, a))
    .filter(Boolean);
  if (!list.length) return NextResponse.json({ error: "nothing_to_do" }, { status: 400 });

  const results: { ok: boolean; error?: string }[] = [];
  for (const a of list) {
    try {
      if (a.type === "change_plan_amount" || a.type === "end_plan_item") {
        const { data: it, error } = await supabase.from("recurring_items").select("*").eq("id", a.item_id).single();
        if (error || !it) throw new Error("not_found");
        if (a.type === "end_plan_item") {
          const { error: e } = await supabase.from("recurring_items").update({ end_date: a.end_date }).eq("id", it.id);
          if (e) throw e;
        } else {
          const oldNet = Number(it.amount);
          const taxes = scaleTaxes(it.taxes ?? null, oldNet, a.new_amount);
          if (a.effective_date <= it.start_date || it.frequency === "once") {
            const { error: e } = await supabase.from("recurring_items").update({ amount: a.new_amount, taxes }).eq("id", it.id);
            if (e) throw e;
          } else {
            // close the old amount the day before, continue with the new one
            const first =
              occurrenceDates(it, a.effective_date, addDays(a.effective_date, 400))[0] ?? a.effective_date;
            const { error: e1 } = await supabase.from("recurring_items").update({ end_date: dayBefore(a.effective_date) }).eq("id", it.id);
            if (e1) throw e1;
            const { error: e2 } = await supabase.from("recurring_items").insert({
              user_id: user.id,
              space: it.space,
              household_id: it.household_id ?? null,
              title: it.title,
              kind: it.kind,
              amount: a.new_amount,
              category_id: it.category_id,
              account_id: it.account_id,
              frequency: it.frequency,
              schedule: it.schedule ?? null,
              taxes,
              start_date: first,
              end_date: it.end_date && it.end_date >= first ? it.end_date : null,
              active: true,
            });
            if (e2) throw e2;
          }
        }
      } else if (a.type === "add_plan_item") {
        const f = a.frequency as Frequency;
        const schedule = defaultSchedule(f, a.start_date);
        const { error } = await supabase.from("recurring_items").insert({
          user_id: user.id,
          title: a.title,
          kind: a.kind,
          amount: a.amount,
          category_id: a.category_id ?? null,
          frequency: f,
          schedule,
          start_date: scheduleStart(f, schedule, a.start_date),
          end_date: a.end_date ?? null,
        });
        if (error) throw error;
      } else if (a.type === "add_transaction") {
        const { error } = await supabase.from("transactions").insert({
          user_id: user.id,
          kind: a.kind,
          amount: a.amount,
          tx_date: a.date,
          category_id: a.category_id ?? null,
          note: a.note ?? null,
          source: "manual",
        });
        if (error) throw error;
      } else if (a.type === "create_category") {
        const { error } = await supabase.from("categories").insert({
          user_id: user.id,
          name: a.name,
          icon: "",
          kind: a.kind,
          parent_id: a.parent_id ?? null,
        });
        if (error) throw error;
      }
      results.push({ ok: true });
    } catch (e: any) {
      results.push({ ok: false, error: String(e?.message ?? "failed") });
    }
  }
  return NextResponse.json({ results });
}
