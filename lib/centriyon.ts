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
