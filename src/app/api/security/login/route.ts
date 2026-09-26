import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deviceOf(ua: string): string {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  const br = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${br} · ${os}`;
}

// POST → record this sign-in; returns whether the device/place is new
export async function POST(req: Request) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const h = req.headers;
  const device = deviceOf(h.get("user-agent") ?? "");
  const dec = (v: string | null) => { try { return v ? decodeURIComponent(v) : ""; } catch { return v ?? ""; } };
  const place = [dec(h.get("x-vercel-ip-city")), h.get("x-vercel-ip-country-region"), h.get("x-vercel-ip-country")]
    .filter(Boolean).join(", ") || null;
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  let q = supabase.from("login_events").select("id").eq("device", device);
  q = place ? q.eq("place", place) : q.is("place", null);
  const { data: seen } = await q.limit(1);
  const { count } = await supabase.from("login_events").select("id", { count: "exact", head: true });
  const isNew = (count ?? 0) > 0 && !(seen ?? []).length;
  await supabase.from("login_events").insert({ user_id: user.id, device, place, ip, is_new: isNew });
  return NextResponse.json({ ok: true, is_new: isNew });
}

// GET → my last 10 sign-ins
export async function GET() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const { data } = await supabase
    .from("login_events").select("created_at,device,place,is_new").order("created_at", { ascending: false }).limit(10);
  return NextResponse.json({ events: data ?? [] });
}
