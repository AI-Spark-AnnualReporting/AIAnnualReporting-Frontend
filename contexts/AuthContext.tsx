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

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  loginWithToken: (token: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const ROLE_ROUTES: Record<UserRole, string> = {
  admin: "/admin",
  project_manager: "/pm",
  hod: "/hod",
  department_user: "/department",
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
    async (token: string) => {
      localStorage.setItem("access_token", token)
      localStorage.removeItem("refresh_token")
      const userData = await authApi.me()
      setUser(userData)
      const dest = ROLE_ROUTES[userData.role] ?? "/login"
      router.push(dest)
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
