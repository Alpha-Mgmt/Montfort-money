import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { buildMonthSummary } from "@/lib/insights";
import { monthRange, monthStartISO, todayISO } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.INSIGHTS_MODEL || "claude-haiku-4-5";

type Insight = { tone: "warn" | "good" | "tip"; text: string };

export async function POST(request: Request) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let month = monthStartISO();
  try {
    const body = await request.json();
    if (typeof body?.month === "string" && /^\d{4}-\d{2}-01$/.test(body.month)) {
      month = body.month;
    }
  } catch {
    // no body — default to current month
  }

  const { from, to } = monthRange(month);
  const [
    { data: profile },
    { data: categories },
    { data: txs },
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
      .gte("tx_date", from)
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
    supabase.from("goals").select("id,name,target_amount,target_date,saved,archived").eq("archived", false),
    supabase.from("budgets").select("id,category_id,month,limit_amount").eq("month", month),
  ]);

  const num = (v: any) => Number(v);
  const summary = buildMonthSummary({
    month,
    today: todayISO(),
    name: (profile?.full_name ?? "").split(" ")[0] ?? "",
    categories: (categories ?? []) as any,
    txs: ((txs ?? []) as any[]).map((t) => ({ ...t, amount: num(t.amount) })) as any,
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

  if (!summary.hasData) {
    return NextResponse.json({
      headline: "Aún no hay nada que analizar",
      insights: [
        {
          tone: "tip",
          text: "Agrega tus ingresos, gastos o una meta y vuelve — aquí te diré cómo vas y qué cuidar.",
        },
      ] as Insight[],
      generated: false,
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      headline: "Falta conectar la IA",
      insights: [
        {
          tone: "tip",
          text: "El análisis con IA aún no está configurado en el servidor. En cuanto se agregue la llave, esta tarjeta cobra vida.",
        },
      ] as Insight[],
      generated: false,
    });
  }

  const system =
    "Eres el analista financiero personal de Montfort Money. Recibes un resumen ya calculado del mes de un usuario (montos en USD). " +
    "Tu trabajo es darle 3 a 5 observaciones claras, útiles y accionables, en español, tono cercano y directo (tutea). " +
    "Usa SOLO los números del resumen; nunca inventes cifras. Formatea el dinero como $1,234. Sé específico y breve — una o dos frases por observación. " +
    "Prioriza: dónde se está pasando del plan, pagos fuertes que vienen, si las metas van a alcanzar, meses que pintan en rojo, y una recomendación práctica. " +
    'Responde ÚNICAMENTE con JSON válido, sin texto extra, con esta forma: {"headline": string, "insights": [{"tone": "warn"|"good"|"tip", "text": string}]}. ' +
    'Usa "warn" para alertas, "good" para lo que va bien, "tip" para recomendaciones.';

  const userMsg =
    "Resumen del mes (JSON):\n" +
    JSON.stringify(summary, null, 2) +
    "\n\nGenera el análisis en el formato JSON indicado.";

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
        max_tokens: 900,
        system,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("Anthropic API error", resp.status, detail);
      return NextResponse.json(
        {
          headline: "No pude generar el análisis",
          insights: [
            {
              tone: "tip",
              text: "Hubo un problema al contactar la IA. Intenta de nuevo en un momento.",
            },
          ] as Insight[],
          generated: false,
        },
        { status: 200 }
      );
    }

    const data = await resp.json();
    const text: string =
      data?.content?.map((b: any) => b?.text ?? "").join("") ?? "";
    const parsed = parseInsights(text);
    return NextResponse.json({ ...parsed, generated: true });
  } catch (e) {
    console.error("insights route error", e);
    return NextResponse.json(
      {
        headline: "No pude generar el análisis",
        insights: [
          { tone: "tip", text: "Intenta de nuevo en un momento." },
        ] as Insight[],
        generated: false,
      },
      { status: 200 }
    );
  }
}

/** Pull the JSON object out of the model text, defensively. */
function parseInsights(text: string): { headline: string; insights: Insight[] } {
  const fallback = {
    headline: "Tu mes",
    insights: [{ tone: "tip", text: text.slice(0, 300) }] as Insight[],
  };
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return fallback;
    const obj = JSON.parse(text.slice(start, end + 1));
    const insights: Insight[] = Array.isArray(obj.insights)
      ? obj.insights
          .filter((i: any) => i && typeof i.text === "string")
          .map((i: any) => ({
            tone: ["warn", "good", "tip"].includes(i.tone) ? i.tone : "tip",
            text: String(i.text),
          }))
      : [];
    return {
      headline: typeof obj.headline === "string" ? obj.headline : "Tu mes",
      insights: insights.length ? insights : fallback.insights,
    };
  } catch {
    return fallback;
  }
}
