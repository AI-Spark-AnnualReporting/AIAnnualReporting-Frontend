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
 * Absolute Centriyon dashboard URL, carrying the current session's JWT so the
 * handoff back to Centriyon is seamless — the same passthrough Centriyon uses
 * to send users here (`{SAR_URL}?token=<jwt>`), just reversed. Centriyon reads
 * the token off its own root URL the same way SAR's `app/auth/token` page does.
 * Returns null when there's no base URL or token to hand off.
 */
export function centriyonDashboardUrl(token: string | null | undefined): string | null {
  const base = centriyonBaseUrl()
  if (!base || !token) return null
  return `${base}/?token=${encodeURIComponent(token)}`
}
