import { NextResponse } from "next/server";
import { isOwner } from "@/lib/admin";
import { currentUser } from "../../plaid/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → { owner } so the UI knows whether to show the owner panel link
export async function GET() {
  const me = await currentUser();
  return NextResponse.json({ owner: !!me && isOwner(me.email) });
}
