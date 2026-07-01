"use client"

import Link from "next/link"
import { useHODSessions } from "@/hooks/useHod"
import type { HODSession, HODQuestion } from "@/lib/api/hod"
import { PMStatCard } from "@/components/pm/PMStatCard"
import { EmptyState } from "@/components/ui/empty-state"
import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { SortControl } from "@/components/ui/sort-control"
import { useSort } from "@/hooks/useSort"
import type { SortField } from "@/lib/sort"
import { ClipboardCheck, Clock, FileText, ArrowRight, Users } from "lucide-react"
import { formatDate, cn } from "@/lib/utils"

const reviewOf = (q: HODQuestion) => q.review_status || "pending"
const WITH_TEAM = ["not_started", "in_progress", "submitted", "reopened"]

function tally(s: HODSession) {
  const qs = s.questions || []
  const total = qs.length
  const approved = qs.filter((q) => reviewOf(q) === "approved").length
  const rejected = qs.filter((q) => reviewOf(q) === "rejected").length
  const pending = qs.filter((q) => reviewOf(q) === "pending").length
  return { total, approved, rejected, pending, reviewed: approved + rejected }
}

const SORT_FIELDS: SortField<HODSession>[] = [
  { key: "deadline", label: "Deadline", defaultDirection: "asc", type: "date", accessor: (s) => s.reporting_cycles?.submission_deadline },
  { key: "cycle", label: "Cycle", defaultDirection: "asc", type: "string", accessor: (s) => s.reporting_cycles?.cycle_name },
  { key: "fiscal_year", label: "Fiscal Year", defaultDirection: "desc", type: "number", accessor: (s) => s.reporting_cycles?.fiscal_year },
]

export default function HODDashboardPage() {
  const { data: sessions, isLoading } = useHODSessions()
  const sort = useSort(SORT_FIELDS)

  if (isLoading) return <PageLoader />

  const all = sessions || []
  const toReview = all.filter((s) => s.status === "hod_curation")
  const withTeam = all.filter((s) => WITH_TEAM.includes(s.status))
  const pendingQuestions = toReview.reduce((n, s) => n + tally(s).pending, 0)

  // One list, actionable (awaiting your review) first, each group sorted by the
  // chosen field — so the page is always full and consistent, never a void.
  const sorted = sort.sort(all)
  const ordered = [
    ...sorted.filter((s) => s.status === "hod_curation"),
    ...sorted.filter((s) => s.status !== "hod_curation"),
  ]

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">HOD Dashboard</h1>
        <p className="mt-1.5 text-base text-slate-500">
          Review your department’s questions, then assign a team member to answer them.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-5 md:grid-cols-3">
        <PMStatCard title="To Review" value={toReview.length} description="Cycles awaiting your review" icon={ClipboardCheck} accent="indigo" />
        <PMStatCard title="Pending Questions" value={pendingQuestions} description="Questions to approve or reject" icon={Clock} accent="amber" highlight valueClassName="text-amber-500" />
        <PMStatCard title="With Your Team" value={withTeam.length} description="Assigned and being answered" icon={FileText} accent="green" />
      </div>

      {/* Unified list */}
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-slate-900">Your Reporting Cycles</h2>
          {all.length > 0 && <SortControl fields={SORT_FIELDS} value={sort.state} onSelect={sort.onSelect} />}
        </div>

        {all.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="No reporting cycles yet"
            description="When a PM kicks off a cycle for your department, the AI-generated questions appear here for you to review and assign."
          />
        ) : (
          <div className="space-y-5">
            {ordered.map((s) => (
              <SessionCard key={s.session_id} s={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SessionCard({ s }: { s: HODSession }) {
  const status = s.status
  const isCuration = status === "hod_curation"
  const t = tally(s)
  const assignee = s.users?.full_name || "a team member"
  const meta = STATUS_META[status] || { label: status, badge: "bg-slate-100 text-slate-600", bar: "bg-slate-400" }

  // Progress + label adapt to the stage, but the card structure stays identical.
  let pct: number
  let progressLabel: string
  let action: { href: string; label: string } | null = null
  let badgeLabel = meta.label
  let badgeClass = meta.badge
  let barClass = meta.bar

  if (isCuration) {
    const ready = t.total > 0 && t.pending === 0
    pct = t.total ? Math.round((t.reviewed / t.total) * 100) : 0
    progressLabel = `${t.reviewed} of ${t.total} questions reviewed`
    action = { href: `/hod/sessions/${s.session_id}`, label: ready ? "Assign" : "Review" }
    if (ready) {
      badgeLabel = "Ready to assign"
      badgeClass = "bg-emerald-50 text-emerald-700"
      barClass = "bg-emerald-500"
    } else if (t.pending > 0) {
      badgeLabel = `${t.pending} to review`
    }
  } else {
    pct = ["submitted", "approved"].includes(status) ? 100 : s.progress_percentage ?? 0
    progressLabel =
      status === "submitted" ? `Submitted by ${assignee} — awaiting review`
      : status === "approved" ? `Approved · ${assignee}`
      : status === "in_progress" ? `${assignee} is answering`
      : status === "reopened" ? `Sent back to ${assignee}`
      : `Assigned to ${assignee} · waiting to start`
    // A submitted session is yours to review — surface the action on the card too.
    if (status === "submitted") {
      action = { href: `/hod/sessions/${s.session_id}/review`, label: "Review" }
    }
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="p-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-extrabold tracking-wide",
              isCuration ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500",
            )}>
              {s.departments?.department_code || "DEPT"}
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold text-slate-900">
                {s.reporting_cycles?.cycle_name || "Reporting cycle"}
              </h3>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                <Clock className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  {s.departments?.department_name || "Department"}
                  {s.reporting_cycles?.submission_deadline ? ` · Deadline ${formatDate(s.reporting_cycles.submission_deadline)}` : ""}
                </span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", badgeClass)}>{badgeLabel}</span>
            {action && (
              <Link href={action.href}>
                <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
                  {action.label} <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-slate-600">
              {!isCuration && <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
              {progressLabel}
            </span>
            <span className="font-semibold text-slate-900">{pct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={cn("h-full rounded-full transition-all", barClass)} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

const STATUS_META: Record<string, { label: string; badge: string; bar: string }> = {
  hod_curation: { label: "Needs your review", badge: "bg-amber-50 text-amber-700", bar: "bg-indigo-500" },
  not_started: { label: "Awaiting start", badge: "bg-slate-100 text-slate-600", bar: "bg-slate-400" },
  in_progress: { label: "In progress", badge: "bg-blue-50 text-blue-600", bar: "bg-indigo-500" },
  submitted: { label: "Submitted", badge: "bg-amber-50 text-amber-700", bar: "bg-amber-500" },
  reopened: { label: "Needs changes", badge: "bg-rose-50 text-rose-600", bar: "bg-rose-500" },
  approved: { label: "Approved", badge: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
}
