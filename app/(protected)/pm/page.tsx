"use client"

import { usePMDashboard } from "@/hooks/useSessions"
import { PageHeader } from "@/components/ui/page-header"
import { StatsCard } from "@/components/ui/stats-card"
import { Progress } from "@/components/ui/progress"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { PageSkeleton } from "@/components/ui/skeletons"
import { Button } from "@/components/ui/button"
import {
  RefreshCw, ClipboardCheck, ArrowRight, Clock, FileText,
  CheckCircle2, AlertTriangle, BookOpen,
} from "lucide-react"
import Link from "next/link"
import { formatDate, formatDateTime } from "@/lib/utils"

export default function PMDashboard() {
  const { data, isLoading } = usePMDashboard()

  if (isLoading) return <PageSkeleton />

  const cycles = data?.active_cycles || []
  const recentSubmissions = data?.recent_submissions || []
  const pendingReviews = data?.pending_reviews ?? 0

  return (
    <div className="space-y-8">
      <PageHeader
        title="PM Dashboard"
        description="Monitor your assigned cycles, review submissions, and generate reports"
      />

      {/* Pending Reviews Alert */}
      {pendingReviews > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-800">
              {pendingReviews} submission{pendingReviews !== 1 ? "s" : ""} waiting for your review
            </p>
            <p className="text-sm text-blue-600 mt-0.5">
              Review department submissions before the deadline.
            </p>
          </div>
          <Link href="/pm/reviews">
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white shrink-0">
              Review Now
            </Button>
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard title="Assigned Cycles" value={cycles.length} description="Active reporting cycles" icon={RefreshCw} />
        <StatsCard title="Pending Reviews" value={pendingReviews} description="Submissions to review" icon={ClipboardCheck} />
        <StatsCard title="Recent Submissions" value={recentSubmissions.length} description="Latest department submissions" icon={FileText} />
      </div>

      {/* Active Cycles */}
      <div className="space-y-4">
        <h2 className="font-semibold text-lg">Your Assigned Cycles</h2>
        {cycles.length === 0 ? (
          <EmptyState
            icon={RefreshCw}
            title="No active cycles assigned"
            description="The admin will assign you to a reporting cycle. Once assigned, you can configure and manage it here."
          />
        ) : (
          <div className="grid gap-4">
            {cycles.map((cycle) => {
              const submitted = cycle.submitted_count ?? 0
              const total = cycle.total_departments ?? 0
              const pct = cycle.completion_rate ?? 0
              const approved = Math.round(pct)
              const notStarted = total - submitted
              const isLow = pct < 30
              const isMid = pct >= 30 && pct < 70

              return (
                <div key={cycle.id} className="rounded-xl border bg-card overflow-hidden hover:shadow-sm transition-shadow">
                  {/* Card Header */}
                  <div className="px-6 pt-5 pb-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{cycle.cycle_name}</h3>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Deadline: {formatDate(cycle.submission_deadline)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Link href={`/pm/cycles/${cycle.id}`}>
                        <Button size="sm">
                          Manage <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="px-6 pb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">
                        {submitted} of {total} departments submitted
                      </span>
                      <span className={isLow ? "text-red-600 font-semibold" : isMid ? "text-amber-600 font-semibold" : "text-green-600 font-semibold"}>
                        {approved}% complete
                      </span>
                    </div>
                    <Progress
                      value={pct}
                      className={isLow ? "[&>div]:bg-red-500 h-2.5" : isMid ? "[&>div]:bg-amber-500 h-2.5" : "[&>div]:bg-green-500 h-2.5"}
                    />
                  </div>

                  {/* Status Summary */}
                  <div className="border-t bg-muted/30 px-6 py-3 grid grid-cols-3 gap-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">Submitted</p>
                        <p className="text-sm font-semibold">{submitted}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">In Progress</p>
                        <p className="text-sm font-semibold">{Math.max(0, total - submitted - notStarted)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Not Started</p>
                        <p className="text-sm font-semibold">{notStarted}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent Submissions */}
      {recentSubmissions.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="px-6 py-4 border-b flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Recent Submissions to Review</h2>
          </div>
          <div className="divide-y">
            {recentSubmissions.map((sub) => (
              <div key={sub.session_id} className="flex items-center justify-between px-6 py-4">
                <div>
                  <p className="font-medium">{sub.department_name}</p>
                  <p className="text-sm text-muted-foreground">
                    Submitted {formatDateTime(sub.submitted_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status="submitted" variant="session" />
                  <Link href={`/pm/sessions/${sub.session_id}`}>
                    <Button variant="outline" size="sm">Review</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
