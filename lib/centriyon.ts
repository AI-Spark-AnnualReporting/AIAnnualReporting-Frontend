/** Centriyon base URL with any trailing slashes stripped. Empty string if unset. */
export function centriyonBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_CENTRITON_URL ?? "").replace(/\/+$/, "")
}

/**
 * Absolute Centriyon login URL. Falls back to SAR's relative "/login" only when
 * the env var is missing (should not happen in deployed environments).
 */
export function centriyonLoginUrl(): string {
  const base = centriyonBaseUrl()
  return base ? `${base}/login` : "/login"
}

/**
 * Absolute Centriyon URL for `path` (omit it for the dashboard).
 *
 * It no longer carries a token. Since refresh tokens, Centriyon keeps its own
 * session in its own storage on this browser (the user came here from it), so
 * a plain link lands them signed in; one without a session gets Centriyon's
 * login, which sends them on to `path` afterwards. Putting a token in the link
 * only left it in browser history. `_token` stays so callers need no change.
 * Returns null only when there is no base URL to build on.
 * Plan: Centriton/.claude/plans/refresh-token.md
 */
export function centriyonUrl(
  _token: string | null | undefined,
  path = "/",
): string | null {
  const base = centriyonBaseUrl()
  if (!base) return null
  return `${base}${path === "/" ? "" : path}`
}

/** The dashboard, carrying the session. Null without a base URL or a token. */
export function centriyonDashboardUrl(token: string | null | undefined): string | null {
  return token ? centriyonUrl(token) : null
}
