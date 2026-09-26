import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildAskContext } from "@/lib/insights";
import { addMonths, money, monthStartISO, todayISO } from "@/lib/format";
import { AI_TOOLS, cleanAction, type AIAction } from "@/lib/ai-actions";
import { taxTotal } from "@/lib/taxes";


function aiContext(body: any): string {
  const es = body?.lang === "es";
  const biz = body?.space === "business";
  const couple = body?.space === "shared";
  return (
    (couple
      ? "This data is the COUPLE space the user shares with their partner (household money both of them manage): speak to them as a household. "
      : "") +
    (biz
      ? "This data is the user's BUSINESS space (their business's money, kept apart from personal money): talk about revenue, costs and profit. "
      : "") +
    (es
      ? "IMPORTANT: the user reads Spanish — write every word of your answer in natural Latin-American Spanish (tú). Format money as $1,234. "
      : "")
  );
}

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
  let extra = "";
  let messages: ChatMsg[] = [];
  try {
    const body = await request.json();
    extra = aiContext(body);
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
        "id,title,kind,amount,category_id,account_id,frequency,start_date,end_date,active,schedule,taxes"
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

  const es = extra.includes("Spanish");
  const cats = ((categories ?? []) as any[]);
  const catById = new Map(cats.map((c) => [c.id, c]));
  const recs = ((recurring ?? []) as any[]).map((r) => ({ ...r, amount: num(r.amount) }));
  const planItems = recs.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    amount: r.amount,
    frequency: r.frequency,
    starts: r.start_date,
    ends: r.end_date,
    category: r.category_id ? catById.get(r.category_id)?.name ?? null : null,
    gross: r.taxes?.gross ?? null,
    taxes: r.taxes ? taxTotal(r.taxes) : null,
    taxDetail: r.taxes ?? null,
  }));
  const categoryList = cats.map((c) => ({ id: c.id, name: c.name, kind: c.kind, parent: c.parent_id ? catById.get(c.parent_id)?.name ?? null : null }));

  const system =
    "You are Montfort AI, the money assistant inside the Montfort Money app. " +
    "You answer the user's questions about their own finances using ONLY the data provided below (amounts in USD). " +
    "Answer in English, warm and concise — a few sentences, not an essay. Format money as $1,234. You can do arithmetic on the data. " +
    extra +
    "If the data doesn't contain what's needed to answer, say so plainly and suggest what they could add or which month to check. " +
    "The 'yearToDate.byCategory' totals cover January 1 through the viewed month; use them for 'this year' questions. " +
    "'thisMonthByCategory' is the viewed month exactly as the app shows it: each category (with its 'group' = parent category, e.g. an employer), what's planned vs actually logged, and the plan lines inside it (e.g. Salary, Stipends) with their amounts, how they repeat and the dates they fall on this month. Use it for any breakdown of income or expenses, and name the real categories and lines. " +
    "'thisMonthTransactions' lists what was actually logged this month. " +
    "You can't send messages, emails or WhatsApps yourself: if asked, write the text ready to copy and mention the Share button under your answer. " +
    "Formatting: plain text only — no Markdown headings or tables; you may use **bold** for key numbers and simple lines starting with '• ' for lists. " +
    "You provide informational analysis, not licensed financial or investment advice — when asked for a recommendation, lay out the trade-offs with their real numbers and remind them you're not a licensed advisor. " +
    "Never invent figures that aren't in the data. " +
    "Today is " + todayISO() + ". " +
    "CHANGES: you can propose changes with the tools (change a plan amount from a date, stop a plan item, add a plan item, log a transaction, create a category). Only use a tool when the user clearly asks you to change or add something. Use ids exactly as they appear in planItems / categories; if you're unsure which item they mean, ask instead of guessing. The app shows your proposal with Apply / Cancel buttons — nothing changes until they tap Apply, so in your text say briefly what you'll change and ask them to confirm with the button. For income, plan amounts are take-home; if an item has gross/taxes, a new take-home keeps the same tax rate.\n\n" +
    "USER FINANCIAL DATA (JSON):\n" +
    JSON.stringify({ ...context, planItems, categories: categoryList }, null, 2);

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
        tools: AI_TOOLS,
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
    const blocks: any[] = data?.content ?? [];
    let reply: string = blocks.filter((b) => b?.type === "text").map((b) => b.text).join("").trim();

    // proposals the user must confirm
    const itemIds = new Set(recs.map((r) => r.id));
    const catIds = new Set(cats.map((c) => c.id));
    const actions: { action: AIAction; summary: string }[] = [];
    for (const b of blocks) {
      if (b?.type !== "tool_use") continue;
      const a = cleanAction(b.name, b.input);
      if (!a) continue;
      if ("item_id" in a && !itemIds.has(a.item_id)) continue;
      if ("category_id" in a && a.category_id && !catIds.has(a.category_id)) (a as any).category_id = null;
      if (a.type === "create_category" && a.parent_id && !catIds.has(a.parent_id)) a.parent_id = null;
      actions.push({ action: a, summary: describe(a) });
    }
    if (!reply) reply = actions.length ? (es ? "¿Aplico este cambio?" : "Shall I apply this?") : "I couldn't find an answer for that.";
    return NextResponse.json({ reply, actions });

    function describe(a: AIAction): string {
      const cat = (id?: string | null) => (id ? catById.get(id)?.name : null);
      const item = (id: string) => recs.find((r) => r.id === id);
      switch (a.type) {
        case "change_plan_amount": {
          const it = item(a.item_id);
          return es
            ? `Cambiar "${it?.title}" de ${money(it?.amount ?? 0)} a ${money(a.new_amount)} a partir del ${a.effective_date}`
            : `Change "${it?.title}" from ${money(it?.amount ?? 0)} to ${money(a.new_amount)} starting ${a.effective_date}`;
        }
        case "end_plan_item":
          return es ? `Terminar "${item(a.item_id)?.title}" el ${a.end_date}` : `End "${item(a.item_id)?.title}" on ${a.end_date}`;
        case "add_plan_item":
          return es
            ? `Agregar al plan: "${a.title}" ${money(a.amount)} (${a.frequency}) desde el ${a.start_date}${cat(a.category_id) ? ` en ${cat(a.category_id)}` : ""}`
            : `Add to plan: "${a.title}" ${money(a.amount)} (${a.frequency}) from ${a.start_date}${cat(a.category_id) ? ` in ${cat(a.category_id)}` : ""}`;
        case "add_transaction":
          return es
            ? `Registrar ${a.kind === "income" ? "ingreso" : "gasto"} de ${money(a.amount)} el ${a.date}${cat(a.category_id) ? ` en ${cat(a.category_id)}` : ""}${a.note ? ` (${a.note})` : ""}`
            : `Log ${a.kind} of ${money(a.amount)} on ${a.date}${cat(a.category_id) ? ` in ${cat(a.category_id)}` : ""}${a.note ? ` (${a.note})` : ""}`;
        case "create_category":
          return es
            ? `Crear categoría "${a.name}" (${a.kind === "income" ? "ingreso" : "gasto"})${cat(a.parent_id) ? ` dentro de ${cat(a.parent_id)}` : ""}`
            : `Create ${a.kind} category "${a.name}"${cat(a.parent_id) ? ` inside ${cat(a.parent_id)}` : ""}`;
      }
    }
  } catch (e) {
    console.error("ask route error", e);
    return NextResponse.json({
      reply: "Something went wrong. Please try again in a moment.",
    });
  }
}
