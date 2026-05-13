"use client"

import { use, useRef, useState, useEffect } from "react"
import {
  usePMCycleDashboard, useSendReminder, useGenerateReport,
  useSubmitKickoff, useUploadKickoffDoc, useCreateEscalation,
  useEscalations, useBulkReminder,
} from "@/hooks/useSessions"
import { PageHeader } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, Column } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { Progress } from "@/components/ui/progress"
import { PageSkeleton } from "@/components/ui/skeletons"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { SessionSummary } from "@/types"
import {
  ArrowLeft, Bell, FileText, Eye, Loader2, Download,
  AlertTriangle, BookOpen, CheckCircle2, Clock, RefreshCw, Sparkles,
  FileUp, Zap, AlertOctagon, BellRing, Trophy, ShieldAlert,
  ListChecks, ClipboardCheck,
} from "lucide-react"
import Link from "next/link"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// Shape of the PM cycle dashboard API response
interface PMCycleDashboardData {
  cycle?: {
    id?: string
    cycle_name?: string
    status?: string
    submission_deadline?: string
    fiscal_year?: number
    project_manager_id?: string
    kickoff_brief?: string | null
  }
  stats?: {
    total_departments: number
    submitted: number
    in_progress: number
    not_started: number
    reviewed: number
    approved: number
    completion_rate: number
  }
  departments?: SessionSummary[]
}

