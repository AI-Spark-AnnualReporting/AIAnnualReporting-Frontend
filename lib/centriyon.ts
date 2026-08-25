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
 * Absolute Centriyon URL that carries the current session's JWT, so the user
 * arrives signed in instead of at a login form — the mirror of the passthrough
 * Centriyon uses to send users here, landing on its `/auth/token` page the way
 * SAR's own `app/auth/token` receives one.
 *
 * `path` is where they should end up once the token is stored; omit it for the
 * dashboard. Without a token the deep link is still returned — a user with a
 * live Centriyon session lands straight on it, and one without gets Centriyon's
 * login. Returns null only when there is no base URL to build on.
 */
export function centriyonUrl(
  token: string | null | undefined,
  path = "/",
): string | null {
  const base = centriyonBaseUrl()
  if (!base) return null
  if (!token) return `${base}${path === "/" ? "" : path}`
  const next = path === "/" ? "" : `&next=${encodeURIComponent(path)}`
  return `${base}/auth/token?token=${encodeURIComponent(token)}${next}`
}

/** The dashboard, carrying the session. Null without a base URL or a token. */
export function centriyonDashboardUrl(token: string | null | undefined): string | null {
  return token ? centriyonUrl(token) : null
}
