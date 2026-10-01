/**
 * Optional email-domain allowlist for sign-in. By default every domain is allowed.
 * Restrict domains with AUTH_ALLOWED_EMAIL_DOMAINS (comma-separated, lowercase hostnames).
 * Set AUTH_DISABLE_TENANT_ALLOWLIST=true to ignore AUTH_ALLOWED_EMAIL_DOMAINS.
 */

function parseDomainList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function getTenantEmailAllowlist(): string[] {
  if (process.env.AUTH_DISABLE_TENANT_ALLOWLIST === "true") {
    return [];
  }
  const fromEnv = process.env.AUTH_ALLOWED_EMAIL_DOMAINS?.trim();
  if (fromEnv) {
    return parseDomainList(fromEnv);
  }
  return [];
}

export function emailMatchesTenantAllowlist(
  email: string | null | undefined,
  domains: string[]
): boolean {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return false;
  const host = e.slice(at + 1);
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

export function resolveOAuthSignInEmail(
  user: { email?: string | null },
  profile: unknown
): string {
  const fromUser = (user?.email ?? "").trim();
  if (fromUser) return fromUser;
  const p = profile as { email?: string | null } | null | undefined;
  return (p?.email ?? "").trim();
}
