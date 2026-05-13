"use client"

import { useState } from "react"
import { usePMDashboard } from "@/hooks/useSessions"
import { PageHeader } from "@/components/ui/page-header"
import { StatsCard } from "@/components/ui/stats-card"
import { Progress } from "@/components/ui/progress"
import { StatusBadge } from "@/components/ui/status-badge"
import { PageSkeleton } from "@/components/ui/skeletons"
import { Button } from "@/components/ui/button"
import { CYCLE_STATUSES } from "@/lib/constants"
import { CycleStatus } from "@/types"
import { cn } from "@/lib/utils"
import { RefreshCw, Clock, ArrowRight, CheckCircle2, AlertCircle, Info } from "lucide-react"
import Link from "next/link"
import { formatDate } from "@/lib/utils"

type StatusFilter = "all" | CycleStatus

interface PMCycle {
  id: string
  cycle_name: string
  submission_deadline: string
  status?: CycleStatus
  total_departments?: number
  submitted_count?: number
  completion_rate?: number
}

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: CYCLE_STATUSES.draft.label },
  { value: "active", label: CYCLE_STATUSES.active.label },
  { value: "completed", label: CYCLE_STATUSES.completed.label },
  { value: "archived", label: CYCLE_STATUSES.archived.label },
  { value: "closed", label: CYCLE_STATUSES.closed.label },
]

export default function PMCyclesPage() {
  const { data, isLoading, isError, error } = usePMDashboard()
  const [filter, setFilter] = useState<StatusFilter>("all")

  if (isLoading) return <PageSkeleton />

  // Support both active_cycles (standard) and cycles (alternate key some backends use)
  const rawData = data as Record<string, unknown> | undefined
  const allCycles = ((rawData?.active_cycles || rawData?.cycles || []) as PMCycle[])

  const visibleCycles =
    filter === "all" ? allCycles : allCycles.filter((c) => c.status === filter)

  // Counts per status for the filter chips
  const countFor = (f: StatusFilter) =>
    f === "all" ? allCycles.length : allCycles.filter((c) => c.status === f).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Cycles"
        description="Every reporting cycle assigned to you — filter by status"
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
          title="Total Cycles"
          value={allCycles.length}
          description="All cycles assigned to you"
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
          value={allCycles.reduce((sum, c) => sum + (c.submitted_count ?? 0), 0)}
          description="Total submissions across all cycles"
          icon={CheckCircle2}
        />
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2 border-b pb-3">
        {FILTERS.map((f) => {
          const active = filter === f.value
          const count = countFor(f.value)
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors border",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground hover:text-foreground hover:bg-accent border-border"
              )}
            >
              <span>{f.label}</span>
              <span
                className={cn(
                  "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold min-w-5",
                  active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {allCycles.length === 0 ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700 space-y-1">
                <p className="font-semibold text-blue-800">No cycles assigned to you</p>
                <p>Cycles appear here once an <strong>admin</strong> has:</p>
                <ol className="list-decimal ml-4 space-y-0.5 text-blue-700">
                  <li>Created a cycle and assigned you as Project Manager</li>
                  <li>Assigned departments &amp; responsible users to the cycle</li>
                  <li>Clicked <strong>Activate</strong> — this creates department sessions</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      ) : visibleCycles.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          No cycles in the <span className="font-medium">{FILTERS.find((f) => f.value === filter)?.label}</span> status.
        </div>
      ) : (
        <div className="space-y-4">
          {visibleCycles.map((cycle) => {
            const completionRate = cycle.completion_rate ?? 0
            const isLate = (cycle.status === "active") && completionRate < 50

            return (
              <div
                key={cycle.id}
                className="rounded-xl border bg-card p-6 space-y-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{cycle.cycle_name}</h3>
                      <StatusBadge status={cycle.status ?? "draft"} variant="cycle" />
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
