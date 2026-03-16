"use client"

import { usePMDashboard } from "@/hooks/useSessions"
import { PageHeader } from "@/components/ui/page-header"
import { StatsCard } from "@/components/ui/stats-card"
import { Progress } from "@/components/ui/progress"
import { StatusBadge } from "@/components/ui/status-badge"
import { PageSkeleton } from "@/components/ui/skeletons"
import { Button } from "@/components/ui/button"
import { RefreshCw, Clock, ArrowRight, CheckCircle2, AlertCircle, Info } from "lucide-react"
import Link from "next/link"
import { formatDate } from "@/lib/utils"

export default function PMCyclesPage() {
  const { data, isLoading, isError, error } = usePMDashboard()

  if (isLoading) return <PageSkeleton />

  // Support both active_cycles (standard) and cycles (alternate key some backends use)
  const rawData = data as Record<string, unknown> | undefined
  const cycles = (
    rawData?.active_cycles ||
    rawData?.cycles ||
    []
  ) as {
    id: string
    cycle_name: string
    submission_deadline: string
    total_departments?: number
    submitted_count?: number
    completion_rate?: number
  }[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Active Cycles"
        description="Monitor all active reporting cycles and their progress"
      />

      {/* API error banner */}
      {isError && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <div className="text-sm text-destructive">
            <p className="font-medium">Could not load dashboard data</p>
            <p className="text-xs mt-0.5 opacity-80">
              {(error as { message?: string })?.message || "Unexpected error from server"}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="Total Active"
          value={cycles.length}
          description="Cycles currently in progress"
          icon={RefreshCw}
        />
        <StatsCard
          title="Pending Reviews"
          value={rawData?.pending_reviews as number ?? 0}
          description="Submissions awaiting your review"
          icon={AlertCircle}
        />
        <StatsCard
          title="Departments on Track"
          value={cycles.reduce((sum, c) => sum + (c.submitted_count ?? 0), 0)}
          description="Total submissions across all cycles"
          icon={CheckCircle2}
        />
      </div>

      {cycles.length === 0 ? (
        <div className="space-y-4">
          {/* Helpful explanation for why cycles might not appear */}
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700 space-y-1">
                <p className="font-semibold text-blue-800">No active cycles assigned to you</p>
                <p>Cycles appear here once an <strong>admin</strong> has:</p>
                <ol className="list-decimal ml-4 space-y-0.5 text-blue-700">
                  <li>Created a cycle and assigned you as Project Manager</li>
                  <li>Assigned departments &amp; responsible users to the cycle</li>
                  <li>Clicked <strong>Activate</strong> — this creates department sessions</li>
                </ol>
                <p className="mt-2">
                  If you have been assigned to a cycle but still see this page, the cycle may still
                  be in <strong>Draft</strong> status. Ask your admin to complete the activation.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {cycles.map((cycle) => {
            const completionRate = cycle.completion_rate ?? 0
            const isLate = completionRate < 50

            return (
              <div
                key={cycle.id}
                className="rounded-xl border bg-card p-6 space-y-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{cycle.cycle_name}</h3>
                      <StatusBadge status="active" variant="cycle" />
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Deadline: {formatDate(cycle.submission_deadline)}
                      </span>
                    </div>
                  </div>
                  <Link href={`/pm/cycles/${cycle.id}`} className="shrink-0">
                    <Button size="sm">
                      Manage <ArrowRight className="ml-2 h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {cycle.submitted_count ?? 0} of {cycle.total_departments ?? 0} departments submitted
                    </span>
                    <span className={isLate ? "text-destructive font-medium" : "font-medium"}>
                      {completionRate.toFixed(0)}%
                    </span>
                  </div>
                  <Progress
                    value={completionRate}
                    className={isLate ? "[&>div]:bg-destructive h-2" : "h-2"}
                  />
                </div>

                {isLate && (
                  <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Low submission rate — consider sending reminders
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
