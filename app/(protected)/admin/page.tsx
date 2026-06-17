"use client"

import { useUserStats } from "@/hooks/useUsers"
import { useCycles, useCycleOverview } from "@/hooks/useCycles"
import { useDepartments } from "@/hooks/useDepartments"
import { Cycle } from "@/types"
import { PageHeader } from "@/components/ui/page-header"
import { StatsCard } from "@/components/ui/stats-card"
import { StatusBadge } from "@/components/ui/status-badge"
import { Progress } from "@/components/ui/progress"
import { PageLoader } from "@/components/ui/spinner"
import {
  Users, Building2, RefreshCw, Activity, Clock,
  UserCheck, AlertCircle, ChevronRight, Plus, TrendingUp, Shield,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { formatDate } from "@/lib/utils"

export default function AdminDashboard() {
  const { data: statsData, isLoading: statsLoading } = useUserStats()
  const { data: cyclesData } = useCycles()
  const { data: deptsData } = useDepartments()

  if (statsLoading) return <PageLoader />

  const stats = statsData
  const allCycles = cyclesData?.cycles || []
  const activeCycles = allCycles.filter((c) => c.status === "active")
const pendingUsers = stats?.pending_users ?? 0

  return (
    <div className="space-y-8">
      <PageHeader
        title="Admin Dashboard"
        description="Overview of your organization's annual report system"
        action={
          <Link href="/admin/cycles/new">
            <Button><Plus className="mr-2 h-4 w-4" />New Cycle</Button>
          </Link>
        }
      />

      {/* Requires Attention Banner */}
      {pendingUsers > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <p className="text-sm font-semibold text-amber-800">Requires Your Attention</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/users">
              <div className="flex items-center gap-2 rounded-lg bg-white border border-amber-200 px-4 py-2.5 hover:bg-amber-50 transition-colors cursor-pointer">
                <UserCheck className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">
                  {pendingUsers} user{pendingUsers !== 1 ? "s" : ""} awaiting activation
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-amber-500" />
              </div>
            </Link>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="Total Users" value={stats?.total_users ?? 0} description={`${stats?.active_users ?? 0} active users`} icon={Users} />
        <StatsCard title="Pending Activation" value={pendingUsers} description="Awaiting admin approval" icon={Clock} />
        <StatsCard title="Departments" value={deptsData?.total ?? 0} description="Registered departments" icon={Building2} />
        <StatsCard title="Active Cycles" value={activeCycles.length} description="In-progress report cycles" icon={Activity} />
      </div>

      {/* User Role Breakdown */}
      <div className="rounded-xl border bg-card">
        <div className="px-6 py-4 border-b flex items-center gap-2">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">User Roles Breakdown</h2>
        </div>
        <div className="grid grid-cols-3 divide-x">
          <div className="p-5 text-center">
            <p className="text-3xl font-bold text-primary">{stats?.by_role?.admin ?? 0}</p>
            <p className="text-sm text-muted-foreground mt-1">Admins</p>
          </div>
          <div className="p-5 text-center">
            <p className="text-3xl font-bold text-blue-600">{stats?.by_role?.project_manager ?? 0}</p>
            <p className="text-sm text-muted-foreground mt-1">Project Managers</p>
          </div>
          <div className="p-5 text-center">
            <p className="text-3xl font-bold text-green-600">{stats?.by_role?.department_user ?? 0}</p>
            <p className="text-sm text-muted-foreground mt-1">Department Users</p>
          </div>
        </div>
      </div>

      {/* Active Cycles */}
      {activeCycles.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Active Cycles</h2>
            </div>
            <Link href="/admin/cycles">
              <Button variant="ghost" size="sm" className="text-primary">
                View all <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
          <div className="divide-y">
            {activeCycles.map((cycle) => (
              <ActiveCycleRow key={cycle.id} cycle={cycle} />
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="font-semibold mb-3">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Link href="/admin/departments" className="group rounded-xl border bg-card p-5 hover:border-primary/50 hover:shadow-sm transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="rounded-lg bg-blue-50 p-2.5"><Building2 className="h-5 w-5 text-blue-600" /></div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="font-medium">Manage Departments</p>
            <p className="text-sm text-muted-foreground mt-1">Create departments — each becomes an AI-reporting agent</p>
            <p className="text-xs text-primary mt-2 font-medium">{deptsData?.total ?? 0} departments registered</p>
          </Link>
          <Link href="/admin/users" className="group rounded-xl border bg-card p-5 hover:border-primary/50 hover:shadow-sm transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="rounded-lg bg-purple-50 p-2.5"><Users className="h-5 w-5 text-purple-600" /></div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="font-medium">Manage Users</p>
            <p className="text-sm text-muted-foreground mt-1">Create PM accounts, department users and assign roles</p>
            <p className="text-xs mt-2 font-medium">
              <span className="text-primary">{stats?.total_users ?? 0} total users</span>
              {pendingUsers > 0 && <span className="text-amber-600 ml-1">· {pendingUsers} pending</span>}
            </p>
          </Link>
          <Link href="/admin/cycles/new" className="group rounded-xl border bg-card p-5 hover:border-primary/50 hover:shadow-sm transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="rounded-lg bg-green-50 p-2.5"><RefreshCw className="h-5 w-5 text-green-600" /></div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <p className="font-medium">New Reporting Cycle</p>
            <p className="text-sm text-muted-foreground mt-1">Start a cycle and assign a PM to configure it</p>
            <p className="text-xs text-primary mt-2 font-medium">{allCycles.length} total cycles</p>
          </Link>
        </div>
      </div>
    </div>
  )
}

/**
 * One row in the "Active Cycles" widget. The /admin/cycles list endpoint does
 * not populate per-cycle session counts, so we read them from the accurate
 * /admin/cycles/{id}/overview endpoint (the same source the cycle-detail page
 * uses). Falls back to the raw list counts while the overview is loading.
 */
function ActiveCycleRow({ cycle }: { cycle: Cycle }) {
  const { data: overview } = useCycleOverview(cycle.id)
  const stats = overview?.stats

  const total = stats?.total_departments ?? cycle.total_departments ?? 0
  // "Submitted" includes approved departments — an approved one was submitted too.
  const submitted = stats
    ? stats.submitted + stats.approved
    : cycle.submitted_count ?? 0
  const pct = total > 0 ? Math.round((submitted / total) * 100) : 0
  const isLow = pct < 30
  const isMid = pct >= 30 && pct < 70

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-medium">{cycle.cycle_name}</p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-muted-foreground">Deadline: {formatDate(cycle.submission_deadline)}</span>
            {cycle.pm_name && <span className="text-xs text-muted-foreground">· PM: {cycle.pm_name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={cycle.status} variant="cycle" />
          <Link href={`/admin/cycles/${cycle.id}`}><Button variant="outline" size="sm">View</Button></Link>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-muted-foreground">{submitted} of {total} departments submitted</span>
          <span className={isLow ? "text-red-600 font-semibold" : isMid ? "text-amber-600 font-semibold" : "text-green-600 font-semibold"}>{pct}%</span>
        </div>
        <Progress value={pct} className={isLow ? "[&>div]:bg-red-500 h-2" : isMid ? "[&>div]:bg-amber-500 h-2" : "[&>div]:bg-green-500 h-2"} />
      </div>
    </div>
  )
}
