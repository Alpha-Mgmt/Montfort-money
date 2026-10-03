"use client";

/**
 * Open Plaid Link and finish the connection (exchange + first import).
 * Two-step verification must already be passed in this session.
 */
export type LinkResult =
  | { ok: true; institution: string | null; added: number }
  | { ok: false; cancelled?: boolean; error?: string };

function loadPlaidScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Plaid) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script"));
    document.head.appendChild(s);
  });
}

export async function openPlaidLink(lang: "en" | "es", onConnecting?: () => void): Promise<LinkResult> {
  try {
    const [{ link_token, error }] = await Promise.all([
      fetch("/api/plaid/link-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lang }),
      }).then((r) => r.json()),
      loadPlaidScript(),
    ]);
    const Plaid = (window as any).Plaid;
    if (!link_token || !Plaid) return { ok: false, error: error || "link" };
    // OAuth banks leave the page and come back to /app/plaid-oauth with this token
    try {
      localStorage.setItem("mf-plaid-link", JSON.stringify({ token: link_token, at: Date.now() }));
    } catch {}
    return await new Promise<LinkResult>((resolve) => {
      const handler = Plaid.create({
        token: link_token,
        onSuccess: async (public_token: string, metadata: any) => {
          onConnecting?.();
          const institution = metadata?.institution?.name ?? null;
          const r = await fetch("/api/plaid/exchange", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ public_token, institution_name: institution }),
          });
          const j = await r.json().catch(() => ({}));
          resolve(r.ok ? { ok: true, institution, added: j.added ?? 0 } : { ok: false, error: j.error ?? "exchange" });
        },
        onExit: (err: any) => resolve({ ok: false, cancelled: !err, error: err?.error_message }),
      });
      handler.open();
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "link" };
  }
}
