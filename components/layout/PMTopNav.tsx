"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/contexts/AuthContext"
import { getInitials } from "@/lib/utils"
import { LogOut, User, KeyRound, ChevronRight } from "lucide-react"
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

// Map the current PM route to a breadcrumb leaf label.
function pageTitle(pathname: string): string {
  if (pathname === "/pm") return "Dashboard"
  if (pathname.startsWith("/pm/cycles")) return "All Cycles"
  if (pathname.startsWith("/pm/reviews")) return "Pending Reviews"
  if (pathname.startsWith("/pm/documents")) return "Document Bank"
  if (pathname.startsWith("/pm/sessions")) return "Review Submission"
  return "Dashboard"
}

export function PMTopNav() {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const { data } = useNotificationsLive()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()

  const allNotifications = data?.notifications ?? []
  const unreadEscalations = allNotifications.filter((n) => n.notification_type === "escalation" && !n.is_read)
  const bannerEscalations = unreadEscalations.filter((n) => !dismissed.has(n.id))

  function handleView(id: string) {
    markRead.mutate(id)
    setDismissed((prev) => new Set([...prev, id]))
  }

  function handleDismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]))
  }

  if (!user) return null

  return (
    <div data-app-chrome="true" className="app-header flex flex-col shrink-0">
      <header className="flex h-[72px] items-center justify-between border-b border-slate-200 bg-white px-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-slate-900">PM Workspace</span>
          <ChevronRight className="h-4 w-4 text-slate-300" />
          <span className="text-slate-500">{pageTitle(pathname)}</span>
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-4">
          <NotificationBell
            notifications={allNotifications}
            onView={handleView}
            markRead={markRead}
            markAllRead={markAllRead}
            className="relative h-10 w-10 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-slate-50">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500 text-xs font-semibold text-white">
                  {getInitials(user.full_name)}
                </div>
                <div className="text-left leading-tight">
                  <p className="text-sm font-semibold text-slate-900">{user.full_name}</p>
                  <p className="text-xs text-slate-500">Project Manager</p>
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
              <DropdownMenuItem asChild>
                <Link href="/profile?tab=password" className="cursor-pointer">
                  <KeyRound className="mr-2 h-4 w-4" />
                  Change Password
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={logout}
                className="cursor-pointer text-red-600 focus:text-red-600"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <EscalationBannerStrip
        escalations={bannerEscalations}
        onView={handleView}
        onDismiss={handleDismiss}
      />
    </div>
  )
}
