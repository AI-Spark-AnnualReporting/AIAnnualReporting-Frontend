import axios, {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios"
import { centriyonLoginUrl } from "@/lib/centriyon"
import { storePostLoginRedirect } from "@/lib/postLoginRedirect"
import { getActingCompany } from "@/lib/actingCompany"

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://anualreport-hmc4gyfnc9e9emdf.canadacentral-01.azurewebsites.net/api/v1"

/**
 * The ceiling for a call that has not thought about its own.
 *
 * Short on purpose: most of this API is a handful of database reads, and a
 * request still running after half a minute is a request in trouble. Anything
 * that legitimately takes longer — a render, a model call, a screen that reads
 * a whole assembled report — sets its own and says why. A call that inherits
 * this one has not made a decision, and "timeout of 30000ms exceeded" in front
 * of a user is what that looks like.
 */
export const DEFAULT_TIMEOUT_MS = 30000

/**
 * The shape every rejected apiClient call arrives in.
 *
 * `code` is the load-bearing field. Screens that must tell one failure from
 * another — a kickoff that timed out is not a kickoff that failed, because the
 * backend is probably still generating and submitting again would duplicate it
 * — branch on this, never on `message`. `message` is written for a person and
 * is free to change wording; it was changed once, and two kickoff guards that
 * regex-matched it silently stopped firing.
 */
export interface ApiError {
  /** Backend error slug, or TIMEOUT / NETWORK / UNKNOWN_ERROR when there was no response. */
  error: string
  /** Human-readable. For display only — never branch on it. */
  message: string
  /** HTTP status, absent when the request never got a response. */
  status?: number
  /** Axios's own code: ECONNABORTED, ETIMEDOUT, ERR_NETWORK, ERR_BAD_REQUEST… */
  code: string | null
  details?: unknown
}

/**
 * True when the client gave up waiting, rather than the server saying no.
 *
 * The `message` fallback is deliberate. An error that never passed through the
 * interceptor below (a raw axios reject from a call made another way) still has
 * to be recognised, and for a kickoff the safe direction is to treat an unknown
 * failure as "it may have gone through" — locking the form — rather than
 * re-enabling a button that fires a second one.
 */
export function isTimeoutError(err: unknown): boolean {
  const e = err as Partial<ApiError> & { message?: unknown }
  if (e?.code === "ECONNABORTED" || e?.code === "ETIMEDOUT") return true
  if (e?.error === "TIMEOUT") return true
  return typeof e?.message === "string" && /timeout|ECONNABORTED/i.test(e.message)
}

/**
 * True when this session may no longer touch what it asked for.
 *
 * Single-sourced because two places act on it and they must not drift: the
 * query client refuses to retry these (no amount of retrying fixes a revoked
 * session), and a screen holding a stale payload must stop pretending it still
 * works.
 */
export function isAuthError(err: unknown): boolean {
  const status = (err as Partial<ApiError> | undefined)?.status
  return status === 401 || status === 403
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: DEFAULT_TIMEOUT_MS,
})

// Request interceptor: attach the Centriyon-issued JWT, and — for Spark staff —
// the company they are acting on. Read fresh per request rather than captured,
// so another tab switching company can't leave this one stale.
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("access_token")
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`
      }
      // Absent for everyone but Spark, so no other user's requests change. The
      // backend ignores it for every role except spark_internal regardless —
      // that check is what stops it being a tenant-isolation hole.
      const company = getActingCompany()
      if (company && config.headers) {
        config.headers["X-Company-Id"] = company
      }
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor:
//   401 → token is invalid/expired. There is no SAR refresh flow any more —
//   bounce the user back to Centriyon login so they can re-authenticate.
//
//   We deliberately do NOT redirect when the failing call is `/auth/me` or
//   `/auth/logout`. `me` runs on mount with whatever happens to be in
//   localStorage; AuthContext.refreshUser handles that cleanly (clears state,
//   lands the user on `/login` which shows the Centriyon info card). Without
//   this exception a stale token would loop the user back to Centriyon before
//   SAR's info page can render.
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const url: string = error.config?.url ?? ""
      const isAuthEndpoint =
        url.includes("/auth/me") || url.includes("/auth/logout")
      if (!isAuthEndpoint) {
        localStorage.removeItem("access_token")
        localStorage.removeItem("refresh_token")
        // Remember the page so login lands back here, not on the role home —
        // an expiry mid-kickoff otherwise loses the PM's place entirely.
        storePostLoginRedirect(window.location.pathname + window.location.search)
        window.location.href = centriyonLoginUrl()
      }
    }

    // Normalize error — supports both {"message":"..."} and FastAPI {"detail":"..."} formats.
    // FastAPI returns detail as an array of { type, loc, msg, input } for 422s; flatten
    // to a string BEFORE the `||` chain so the array never escapes as a message (React
    // would crash trying to render an object child).
    const responseData = error.response?.data
    const detail = responseData?.detail
    const detailMessage = Array.isArray(detail)
      ? detail
          .map((d: { msg?: string; loc?: unknown[] }) =>
            d?.msg
              ? Array.isArray(d.loc) && d.loc.length > 0
                ? `${d.loc.join(".")}: ${d.msg}`
                : d.msg
              : null,
          )
          .filter(Boolean)
          .join("; ")
      : typeof detail === "string"
        ? detail
        : null
    const backendMessage =
      responseData?.message ||
      detailMessage ||
      responseData?.error ||
      null

    // Log full error details for debugging
    // Includes error.code + error.message so network failures (no response object)
    // are diagnosable instead of printing as "{}".
    const fullUrl = error.config?.baseURL && error.config?.url
      ? `${error.config.baseURL}${error.config.url}`
      : (error.config?.url ?? "<unknown>")
    console.error("[API Error]", {
      status: error.response?.status ?? "(no response)",
      code: error.code,                            // e.g. ERR_NETWORK, ERR_BAD_REQUEST, ECONNABORTED
      message: error.message,                      // e.g. "Network Error", "timeout of 30000ms exceeded"
      method: error.config?.method,
      url: fullUrl,
      responseData,
    })

    // Axios describes a timeout as "timeout of 30000ms exceeded" and a dropped
    // connection as "Network Error". Both end up rendered verbatim wherever a
    // screen shows err.message, which is a stack trace pointed at a person who
    // can only wait or retry. Say the thing they can act on instead.
    //
    // REWORDING THIS IS ONLY SAFE BECAUSE `code` CARRIES THE FACT. The friendly
    // sentence shipped once without it, and two screens that decided "was this
    // a timeout?" by matching the old axios wording stopped deciding anything —
    // which on the kickoff screen re-enabled a submit button while the backend
    // was still generating, i.e. a duplicate kickoff. Anything that needs to
    // know what went wrong reads `code` (or isTimeoutError above).
    const isTimeout =
      error.code === "ECONNABORTED" || error.code === "ETIMEDOUT"
    const isOffline = error.code === "ERR_NETWORK"
    const transportMessage = isTimeout
      ? "The server took too long to answer. It may still be busy finishing earlier work — try again in a moment."
      : isOffline
        ? "Could not reach the server. Check your connection and try again."
        : null

    const normalizedError: ApiError = {
      error:
        responseData?.error ||
        responseData?.detail ||
        (isTimeout ? "TIMEOUT" : isOffline ? "NETWORK" : "UNKNOWN_ERROR"),
      message:
        backendMessage ||
        transportMessage ||
        error.message ||
        "An unexpected error occurred",
      status: error.response?.status,
      code: error.code ?? null,
      details: responseData?.details || responseData,
    }

    return Promise.reject(normalizedError)
  }
)

export default apiClient
