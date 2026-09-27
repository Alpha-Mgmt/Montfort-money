import { adminDb, plaid } from "@/lib/plaid";

/**
 * Permanently delete a user: revoke their bank connections with Plaid,
 * remove their receipt files, then delete the auth user (every app table
 * cascades on auth.users). Server-only (service role).
 */
export async function deleteUserEverywhere(id: string): Promise<{ ok: boolean; revoked: number; error?: string }> {
  const db = adminDb();
  const { data: items } = await db.from("plaid_items").select("id,access_token").eq("user_id", id);
  for (const it of (items ?? []) as any[]) {
    try {
      await plaid("/item/remove", { access_token: it.access_token });
    } catch {}
  }
  try {
    const { data: files } = await db.storage.from("receipts").list(id, { limit: 1000 });
    const paths = (files ?? []).map((f: any) => `${id}/${f.name}`);
    if (paths.length) await db.storage.from("receipts").remove(paths);
  } catch {}
  const { error } = await db.auth.admin.deleteUser(id);
  if (error) return { ok: false, revoked: (items ?? []).length, error: error.message };
  return { ok: true, revoked: (items ?? []).length };
}
