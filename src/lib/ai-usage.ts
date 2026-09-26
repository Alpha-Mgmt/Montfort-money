/**
 * Record one Anthropic call for the owner dashboard. Best-effort: never
 * breaks the user's request. Prices per million tokens (input / output);
 * override with AI_PRICE_IN / AI_PRICE_OUT if the model or prices change.
 */
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
};

export function aiCost(model: string, usage: any): { input: number; output: number; cost: number } {
  const input =
    Number(usage?.input_tokens ?? 0) +
    Number(usage?.cache_creation_input_tokens ?? 0) +
    Number(usage?.cache_read_input_tokens ?? 0);
  const output = Number(usage?.output_tokens ?? 0);
  const [pi, po] = [
    Number(process.env.AI_PRICE_IN) || PRICES[model]?.[0] || 1,
    Number(process.env.AI_PRICE_OUT) || PRICES[model]?.[1] || 5,
  ];
  // cache writes cost 1.25×, cache reads 0.1× the input price
  const cost =
    (Number(usage?.input_tokens ?? 0) * pi +
      Number(usage?.cache_creation_input_tokens ?? 0) * pi * 1.25 +
      Number(usage?.cache_read_input_tokens ?? 0) * pi * 0.1 +
      output * po) /
    1_000_000;
  return { input, output, cost };
}

export async function logAiUsage(supabase: any, userId: string, kind: "ask" | "insights", model: string, usage: any) {
  try {
    const c = aiCost(model, usage);
    await supabase.from("ai_usage").insert({
      user_id: userId,
      kind,
      model,
      input_tokens: c.input,
      output_tokens: c.output,
      cost_usd: Math.round(c.cost * 100000) / 100000,
    });
  } catch {
    // usage logging must never break the answer
  }
}
