"use client"

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react"
import { useRouter } from "next/navigation"
import { User, UserRole } from "@/types"
import { authApi } from "@/lib/api/auth"
import { centriyonLoginUrl } from "@/lib/centriyon"
import {
  clearPostLoginRedirect,
  consumePostLoginRedirect,
  isSafeRedirectPath,
} from "@/lib/postLoginRedirect"
import { clearActingCompany, setActingCompany } from "@/lib/actingCompany"
import { clearBackUrl, setBackUrl } from "@/lib/backUrl"

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

  const refreshUser = useCallback(async () => {
    try {
      const userData = await authApi.me()
      setUser(userData)
    } catch {
      setUser(null)
      localStorage.removeItem("access_token")
      localStorage.removeItem("refresh_token")
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (token) {
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
      setUser(userData)
      // An explicit destination wins: it is the whole point of the handoff.
      // Otherwise resume a session that expired mid-work, then fall back to the
      // role home. RouteGuard re-routes if the role can't see the page.
      const back = consumePostLoginRedirect()
      const target = isSafeRedirectPath(opts?.next)
        ? opts.next
        : back ?? ROLE_ROUTES[userData.role] ?? "/login"
      // replace, not push: otherwise /auth/token?token=<JWT> stays one Back
      // press away, and for a super-admin's token that is worth avoiding.
      router.replace(target)
    },
    [router]
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
