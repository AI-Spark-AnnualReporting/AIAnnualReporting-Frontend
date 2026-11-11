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

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  loginWithToken: (
    token: string,
    opts?: {
      next?: string | null
      company?: string | null
      back?: string | null
    }
  ) => Promise<void>
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

  const refreshUser = useCallback(async () => {
    // The token this check is about. If a newer sign-in saves another one while
    // /auth/me is in flight (a hand-off tab racing a left-over token), this
    // result is stale either way and must not touch the session — see
    // lib/storedToken.
    const checkedToken = getStoredToken()
    try {
      const userData = await authApi.me()
      if (!isStillStoredToken(checkedToken)) return
      rememberSignedInUser(userData.user_id)
      setUser(userData)
    } catch {
      if (!isStillStoredToken(checkedToken)) return
      setUser(null)
      localStorage.removeItem("access_token")
      localStorage.removeItem("refresh_token")
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem("access_token")
    // On the hand-off page the token in the URL is about to replace the saved
    // one, and loginWithToken checks it itself. Checking the saved (old) one
    // here as well can only race it.
    const handingOff =
      window.location.pathname === "/auth/token" &&
      new URLSearchParams(window.location.search).has("token")
    if (token && !handingOff) {
      refreshUser().finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [refreshUser])

  // Centriyon SSO: the JWT is minted by Centriyon and handed to SAR via
  // `?token=` on the root URL. We persist it, hydrate the user, and route to
  // their role home. There's no SAR-issued refresh token any more.
  const loginWithToken = useCallback(
    async (
      token: string,
      opts?: {
        next?: string | null
        company?: string | null
        back?: string | null
      }
    ) => {
      localStorage.setItem("access_token", token)
      localStorage.removeItem("refresh_token")
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

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // ignore — local cleanup + Centriyon bounce still happens
    } finally {
      localStorage.removeItem("access_token")
      localStorage.removeItem("refresh_token")
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
