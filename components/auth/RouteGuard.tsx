"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { UserRole } from "@/types"
import { AuthSkeleton } from "@/components/ui/skeletons"

interface RouteGuardProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export function RouteGuard({ children, allowedRoles }: RouteGuardProps) {
  const { user, isLoading, isAuthenticated } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  // Check localStorage token as a fallback to prevent premature redirects
  // right after login when React state hasn't propagated to the new page yet
  const hasToken =
    typeof window !== "undefined" ? !!localStorage.getItem("access_token") : false

  useEffect(() => {
    if (isLoading) return

    // Only redirect if no token exists at all — not when token exists but user
    // state is still hydrating (avoids bouncing back to /login after login)
    if (!isAuthenticated && !hasToken) {
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`)
      return
    }

    if (isAuthenticated && allowedRoles && user && !allowedRoles.includes(user.role)) {
      const roleRoutes: Record<UserRole, string> = {
        admin: "/admin",
        project_manager: "/pm",
        department_user: "/department",
      }
      router.push(roleRoutes[user.role])
    }
  }, [isLoading, isAuthenticated, hasToken, user, router, pathname, allowedRoles])

  if (isLoading) return <AuthSkeleton />

  // Show skeleton while token exists but user state is still propagating
  if (!isAuthenticated && hasToken) return <AuthSkeleton />

  if (!isAuthenticated) return <AuthSkeleton />

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <AuthSkeleton />
  }

  return <>{children}</>
}
