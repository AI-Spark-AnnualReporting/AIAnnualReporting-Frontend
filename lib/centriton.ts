/** Centriton base URL with any trailing slashes stripped. Empty string if unset. */
export function centritonBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_CENTRITON_URL ?? "").replace(/\/+$/, "")
}

/**
 * Absolute Centriton login URL. Falls back to SAR's relative "/login" only when
 * the env var is missing (should not happen in deployed environments).
 */
export function centritonLoginUrl(): string {
  const base = centritonBaseUrl()
  return base ? `${base}/login` : "/login"
}
