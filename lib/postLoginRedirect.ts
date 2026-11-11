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
// Who was signed in when the path was stored. A page from one account must
// never be resumed for another (e.g. a Spark cycle for a client-company PM,
// which then 404s on every request the page makes).
const USER_KEY = "sar_signed_in_user"

/** Remember who is signed in, so a stored path can be tied to them. */
export function rememberSignedInUser(userId: string) {
  try {
    localStorage.setItem(USER_KEY, userId)
  } catch {
    // Private mode / quota — the redirect just won't be resumed.
  }
}
const MAX_AGE_MS = 60 * 60 * 1000 // 1h — a day-old path is no longer "where I was"

export function storePostLoginRedirect(path: string) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ path, ts: Date.now(), user: localStorage.getItem(USER_KEY) }),
    )
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
/**
 * Whether a path is safe to redirect to after a handoff.
 *
 * Shared with the `?next=` param on /auth/token, which arrives from another
 * origin holding a live token — so the same open-redirect rules have to apply
 * there, and applying them from one place is the point.
 */
export function isSafeRedirectPath(path: unknown): path is string {
  if (typeof path !== "string") return false
  if (!path.startsWith("/") || path.startsWith("//")) return false
  // Bouncing back into the login handoff would just loop.
  if (path.startsWith("/auth") || path.startsWith("/login")) return false
  return true
}

export function consumePostLoginRedirect(userId: string): string | null {
  const raw = localStorage.getItem(KEY)
  clearPostLoginRedirect()
  if (!raw) return null
  try {
    const { path, ts, user } = JSON.parse(raw) as {
      path?: unknown
      ts?: unknown
      user?: unknown
    }
    if (typeof ts !== "number") return null
    // Only resume for the same person; anyone else starts on their home page.
    if (user !== userId) return null
    if (Date.now() - ts > MAX_AGE_MS) return null
    if (!isSafeRedirectPath(path)) return null
    return path
  } catch {
    return null
  }
}
