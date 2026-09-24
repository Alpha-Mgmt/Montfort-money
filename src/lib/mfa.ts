"use client";

import { createClient } from "@/lib/supabase/client";

/** Where the signed-in user stands with two-step verification. */
export async function mfaStatus(): Promise<{
  enrolled: boolean; // has a verified authenticator app
  verifiedNow: boolean; // this session passed the code (aal2)
  factorId: string | null;
}> {
  const supabase = createClient();
  const [{ data: factors }, { data: aal }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  const totp = (factors?.totp ?? []).find((f) => f.status === "verified") ?? null;
  return {
    enrolled: !!totp,
    verifiedNow: aal?.currentLevel === "aal2",
    factorId: totp?.id ?? null,
  };
}

/** Check a 6-digit code for an enrolled factor; upgrades the session to aal2. */
export async function verifyCode(factorId: string, code: string): Promise<string | null> {
  const { error } = await createClient().auth.mfa.challengeAndVerify({
    factorId,
    code: code.replace(/\D/g, ""),
  });
  return error ? error.message : null;
}

/** Remove half-finished enrollments so a fresh one can start. */
export async function clearUnverified() {
  const supabase = createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  for (const f of data?.all ?? []) {
    if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
}
