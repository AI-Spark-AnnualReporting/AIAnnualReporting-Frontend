"use client"

import { useAuth } from "@/contexts/AuthContext"
import { centriyonDashboardUrl, centriyonUrl } from "@/lib/centriyon"
import { getBackUrl } from "@/lib/backUrl"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ArrowLeftRight } from "lucide-react"

/**
 * Only rendered for users whose session says they can also access Centriyon's
 * own dashboard (`user.apps` includes "centriton_dashboard") — most users
 * won't have this. Computed once from the session that's already loaded; no
 * polling. Reuses the same token-in-URL handoff Centriyon uses to send users
 * here, just pointed the other way.
 *
 * Spark staff are the exception. They arrive here to look at a CLIENT's
 * workspace, and "the Centriyon dashboard" for them resolves to that client's
 * Command Center — a page they must never see. So for them this is a way BACK
 * to the cycle page they came from, which the handoff carried in `?back=`.
 *
 * The fallback is load-bearing: with no stored return URL they go to the
 * company directory, never to `/`. The whole point is that no path through this
 * button ends on a client dashboard.
 */
export function BackToCentritonButton({ className }: { className?: string }) {
  const { user } = useAuth()

  if (!user?.apps?.includes("centriton_dashboard")) return null

  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
  const isSpark = user.role === "spark_internal"

  // getBackUrl re-validates the origin on read, so this can't be pointed
  // somewhere else by editing storage.
  const href = isSpark
    ? getBackUrl() ?? centriyonUrl(token, "/companies")
    : centriyonDashboardUrl(token)
  if (!href) return null

  return (
    <a href={href}>
      <Button
        variant="outline"
        size="sm"
        className={cn(
          "gap-1.5 rounded-full border-indigo-100 bg-indigo-50 px-3.5 text-indigo-700 shadow-none hover:bg-indigo-100 hover:text-indigo-800",
          className
        )}
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
        {isSpark ? "Go back" : "Back to Centriton Dashboard"}
      </Button>
    </a>
  )
}
