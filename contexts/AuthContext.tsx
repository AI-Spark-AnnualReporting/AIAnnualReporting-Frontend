"use client"

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { User, UserRole } from "@/types"
import { authApi } from "@/lib/api/auth"
import { centriyonLoginUrl } from "@/lib/centriyon"
import {
  clearPostLoginRedirect,
  consumePostLoginRedirect,
  isSafeRedirectPath,
  rememberSignedInUser,
} from "@/lib/postLoginRedirect"
import { clearActingCompany, setActingCompany } from "@/lib/actingCompany"
import { clearBackUrl, setBackUrl } from "@/lib/backUrl"
import { getStoredToken, isStillStoredToken } from "@/lib/storedToken"
import { clearSession, revokeRefreshToken, startSessionFromHandoff } from "@/lib/api/session"

interface HandoffOptions {
  next?: string | null
  company?: string | null
  back?: string | null
}

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  /** Old hand-off: a bare access token in `?token=` (older Centriyon builds). */
  loginWithToken: (token: string, opts?: HandoffOptions) => Promise<void>
  /** New hand-off: this app's own refresh token, from after `#` in the link. */
  loginWithRefreshToken: (refreshToken: string, opts?: HandoffOptions) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const ROLE_ROUTES: Record<UserRole, string> = {
  admin: "/admin",
  project_manager: "/pm",
  hod: "/hod",
  department_user: "/department",
  // Spark staff are sent to a specific workspace by the `next` param on the
  // handoff. This is only the fallback for arriving without one.
  spark_internal: "/pm",
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  const queryClient = useQueryClient()

  // One /auth/me check of the saved session. "failed" = the check couldn't be
  // made (network, timeout, 5xx) — that says nothing about the session itself.
  const checkSavedSession = useCallback(async (): Promise<"done" | "failed"> => {
    // The token this check is about. If a newer sign-in saves another one while
    // /auth/me is in flight (a hand-off tab racing a left-over token), this
    // result is stale either way and must not touch the session — see
    // lib/storedToken.
    const checkedToken = getStoredToken()
    try {
      const userData = await authApi.me()
      if (!isStillStoredToken(checkedToken)) return "done"
      rememberSignedInUser(userData.user_id)
      setUser(userData)
      return "done"
    } catch (err) {
      if (!isStillStoredToken(checkedToken)) return "done"
      // Only a 401 means the session is over — by now the api client has
      // already tried to renew it. A network error, a timeout or a 5xx (the
      // backend answers 503 when its database hiccups) must not sign anyone out.
      const status = (err as { status?: number } | undefined)?.status
      if (status !== 401) return "failed"
      setUser(null)
      clearSession()
      return "done"
    }
  }, [])

  const refreshUser = useCallback(async () => {
    await checkSavedSession()
  }, [checkSavedSession])

  // On start-up, a check that couldn't be made is tried again (after 2, 4 and
  // 6 seconds) instead of signing the user out over a blip. Only if the server
  // stays unreachable does the session go, as it always did.
  const loadSavedSession = useCallback(async () => {
    for (const waitMs of [0, 2000, 4000, 6000]) {
      if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
      if ((await checkSavedSession()) === "done") return
    }
    setUser(null)
    clearSession()
  }, [checkSavedSession])

  useEffect(() => {
    const token = localStorage.getItem("access_token")
    // On the hand-off page the session in the URL is about to replace the
    // saved one, and the login there checks it itself. Checking the saved
    // (old) one here as well can only race it. Decided by the path alone: that
    // page's effect runs BEFORE this one and has already removed the `#…`
    // from the address bar, so looking for the token here would miss it.
    const handingOff = window.location.pathname === "/auth/token"
    if (token && !handingOff) {
      loadSavedSession().finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [loadSavedSession])

  // After the session is saved (either hand-off): hydrate the user and route.
  const finishSignIn = useCallback(
    async (opts?: HandoffOptions) => {
      // Spark accounts carry no company of their own; the backend resolves the
      // one they are acting on from X-Company-Id, which the api client attaches
      // from here. Set it BEFORE /auth/me — that call is company-scoped too.
      if (opts?.company) {
        setActingCompany(opts.company)
      } else {
        clearActingCompany()
      }
      // Stash before the router.replace below destroys the query string. Only a
      // Centriyon-origin URL is kept — see lib/backUrl.
      setBackUrl(opts?.back)
      const userData = await authApi.me()
      // A new sign-in may be a different person (e.g. Spark, then a client
      // PM in the same browser). Drop everything cached for the previous one,
      // or their open pages refetch with this login and fail.
      queryClient.clear()
      rememberSignedInUser(userData.user_id)
      setUser(userData)
      // An explicit destination wins: it is the whole point of the handoff.
      // Otherwise resume a session that expired mid-work, then fall back to the
      // role home. RouteGuard re-routes if the role can't see the page.
      const back = consumePostLoginRedirect(userData.user_id)
      const target = isSafeRedirectPath(opts?.next)
        ? opts.next
        : back ?? ROLE_ROUTES[userData.role] ?? "/login"
      // replace, not push: otherwise /auth/token?token=<JWT> stays one Back
      // press away, and for a super-admin's token that is worth avoiding.
      router.replace(target)
    },
    [router, queryClient]
  )

  // Old Centriyon SSO: a bare access token handed over in `?token=`. It can't
  // renew itself, so the session ends when it expires. Kept for Centriyon
  // builds older than refresh tokens; remove one release after.
  const loginWithToken = useCallback(
    async (token: string, opts?: HandoffOptions) => {
      clearSession()
      localStorage.setItem("access_token", token)
      await finishSignIn(opts)
    },
    [finishSignIn]
  )

  // Centriyon SSO: Centriyon starts a separate session for this app and puts
  // its refresh token after `#` in the link. Swapping it at once gives this
  // tab its own access + refresh token, and kills the copy left in history.
  // A link that can't be swapped (stale, already used) leaves any session
  // already saved here alone — only a successful swap replaces it.
  const loginWithRefreshToken = useCallback(
    async (refreshToken: string, opts?: HandoffOptions) => {
      const started = await startSessionFromHandoff(refreshToken)
      if (!started) throw new Error("This sign-in link has expired or was already used.")
      await finishSignIn(opts)
    },
    [finishSignIn]
  )

  const logout = useCallback(async () => {
    // Ends this session at Centriyon, so the refresh token stops working.
    // First, and fire-and-forget: it must not wait on the SAR call below.
    revokeRefreshToken()
    try {
      await authApi.logout()
    } catch {
      // ignore — local cleanup + Centriyon bounce still happens
    } finally {
      clearSession()
      // Signing out is deliberate — don't resume the last page on next login.
      clearPostLoginRedirect()
      // Otherwise the next person on this browser inherits a Spark session's
      // company and silently sends it on every request.
      clearActingCompany()
      clearBackUrl()
      setUser(null)
      window.location.href = centriyonLoginUrl()
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        loginWithToken,
        loginWithRefreshToken,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
