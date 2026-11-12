"use client"

import { Suspense, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { handoffRefreshTokenFromUrl } from "@/lib/api/session"
import { Loader2 } from "lucide-react"

/** Take the `#…` part out of the address bar before anything else happens. */
function removeHashFromAddressBar(): void {
  window.history.replaceState(null, "", window.location.pathname + window.location.search)
}

// Transient handoff from Centriyon, then bounce to the role home (or `next`).
// If anything fails we fall back to /login, which shows the Centriyon info card.
//
//   New: `#refresh_token=…` — this app's own session. Swapped at once, so the
//        copy left in browser history no longer works.
//   Old: `?token=<JWT>` — a bare access token, from Centriyon builds older than
//        refresh tokens. Remove one release after.
function TokenHandler() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { loginWithToken, loginWithRefreshToken } = useAuth()
  // React runs effects twice in dev. A refresh token works exactly once, so a
  // second swap would be refused and land the user on /login.
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    // Centriyon can name the workspace to open (`next`) and, for Spark staff,
    // the company to act on (`company`). Cross-origin, the URL is the only
    // channel — localStorage on this origin is not reachable from there.
    const opts = {
      next: searchParams.get("next"),
      company: searchParams.get("company"),
      back: searchParams.get("back"),
    }

    const refreshToken = handoffRefreshTokenFromUrl()
    if (refreshToken) {
      removeHashFromAddressBar()
      loginWithRefreshToken(refreshToken, opts).catch(() => router.replace("/login"))
      return
    }

    const token = searchParams.get("token")
    if (token) {
      loginWithToken(token, opts).catch(() => router.replace("/login"))
      return
    }
    router.replace("/login")
  }, [searchParams, router, loginWithToken, loginWithRefreshToken])

  return <SigningIn />
}

function SigningIn() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  )
}

export default function TokenPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Suspense fallback={<SigningIn />}>
        <TokenHandler />
      </Suspense>
    </div>
  )
}
