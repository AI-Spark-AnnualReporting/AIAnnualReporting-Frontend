"use client"

import { useAuth } from "@/contexts/AuthContext"
import { Sidebar } from "@/components/layout/Sidebar"
import { TopNav } from "@/components/layout/TopNav"
import { PMSidebar } from "@/components/layout/PMSidebar"
import { PMTopNav } from "@/components/layout/PMTopNav"

/**
 * Chooses the app shell by role. Project Managers get the redesigned
 * "Centriton" PM workspace (dark sidebar + light canvas); every other role
 * keeps the original shell untouched.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()

  if (user?.role === "project_manager") {
    return (
      <div className="flex h-screen overflow-hidden bg-[#f5f6fc]">
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
