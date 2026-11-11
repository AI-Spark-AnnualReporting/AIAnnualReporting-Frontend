/**
 * The saved sign-in token, and the one rule for throwing it away.
 *
 * Why this exists: a new tab opened from Centriyon carries a fresh token in its
 * URL, but this origin's storage may still hold an OLD one from an earlier visit.
 * The old token's checks (the start-up /auth/me, or a request still in flight)
 * then failed AFTER the new token had been saved, and their failure handlers
 * deleted whatever was saved at that moment, i.e. the new token. The user was
 * logged out of a tab that had just signed in.
 *
 * The rule: a failed check may only throw away the token it actually used. If a
 * newer token has been saved since, the failure belongs to the old session and is
 * ignored. Callers ask isStillStoredToken() before running their existing
 * clean-up, so a genuine expiry behaves exactly as before.
 */

const ACCESS_TOKEN_KEY = "access_token"

/** The saved access token, or null when there is none or storage is unavailable. */
export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY)
  } catch {
    return null
  }
}

/**
 * Whether `token` is still the saved access token.
 *
 * False means a newer sign-in replaced it after the check started, so the
 * caller must leave the session alone. Two nulls count as "still the same":
 * a request sent with no token, while none is saved, is a real sign-out.
 */
export function isStillStoredToken(token: string | null): boolean {
  return getStoredToken() === token
}

/**
 * The token a request was sent with, read from its `Authorization` header.
 * Null when the request carried none.
 */
export function tokenFromAuthHeader(header: unknown): string | null {
  if (typeof header !== "string") return null
  if (!header.startsWith("Bearer ")) return null
  return header.slice("Bearer ".length)
}
