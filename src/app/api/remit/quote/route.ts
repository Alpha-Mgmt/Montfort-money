import { NextResponse } from "next/server";
import { parseWiseComparison, REMIT_CURRENCIES } from "@/lib/remit";

export const runtime = "nodejs";

// GET /api/remit/quote?amount=500&to=MXN
// Live multi-provider quotes from Wise's public comparison endpoint
// (no key needed). Cached 10 minutes per amount/currency.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const amount = Math.round(Number(searchParams.get("amount")) || 0);
  const to = (searchParams.get("to") || "MXN").toUpperCase();
  if (amount < 10 || amount > 50000 || !REMIT_CURRENCIES.some((c) => c.code === to) || to === "USD") {
    return NextResponse.json({ quotes: [], live: false });
  }
  try {
    const url = `https://api.wise.com/v4/comparisons/?sourceCurrency=USD&targetCurrency=${to}&sendAmount=${amount}`;
    const r = await fetch(url, {
      headers: { accept: "application/json" },
      next: { revalidate: 600 },
    });
    if (!r.ok) throw new Error(String(r.status));
    const quotes = parseWiseComparison(await r.json());
    return NextResponse.json({ quotes, live: quotes.length > 0 });
  } catch {
    return NextResponse.json({ quotes: [], live: false });
  }
}
