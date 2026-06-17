"use client"

import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { getInitials } from "@/lib/utils"
import { USER_ROLES } from "@/lib/constants"
import {
  Bell, LogOut, User, Check, CheckCheck,
  AlertTriangle, X, ExternalLink,KeyRound
} from "lucide-react"
import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  useNotificationsLive,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "@/hooks/useNotifications"
import { NotificationBell, EscalationBannerStrip } from "@/components/layout/notifications"

// ── TopNav ────────────────────────────────────────────────────────────────────

export function TopNav() {
  const { user, logout } = useAuth()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const { data } = useNotificationsLive()
  const markRead    = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()

  const allNotifications   = data?.notifications ?? []
  const unreadEscalations  = allNotifications.filter((n) => n.notification_type === "escalation" && !n.is_read)
  const bannerEscalations  = unreadEscalations.filter((n) => !dismissed.has(n.id))

  function handleView(id: string) {
    markRead.mutate(id)
    setDismissed((prev) => new Set([...prev, id]))
  }

  function handleDismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]))
  }

  if (!user) return null

  const roleLabel = USER_ROLES[user.role as keyof typeof USER_ROLES]?.label || user.role

  return (
    <div className="flex flex-col shrink-0">
      <header className="flex h-16 items-center justify-between border-b bg-card px-6">
        <div />
        <div className="flex items-center gap-3">
          <NotificationBell
            notifications={allNotifications}
            onView={handleView}
            markRead={markRead}
            markAllRead={markAllRead}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {getInitials(user.full_name)}
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground leading-tight">{user.full_name}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium">{user.full_name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile" className="cursor-pointer">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={logout}
                className="text-red-600 focus:text-red-600 cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Escalation banners — below the nav bar, above page content */}
      <EscalationBannerStrip
        escalations={bannerEscalations}
        onView={handleView}
        onDismiss={handleDismiss}
      />
    </div>
  )
}
