import axios, {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios"
import { centriyonLoginUrl } from "@/lib/centriyon"

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://anualreport-hmc4gyfnc9e9emdf.canadacentral-01.azurewebsites.net/api/v1"

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
})

// Request interceptor: attach the Centriyon-issued JWT.
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("access_token")
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`
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

    const normalizedError = {
      error: responseData?.error || responseData?.detail || "UNKNOWN_ERROR",
      message: backendMessage || error.message || "An unexpected error occurred",
      status: error.response?.status,
      details: responseData?.details || responseData,
    }

    return Promise.reject(normalizedError)
  }
)

export default apiClient
