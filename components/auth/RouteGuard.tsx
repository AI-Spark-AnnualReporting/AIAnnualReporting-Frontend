"use client"

import { Suspense, useEffect } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { UserRole } from "@/types"
import { AuthSkeleton } from "@/components/ui/skeletons"

interface RouteGuardProps {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

// useSearchParams must sit inside a Suspense boundary in Next 16. We wrap the
// inner guard so the outer component can be used anywhere without forcing
// every consumer to add their own Suspense.
export function RouteGuard(props: RouteGuardProps) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <RouteGuardInner {...props} />
    </Suspense>
  )
}

function RouteGuardInner({ children, allowedRoles }: RouteGuardProps) {
  const { user, isLoading, isAuthenticated } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Check localStorage token as a fallback to prevent premature redirects
  // right after login when React state hasn't propagated to the new page yet
  const hasToken =
    typeof window !== "undefined" ? !!localStorage.getItem("access_token") : false

  // Centriton can hand the JWT over via `?token=` on any URL. While the root
  // handler / token landing page is processing it, render the skeleton instead
  // of bouncing the user to /login.
  const tokenInUrl = !!searchParams?.get("token")

  useEffect(() => {
    if (isLoading) return
    if (tokenInUrl) return // let /auth/token finish the handoff

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
  }, [isLoading, isAuthenticated, hasToken, tokenInUrl, user, router, pathname, allowedRoles])

  if (isLoading) return <AuthSkeleton />
  if (tokenInUrl) return <AuthSkeleton />

  // Show skeleton while token exists but user state is still propagating
  if (!isAuthenticated && hasToken) return <AuthSkeleton />

  if (!isAuthenticated) return <AuthSkeleton />

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <AuthSkeleton />
  }

  return <>{children}</>
}
