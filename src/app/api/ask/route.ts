import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildAskContext } from "@/lib/insights";
import { addMonths, monthStartISO, todayISO } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.INSIGHTS_MODEL || "claude-haiku-4-5";

type ChatMsg = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let month = monthStartISO();
  let messages: ChatMsg[] = [];
  try {
    const body = await request.json();
    if (typeof body?.month === "string" && /^\d{4}-\d{2}-01$/.test(body.month)) {
      month = body.month;
    }
    if (Array.isArray(body?.messages)) {
      messages = body.messages
        .filter(
          (m: any) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.trim().length > 0
        )
        .slice(-12)
        .map((m: any) => ({
          role: m.role,
          content: String(m.content).slice(0, 2000),
        }));
    }
  } catch {
    // ignore — validated below
  }

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "no_question" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      reply:
        "The AI isn't connected on the server yet. Once the API key is added, you'll be able to ask me anything about your money.",
    });
  }

  // year-to-date window so "this year" questions work
  const year = month.slice(0, 4);
  const ytdFrom = `${year}-01-01`;
  const to = addMonths(month, 1);

  const [
    { data: profile },
    { data: categories },
    { data: ytdTxs },
    { data: recurring },
    { data: debts },
    { data: investments },
    { data: goals },
    { data: budgets },
  ] = await Promise.all([
    supabase.from("profiles").select("full_name").single(),
    supabase.from("categories").select("id,name,icon,kind,parent_id,pinned"),
    supabase
      .from("transactions")
      .select(
        "id,account_id,category_id,kind,amount,tx_date,note,source,task_id,recurring_item_id,debt_id,investment_id,goal_id"
      )
      .gte("tx_date", ytdFrom)
      .lt("tx_date", to),
    supabase
      .from("recurring_items")
      .select(
        "id,title,kind,amount,category_id,account_id,frequency,start_date,end_date,active"
      ),
    supabase
      .from("debts")
      .select(
        "id,name,debt_type,original_amount,balance,apr,planned_payment,payment_due_day,statement_close_day,archived"
      )
      .eq("archived", false),
    supabase
      .from("investments")
      .select(
        "id,name,inv_type,balance,expected_apr,contributed_total,monthly_amount,monthly_kind,archived"
      )
      .eq("archived", false),
    supabase
      .from("goals")
      .select("id,name,target_amount,target_date,saved,archived")
      .eq("archived", false),
    supabase.from("budgets").select("id,category_id,month,limit_amount").eq("month", month),
  ]);

  const num = (v: any) => Number(v);
  const context = buildAskContext({
    month,
    today: todayISO(),
    name: (profile?.full_name ?? "").split(" ")[0] ?? "",
    categories: (categories ?? []) as any,
    ytdTxs: ((ytdTxs ?? []) as any[]).map((t) => ({ ...t, amount: num(t.amount) })) as any,
    recurring: ((recurring ?? []) as any[]).map((r) => ({ ...r, amount: num(r.amount) })) as any,
    debts: ((debts ?? []) as any[]).map((d) => ({
      ...d,
      original_amount: d.original_amount == null ? null : num(d.original_amount),
      balance: num(d.balance),
      apr: num(d.apr),
      planned_payment: num(d.planned_payment),
    })) as any,
    investments: ((investments ?? []) as any[]).map((i) => ({
      ...i,
      balance: num(i.balance),
      expected_apr: num(i.expected_apr),
      contributed_total: num(i.contributed_total),
      monthly_amount: num(i.monthly_amount ?? 0),
      monthly_kind: i.monthly_kind ?? "deposit",
    })) as any,
    goals: ((goals ?? []) as any[]).map((g) => ({
      ...g,
      target_amount: num(g.target_amount),
      saved: num(g.saved),
    })) as any,
    budgets: ((budgets ?? []) as any[]).map((b) => ({ ...b, limit_amount: num(b.limit_amount) })) as any,
  });

  const system =
    "You are Montfort AI, the money assistant inside the Montfort Money app. " +
    "You answer the user's questions about their own finances using ONLY the data provided below (amounts in USD). " +
    "Answer in English, warm and concise — a few sentences, not an essay. Format money as $1,234. You can do arithmetic on the data. " +
    "If the data doesn't contain what's needed to answer, say so plainly and suggest what they could add or which month to check. " +
    "The 'yearToDate.byCategory' totals cover January 1 through the viewed month; use them for 'this year' questions. " +
    "You provide informational analysis, not licensed financial or investment advice — when asked for a recommendation, lay out the trade-offs with their real numbers and remind them you're not a licensed advisor. " +
    "Never invent figures that aren't in the data.\n\n" +
    "USER FINANCIAL DATA (JSON):\n" +
    JSON.stringify(context, null, 2);

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("Anthropic ask error", resp.status, detail);
      return NextResponse.json({
        reply: "I hit a problem reaching the AI. Please try again in a moment.",
      });
    }

    const data = await resp.json();
    const reply: string =
      data?.content?.map((b: any) => b?.text ?? "").join("").trim() ??
      "I couldn't find an answer for that.";
    return NextResponse.json({ reply });
  } catch (e) {
    console.error("ask route error", e);
    return NextResponse.json({
      reply: "Something went wrong. Please try again in a moment.",
    });
  }
}
