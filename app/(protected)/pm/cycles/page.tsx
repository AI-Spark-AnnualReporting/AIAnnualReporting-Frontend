"use client"

import { useState } from "react"
import { usePMDashboard } from "@/hooks/useSessions"
import { PMStatCard } from "@/components/pm/PMStatCard"
import { Button } from "@/components/ui/button"
import { CYCLE_STATUSES } from "@/lib/constants"
import { CycleStatus } from "@/types"
import { cn, formatDate } from "@/lib/utils"
import { RefreshCw, Clock, ArrowRight, CheckCircle2, AlertCircle, ClipboardCheck, Info } from "lucide-react"
import Link from "next/link"

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

// Soft status pill with a leading dot, matching the redesign.
const STATUS_PILL: Record<string, { text: string; dot: string }> = {
  draft: { text: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
  active: { text: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  completed: { text: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  archived: { text: "bg-amber-50 text-amber-700", dot: "bg-amber-500" },
  closed: { text: "bg-red-50 text-red-700", dot: "bg-red-500" },
}

function CycleStatusPill({ status }: { status: CycleStatus }) {
  const style = STATUS_PILL[status] ?? STATUS_PILL.draft
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", style.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} />
      {CYCLE_STATUSES[status]?.label ?? status}
    </span>
  )
}

export default function PMCyclesPage() {
  const { data, isLoading, isError, error } = usePMDashboard()
  const [filter, setFilter] = useState<StatusFilter>("all")

  const rawData = data as Record<string, unknown> | undefined
  const allCycles = ((rawData?.active_cycles || rawData?.cycles || []) as PMCycle[])

  const visibleCycles =
    filter === "all" ? allCycles : allCycles.filter((c) => c.status === filter)

  const countFor = (f: StatusFilter) =>
    f === "all" ? allCycles.length : allCycles.filter((c) => c.status === f).length

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">All Cycles</h1>
        <p className="mt-1.5 text-base text-slate-500">
          Every reporting cycle assigned to you — filter by status.
        </p>
      </div>

      {/* API error banner */}
      {isError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="text-sm text-red-700">
            <p className="font-medium">Could not load dashboard data</p>
            <p className="mt-0.5 text-xs opacity-80">
              {(error as { message?: string })?.message || "Unexpected error from server"}
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-5 md:grid-cols-3">
        <PMStatCard
          title="Total Cycles"
          value={allCycles.length}
          description="All cycles assigned to you"
          icon={RefreshCw}
          accent="indigo"
        />
        <PMStatCard
          title="Pending Reviews"
          value={(rawData?.pending_reviews as number) ?? 0}
          description="Submissions awaiting your review"
          icon={ClipboardCheck}
          accent="amber"
          highlight
          valueClassName="text-amber-500"
        />
        <PMStatCard
          title="Departments on Track"
          value={allCycles.reduce((sum, c) => sum + (c.submitted_count ?? 0), 0)}
          description="Total submissions across all cycles"
          icon={CheckCircle2}
          accent="green"
        />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.value
          const count = countFor(f.value)
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-white"
              )}
            >
              <span>{f.label}</span>
              <span
                className={cn(
                  "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
                  active ? "bg-white/20 text-white" : "bg-slate-200/70 text-slate-600"
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-slate-100 bg-white" />
          ))}
        </div>
      ) : allCycles.length === 0 ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <div className="space-y-1 text-sm text-blue-700">
              <p className="font-semibold text-blue-800">No cycles assigned to you</p>
              <p>Cycles appear here once an <strong>admin</strong> has:</p>
              <ol className="ml-4 list-decimal space-y-0.5">
                <li>Created a cycle and assigned you as Project Manager</li>
                <li>Assigned departments &amp; responsible users to the cycle</li>
                <li>Clicked <strong>Activate</strong> — this creates department sessions</li>
              </ol>
            </div>
          </div>
        </div>
      ) : visibleCycles.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm text-slate-500">
          No cycles in the{" "}
          <span className="font-medium">{FILTERS.find((f) => f.value === filter)?.label}</span> status.
        </div>
      ) : (
        <div className="space-y-5">
          {visibleCycles.map((cycle) => {
            const pct = Math.round(cycle.completion_rate ?? 0)
            const isLate = cycle.status === "active" && pct < 50

            return (
              <div key={cycle.id} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-lg font-bold text-slate-900">{cycle.cycle_name}</h3>
                      <CycleStatusPill status={cycle.status ?? "draft"} />
                    </div>
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

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      {cycle.submitted_count ?? 0} of {cycle.total_departments ?? 0} departments submitted
                    </span>
                    <span className="font-semibold text-slate-900">{pct}%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn("h-full rounded-full transition-all", isLate ? "bg-amber-500" : "bg-indigo-500")}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>

                {isLate && (
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
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
