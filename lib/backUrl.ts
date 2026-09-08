/**
 * Where a Spark (`spark_internal`) session should return to in Centriyon.
 *
 * Spark staff open a client's workspace here from a specific cycle page, and
 * "Back to Centriton Dashboard" would land them on that CLIENT's dashboard —
 * a page they must never see. So the cycle page sends its own URL along on the
 * handoff and the nav button returns there instead.
 *
 * It has to be stashed rather than read from the URL each time: AuthContext
 * calls router.replace() the moment the handoff completes, which destroys the
 * query string.
 *
 * The origin check is the whole point of this module. An arbitrary URL in
 * `?back=` would make the nav button a phishing link wearing our chrome — it
 * reads "Go back" and goes wherever the link author chose. Centriyon's own
 * BackToOrigin does exactly this in the opposite direction, for the same reason.
 */

import { centriyonBaseUrl } from "@/lib/centriyon"

const KEY = "sar_back_url"

/** True only for an absolute URL on the Centriyon origin. */
export function isTrustedBackUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url) return false
  const base = centriyonBaseUrl()
  if (!base) return false
  try {
    return new URL(url).origin === new URL(base).origin
  } catch {
    return false
  }
}

/** The stored return URL, or null. Re-validated on read — storage is writable. */
export function getBackUrl(): string | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(KEY)
    return isTrustedBackUrl(raw) ? raw : null
  } catch {
    return null
  }
}

/** Stores only a trusted URL; anything else clears, so a bad value can't linger. */
export function setBackUrl(url: string | null | undefined): void {
  if (typeof window === "undefined") return
  try {
    if (isTrustedBackUrl(url)) localStorage.setItem(KEY, url)
    else localStorage.removeItem(KEY)
  } catch {
    /* storage disabled — the button falls back to the company directory */
  }
}

export function clearBackUrl(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
