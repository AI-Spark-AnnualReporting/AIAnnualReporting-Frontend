"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { getInitials, cn } from "@/lib/utils"
import {
  LayoutGrid,
  MessageSquare,
  BookOpen,
  LogOut,
} from "lucide-react"

const NAV = [
  { href: "/department", label: "My Sessions", icon: LayoutGrid, exact: true },
  { href: "/department/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/department/documents", label: "Document Bank", icon: BookOpen },
]

export function DeptSidebar() {
  const { user, logout } = useAuth()
  const pathname = usePathname()

  if (!user) return null

  function isActive(href: string, exact?: boolean): boolean {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <aside
      data-app-chrome="true"
      className="app-sidebar flex h-full w-64 shrink-0 flex-col bg-gradient-to-b from-indigo-600 to-indigo-800 text-white"
    >
      {/* Brand */}
      <div className="flex h-[72px] items-center gap-3 px-5 shrink-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
          <LayoutGrid className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-base font-bold text-white">Centriton</p>
          <p className="text-xs text-indigo-200">AR Studio</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-indigo-300/80">
          Workspace
        </p>
        <div className="space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href, item.exact)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/15 text-white shadow-sm"
                    : "text-indigo-100/90 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* User card */}
      <div className="border-t border-white/10 p-3 shrink-0">
        <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-fuchsia-500 text-xs font-semibold text-white">
            {getInitials(user.full_name)}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-white">{user.full_name}</p>
            <p className="truncate text-xs text-indigo-200">Department User</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-indigo-200 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
