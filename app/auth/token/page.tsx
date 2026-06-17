"use client"

import { Suspense, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { Loader2 } from "lucide-react"

// Transient handoff: receive the Centriyon JWT from `?token=`, persist it,
// hydrate the user from /auth/me, and bounce to the role home. If anything
// fails we fall back to /login which now shows the Centriyon info card.
function TokenHandler() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { loginWithToken } = useAuth()

  useEffect(() => {
    const token = searchParams.get("token")
    if (!token) {
      router.replace("/login")
      return
    }
    loginWithToken(token).catch(() => router.replace("/login"))
  }, [searchParams, router, loginWithToken])

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
