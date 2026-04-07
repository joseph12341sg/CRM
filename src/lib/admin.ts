/**
 * Returns true if the given email matches one of the admin emails
 * configured via the ADMIN_EMAIL env var (comma-separated list supported).
 *
 * Server-side: uses ADMIN_EMAIL.
 * Client-side: uses NEXT_PUBLIC_ADMIN_EMAIL (must be set if you want
 * the login page to redirect correctly without a server round-trip).
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw =
    process.env.ADMIN_EMAIL ?? process.env.NEXT_PUBLIC_ADMIN_EMAIL ?? '';
  if (!raw) return false;
  const allowed = raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}
