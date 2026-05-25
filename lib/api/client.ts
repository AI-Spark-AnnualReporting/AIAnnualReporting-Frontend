import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios"

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://anualreport-hmc4gyfnc9e9emdf.canadacentral-01.azurewebsites.net/api/v1"

let isRefreshing = false
let failedQueue: Array<{
  resolve: (value: string) => void
  reject: (reason: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token!)
    }
  })
  failedQueue = []
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
})

// Request interceptor: attach access token
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

// Response interceptor: handle 401 with token refresh
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean
    }

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/login")
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers["Authorization"] = "Bearer " + token
            }
            return apiClient(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      originalRequest._retry = true
      isRefreshing = true

      const refreshToken =
        typeof window !== "undefined"
          ? localStorage.getItem("refresh_token")
          : null

      if (!refreshToken) {
        isRefreshing = false
        if (typeof window !== "undefined") {
          localStorage.removeItem("access_token")
          localStorage.removeItem("refresh_token")
          window.location.href = "/login"
        }
        return Promise.reject(error)
      }

      try {
        const response = await axios.post(`${BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        })
        const { access_token } = response.data
        localStorage.setItem("access_token", access_token)
        apiClient.defaults.headers.common["Authorization"] = `Bearer ${access_token}`
        processQueue(null, access_token)
        return apiClient(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        localStorage.removeItem("access_token")
        localStorage.removeItem("refresh_token")
        window.location.href = "/login"
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
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
