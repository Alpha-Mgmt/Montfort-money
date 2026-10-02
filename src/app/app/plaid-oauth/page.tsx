"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { tr } from "@/lib/i18n";

/** OAuth banks (Chase, BofA, Wells…) send people back here to finish connecting. */
export default function PlaidOAuthReturn() {
  const router = useRouter();
  const [msg, setMsg] = useState(tr("Finishing the bank connection…"));

  useEffect(() => {
    let saved: { token: string; at: number } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem("mf-plaid-link") || "null");
    } catch {}
    if (!saved?.token || Date.now() - saved.at > 30 * 60 * 1000) {
      setMsg(tr("This connection expired. Start again from More → Bank connections."));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    s.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (window as any).Plaid.create({
        token: saved!.token,
        receivedRedirectUri: window.location.href,
        onSuccess: async (public_token: string, metadata: any) => {
          setMsg(tr("Connecting and importing…"));
          const r = await fetch("/api/plaid/exchange", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ public_token, institution_name: metadata?.institution?.name }),
          });
          try {
            localStorage.removeItem("mf-plaid-link");
          } catch {}
          const j = await r.json().catch(() => ({}));
          if (r.ok) router.replace("/app/settings?bank=connected");
          else setMsg(tr("Couldn't connect: {e}", { e: j.error ?? "error" }));
        },
        onExit: () => router.replace("/app/settings"),
      });
      handler.open();
    };
    s.onerror = () => setMsg(tr("Couldn't start the bank connection."));
    document.body.appendChild(s);
  }, [router]);

  return <p className="muted py-16 text-center text-sm">{msg}</p>;
}
