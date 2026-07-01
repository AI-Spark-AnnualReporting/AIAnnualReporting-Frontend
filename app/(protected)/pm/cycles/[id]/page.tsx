"use client"

import { use, useRef, useState, useEffect } from "react"
import {
  usePMCycleDashboard, useSendReminder, useGenerateReport,
  useSubmitKickoff, useUploadKickoffDoc, useCreateEscalation,
  useEscalations, useBulkReminder, usePreviousBrief,
} from "@/hooks/useSessions"
import { useBuildReadiness } from "@/hooks/useReportBuilder"
import { PageHeader } from "@/components/ui/page-header"
import { KickoffLoader } from "@/components/pm/kickoff-loader"
import { Button } from "@/components/ui/button"
import { DataTable, Column } from "@/components/ui/data-table"
import { StatusBadge } from "@/components/ui/status-badge"
import { Progress } from "@/components/ui/progress"
import { PageLoader } from "@/components/ui/spinner"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { SessionSummary, ContentLanguage } from "@/types"
import {
  languageMismatchWarning,
  isLanguageAcceptable,
  documentLanguageWarning,
  isDocumentLanguageError,
} from "@/lib/lang"
import { documentsApi } from "@/lib/api/documents"
import { LanguageMismatchAlert } from "@/components/ui/language-mismatch-alert"
import { pmApi } from "@/lib/api/pm"
import {
  ArrowLeft, Bell, FileText, Eye, Loader2, Download,
  AlertTriangle, BookOpen, CheckCircle2, Clock, RefreshCw, Sparkles,
  FileUp, Zap, AlertOctagon, BellRing, Trophy, ShieldAlert,
  ListChecks, ClipboardCheck, Hammer, ArrowRight,
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
    content_language?: ContentLanguage
  }
  stats?: {
    total_departments: number
    assigned: number
    not_started: number
    in_progress: number
    submitted: number
    approved: number
    reopened: number
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
  const { data: readiness } = useBuildReadiness(id)

  const fileRef = useRef<HTMLInputElement>(null)
  // Bumped on every pick/replace/remove so a stale in-flight language check
  // can't overwrite the current file's status (replace race guard).
  const docCheckSeq = useRef(0)

  const [reminderTarget, setReminderTarget] = useState<SessionSummary | null>(null)
  const [reminderMsg, setReminderMsg] = useState("")
  const [reminderPriority, setReminderPriority] = useState("normal")
  // Nudge-HOD dialog — a deadline-aware reminder pointed at a department's HOD.
  const [hodNudgeTarget, setHodNudgeTarget] = useState<SessionSummary | null>(null)
  const [hodNudgeMsg, setHodNudgeMsg] = useState("")
  const [hodNudgePriority, setHodNudgePriority] = useState("normal")
  const [reportResult, setReportResult] = useState<string | null>(null)
  // ID of the most recently generated report — needed to download the .docx.
  const [reportId, setReportId] = useState<string | null>(null)
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
  // Name of the cycle a pre-filled brief was carried over from (for the hint).
  const [prefillSource, setPrefillSource] = useState<{ name: string; fiscalYear: number | null } | null>(null)
  // Guards the pre-fill so it runs at most once per dialog-open and never
  // clobbers text the PM has already started typing/editing.
  const briefPrefilledRef = useRef(false)
  const [additionalContext, setAdditionalContext] = useState("")
  const [submittingKickoff, setSubmittingKickoff] = useState(false)
  // Module 1-6 additions
  const [numQuestions, setNumQuestions] = useState(12)
  // Locally selected kickoff document — NOT uploaded until the PM clicks Submit
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  // Prominent inline warning when the picked/uploaded document isn't in the
  // cycle's language. Set instantly for .txt (client pre-check) or after the
  // backend rejects a PDF/DOCX upload; cleared when the file changes.
  const [docLangWarning, setDocLangWarning] = useState<string | null>(null)
  // True while the picked document's language is being verified on the server.
  // The submit button stays disabled until the check clears.
  const [docLangChecking, setDocLangChecking] = useState(false)
  // Set when the kickoff request times out. A timeout is a FALSE NEGATIVE — the
  // backend is slow but likely still generating questions, so resubmitting would
  // fire a duplicate kickoff. We lock the form until the PM checks the cycle.
  const [kickoffTimedOut, setKickoffTimedOut] = useState(false)

  // ── Generate Report dialog ──────────────────────────────────────────────────
  // Shows approved sessions; PM can choose all-approved or pick specific ones
  const [reportDialogOpen, setReportDialogOpen] = useState(false)
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState<"all" | "pick">("all")

  // Computed from raw data BEFORE the early return so the effect order is stable
  const pmDashRaw = pmData as PMCycleDashboardData | undefined
  const cycleStatusRaw = pmDashRaw?.cycle?.status as string | undefined
  const hasKickoffRaw = !!(pmDashRaw?.cycle?.kickoff_brief)
  // Cycle MUST have a kickoff brief before the PM can do anything else.
  // The dialog auto-opens and cannot be dismissed until submitted for any cycle that
  // is loaded and still in draft/active state without a brief.
  const isForceKickoff =
    !hasKickoffRaw &&
    (cycleStatusRaw === "draft" || cycleStatusRaw === "active")

  useEffect(() => {
    if (isForceKickoff) setBriefOpen(true)
  }, [isForceKickoff])

  // Pre-fill the strategic brief from the company's most recent prior cycle.
  // Only fetch while the dialog is open and the cycle has no brief yet (a new
  // kickoff). A non-200 surfaces as no data here, so the field just stays empty.
  const { data: previousBrief } = usePreviousBrief(id, briefOpen && !hasKickoffRaw)

  useEffect(() => {
    // Run once per open, and never overwrite text the user has already entered.
    if (
      briefOpen &&
      previousBrief?.has_previous &&
      previousBrief.kickoff_brief &&
      !briefPrefilledRef.current &&
      !briefText.trim()
    ) {
      briefPrefilledRef.current = true
      setBriefText(previousBrief.kickoff_brief)
      setPrefillSource({
        name: previousBrief.source_cycle_name ?? "a previous cycle",
        fiscalYear: previousBrief.source_fiscal_year,
      })
    }
  }, [briefOpen, previousBrief, briefText])

  if (isLoading) return <PageLoader />

  const pmDash = pmData as PMCycleDashboardData | undefined
  const stats = pmDash?.stats
  const departments = pmDash?.departments || []
  const cycleName = pmDash?.cycle?.cycle_name || "Cycle Management"
  // Cycle language → drives the brief language warnings + submit gating below.
  const cycleLang = pmDash?.cycle?.content_language ?? "english"
  const kickoffLangOk =
    isLanguageAcceptable(briefText, cycleLang) &&
    isLanguageAcceptable(additionalContext, cycleLang)
  const cycleId = id

  const hasKickoff    = !!(pmDash?.cycle?.kickoff_brief)
  const needsReview   = departments.filter((d) => d.status === "submitted")
  const reopened      = departments.filter((d) => d.status === "reopened")
  const approved      = departments.filter((d) => d.status === "approved")
  const inProgress    = departments.filter((d) => d.status === "in_progress")
  const notStarted    = departments.filter((d) => d.status === "not_started")

  // At least one department has moved past "not started". Generating content is
  // pointless while every department is still untouched — disable the button until
  // there's actual work to consolidate.
  const hasActiveWork =
    departments.length > 0 && departments.some((d) => d.status !== "not_started")

  const submissionDeadline = pmDash?.cycle?.submission_deadline
  const isOverdue = (row: SessionSummary) =>
    !!submissionDeadline &&
    new Date() > new Date(submissionDeadline) &&
    row.status !== "submitted" &&
    row.status !== "approved"
  const overdueRows = departments.filter(isOverdue)
  const allDone =
    departments.length > 0 &&
    departments.every((d) => ["submitted", "approved"].includes(d.status))

  // Deadline urgency — drives the nudge's default priority + the dialog/banner chip.
  const deadlineDate = submissionDeadline ? new Date(submissionDeadline) : null
  const daysLeft = deadlineDate
    ? Math.ceil((deadlineDate.getTime() - Date.now()) / 86_400_000)
    : null
  const deadlineUrgency =
    daysLeft === null ? "none"
    : daysLeft < 0 ? "overdue"
    : daysLeft <= 2 ? "soon"
    : daysLeft <= 7 ? "near"
    : "ok"
  const urgencyPriority =
    deadlineUrgency === "overdue" || deadlineUrgency === "soon" ? "urgent"
    : deadlineUrgency === "near" ? "high"
    : "normal"
  const deadlineChip =
    daysLeft === null ? null
    : daysLeft < 0 ? { label: `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"}`, cls: "bg-red-100 text-red-700" }
    : daysLeft === 0 ? { label: "Due today", cls: "bg-red-100 text-red-700" }
    : daysLeft <= 2 ? { label: `Due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, cls: "bg-amber-100 text-amber-700" }
    : { label: `Due in ${daysLeft} days`, cls: "bg-slate-100 text-slate-600" }

  // Departments where the HOD is the blocker — questions to curate or answers to approve.
  const hodBlocked = departments.filter(
    (d) => (d.status === "hod_curation" || d.status === "submitted") && d.hod_user_id,
  )

  const escalations: { id?: string; reason?: string; message?: string; priority?: string; created_at?: string; department_name?: string }[] =
    Array.isArray(escalationsData)
      ? escalationsData
      : (escalationsData as { escalations?: unknown[] } | undefined)?.escalations ?? []

  /* ── Handlers ─────────────────────────────────────────────────────────────── */
  const resetKickoffForm = () => {
    setBriefText("")
    setPrefillSource(null)
    briefPrefilledRef.current = false
    setAdditionalContext("")
    setNumQuestions(12)
    setPendingFile(null)
    setDocLangWarning(null)
    setDocLangChecking(false)
    docCheckSeq.current++
    setKickoffTimedOut(false)
  }

  const handleSubmitKickoff = async () => {
    if (!briefText.trim()) {
      toast.error("Please write the strategic brief before submitting")
      return
    }
    setSubmittingKickoff(true)
    setKickoffTimedOut(false)
    setDocLangWarning(null)
    try {
      // One endpoint per submit. Backend converges both on the same pipeline.
      //   file picked    → POST /pm/kickoff/upload (multipart with `files`)
      //   no file picked → POST /pm/kickoff        (JSON)
      const result = pendingFile
        ? await uploadKickoffDoc.mutateAsync({
            file: pendingFile,
            cycleId,
            strategicBrief: briefText,
            numQuestions,
          })
        : await submitKickoff.mutateAsync({
            cycle_id: cycleId,
            strategic_brief: briefText,
            additional_context: additionalContext || undefined,
            num_questions: numQuestions,
          })

      // Optional info toast when the backend enriched the brief with AI context
      if (result?.enrichment_applied) {
        toast.info("Brief was expanded with AI context to improve question quality.")
      }

      // Questions are generated regardless of brief quality, so always close the
      // dialog and land the PM back on the cycle dashboard with the fresh data.
      setBriefOpen(false)
      resetKickoffForm()
      refetchPM()
    } catch (err) {
      // A timeout means the request was aborted client-side while the backend was
      // (very likely) still generating questions. Resubmitting would create a
      // DUPLICATE kickoff — so on timeout we lock the form and show a warning
      // panel instead. Non-timeout errors already surface via the hook's onError.
      const msg = (err as { message?: string })?.message ?? ""
      if (/timeout|ECONNABORTED/i.test(msg)) {
        setKickoffTimedOut(true)
      } else if (isDocumentLanguageError(err)) {
        // Wrong-language document: show the prominent inline banner (the hook
        // suppresses its toast for this case) and keep the file selected so the
        // PM can Replace it.
        setDocLangWarning(documentLanguageWarning(cycleLang))
      }
    } finally {
      setSubmittingKickoff(false)
    }
  }

  // Picking a file now only stores it locally. The actual upload is deferred
  // until the PM clicks "Submit & Generate Questions" — see handleSubmitKickoff.
  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setDocLangWarning(null)
    // Verify the document's language NOW (works for PDF/DOCX too, via the
    // backend) so the warning shows at attach time instead of at submit. The
    // submit button is disabled while this runs and on a mismatch. The seq guard
    // ensures a replace always re-checks and only the latest file's result wins.
    setDocLangChecking(true)
    const seq = ++docCheckSeq.current
    documentsApi
      .checkLanguage(file, cycleLang)
      .then((res) => {
        if (seq !== docCheckSeq.current) return // superseded by a newer pick/remove
        if (!res.matches) {
          const detected =
            res.detected_language === "arabic" || res.detected_language === "english"
              ? res.detected_language
              : undefined
          setDocLangWarning(documentLanguageWarning(cycleLang, detected))
        } else {
          setDocLangWarning(null)
        }
      })
      .catch(() => {
        // Network/precheck failure: fail open — the submit-time gate still protects.
        if (seq === docCheckSeq.current) setDocLangWarning(null)
      })
      .finally(() => {
        if (seq === docCheckSeq.current) setDocLangChecking(false)
      })
    // Clear the input so the same filename can be picked again later
    if (fileRef.current) fileRef.current.value = ""
  }

  const handleSendReminder = async () => {
    if (!reminderTarget || !reminderMsg) return
    if (!reminderTarget.user_id) {
      toast.error("No user is assigned to this department")
      return
    }
    await sendReminder.mutateAsync({
      user_ids: [reminderTarget.user_id],
      title: `Reminder: ${reminderTarget.department_name}`,
      message: reminderMsg,
      priority: reminderPriority as "low" | "normal" | "high" | "urgent",
      related_type: "cycle",
      related_id: id,
    })
    setReminderTarget(null)
    setReminderMsg("")
  }

  // ── Nudge HOD (deadline-aware reminder to a department's HOD) ──
  const firstName = (full?: string | null) => (full || "").trim().split(/\s+/)[0] || "there"

  const hodNudgeMessageFor = (d: SessionSummary) => {
    const who = firstName(d.hod_name)
    const what =
      d.status === "hod_curation"
        ? `review and approve the AI-generated questions for ${d.department_name} and assign a team member`
        : `review and approve ${d.department_name}'s submitted answers`
    const when =
      daysLeft === null ? `for the ${cycleName} report`
      : daysLeft < 0 ? `for the ${cycleName} report, which is now overdue (was due ${submissionDeadline ? formatDate(submissionDeadline) : "recently"})`
      : daysLeft === 0 ? `for the ${cycleName} report — it's due today (${submissionDeadline ? formatDate(submissionDeadline) : "today"})`
      : `for the ${cycleName} report, due ${submissionDeadline ? formatDate(submissionDeadline) : "soon"}${daysLeft <= 7 ? ` — only ${daysLeft} day${daysLeft === 1 ? "" : "s"} away` : ""}`
    const lead =
      deadlineUrgency === "overdue" || deadlineUrgency === "soon"
        ? "we're up against the deadline"
        : "we're working toward the deadline"
    return `Hi ${who}, ${lead} — please ${what} ${when}. Thanks for keeping things on track!`
  }

  const openHodNudge = (d: SessionSummary) => {
    setHodNudgeTarget(d)
    setHodNudgeMsg(hodNudgeMessageFor(d))
    setHodNudgePriority(urgencyPriority)
  }

  const handleSendHodNudge = async () => {
    if (!hodNudgeTarget?.hod_user_id || !hodNudgeMsg.trim()) return
    await sendReminder.mutateAsync({
      user_ids: [hodNudgeTarget.hod_user_id],
      title: `Action needed: ${cycleName}`,
      message: hodNudgeMsg,
      priority: hodNudgePriority as "low" | "normal" | "high" | "urgent",
      related_type: "cycle",
      related_id: id,
    })
    setHodNudgeTarget(null)
    setHodNudgeMsg("")
  }

  const handleNudgeAllHods = async () => {
    const ids = Array.from(new Set(hodBlocked.map((d) => d.hod_user_id).filter(Boolean) as string[]))
    if (ids.length === 0) return
    const due =
      daysLeft === null ? ""
      : daysLeft < 0 ? ` It is now overdue (was due ${submissionDeadline ? formatDate(submissionDeadline) : "recently"}).`
      : daysLeft === 0 ? ` It is due today (${submissionDeadline ? formatDate(submissionDeadline) : "today"}).`
      : ` It is due ${submissionDeadline ? formatDate(submissionDeadline) : "soon"}${daysLeft <= 7 ? ` — ${daysLeft} day${daysLeft === 1 ? "" : "s"} away` : ""}.`
    await sendReminder.mutateAsync({
      user_ids: ids,
      title: `Action needed: ${cycleName}`,
      message: `Please review and approve your department's pending items for the ${cycleName} report so we can build the final report.${due}`,
      priority: urgencyPriority as "low" | "normal" | "high" | "urgent",
      related_type: "cycle",
      related_id: id,
    })
  }

  const handleCreateEscalation = async () => {
    if (!escalationTarget || !escalationMsg.trim()) return
    await createEscalation.mutateAsync({
      session_id: escalationTarget.session_id,
      reason: escalationMsg,
      priority: escalationPriority,
    })
    setEscalationTarget(null)
    setEscalationMsg("")
  }

  const handleBulkReminder = async () => {
    if (!bulkMsg.trim()) return
    const userIds = [...notStarted, ...inProgress]
      .map((d) => d.user_id)
      .filter((u): u is string => !!u)
    if (userIds.length === 0) {
      toast.error("No pending departments have a user assigned")
      return
    }
    await bulkReminder.mutateAsync({
      user_ids: userIds,
      title: "Annual Report Submission Reminder",
      message: bulkMsg,
      priority: bulkPriority as "low" | "normal" | "high" | "urgent",
      related_type: "cycle",
      related_id: id,
    })
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
      const newReportId = res.report_id ?? res.id ?? null
      // Keep the report id so the PM can download the .docx afterwards
      setReportId(newReportId)
      // Show the backend preview immediately so the user sees something fast
      setReportResult(res.report ?? res.report_preview ?? null)
      toast.success(
        `Report generated — ${res.word_count ?? "—"} words` +
        (res.departments_included?.length ? ` from ${res.departments_included.length} department(s)` : "")
      )
      // Replace the truncated preview with the full report content straight
      // from the backend (GET /pm/reports/{report_id}).
      if (newReportId) {
        try {
          const full = await pmApi.getReport(newReportId)
          const content =
            full?.content ??
            full?.report ??
            full?.report_content ??
            full?.full_content ??
            full?.report_markdown ??
            null
          if (typeof content === "string" && content.trim()) {
            setReportResult(content)
          }
        } catch {
          // Keep the preview if the full fetch fails
        }
      }
    } finally {
      setGeneratingReport(false)
    }
  }

  // Trigger a browser download for a blob.
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  // Last-resort fallback — save the preview/markdown already on screen.
  const downloadMarkdownFallback = () => {
    if (!reportResult) return
    triggerDownload(
      new Blob([reportResult], { type: "text/markdown" }),
      `annual-report-${id.slice(0, 8)}.md`
    )
  }

  // Download the generated report as a .docx from the backend
  // (GET /pm/reports/{report_id}/download). Falls back to Markdown if needed.
  const downloadReport = async () => {
    setDownloadingReport(true)
    try {
      if (reportId) {
        const blob = await pmApi.downloadReportDocx(reportId)
        triggerDownload(blob, `annual-report-${id.slice(0, 8)}.docx`)
        return
      }
      // No report id available — generate the report first.
      toast.error("Generate the report first, then download.")
      downloadMarkdownFallback()
    } catch {
      toast.error("Couldn't download the .docx — saved a Markdown copy instead.")
      downloadMarkdownFallback()
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
          {row.status === "assigned" && (
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
              {["submitted","approved"].includes(row.status) ? "Submitted" : `${row.progress_percentage}% answered`}
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
          {/* Submitted sessions are reviewed by the department HOD — PM has no action */}
          {row.status === "approved" && (
            <Link href={`/pm/sessions/${row.session_id}`}>
              <Button
                size="sm"
                variant="outline"
                className="text-green-700 border-green-200 hover:bg-green-50"
                title="Open the approved submission"
              >
                <Eye className="h-3 w-3 mr-1" /> View Submission
              </Button>
            </Link>
          )}
          {row.status === "reopened" && (
            <Link href={`/pm/sessions/${row.session_id}`}>
              <Button size="sm" variant="outline" className="text-red-600 border-red-200">
                <Eye className="h-3 w-3 mr-1" /> Awaiting Resubmit
              </Button>
            </Link>
          )}
          {(row.status === "not_started" || row.status === "in_progress" || row.status === "assigned") && (
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
          {(row.status === "hod_curation" || row.status === "submitted") && row.hod_user_id && (
            <Button
              size="sm" variant="outline"
              onClick={() => openHodNudge(row)}
              className="text-indigo-600 border-indigo-200 hover:bg-indigo-50"
            >
              <BellRing className="h-3 w-3 mr-1" /> Nudge HOD
            </Button>
          )}
        </div>
      ),
    },
  ]

  /* ── Render ────────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">

      {/* Full-screen animated loader while AI generates the question set */}
      {submittingKickoff && <KickoffLoader />}

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
              <Button
                variant="outline"
                onClick={() => setBriefOpen(true)}
                disabled={hasKickoff}
                title={hasKickoff ? "Kickoff brief already submitted for this cycle" : undefined}
              >
                {hasKickoff
                  ? <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                  : <BookOpen className="mr-2 h-4 w-4" />}
                {hasKickoff ? "Kickoff Submitted" : "Submit Kickoff Brief"}
              </Button>
              {(notStarted.length > 0 || inProgress.length > 0) && (
                <Button variant="outline" onClick={() => setBulkOpen(true)}>
                  <BellRing className="mr-2 h-4 w-4" />
                  Remind All
                </Button>
              )}
              {reportResult && (
                <Button onClick={downloadReport}>
                  <Download className="mr-2 h-4 w-4" /> Download
                </Button>
              )}
            </div>
          }
        />
      </div>

      {/* ── Report Builder entry ── */}
      <div className="rounded-xl border bg-card px-6 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <Hammer className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold">Report Builder</h2>
              <p className="text-sm text-muted-foreground">
                Assemble this cycle&apos;s annual report section by section.
              </p>
              {!readiness?.sections_resolved ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Report sections haven&apos;t been set up for this cycle yet.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  {readiness.departments_approved} of {readiness.departments_total}{" "}
                  departments approved by their HOD.
                </p>
              )}
            </div>
          </div>
          {(() => {
            const total = readiness?.departments_total ?? 0
            const approved = readiness?.departments_approved ?? 0

            if (readiness?.can_build) {
              return (
                <Link href={`/pm/cycles/${id}/plan`}>
                  <Button>
                    Open Report Builder
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              )
            }

            const tooltip = !readiness?.sections_resolved
              ? "Report sections haven't been set up for this cycle yet"
              : total === 0
                ? "No departments assigned to this cycle yet"
                : `Available once every department's HOD has approved (${approved} of ${total} so far)`

            return (
              <Button disabled title={tooltip}>
                Open Report Builder
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )
          })()}
        </div>
        {readiness?.sections_resolved &&
          (readiness.departments_total ?? 0) > 0 &&
          readiness.departments_approved < readiness.departments_total && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                {readiness.departments_approved === 0
                  ? "No department has been approved by its HOD yet — the Report Builder unlocks once every department's HOD has approved."
                  : `${readiness.departments_approved} of ${readiness.departments_total} departments approved by their HOD — the Report Builder unlocks once every department is approved.`}
              </span>
            </div>
          )}
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
            <PipelineConnector done={(stats?.submitted ?? needsReview.length) > 0 || (stats?.approved ?? approved.length) > 0 || (stats?.reopened ?? reopened.length) > 0} />

            {/* Stage 3 – Submitted (awaiting PM review) */}
            <PipelineStage
              icon={ClipboardCheck}
              label="Submitted"
              count={String(stats?.submitted ?? needsReview.length)}
              done={(stats?.submitted ?? needsReview.length) === 0 && (stats?.approved ?? approved.length) > 0}
              active={(stats?.submitted ?? needsReview.length) > 0}
              colorClass="amber"
            />
            <PipelineConnector done={(stats?.approved ?? approved.length) > 0} />

            {/* Stage 4 – Needs Changes (PM sent back to dept) */}
            <PipelineStage
              icon={Eye}
              label="Needs Changes"
              count={String(stats?.reopened ?? reopened.length)}
              done={false}
              active={(stats?.reopened ?? reopened.length) > 0}
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
              Now with their HODs for approval — the report builder unlocks once every department&apos;s HOD has approved.
            </p>
          </div>
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
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold mt-1">{stats.total_departments}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              <p className="text-xs text-muted-foreground">Assigned</p>
            </div>
            <p className="text-2xl font-bold text-slate-600">{stats.assigned ?? 0}</p>
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
              <Eye className="h-3.5 w-3.5 text-red-500" />
              <p className="text-xs text-muted-foreground">Needs Changes</p>
            </div>
            <p className="text-2xl font-bold text-red-600">{stats.reopened ?? 0}</p>
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
              const isSubmitted = ["submitted", "approved"].includes(d.status)
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
                      {(d.status === "hod_curation" || d.status === "submitted") && d.hod_user_id && (
                        <Button
                          size="sm" variant="outline"
                          onClick={() => openHodNudge(d)}
                          className="h-7 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                        >
                          <BellRing className="h-3 w-3 mr-1" /> Nudge HOD
                        </Button>
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

      {/* ── Waiting on department HODs (read-only for the PM, but nudgeable) ── */}
      {hodBlocked.length > 0 && (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-amber-800">
              {hodBlocked.length} department{hodBlocked.length !== 1 ? "s" : ""} waiting on their HOD
              {deadlineChip && (
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", deadlineChip.cls)}>
                  {deadlineChip.label}
                </span>
              )}
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              {hodBlocked.map((d) => d.department_name).join(", ")}
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleNudgeAllHods}
            disabled={sendReminder.isPending}
            className="shrink-0 bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <BellRing className="h-3.5 w-3.5 mr-1.5" /> Nudge all HODs
          </Button>
        </div>
      )}

      {/* ── Reopened (waiting on dept) ── */}
      {reopened.length > 0 && (
        <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <Eye className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">
              {reopened.length} submission{reopened.length !== 1 ? "s" : ""} sent back — waiting on the department
            </p>
            <p className="text-sm text-red-700 mt-0.5">
              {reopened.map((d) => d.department_name).join(", ")} — these will return once revised
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
                  <p className="text-sm">{esc.reason ?? esc.message}</p>
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
          className="max-w-2xl max-h-[85vh] overflow-y-auto"
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
              A kickoff brief is required before you can manage this cycle. Submit one below to generate AI questions for each department.
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
                rows={4}
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
              {prefillSource && (
                <p className="text-xs text-muted-foreground">
                  Pre-filled from &ldquo;{prefillSource.name}&rdquo;
                  {prefillSource.fiscalYear ? ` (FY ${prefillSource.fiscalYear})` : ""} — edit as needed.
                </p>
              )}
              {(() => {
                const warn = languageMismatchWarning(
                  briefText, pmDash?.cycle?.content_language ?? "english",
                )
                return warn ? <p className="text-xs text-amber-600">{warn}</p> : null
              })()}
            </div>
            <div className="space-y-2">
              <Label>Additional Context <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Any specific themes, KPIs, or focus areas for this cycle..."
                rows={2}
                className="text-sm"
              />
              {(() => {
                const warn = languageMismatchWarning(
                  additionalContext, pmDash?.cycle?.content_language ?? "english",
                )
                return warn ? <p className="text-xs text-amber-600">{warn}</p> : null
              })()}
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
            <LanguageMismatchAlert message={docLangWarning} />
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              className="hidden"
              onChange={handleFilePick}
            />
            {pendingFile ? (
              <div className={cn(
                "w-full rounded-lg border p-3 flex items-center gap-3",
                docLangWarning
                  ? "border-destructive/40 bg-destructive/10"
                  : "border bg-card",
              )}>
                {docLangWarning ? (
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                ) : docLangChecking ? (
                  <Loader2 className="h-5 w-5 text-muted-foreground shrink-0 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium truncate",
                    docLangWarning ? "text-destructive" : "text-foreground",
                  )}>{pendingFile.name}</p>
                  <p className={cn(
                    "text-xs",
                    docLangWarning ? "text-destructive/80" : "text-muted-foreground",
                  )}>
                    {docLangWarning
                      ? "Wrong language — replace this file to continue."
                      : docLangChecking
                        ? "Checking document language…"
                        : <>Will be uploaded when you click <strong>Submit &amp; Generate Questions</strong>.</>}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => fileRef.current?.click()}
                  disabled={submittingKickoff}
                >
                  Replace
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => { setPendingFile(null); setDocLangWarning(null); setDocLangChecking(false); docCheckSeq.current++ }}
                  disabled={submittingKickoff}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={submittingKickoff}
                className="w-full rounded-lg border-2 border-dashed border-muted-foreground/30 p-4 text-center hover:border-primary/50 hover:bg-accent transition-colors"
              >
                <FileUp className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
                <p className="text-sm font-medium">Click to attach a document</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, DOC, TXT</p>
              </button>
            )}
          </div>

          {/* Timeout warning — the request was aborted client-side but the backend
              is almost certainly still generating questions. Resubmitting here
              would create a duplicate kickoff, so the submit button is locked. */}
          {kickoffTimedOut && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-900">Still generating questions…</p>
                  <p className="text-sm text-amber-800">
                    This is taking longer than expected. Your brief was most likely
                    received and questions are still being generated on the server.
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    <span className="font-medium">Do not resubmit</span> — that would
                    create a duplicate kickoff. Wait a moment, then check the cycle.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => {
                    setBriefOpen(false)
                    resetKickoffForm()
                    refetchPM()
                  }}
                >
                  Check cycle
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            {!isForceKickoff && (
              <Button variant="outline" onClick={() => setBriefOpen(false)}>Cancel</Button>
            )}
            {/* Force-kickoff on a draft cycle: the dialog can't just close (there's
                nothing behind it yet), so Cancel exits to the PM cycles list. */}
            {isForceKickoff && cycleStatusRaw === "draft" && (
              <Link href="/pm/cycles">
                <Button variant="outline">Cancel</Button>
              </Link>
            )}
            <Button
              onClick={handleSubmitKickoff}
              disabled={submittingKickoff || !briefText.trim() || kickoffTimedOut || !kickoffLangOk || docLangChecking || !!docLangWarning}
            >
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

      {/* ── Nudge HOD Dialog ── */}
      <Dialog open={!!hodNudgeTarget} onOpenChange={(o) => !o && setHodNudgeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nudge HOD — {hodNudgeTarget?.department_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2.5 text-xs text-indigo-800">
              <BellRing className="h-3.5 w-3.5 shrink-0" />
              <span>
                {hodNudgeTarget?.hod_name ? <b>{hodNudgeTarget.hod_name}</b> : "The HOD"}{" "}
                {hodNudgeTarget?.status === "hod_curation"
                  ? "needs to review the questions and assign a team member."
                  : "needs to review and approve the submitted answers."}
              </span>
              {deadlineChip && (
                <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold", deadlineChip.cls)}>
                  {deadlineChip.label}
                </span>
              )}
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                value={hodNudgeMsg}
                onChange={(e) => setHodNudgeMsg(e.target.value)}
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={hodNudgePriority} onValueChange={setHodNudgePriority}>
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
            <Button variant="outline" onClick={() => setHodNudgeTarget(null)}>Cancel</Button>
            <Button
              onClick={handleSendHodNudge}
              disabled={!hodNudgeMsg.trim() || sendReminder.isPending}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <BellRing className="mr-2 h-4 w-4" />
              {sendReminder.isPending ? "Sending…" : "Send nudge"}
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
