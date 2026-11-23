/**
 * Refresh tokens for SAR — the one copy of "renew the session, then retry",
 * used by both axios clients (client.ts, communications.ts) and the raw SSE
 * fetch (sectionBlocks.ts).
 *
 * Centriyon gives this app its OWN session: the hand-off link carries a refresh
 * token after `#`, which app/auth/token swaps for a new pair at once. After
 * that the access token (15 minutes) is renewed with the refresh token (7 days)
 * by calling CENTRIYON's /auth/refresh — Centriyon owns users and sessions; SAR's
 * backend only checks the access token.
 *
 * Plan: Centriton/.claude/plans/refresh-token.md
 */

import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from "axios"
// Relative with the extension (not "@/lib/…") so `node lib/api/session.test.ts`
// can load it with no bundler — same as lib/storedToken.test.ts.
import { getStoredToken, tokenFromAuthHeader } from "../storedToken.ts"

const ACCESS_TOKEN_KEY = "access_token"
// A new key on purpose: `refresh_token` may still hold a token from SAR's old,
// retired login, which Centriyon would reject — and a rejected refresh logs out.
const REFRESH_TOKEN_KEY = "centriton_refresh_token"
// Only cleaned up. Can go once every browser has signed in since this shipped.
const OLD_REFRESH_TOKEN_KEY = "refresh_token"

// The Centriyon API, same variable the communications client already uses.
const CENTRIYON_API_URL = (
  process.env.NEXT_PUBLIC_CENTRION_API_URL || "http://localhost:8000/api/v1"
).replace(/\/+$/, "")

/** The saved refresh token, or null. */
export function getStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  } catch {
    return null
  }
}

/** Save a new access + refresh token pair. */
export function saveSession(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  localStorage.removeItem(OLD_REFRESH_TOKEN_KEY)
}

/** Forget the whole session (both tokens, and the retired key). */
export function clearSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(OLD_REFRESH_TOKEN_KEY)
}

// What a refresh attempt ended in:
//   "ok"          — a fresh access token is saved; retry the request.
//   "expired"     — Centriyon refused the refresh token (401/403); sign out.
//   "unavailable" — network error or 5xx; keep the session, show the error.
export type RefreshOutcome = "ok" | "expired" | "unavailable"

// The answer to one POST /auth/refresh: the new pair, or why there is none.
type ExchangeResult =
  | { outcome: "ok"; accessToken: string; refreshToken: string }
  | { outcome: "expired" | "unavailable" }

/** Send a refresh token to Centriyon and return the new pair (or why not).
 *  Plain fetch, not an api client — this call must never refresh itself. */
async function exchangeRefreshToken(refreshToken: string): Promise<ExchangeResult> {
  let res: Response
  try {
    res = await fetch(`${CENTRIYON_API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch {
    return { outcome: "unavailable" }
  }
  if (res.ok) {
    const data = (await res.json()) as { access_token: string; refresh_token: string }
    return { outcome: "ok", accessToken: data.access_token, refreshToken: data.refresh_token }
  }
  if (res.status === 401 || res.status === 403) return { outcome: "expired" }
  return { outcome: "unavailable" }
}

/** The SAR refresh token Centriyon put after `#` in a hand-off link, or null. */
export function handoffRefreshTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null
  return new URLSearchParams(window.location.hash.slice(1)).get("refresh_token")
}

// Every refresh swaps the refresh token and the old one stops working, so two
// tabs refreshing at once would knock each other out. Web Locks lets only one
// tab refresh at a time; browsers without it still get the in-tab sharing below
// and the re-checks in refreshOnce().
async function runWithRefreshLock(work: () => Promise<RefreshOutcome>): Promise<RefreshOutcome> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined
  if (!locks?.request) return work()
  // `await` because this TypeScript lib types request() as a promise of the
  // callback's promise; awaiting flattens it to the outcome.
  return await locks.request("sar-token-refresh", work)
}

async function refreshOnce(failedToken: string | null): Promise<RefreshOutcome> {
  // Another tab (or an earlier call) already refreshed while we waited.
  const current = getStoredToken()
  if (current && current !== failedToken) return "ok"

  const refreshToken = getStoredRefreshToken()
  if (!refreshToken) return "expired"

  const result = await exchangeRefreshToken(refreshToken)
  if (result.outcome === "ok") {
    saveSession(result.accessToken, result.refreshToken)
    return "ok"
  }
  // Without Web Locks another tab may have won the race with this same refresh
  // token — its new tokens are already saved, so use them.
  if (result.outcome === "expired" && getStoredRefreshToken() !== refreshToken) return "ok"
  return result.outcome
}

// Several requests can 401 at the same moment; they share one refresh.
let refreshInFlight: Promise<RefreshOutcome> | null = null

/** Get a new access token. `failedToken` is the one the 401'd request carried. */
export function refreshSession(failedToken: string | null): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = runWithRefreshLock(() => refreshOnce(failedToken)).finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

/**
 * Start this app's session from the refresh token Centriyon put in the hand-off
 * link. Swapping it at once means the copy left in browser history is dead.
 * Returns false when it couldn't be swapped (expired, already used, or
 * Centriyon unreachable) — any session already saved here is left as it was.
 */
export async function startSessionFromHandoff(handoffRefreshToken: string): Promise<boolean> {
  const result = await exchangeRefreshToken(handoffRefreshToken)
  if (result.outcome !== "ok") return false
  saveSession(result.accessToken, result.refreshToken)
  return true
}

/** Tell Centriyon to end this session. Fire-and-forget: signing out never waits on it. */
export function revokeRefreshToken(): void {
  const refreshToken = getStoredRefreshToken()
  if (!refreshToken) return
  try {
    fetch(`${CENTRIYON_API_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // fetch unavailable — the local sign-out still happens.
  }
}

type RetriableConfig = InternalAxiosRequestConfig & { _retriedAfterRefresh?: boolean }

/**
 * For an axios 401: renew the session and resend the request once.
 *
 * Returns the retried response; or "expired" (the caller signs out as before);
 * or "unavailable" (the caller must NOT sign out); or null when this error
 * isn't one to retry (no token sent, or already retried).
 */
export async function retryOnceAfterRefresh(
  error: { config?: RetriableConfig },
  client: AxiosInstance,
): Promise<AxiosResponse | RefreshOutcome | null> {
  const config = error.config
  if (!config || config._retriedAfterRefresh) return null
  const sentToken = tokenFromAuthHeader(config.headers?.Authorization)
  if (!sentToken) return null

  const outcome = await refreshSession(sentToken)
  if (outcome !== "ok") return outcome

  config._retriedAfterRefresh = true
  // The request interceptor attaches the freshly saved token on the way out.
  return client(config)
}

/**
 * fetch() with the saved token that renews an expired token once and retries.
 * Only for a 401 BEFORE a stream starts; a stream already running is not
 * retried. Throws (without signing out) when Centriyon can't be reached.
 */
export async function fetchWithRefresh(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, init)
  const sentToken = tokenFromAuthHeader(new Headers(init.headers).get("Authorization"))
  if (res.status !== 401 || !sentToken) return res

  const outcome = await refreshSession(sentToken)
  if (outcome === "expired") return res
  if (outcome === "unavailable") {
    throw new Error("Could not reach the server to renew your session. Please try again.")
  }
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${getStoredToken()}`)
  return fetch(url, { ...init, headers })
}