export default function PMCyclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: pmData, isLoading, refetch: refetchPM, isFetching } = usePMCycleDashboard(id)
  const sendReminder = useSendReminder()
  const generateReport = useGenerateReport()
  const submitKickoff = useSubmitKickoff()
  const uploadKickoffDoc = useUploadKickoffDoc()
  const createEscalation = useCreateEscalation()
  const { data: escalationsData } = useEscalations(id)
  const bulkReminder = useBulkReminder()

  const fileRef = useRef<HTMLInputElement>(null)

  const [reminderTarget, setReminderTarget] = useState<SessionSummary | null>(null)
  const [reminderMsg, setReminderMsg] = useState("")
  const [reminderPriority, setReminderPriority] = useState("normal")
  const [reportResult, setReportResult] = useState<string | null>(null)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [downloadingReport, setDownloadingReport] = useState(false)

  // Escalation dialog
  const [escalationTarget, setEscalationTarget] = useState<SessionSummary | null>(null)
  const [escalationMsg, setEscalationMsg] = useState("")
  const [escalationPriority, setEscalationPriority] = useState("high")

  // Bulk reminder dialog
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkMsg, setBulkMsg] = useState("")
  const [bulkPriority, setBulkPriority] = useState("normal")

  // Kickoff brief state
  const [briefOpen, setBriefOpen] = useState(false)
  const [briefText, setBriefText] = useState("")
  const [additionalContext, setAdditionalContext] = useState("")
  const [docBriefText, setDocBriefText] = useState("")
  const [submittingKickoff, setSubmittingKickoff] = useState(false)
  // Module 1-6 additions
  const [numQuestions, setNumQuestions] = useState(12)
  const [qualityWarning, setQualityWarning] = useState<{
    suggestion: string
    missing: string[]
  } | null>(null)

  // ── Generate Report dialog ──────────────────────────────────────────────────
  // Shows approved sessions; PM can choose all-approved or pick specific ones
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState<"all" | "pick">("all")

  // Computed from raw data BEFORE the early return so the effect order is stable
  const pmDashRaw = pmData as PMCycleDashboardData | undefined
  const cycleStatusRaw = pmDashRaw?.cycle?.status as string | undefined
  const hasKickoffRaw = !!(pmDashRaw?.cycle?.kickoff_brief)
  // Draft cycles MUST have a kickoff brief before the PM can do anything else.
  // The kickoff dialog auto-opens and cannot be dismissed until submitted.
  const isForceKickoff = cycleStatusRaw === "draft" && !hasKickoffRaw

  useEffect(() => {
    if (isForceKickoff) setBriefOpen(true)
  }, [isForceKickoff])

  if (isLoading) return <PageSkeleton />

  const pmDash = pmData as PMCycleDashboardData | undefined
  const stats = pmDash?.stats
  const departments = pmDash?.departments || []
  const cycleName = pmDash?.cycle?.cycle_name || "Cycle Management"
  const cycleId = id

  const hasKickoff    = !!(pmDash?.cycle?.kickoff_brief)
  const needsReview   = departments.filter((d) => d.status === "submitted")
  const reviewed      = departments.filter((d) => d.status === "reviewed")
  const approved      = departments.filter((d) => d.status === "approved")
  const inProgress    = departments.filter((d) => d.status === "in_progress")
  const notStarted    = departments.filter((d) => d.status === "not_started")

  const submissionDeadline = pmDash?.cycle?.submission_deadline
  const isOverdue = (row: SessionSummary) =>
    !!submissionDeadline &&
    new Date() > new Date(submissionDeadline) &&
    row.status !== "submitted" &&
    row.status !== "approved"
  const overdueRows = departments.filter(isOverdue)
  const allDone =
    departments.length > 0 &&
    departments.every((d) => ["submitted", "reviewed", "approved"].includes(d.status))

  const escalations: { id?: string; message: string; priority?: string; created_at?: string; department_name?: string }[] =
    Array.isArray(escalationsData)
      ? escalationsData
      : (escalationsData as { escalations?: unknown[] } | undefined)?.escalations ?? []

  /* ── Handlers ─────────────────────────────────────────────────────────────── */
  const resetKickoffForm = () => {
    setBriefText("")
    setAdditionalContext("")
    setDocBriefText("")
    setNumQuestions(12)
    setQualityWarning(null)
  }

  const handleSubmitKickoff = async () => {
    if (!briefText.trim()) {
      toast.error("Please write the strategic brief before submitting")
      return
    }
    setSubmittingKickoff(true)
    setQualityWarning(null)
    try {
      const result = await submitKickoff.mutateAsync({
        cycle_id: cycleId,
        strategic_brief: briefText,
        additional_context: additionalContext || undefined,
        num_questions: numQuestions,
      })

      // Optional info toast when the backend enriched the brief with AI context
      if (result?.enrichment_applied) {
        toast.info("Brief was expanded with AI context to improve question quality.")
      }

      // Low quality → keep dialog open so PM can decide
      if (result?.brief_quality?.quality === "low") {
        setQualityWarning({
          suggestion: result.brief_quality.suggestion,
          missing: result.brief_quality.missing ?? [],
        })
        return
      }

      // good / acceptable → close + clear as before
      setBriefOpen(false)
      resetKickoffForm()
      refetchPM()
    } finally {
      setSubmittingKickoff(false)
    }
  }

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await uploadKickoffDoc.mutateAsync({ file, cycleId, strategicBrief: docBriefText || undefined })
      setBriefOpen(false)
      setDocBriefText("")
      refetchPM()
    } catch {
      // Error toast already shown by hook
    } finally {
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const handleSendReminder = async () => {
    if (!reminderTarget || !reminderMsg) return
    await sendReminder.mutateAsync({
      sessionId: reminderTarget.session_id,
      data: { message: reminderMsg, priority: reminderPriority as "low" | "normal" | "high" | "urgent" },
    })
    setReminderTarget(null)
    setReminderMsg("")
  }

  const handleCreateEscalation = async () => {
    if (!escalationTarget || !escalationMsg.trim()) return
    await createEscalation.mutateAsync({
      session_id: escalationTarget.session_id,
      message: escalationMsg,
      priority: escalationPriority,
    })
    setEscalationTarget(null)
    setEscalationMsg("")
  }

  const handleBulkReminder = async () => {
    if (!bulkMsg.trim()) return
    await bulkReminder.mutateAsync({ cycle_id: id, message: bulkMsg, priority: bulkPriority })
    setBulkOpen(false)
    setBulkMsg("")
  }

  // Open the Generate Report dialog (shows approved sessions, let PM choose)
  const openReportDialog = () => {
    setSelectedSessionIds(new Set())
    setSelectMode("all")
    setReportDialogOpen(true)
  }

  // Actually generate the report (called from dialog confirm)
  const handleGenerateReport = async () => {
    setGeneratingReport(true)
    setReportDialogOpen(false)
    try {
      const payload =
        selectMode === "pick" && selectedSessionIds.size > 0
          ? { format: "markdown" as const, session_ids: Array.from(selectedSessionIds) }
          : { format: "markdown" as const }          // backend uses all approved when session_ids omitted
      const res = await generateReport.mutateAsync({ cycleId: id, payload })
      // Show the backend preview immediately so the user sees something fast
      setReportResult(res.report ?? res.report_preview ?? null)
      toast.success(
        `Report generated — ${res.word_count ?? "—"} words` +
        (res.departments_included?.length ? ` from ${res.departments_included.length} department(s)` : "")
      )
      // Then replace with the full assembled report from our server proxy
      // (backend report_preview is truncated to ~1000 chars)
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
        const fullRes = await fetch(`/api/pm/cycles/${id}/full-report`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (fullRes.ok) {
          const fullContent = await fullRes.text()
          if (fullContent.trim()) setReportResult(fullContent)
        }
      } catch {
        // Keep the preview if full fetch fails
      }
    } finally {
      setGeneratingReport(false)
    }
  }

  const downloadReport = async () => {
    setDownloadingReport(true)
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
      const res = await fetch(`/api/pm/cycles/${id}/full-report`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) {
        // Fallback: download the preview content we already have
        if (reportResult) {
          const blob = new Blob([reportResult], { type: "text/markdown" })
          const url = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = url
          a.download = `annual-report-${id}.md`
          a.click()
          URL.revokeObjectURL(url)
        }
        return
      }
      const markdown = await res.text()
      const blob = new Blob([markdown], { type: "text/markdown" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `annual-report-${id}.md`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Silent fallback to preview content
      if (reportResult) {
        const blob = new Blob([reportResult], { type: "text/markdown" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `annual-report-${id}.md`
        a.click()
        URL.revokeObjectURL(url)
      }
    } finally {
      setDownloadingReport(false)
    }
  }

  const toggleSession = (sid: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev)
      if (next.has(sid)) next.delete(sid)
      else next.add(sid)
      return next
    })
  }

  /* ── Department table columns ─────────────────────────────────────────────── */
  const columns: Column<SessionSummary>[] = [
    {
      key: "dept",
      header: "Department",
      cell: (row) => (
        <div>
          <p className="font-medium">{row.department_name}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.department_code}</p>
          {row.status === "not_started" && (
            <p className="text-xs italic text-muted-foreground mt-0.5">
              Awaiting kickoff submission
            </p>
          )}
        </div>
      ),
    },
    {
      key: "user",
      header: "Assigned User",
      cell: (row) => (
        <div>
          <p className="text-sm font-medium">{row.user_name || "—"}</p>
          {row.user_email && <p className="text-xs text-muted-foreground">{row.user_email}</p>}
        </div>
      ),
    },
    {
      key: "progress",
      header: "Completion",
      cell: (row) => (
        <div className="min-w-32">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">
              {["submitted","reviewed","approved"].includes(row.status) ? "Submitted" : `${row.progress_percentage}% answered`}
            </span>
            <span className={cn(
              "font-semibold",
              row.progress_percentage < 30 ? "text-red-500" :
              row.progress_percentage < 70 ? "text-amber-500" : "text-green-500"
            )}>
              {row.progress_percentage}%
            </span>
          </div>
          <Progress
            value={row.progress_percentage}
            className={cn(
              "h-2",
              row.progress_percentage < 30 ? "[&>div]:bg-red-400" :
              row.progress_percentage < 70 ? "[&>div]:bg-amber-400" : "[&>div]:bg-green-500"
            )}
          />
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={row.status} variant="session" />
          {isOverdue(row) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              <AlertOctagon className="h-3 w-3" /> Overdue
            </span>
          )}
        </div>
      ),
    },
    {
      key: "submitted",
      header: "Submitted",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.submitted_at ? formatDate(row.submitted_at) : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (row) => (
        <div className="flex gap-2 flex-wrap">
          {/* Review button for submitted / reviewed sessions */}
          {(row.status === "submitted" || row.status === "reviewed") && (
            <Link href={`/pm/sessions/${row.session_id}`}>
              <Button size="sm" variant="outline" className={row.status === "reviewed" ? "text-blue-600 border-blue-200" : ""}>
                <Eye className="h-3 w-3 mr-1" />
                {row.status === "reviewed" ? "Reviewed" : "Review"}
              </Button>
            </Link>
          )}
          {row.status === "approved" && (
            <Link href={`/pm/sessions/${row.session_id}`}>
              <Button size="sm" variant="outline" className="text-green-600 border-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Approved
              </Button>
            </Link>
          )}
          {(row.status === "not_started" || row.status === "in_progress") && (
            <>
              <Button
                size="sm" variant="outline"
                onClick={() => setReminderTarget(row)}
                className="text-amber-600 border-amber-200 hover:bg-amber-50"
              >
                <Bell className="h-3 w-3 mr-1" /> Remind
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => { setEscalationTarget(row); setEscalationMsg("") }}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <ShieldAlert className="h-3 w-3 mr-1" /> Escalate
              </Button>
            </>
          )}
        </div>
      ),
    },
  ]

  /* ── Render ────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Link href="/pm">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          title={cycleName}
          description="Track department progress, review submissions, and generate the final report"
          action={
            <div className="flex gap-2 flex-wrap">
              <Button variant="ghost" size="icon" onClick={() => refetchPM()} disabled={isFetching} title="Refresh">
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
              <Button variant="outline" onClick={() => setBriefOpen(true)}>
                <BookOpen className="mr-2 h-4 w-4" />
                {hasKickoff ? "Update Kickoff Brief" : "Submit Kickoff Brief"}
              </Button>
              {(notStarted.length > 0 || inProgress.length > 0) && (
                <Button variant="outline" onClick={() => setBulkOpen(true)}>
                  <BellRing className="mr-2 h-4 w-4" />
                  Remind All
                </Button>
              )}
              <Button
                variant="outline"
                onClick={openReportDialog}
                disabled={generatingReport || departments.length === 0}
              >
                {generatingReport
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <FileText className="mr-2 h-4 w-4" />}
                Generate Report
              </Button>
              {reportResult && (
                <Button onClick={downloadReport}>
                  <Download className="mr-2 h-4 w-4" /> Download
                </Button>
              )}
            </div>
          }
        />
      </div>

      {/* ── Workflow Pipeline ── */}
      {departments.length > 0 && (
        <div className="rounded-xl border bg-card px-6 py-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            Cycle Workflow
          </p>
          <div className="flex items-start gap-0">
            {/* Stage 1 – Kickoff */}
            <PipelineStage
              icon={Sparkles}
              label="Kickoff Brief"
              count={hasKickoff ? "✓" : "Pending"}
              done={hasKickoff}
              active={!hasKickoff}
              colorClass="purple"
            />
            <PipelineConnector done={hasKickoff} />

            {/* Stage 2 – In Progress */}
            <PipelineStage
              icon={Clock}
              label="In Progress"
              count={String(stats?.in_progress ?? inProgress.length)}
              done={(stats?.in_progress ?? inProgress.length) === 0 && departments.length > 0 && hasKickoff}
              active={(stats?.in_progress ?? inProgress.length) > 0}
              colorClass="blue"
            />
            <PipelineConnector done={(stats?.submitted ?? needsReview.length) > 0 || (stats?.reviewed ?? reviewed.length) > 0 || (stats?.approved ?? approved.length) > 0} />

            {/* Stage 3 – Submitted (awaiting PM review) */}
            <PipelineStage
              icon={ClipboardCheck}
              label="Submitted"
              count={String(stats?.submitted ?? needsReview.length)}
              done={(stats?.submitted ?? needsReview.length) === 0 && ((stats?.reviewed ?? reviewed.length) > 0 || (stats?.approved ?? approved.length) > 0)}
              active={(stats?.submitted ?? needsReview.length) > 0}
              colorClass="amber"
            />
            <PipelineConnector done={(stats?.reviewed ?? reviewed.length) > 0 || (stats?.approved ?? approved.length) > 0} />

            {/* Stage 4 – Reviewed by PM */}
            <PipelineStage
              icon={Eye}
              label="Reviewed"
              count={String(stats?.reviewed ?? reviewed.length)}
              done={(stats?.reviewed ?? reviewed.length) === 0 && (stats?.approved ?? approved.length) > 0}
              active={(stats?.reviewed ?? reviewed.length) > 0}
              colorClass="indigo"
            />
            <PipelineConnector done={(stats?.approved ?? approved.length) > 0} />

            {/* Stage 5 – Approved & ready for report */}
            <PipelineStage
              icon={CheckCircle2}
              label="Approved"
              count={String(stats?.approved ?? approved.length)}
              done={(stats?.approved ?? approved.length) === departments.length && departments.length > 0}
              active={(stats?.approved ?? approved.length) > 0}
              colorClass="green"
            />
            <PipelineConnector done={false} />

            {/* Stage 6 – Final Report */}
            <PipelineStage
              icon={FileText}
              label="Final Report"
              count={reportResult ? "Generated" : "Pending"}
              done={!!reportResult}
              active={approved.length > 0 && !reportResult}
              colorClass="teal"
            />
          </div>
        </div>
      )}

      {/* ── Completion Banner ── */}
      {allDone && (
        <div className="flex gap-3 rounded-xl border-2 border-green-300 bg-green-50 p-5">
          <Trophy className="h-6 w-6 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-900 text-base">All departments have submitted!</p>
            <p className="text-sm text-green-800 mt-0.5">
              Review and approve the submissions, then generate the final consolidated report.
            </p>
          </div>
          <Button
            size="sm" onClick={openReportDialog} disabled={generatingReport}
            className="ml-auto shrink-0 bg-green-600 hover:bg-green-700"
          >
            {generatingReport
              ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
              : <FileText className="h-4 w-4 mr-1" />}
            Generate Report
          </Button>
        </div>
      )}

      {/* ── Overdue Alert ── */}
      {overdueRows.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertOctagon className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">
              {overdueRows.length} department{overdueRows.length !== 1 ? "s" : ""} overdue
            </p>
            <p className="text-sm text-red-700 mt-0.5">
              {overdueRows.map((d) => d.department_name).join(", ")} — deadline passed
            </p>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 border-red-200 text-red-700 hover:bg-red-100" onClick={() => setBulkOpen(true)}>
            <BellRing className="h-3.5 w-3.5 mr-1" /> Remind All
          </Button>
        </div>
      )}

      {/* ── Kickoff Brief CTA removed per request ── */}

      {/* ── Stats Cards ── */}
      {departments.length > 0 && stats && (
        <div className="grid gap-4 md:grid-cols-6">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold mt-1">{stats.total_departments}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Not Started</p>
            </div>
            <p className="text-2xl font-bold text-muted-foreground">{stats.not_started ?? 0}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3.5 w-3.5 text-blue-500" />
              <p className="text-xs text-muted-foreground">In Progress</p>
            </div>
            <p className="text-2xl font-bold text-blue-600">{stats.in_progress}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <ClipboardCheck className="h-3.5 w-3.5 text-amber-500" />
              <p className="text-xs text-muted-foreground">Submitted</p>
            </div>
            <p className="text-2xl font-bold text-amber-600">{stats.submitted}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              <p className="text-xs text-muted-foreground">Approved</p>
            </div>
            <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Completion</p>
            <p className="text-2xl font-bold">{stats.completion_rate.toFixed(0)}%</p>
            <Progress value={stats.completion_rate} className="h-1.5 mt-2" />
          </div>
        </div>
      )}

      {/* ── Per-Department Progress (prominent view) ── */}
      {departments.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-5 py-3.5 border-b">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm">Per-Department Progress</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {departments.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              How much each department has answered
            </p>
          </div>
          <div className="divide-y">
            {departments.map((d) => {
              const pct = d.progress_percentage ?? 0
              const isSubmitted = ["submitted", "reviewed", "approved"].includes(d.status)
              const overdue = isOverdue(d)
              const barTone =
                isSubmitted ? "[&>div]:bg-green-500" :
                pct < 30 ? "[&>div]:bg-red-400" :
                pct < 70 ? "[&>div]:bg-amber-400" :
                "[&>div]:bg-green-500"
              const pctTone =
                isSubmitted ? "text-green-600" :
                pct < 30 ? "text-red-500" :
                pct < 70 ? "text-amber-600" :
                "text-green-600"

              return (
                <div key={d.session_id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm truncate">{d.department_name}</p>
                        <span className="text-xs font-mono text-muted-foreground">{d.department_code}</span>
                        <StatusBadge status={d.status} variant="session" />
                        {overdue && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            <AlertOctagon className="h-3 w-3" /> Overdue
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {d.user_name || d.user_email || "Unassigned"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={cn("text-sm font-semibold tabular-nums", pctTone)}>{pct}%</span>
                      {(d.status === "submitted" || d.status === "reviewed") && (
                        <Link href={`/pm/sessions/${d.session_id}`}>
                          <Button size="sm" variant="outline" className="h-7 text-xs">
                            <Eye className="h-3 w-3 mr-1" /> Review
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                  <Progress value={pct} className={cn("h-2", barTone)} />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {isSubmitted
                      ? `Submitted ${d.submitted_at ? `on ${formatDate(d.submitted_at)}` : ""}`
                      : `${pct}% of questions answered`}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── No departments yet ── */}
      {departments.length === 0 && (
        <div className={cn(
          "rounded-xl border-2 border-dashed p-10 text-center space-y-3",
          hasKickoff ? "border-blue-300 bg-blue-50" : "border-muted"
        )}>
          <div className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full mx-auto",
            hasKickoff ? "bg-blue-100" : "bg-muted"
          )}>
            {hasKickoff
              ? <Sparkles className="h-5 w-5 text-blue-600 animate-pulse" />
              : <BookOpen className="h-5 w-5 text-muted-foreground" />}
          </div>
          <p className={cn("font-semibold", hasKickoff ? "text-blue-900" : "")}>
            {hasKickoff ? "Generating AI questions for all departments…" : "No department sessions yet"}
          </p>
          <p className={cn("text-sm max-w-sm mx-auto leading-relaxed", hasKickoff ? "text-blue-800" : "text-muted-foreground")}>
            {hasKickoff
              ? "The AI is processing your kickoff brief and creating tailored questions for each department. Sessions will appear here once ready."
              : "Submit a kickoff brief above to generate tailored AI questions and kick off the cycle for all departments."}
          </p>
        </div>
      )}

      {/* ── Pending Review Alert ── */}
      {needsReview.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {needsReview.length} submission{needsReview.length !== 1 ? "s" : ""} awaiting your review
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              {needsReview.map((d) => d.department_name).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* ── Reviewed but not yet approved ── */}
      {reviewed.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <Eye className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-blue-800">
              {reviewed.length} submission{reviewed.length !== 1 ? "s" : ""} reviewed — pending approval
            </p>
            <p className="text-sm text-blue-700 mt-0.5">
              {reviewed.map((d) => d.department_name).join(", ")} — open each to approve or request revision
            </p>
          </div>
        </div>
      )}

      {/* ── Not Started Alert ── */}
      {notStarted.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-muted bg-muted/30 p-4">
          <Clock className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">
              {notStarted.length} department{notStarted.length !== 1 ? "s" : ""} haven&apos;t started yet
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Consider sending reminders to: {notStarted.map((d) => d.department_name).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* ── Approved summary for report ── */}
      {approved.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-800">
              {approved.length} department{approved.length !== 1 ? "s" : ""} approved — ready for final report
            </p>
            <p className="text-sm text-green-700 mt-0.5">
              {approved.map((d) => d.department_name).join(", ")}
            </p>
          </div>
          <Button
            size="sm"
            onClick={openReportDialog}
            disabled={generatingReport}
            className="shrink-0 bg-green-600 hover:bg-green-700"
          >
            {generatingReport
              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              : <FileText className="h-3.5 w-3.5 mr-1" />}
            Generate Report
          </Button>
        </div>
      )}

      {/* ── Generated Report Preview ── */}
      {reportResult && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div>
              <h2 className="font-semibold">Generated Report</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Preview below · download for the complete document
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={downloadReport} disabled={downloadingReport}>
              {downloadingReport
                ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                : <Download className="mr-2 h-3.5 w-3.5" />}
              Download .md
            </Button>
          </div>
          <div className="p-6 max-h-[600px] overflow-y-auto">
            <pre className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed">
              {reportResult}
            </pre>
          </div>
        </div>
      )}

      {/* ── Departments Table ── */}
      {departments.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">Department Progress Tracker</h2>
          <DataTable
            columns={columns}
            data={departments}
            isLoading={isLoading}
            emptyMessage="No departments in this cycle"
          />
        </div>
      )}

      {/* ── Escalations Panel ── */}
      {escalations.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            <h2 className="font-semibold text-sm">Escalations ({escalations.length})</h2>
          </div>
          <div className="divide-y">
            {escalations.map((esc, i) => (
              <div key={esc.id ?? i} className="flex items-start gap-3 px-5 py-3.5">
                <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  esc.priority === "critical" || esc.priority === "urgent"
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {esc.priority ?? "high"}
                </span>
                <div className="flex-1 min-w-0">
                  {esc.department_name && (
                    <p className="text-xs text-muted-foreground mb-0.5">{esc.department_name}</p>
                  )}
                  <p className="text-sm">{esc.message}</p>
                </div>
                {esc.created_at && (
                  <p className="text-xs text-muted-foreground shrink-0">{formatDate(esc.created_at)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          DIALOGS
      ══════════════════════════════════════════════════════════════════════════ */}

      {/* ── Generate Report Dialog ── */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" /> Generate Final Report
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              The report consolidates all approved department submissions into one document.
            </p>
          </DialogHeader>

          {/* Mode selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectMode("all")}
              className={cn(
                "flex-1 rounded-lg border p-3 text-left text-sm transition-colors",
                selectMode === "all" ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
              )}
            >
              <p className="font-medium flex items-center gap-2">
                <ListChecks className="h-4 w-4" /> All Approved
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Include all {approved.length} approved department{approved.length !== 1 ? "s" : ""}
              </p>
            </button>
            <button
              onClick={() => setSelectMode("pick")}
              className={cn(
                "flex-1 rounded-lg border p-3 text-left text-sm transition-colors",
                selectMode === "pick" ? "border-primary bg-primary/5" : "border-border hover:bg-accent"
              )}
            >
              <p className="font-medium flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4" /> Pick Sessions
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select specific departments to include
              </p>
            </button>
          </div>

          {/* Session picker */}
          {selectMode === "pick" && (
            <div className="space-y-2 max-h-52 overflow-y-auto rounded-lg border p-3">
              {approved.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No approved sessions yet. Approve department submissions first.
                </p>
              ) : (
                approved.map((dep) => {
                  const checked = selectedSessionIds.has(dep.session_id)
                  return (
                    <label
                      key={dep.session_id}
                      className={cn(
                        "flex items-center gap-3 rounded-md p-2.5 cursor-pointer transition-colors",
                        checked ? "bg-primary/8 border border-primary/30" : "hover:bg-accent border border-transparent"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSession(dep.session_id)}
                        className="h-4 w-4 accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{dep.department_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{dep.department_code}</p>
                      </div>
                      <CheckCircle2 className={cn("h-4 w-4 shrink-0", checked ? "text-green-500" : "text-muted-foreground/30")} />
                    </label>
                  )
                })
              )}
            </div>
          )}

          {/* No approved sessions warning */}
          {approved.length === 0 && selectMode === "all" && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                No sessions are approved yet. Review and approve department submissions before generating the report.
                You can still generate a report — the backend will include any available content.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setReportDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleGenerateReport}
              disabled={generatingReport || (selectMode === "pick" && selectedSessionIds.size === 0)}
              className="bg-primary"
            >
              {generatingReport
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating…</>
                : <><Sparkles className="mr-2 h-4 w-4" />
                  {selectMode === "pick"
                    ? `Generate from ${selectedSessionIds.size} session${selectedSessionIds.size !== 1 ? "s" : ""}`
                    : `Generate from All Approved (${approved.length})`}
                </>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Kickoff Brief Dialog ── */}
      <Dialog
        open={briefOpen}
        onOpenChange={(o) => {
          // Draft cycles must complete the kickoff brief before continuing
          if (!o && isForceKickoff) return
          setBriefOpen(o)
          if (!o) resetKickoffForm()
        }}
      >
        <DialogContent
          className="max-w-2xl"
          hideClose={isForceKickoff}
          onEscapeKeyDown={(e) => { if (isForceKickoff) e.preventDefault() }}
          onInteractOutside={(e) => { if (isForceKickoff) e.preventDefault() }}
        >
          <DialogHeader>
            <DialogTitle>Submit Kickoff Brief</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Provide the strategic context. The AI will generate tailored questions for each department session.
            </p>
          </DialogHeader>

          {isForceKickoff && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              This cycle is in <strong>Draft</strong>. A kickoff brief is required before you can manage the cycle.
            </div>
          )}

          {/* Text Brief */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              Text Brief
            </div>
            <div className="space-y-2">
              <Label>Strategic Brief <span className="text-destructive">*</span></Label>
              <Textarea
                value={briefText}
                onChange={(e) => setBriefText(e.target.value)}
                placeholder="e.g. This fiscal year we focused on digital transformation, market expansion…"
                rows={5}
                className="text-sm"
              />
              {(() => {
                const wordCount = briefText.trim() === "" ? 0 : briefText.trim().split(/\s+/).length
                const tone =
                  wordCount < 50 ? "text-red-600" :
                  wordCount < 150 ? "text-amber-600" :
                  "text-green-600"
                const msg =
                  wordCount < 50 ? `${wordCount} words — minimum 50 recommended for good questions` :
                  wordCount < 150 ? `${wordCount} words — good start, more detail helps` :
                  `${wordCount} words — good detail`
                return <p className={cn("text-xs", tone)}>{msg}</p>
              })()}
            </div>
            <div className="space-y-2">
              <Label>Additional Context <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Any specific themes, KPIs, or focus areas for this cycle..."
                rows={3}
                className="text-sm"
              />
            </div>
            {/* num_questions slider (5-20, default 12) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Questions per department: <span className="text-foreground tabular-nums">{numQuestions}</span></Label>
                {numQuestions === 12 && (
                  <span className="text-xs text-muted-foreground">(default)</span>
                )}
              </div>
              <input
                type="range"
                min={5}
                max={20}
                step={1}
                value={numQuestions}
                onChange={(e) => setNumQuestions(parseInt(e.target.value, 10))}
                className="w-full h-1.5 cursor-pointer accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
                <span>5</span>
                <span>12</span>
                <span>20</span>
              </div>
            </div>
          </div>

          {/* Divider with OR */}
          <div className="relative my-1">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
            <div className="relative flex justify-center"><span className="bg-background px-2 text-xs uppercase tracking-wide text-muted-foreground">or also upload</span></div>
          </div>

          {/* Document Upload */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileUp className="h-4 w-4 text-muted-foreground" />
              Upload Document <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              className="hidden"
              onChange={handleDocUpload}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadKickoffDoc.isPending}
              className="w-full rounded-lg border-2 border-dashed border-muted-foreground/30 p-6 text-center hover:border-primary/50 hover:bg-accent transition-colors"
            >
              {uploadKickoffDoc.isPending
                ? <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                : <FileUp className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />}
              <p className="text-sm font-medium">
                {uploadKickoffDoc.isPending ? "Uploading…" : "Click to upload a document"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, DOC, TXT</p>
            </button>
            <div className="space-y-2">
              <Label>Document Summary <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                value={docBriefText}
                onChange={(e) => setDocBriefText(e.target.value)}
                placeholder="Summarise the document to help the AI understand its context…"
                rows={2}
                className="text-sm"
              />
            </div>
          </div>

          {qualityWarning && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-900">Brief quality is low</p>
                  <p className="text-sm text-amber-800">{qualityWarning.suggestion}</p>
                  {qualityWarning.missing.length > 0 && (
                    <p className="text-xs text-amber-800">
                      <span className="font-medium">Missing:</span> {qualityWarning.missing.join(", ")}
                    </p>
                  )}
                  <p className="text-xs text-amber-700 mt-1">
                    Questions have been generated but may be generic. You can improve your brief and resubmit to regenerate questions.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setBriefOpen(false)
                    resetKickoffForm()
                    refetchPM()
                  }}
                >
                  Close anyway
                </Button>
                <Button
                  size="sm"
                  onClick={() => setQualityWarning(null)}
                >
                  Improve brief
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            {!isForceKickoff && (
              <Button variant="outline" onClick={() => setBriefOpen(false)}>Cancel</Button>
            )}
            <Button onClick={handleSubmitKickoff} disabled={submittingKickoff || !briefText.trim()}>
              {submittingKickoff
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Zap className="mr-2 h-4 w-4" />}
              {submittingKickoff ? "Generating questions…" : "Submit & Generate Questions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Escalation Dialog ── */}
      <Dialog open={!!escalationTarget} onOpenChange={(o) => !o && setEscalationTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalate — {escalationTarget?.department_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Escalation Message <span className="text-destructive">*</span></Label>
              <Textarea
                value={escalationMsg}
                onChange={(e) => setEscalationMsg(e.target.value)}
                placeholder="Describe the issue that needs urgent attention..."
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={escalationPriority} onValueChange={setEscalationPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEscalationTarget(null)}>Cancel</Button>
            <Button
              onClick={handleCreateEscalation}
              disabled={!escalationMsg.trim() || createEscalation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              <ShieldAlert className="mr-2 h-4 w-4" />
              {createEscalation.isPending ? "Escalating…" : "Raise Escalation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Reminder Dialog ── */}
      <Dialog open={bulkOpen} onOpenChange={(o) => { setBulkOpen(o); if (!o) setBulkMsg("") }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remind All Pending Departments</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will send a reminder to all departments that have not yet submitted ({notStarted.length + inProgress.length} total).
          </p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Message <span className="text-destructive">*</span></Label>
              <Textarea
                value={bulkMsg}
                onChange={(e) => setBulkMsg(e.target.value)}
                placeholder="Please ensure your annual report submission is completed before the deadline..."
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={bulkPriority} onValueChange={setBulkPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkReminder} disabled={!bulkMsg.trim() || bulkReminder.isPending}>
              <BellRing className="mr-2 h-4 w-4" />
              {bulkReminder.isPending ? "Sending…" : "Send to All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Individual Reminder Dialog ── */}
      <Dialog open={!!reminderTarget} onOpenChange={(o) => !o && setReminderTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Reminder — {reminderTarget?.department_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={reminderMsg}
                onChange={(e) => setReminderMsg(e.target.value)}
                placeholder="Please complete your annual report submission by the deadline..."
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={reminderPriority} onValueChange={setReminderPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderTarget(null)}>Cancel</Button>
            <Button onClick={handleSendReminder} disabled={!reminderMsg || sendReminder.isPending}>
              {sendReminder.isPending ? "Sending…" : "Send Reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ── Pipeline stage sub-components ─────────────────────────────────────────── */
type ColorClass = "purple" | "blue" | "amber" | "indigo" | "green" | "teal"

function PipelineStage({
  icon: Icon, label, count, done, active, colorClass,
}: {
  icon: React.ElementType
  label: string
  count: string
  done?: boolean
  active?: boolean
  colorClass: ColorClass
}) {
  const colors: Record<ColorClass, { bg: string; border: string; text: string; countText: string }> = {
    purple: { bg: "bg-purple-100", border: "border-purple-400", text: "text-purple-600", countText: "text-purple-700" },
    blue:   { bg: "bg-blue-100",   border: "border-blue-400",   text: "text-blue-600",   countText: "text-blue-700"   },
    amber:  { bg: "bg-amber-100",  border: "border-amber-400",  text: "text-amber-600",  countText: "text-amber-700"  },
    indigo: { bg: "bg-indigo-100", border: "border-indigo-400", text: "text-indigo-600", countText: "text-indigo-700" },
    green:  { bg: "bg-green-100",  border: "border-green-400",  text: "text-green-600",  countText: "text-green-700"  },
    teal:   { bg: "bg-teal-100",   border: "border-teal-400",   text: "text-teal-600",   countText: "text-teal-700"   },
  }
  const c = colors[colorClass]

  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[72px]">
      <div className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all",
        done   ? `${c.bg} ${c.border}` :
        active ? `${c.bg} ${c.border} ring-2 ring-offset-1 ring-${colorClass}-300` :
        "bg-muted border-muted-foreground/20"
      )}>
        <Icon className={cn("h-4 w-4", done || active ? c.text : "text-muted-foreground/50")} />
      </div>
      <span className={cn(
        "text-[11px] font-medium text-center leading-tight",
        done || active ? c.countText : "text-muted-foreground"
      )}>
        {label}
      </span>
      <span className={cn(
        "text-xs font-bold",
        done || active ? c.countText : "text-muted-foreground/60"
      )}>
        {count}
      </span>
    </div>
  )
}

function PipelineConnector({ done }: { done?: boolean }) {
  return (
    <div className={cn("h-0.5 flex-1 mt-4.5 mx-1 transition-colors", done ? "bg-green-400" : "bg-muted")} />
  )
}
