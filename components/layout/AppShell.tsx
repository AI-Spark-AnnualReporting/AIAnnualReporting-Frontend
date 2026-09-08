"use client"

import { usePathname } from "next/navigation"

import { useAuth } from "@/contexts/AuthContext"
import { Sidebar } from "@/components/layout/Sidebar"
import { TopNav } from "@/components/layout/TopNav"
import { PMSidebar } from "@/components/layout/PMSidebar"
import { PMTopNav } from "@/components/layout/PMTopNav"
import { DeptSidebar } from "@/components/layout/DeptSidebar"
import { DeptTopNav } from "@/components/layout/DeptTopNav"
import { HODSidebar } from "@/components/layout/HODSidebar"

/**
 * Chooses the app shell by role. Project Managers and Department Users get the
 * redesigned "Centriyon" workspace (dark sidebar + light canvas); every other
 * role keeps the original shell untouched.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const pathname = usePathname()

  // Spark staff are the exception to "shell follows role": one role, but they
  // open whichever workspace they were sent to, so for them the shell follows
  // the PATH. Without this they fall through to the legacy shell below and get
  // the department nav on a PM page.
  const effectiveRole =
    user?.role === "spark_internal"
      ? pathname?.startsWith("/pm")
        ? "project_manager"
        : pathname?.startsWith("/hod")
          ? "hod"
          : pathname?.startsWith("/department")
            ? "department_user"
            : user.role
      : user?.role

  if (effectiveRole === "project_manager") {
    return (
      <div className="flex h-screen overflow-hidden bg-[#f2f3fa]">
        <PMSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <PMTopNav />
          <main className="flex-1 overflow-y-auto">
            <div className="px-8 py-8">{children}</div>
          </main>
        </div>
      </div>
    )
  }

  if (effectiveRole === "department_user") {
    return (
      <div className="flex h-screen overflow-hidden bg-[#f2f3fa]">
        <DeptSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <DeptTopNav />
          <main className="flex-1 overflow-y-auto">
            <div className="px-8 py-8">{children}</div>
          </main>
        </div>
      </div>
    )
  }

  if (effectiveRole === "hod") {
    return (
      <div className="flex h-screen overflow-hidden bg-[#f2f3fa]">
        <HODSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <DeptTopNav />
          <main className="flex-1 overflow-y-auto">
            <div className="px-8 py-8">{children}</div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopNav />
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
