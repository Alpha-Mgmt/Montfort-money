/** Owner-only helpers (server). OWNER_EMAILS = comma-separated list in Vercel. */
const FALLBACK = "alpha.mgmt@outlook.com";

export function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS || FALLBACK)
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isOwner(email?: string | null) {
  return !!email && ownerEmails().includes(email.toLowerCase());
}
