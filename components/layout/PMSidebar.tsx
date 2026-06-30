"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { getInitials, cn } from "@/lib/utils"
import {
  LayoutGrid,
  RefreshCw,
  BookOpen,
  LogOut,
} from "lucide-react"

// Reviewing department submissions now belongs to the HOD, so the PM no longer
// has a "Pending Reviews" surface.
const NAV = [
  { href: "/pm", label: "Dashboard", icon: LayoutGrid, exact: true },
  { href: "/pm/cycles", label: "All Cycles", icon: RefreshCw },
  { href: "/pm/documents", label: "Document Bank", icon: BookOpen },
]

export function PMSidebar() {
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
      className="app-sidebar flex h-full w-[210px] shrink-0 flex-col border-r border-white/10 bg-[#3535b5] text-white"
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 pb-3.5 pt-5 shrink-0">
        <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[#4040c8]">
          <LayoutGrid className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-[13px] font-extrabold tracking-[-0.2px] text-white">Centriyon</p>
          <p className="text-[9px] text-white/30">PM Workspace</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <p className="px-4 pb-1.5 pt-3.5 text-[9px] font-bold uppercase tracking-[0.8px] text-white/30">
          Reporting
        </p>
        <div className="space-y-0.5">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href, item.exact)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-[10px] px-3.5 py-2.5 text-[12px] font-medium transition-colors",
                  active
                    ? "bg-[#3d3dc0] font-bold text-white"
                    : "text-white/65 hover:bg-white/10 hover:text-white/90"
                )}
              >
                {active && (
                  <span className="absolute bottom-1 left-0 top-1 w-[3px] rounded-r-[3px] bg-[#4040c8]" />
                )}
                <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-white" : "text-white/60")} />
                <span className="flex-1">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* User card */}
      <div className="mt-auto border-t border-white/10 px-3.5 py-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] font-extrabold text-white ring-2 ring-white/30">
            {getInitials(user.full_name)}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[11px] font-bold text-white/80">{user.full_name}</p>
            <p className="truncate text-[9px] text-white/30">Project Manager</p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white/90"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
