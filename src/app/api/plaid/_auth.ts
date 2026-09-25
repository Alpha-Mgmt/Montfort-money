import { createServerSupabase } from "@/lib/supabase/server";

/** The signed-in user + their active space, or null. */
export async function currentUser() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("active_space,lang")
    .single();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return {
    mfa: aal?.currentLevel === "aal2",
    id: user.id,
    email: (user.email || "").toLowerCase(),
    space: (profile?.active_space as string) || "personal",
    lang: (profile?.lang as string) || "en",
  };
}
