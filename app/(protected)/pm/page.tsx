"use client"

import { usePMDashboard } from "@/hooks/useSessions"
import { PMStatCard } from "@/components/pm/PMStatCard"
import { EmptyState } from "@/components/ui/empty-state"
import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { SortControl } from "@/components/ui/sort-control"
import { useSort } from "@/hooks/useSort"
import type { SortField } from "@/lib/sort"
import type { PMDashboard as PMDashboardData } from "@/types"
import {
  RefreshCw, ClipboardCheck, ArrowRight, Clock, FileText, CheckCircle2,
} from "lucide-react"
import Link from "next/link"
import { formatDate, cn } from "@/lib/utils"

type PMCycleCard = PMDashboardData["active_cycles"][number]

const SORT_FIELDS: SortField<PMCycleCard>[] = [
  { key: "updated_at", label: "Last Modified", defaultDirection: "desc", type: "date", accessor: (c) => c.updated_at },
  { key: "submission_deadline", label: "Deadline", defaultDirection: "asc", type: "date", accessor: (c) => c.submission_deadline },
  { key: "fiscal_year", label: "Fiscal Year", defaultDirection: "desc", type: "number", accessor: (c) => c.fiscal_year },
]

export default function PMDashboard() {
  const { data, isLoading } = usePMDashboard()
  const sort = useSort(SORT_FIELDS)

  if (isLoading) return <PageLoader />

  const cycles = data?.active_cycles || []
  const sortedCycles = sort.sort(cycles)
  const recentSubmissions = data?.recent_submissions || []
  const pendingReviews = data?.pending_reviews ?? 0

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">PM Dashboard</h1>
        <p className="mt-1.5 text-base text-slate-500">
          Monitor your assigned cycles, review submissions, and generate reports.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-5 md:grid-cols-3">
        <PMStatCard
          title="Assigned Cycles"
          value={cycles.length}
          description="Active reporting cycles"
          icon={RefreshCw}
          accent="indigo"
        />
        <PMStatCard
          title="Pending Reviews"
          value={pendingReviews}
          description="Submissions to review"
          icon={ClipboardCheck}
          accent="amber"
          highlight
          valueClassName="text-amber-500"
        />
        <PMStatCard
          title="Recent Submissions"
          value={recentSubmissions.length}
          description="Latest department submissions"
          icon={FileText}
          accent="green"
        />
      </div>

      {/* Assigned cycles */}
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900">Your Assigned Cycles</h2>
          {cycles.length > 0 && (
            <SortControl fields={SORT_FIELDS} value={sort.state} onSelect={sort.onSelect} />
          )}
        </div>

        {cycles.length === 0 ? (
          <EmptyState
            icon={RefreshCw}
            title="No active cycles assigned"
            description="The admin will assign you to a reporting cycle. Once assigned, you can configure and manage it here."
          />
        ) : (
          <div className="space-y-5">
            {sortedCycles.map((cycle) => {
              const submitted = cycle.submitted_count ?? 0
              const total = cycle.total_departments ?? 0
              const pct = Math.round(cycle.completion_rate ?? 0)
              const notStarted = cycle.not_started_count ?? Math.max(0, total - submitted)
              const inProgress = cycle.in_progress_count ?? Math.max(0, total - submitted - notStarted)
              const complete = pct >= 100

              return (
                <div
                  key={cycle.id}
                  className="rounded-2xl border border-slate-100 bg-white shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="p-6">
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-lg font-bold text-slate-900">{cycle.cycle_name}</h3>
                        <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                          <Clock className="h-4 w-4" />
                          <span>Deadline: {formatDate(cycle.submission_deadline)}</span>
                        </div>
                      </div>
                      <Link href={`/pm/cycles/${cycle.id}`} className="shrink-0">
                        <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
                          Manage <ArrowRight className="ml-1.5 h-4 w-4" />
                        </Button>
                      </Link>
                    </div>

                    {/* Progress */}
                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="text-slate-600">
                          {submitted} of {total} departments submitted
                        </span>
                        <span className={cn("font-semibold", complete ? "text-emerald-600" : "text-slate-900")}>
                          {complete ? "100% complete" : `${pct}%`}
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            complete ? "bg-emerald-500" : "bg-indigo-500"
                          )}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Status footer */}
                  <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100">
                    <StatusCell icon={CheckCircle2} iconClass="text-emerald-500" label="Submitted" value={submitted} />
                    <StatusCell icon={RefreshCw} iconClass="text-indigo-500" label="In Progress" value={inProgress} />
                    <StatusCell icon={Clock} iconClass="text-slate-400" label="Not Started" value={notStarted} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusCell({
  icon: Icon,
  iconClass,
  label,
  value,
}: {
  icon: typeof Clock
  iconClass: string
  label: string
  value: number
}) {
  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className={cn("h-4 w-4", iconClass)} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  )
}
