/**
 * Remembers where a user was when their session expired, so logging back in
 * returns them there instead of dumping them on their role home.
 *
 * Only the 401 interceptor stores a path (see lib/api/client.ts) — a deliberate
 * Logout clears it, because "sign me out" should not silently resume. The trip
 * goes through Centriyon (a different origin), so this must be localStorage:
 * we come back on `/auth/token?token=…` with no query params of our own.
 */
const KEY = "sar_post_login_redirect"
const MAX_AGE_MS = 60 * 60 * 1000 // 1h — a day-old path is no longer "where I was"

export function storePostLoginRedirect(path: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ path, ts: Date.now() }))
  } catch {
    // Private mode / quota — losing the return path is not worth failing over.
  }
}

export function clearPostLoginRedirect() {
  localStorage.removeItem(KEY)
}

/**
 * Returns the stored path once, then clears it. Null when absent, stale, or not
 * an internal app route — `//evil.com` is a protocol-relative URL, so a bare
 * leading-slash check is not enough to keep this from becoming an open redirect.
 */
export function consumePostLoginRedirect(): string | null {
  const raw = localStorage.getItem(KEY)
  clearPostLoginRedirect()
  if (!raw) return null
  try {
    const { path, ts } = JSON.parse(raw) as { path?: unknown; ts?: unknown }
    if (typeof path !== "string" || typeof ts !== "number") return null
    if (Date.now() - ts > MAX_AGE_MS) return null
    if (!path.startsWith("/") || path.startsWith("//")) return null
    // Bouncing back into the login handoff would just loop.
    if (path.startsWith("/auth") || path.startsWith("/login")) return null
    return path
  } catch {
    return null
  }
}
