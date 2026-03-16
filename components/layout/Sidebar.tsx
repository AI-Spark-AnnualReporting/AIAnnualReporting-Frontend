"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/contexts/AuthContext"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Users,
  Building2,
  RefreshCw,
  FileText,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ClipboardCheck,
  BookOpen,
  PanelLeftOpen,
} from "lucide-react"
import { useState, useEffect } from "react"

const ADMIN_NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/departments", label: "Departments", icon: Building2 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/cycles", label: "Cycles", icon: RefreshCw },
  { type: "divider" as const },
  { href: "/admin/documents", label: "Knowledge Base", icon: BookOpen },
]

const PM_NAV = [
  { href: "/pm", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/pm/cycles", label: "Active Cycles", icon: RefreshCw },
  { href: "/pm/reviews", label: "Pending Reviews", icon: ClipboardCheck },
  { type: "divider" as const },
  { href: "/pm/documents", label: "Knowledge Base", icon: BookOpen },
]

const DEPT_NAV = [
  { href: "/department", label: "My Sessions", icon: LayoutDashboard, exact: true },
  { type: "divider" as const },
  { href: "/department/documents", label: "Knowledge Base", icon: BookOpen },
]

type NavItem =
  | { href: string; label: string; icon: React.ElementType; exact?: boolean; type?: never }
  | { type: "divider"; href?: never; label?: never; icon?: never; exact?: never }

function getNav(role: string): NavItem[] {
  if (role === "admin") return ADMIN_NAV as NavItem[]
  if (role === "project_manager") return PM_NAV as NavItem[]
  return DEPT_NAV as NavItem[]
}

export function Sidebar() {
  const { user } = useAuth()
  const pathname = usePathname()

  // 3 states: "expanded" | "icons" | "hidden"
  // Department users start in "icons" mode to give more horizontal space
  const [mode, setMode] = useState<"expanded" | "icons" | "hidden">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sidebar-mode") as "expanded" | "icons" | "hidden" | null
      if (saved) return saved
    }
    return "expanded"
  })

  // Persist mode to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("sidebar-mode", mode)
  }, [mode])

  // Listen for external toggle requests (e.g. from the session workspace)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ mode: "expanded" | "icons" | "hidden" }>).detail
      if (detail?.mode) setMode(detail.mode)
    }
    window.addEventListener("sidebar-set-mode", handler)
    return () => window.removeEventListener("sidebar-set-mode", handler)
  }, [])

  if (!user) return null

  const navItems = getNav(user.role)

  function isActive(item: NavItem): boolean {
    if (!("href" in item) || !item.href) return false
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  const cycle = () => {
    if (mode === "expanded") setMode("icons")
    else if (mode === "icons") setMode("hidden")
    else setMode("expanded")
  }

  // When hidden — show only a floating sliver button to re-open
  if (mode === "hidden") {
    return (
      <button
        onClick={() => setMode("expanded")}
        title="Open navigation"
        className="flex h-full w-6 shrink-0 flex-col items-center justify-center border-r bg-card hover:bg-accent transition-colors group"
      >
        <PanelLeftOpen className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
      </button>
    )
  }

  const collapsed = mode === "icons"

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r bg-card transition-all duration-200",
        collapsed ? "w-14" : "w-64"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex h-16 items-center border-b px-4 gap-3 shrink-0",
        collapsed && "justify-center px-0"
      )}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-sm text-foreground leading-tight">
            Spark AR<br />
            <span className="text-xs font-normal text-muted-foreground">AI Studio</span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {navItems.map((item, idx) => {
          if (item.type === "divider") {
            return <div key={idx} className="my-2 border-t mx-1" />
          }

          const Icon = item.icon!
          const active = isActive(item)

          return (
            <Link
              key={item.href}
              href={item.href!}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                active
                  ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                  : "text-muted-foreground",
                collapsed && "justify-center px-0 w-10 mx-auto"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Collapse / expand toggle */}
      <div className="border-t p-2 shrink-0">
        <button
          onClick={cycle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            collapsed && "justify-center px-0 w-10 mx-auto"
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
