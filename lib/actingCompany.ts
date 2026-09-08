/**
 * The company a Spark (`spark_internal`) session is acting on.
 *
 * Spark staff carry no company of their own, so the backend resolves the one
 * they are working in from the `X-Company-Id` header, which the api client
 * attaches from here. It arrives on the Centriyon handoff URL — cross-origin,
 * that is the only channel available.
 *
 * Absent for every other user, so nothing is sent and nothing changes for them.
 * Cleared on logout and whenever a handoff arrives without one.
 */

const KEY = "sar_acting_company"

/** Read fresh every time — never cache, or a second tab goes stale. */
export function getActingCompany(): string | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setActingCompany(companyId: string): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(KEY, companyId)
  } catch {
    /* storage disabled — the session just won't be company-scoped */
  }
}

export function clearActingCompany(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
