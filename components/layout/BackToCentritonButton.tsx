"use client"

import { useAuth } from "@/contexts/AuthContext"
import { centriyonDashboardUrl } from "@/lib/centriyon"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ArrowLeftRight } from "lucide-react"

/**
 * Only rendered for users whose session says they can also access Centriyon's
 * own dashboard (`user.apps` includes "centriton_dashboard") — most users
 * won't have this. Computed once from the session that's already loaded; no
 * polling. Reuses the same token-in-URL handoff Centriyon uses to send users
 * here, just pointed the other way.
 */
export function BackToCentritonButton({ className }: { className?: string }) {
  const { user } = useAuth()

  if (!user?.apps?.includes("centriton_dashboard")) return null

  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
  const href = centriyonDashboardUrl(token)
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
        Back to Centriton Dashboard
      </Button>
    </a>
  )
}
