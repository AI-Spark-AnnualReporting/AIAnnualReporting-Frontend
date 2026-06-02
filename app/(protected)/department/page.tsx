"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useDepartmentDashboard } from "@/hooks/useSessions"
import { departmentApi } from "@/lib/api/department"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"
import { Progress } from "@/components/ui/progress"
import { EmptyState } from "@/components/ui/empty-state"
import { PageSkeleton } from "@/components/ui/skeletons"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SESSION_STATUSES } from "@/lib/constants"
import { SessionStatus } from "@/types"
import {
  ClipboardList, ArrowRight, Bell, Calendar, RotateCcw, Clock, Eye,
  FileUp, FileText, X,
} from "lucide-react"
import Link from "next/link"
import { formatDate, cn } from "@/lib/utils"
import { toast } from "sonner"
import { ExtractionLoader, type ExtractionResult } from "@/components/department/extraction-loader"

type StatusFilter = "all" | SessionStatus

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "assigned", label: SESSION_STATUSES.assigned.label },
  { value: "not_started", label: SESSION_STATUSES.not_started.label },
  { value: "in_progress", label: SESSION_STATUSES.in_progress.label },
  { value: "submitted", label: SESSION_STATUSES.submitted.label },
  { value: "approved", label: SESSION_STATUSES.approved.label },
  { value: "reopened", label: SESSION_STATUSES.reopened.label },
]

type SessionCTA = {
  label: string
  disabled: boolean
  variant: "default" | "outline" | "destructive"
  icon: React.ElementType
}

function getSessionCTA(status: SessionStatus, progress: number): SessionCTA {
  switch (status) {
    case "assigned":
      return { label: "Waiting for Questions", disabled: true, variant: "outline", icon: Clock }
    case "not_started":
      return { label: "Start Session", disabled: false, variant: "default", icon: ArrowRight }
    case "in_progress":
      return { label: progress > 0 ? "Continue Session" : "Start Session", disabled: false, variant: "default", icon: ArrowRight }
    case "submitted":
      return { label: "Awaiting Review", disabled: true, variant: "outline", icon: Clock }
    case "approved":
      return { label: "View Submission", disabled: false, variant: "outline", icon: Eye }
    case "reopened":
      return { label: "Revise & Resubmit", disabled: false, variant: "destructive", icon: RotateCcw }
  }
}

function getCardBorderColor(status: SessionStatus): string {
  switch (status) {
    case "assigned":    return "border-slate-200"
    case "not_started": return "border-gray-200"
    case "in_progress": return "border-blue-300"
    case "submitted":   return "border-yellow-300"
    case "approved":    return "border-green-400"
    case "reopened":    return "border-red-400"
  }
}

export default function DepartmentDashboard() {
  const { data, isLoading } = useDepartmentDashboard()
  const router = useRouter()
  const [filter, setFilter] = useState<StatusFilter>("all")
  const [startTarget, setStartTarget] = useState<string | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [starting, setStarting] = useState(false)
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || [])
    const valid: File[] = []
    const invalid: string[] = []
    for (const f of picked) {
      if (/\.(pdf|docx?|txt)$/i.test(f.name)) valid.push(f)
      else invalid.push(f.name)
    }
    if (invalid.length) toast.error(`Only PDF, Word, and TXT files are supported: ${invalid.join(", ")}`)
    setPendingFiles((prev) => [...prev, ...valid])
    e.target.value = ""
  }

  const removePendingFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const closeStartDialog = () => {
    setStartTarget(null)
    setPendingFiles([])
  }

  // Documents are optional. When files are attached: upload them, run AI
  // answer-extraction, then hand the user to the session workspace to review
  // the drafted answers. When none are attached: skip straight to the workspace
  // — the user can upload documents from there later.
  const handleStartSession = async () => {
    if (!startTarget) return
    const sessionId = startTarget
    const files = [...pendingFiles]

    // No documents attached — uploading is optional, so go straight in.
    if (files.length === 0) {
      closeStartDialog()
      router.push(`/department/sessions/${sessionId}`)
      return
    }

    // Swap the dialog for the full-screen extraction loader.
    setStartTarget(null)
    setExtractionResult(null)
    setStarting(true)

    // ── Phase 1: upload documents ───────────────────────────────────────────
    // If the upload itself fails (file size limit exceeded, network error,
    // timeout…) the documents never reached the server. Drop the loader, return
    // to the dashboard and reopen the upload dialog with the files still
    // selected so the user can adjust them and retry.
    try {
      for (const file of files) {
        await departmentApi.uploadDocument(sessionId, file)
      }
    } catch (err: unknown) {
      setStarting(false)
      setExtractionResult(null)
      setPendingFiles(files)      // keep the selection so the user can retry
      setStartTarget(sessionId)   // reopen the upload popup on the dashboard
      toast.error(
        (err as { message?: string })?.message ||
          "Document upload failed — please check your files and try again."
      )
      return
    }

    // ── Phase 2: extract answers ────────────────────────────────────────────
    // Documents are uploaded. If extraction fails the user can still answer
    // manually, so continue into the workspace as before.
    try {
      const result = await departmentApi.extractAnswers(sessionId)
      setExtractionResult({
        total_questions: result.total_questions,
        found_count: result.found_count,
        not_found_count: result.not_found_count,
      })
      // Let the success state breathe before entering the workspace.
      setTimeout(() => router.push(`/department/sessions/${sessionId}`), 2200)
    } catch (err: unknown) {
      toast.error(
        (err as { message?: string })?.message ||
          "We couldn't extract answers from your documents — you can still answer each question manually."
      )
      setTimeout(() => router.push(`/department/sessions/${sessionId}`), 1400)
    } finally {
      setPendingFiles([])
    }
  }

  if (isLoading) return <PageSkeleton />
  if (starting) return <ExtractionLoader result={extractionResult} />

  const sessions = data?.assignments || []
  const notifications = data?.notifications?.filter((n) => !n.is_read) || []
  // Use the first assignment's department_name if available (most users have one dept)
  const departmentLabel =
    sessions.length > 0 ? sessions[0].department_name : "Your"

  const visibleSessions =
    filter === "all" ? sessions : sessions.filter((s) => s.status === filter)
  const countFor = (f: StatusFilter) =>
    f === "all" ? sessions.length : sessions.filter((s) => s.status === f).length

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome, ${data?.user_name || ""}!`}
        description={`${departmentLabel} Department · Annual Report Workspace`}
      />

      {/* Unread notifications */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4"
            >
              <Bell className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-800">{n.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sessions */}
      <div>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-semibold text-lg">My Report Sessions</h2>
          <span className="text-xs text-muted-foreground">
            {visibleSessions.length} of {sessions.length}
          </span>
        </div>

        {/* Status filter chips */}
        {sessions.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b pb-3 mb-4">
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
                      active
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {sessions.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="No active sessions"
            description="You don't have any active reporting sessions. An admin will assign one when a cycle is activated."
          />
        ) : visibleSessions.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            No sessions in the <span className="font-medium">{FILTERS.find((f) => f.value === filter)?.label}</span> status.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visibleSessions.map((session) => {
              const cta = getSessionCTA(session.status, session.progress_percentage)
              const isReopened = session.status === "reopened"
              const isTerminalOrSubmitted =
                session.status === "submitted" || session.status === "approved"
              const isOverdue =
                session.submission_deadline &&
                new Date(session.submission_deadline) < new Date() &&
                !isTerminalOrSubmitted &&
                !isReopened
              const Icon = cta.icon

              return (
                <div
                  key={session.session_id}
                  className={cn(
                    "rounded-xl border bg-card p-6 space-y-4 transition-shadow hover:shadow-md",
                    getCardBorderColor(session.status),
                    isOverdue && "border-red-300",
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{session.cycle_name}</p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {session.department_name}
                      </p>
                    </div>
                    <StatusBadge status={session.status} variant="session" />
                  </div>

                  {/* Reopened — show PM feedback when present, otherwise a generic prompt */}
                  {isReopened && (
                    <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="h-3.5 w-3.5 text-red-600 shrink-0" />
                        <p className="text-xs font-semibold text-red-800">PM feedback</p>
                      </div>
                      <p className="mt-1 text-sm text-red-700">
                        {session.review_notes
                          ? session.review_notes
                          : "PM requested revisions — please update and resubmit."}
                      </p>
                    </div>
                  )}

                  {/* Progress */}
                  <div>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">{session.progress_percentage}%</span>
                    </div>
                    <Progress value={session.progress_percentage} className="h-2" />
                  </div>

                  {/* Deadline */}
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className={cn("text-muted-foreground", isOverdue && "text-red-600 font-medium")}>
                      Deadline: {formatDate(session.submission_deadline)}
                      {isOverdue && " — Overdue"}
                    </span>
                  </div>

                  {/* Action */}
                  <div className="flex gap-2 pt-1">
                    {session.status === "assigned" ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground italic px-1 py-2">
                        <Icon className="h-4 w-4 shrink-0" />
                        Awaiting questions from PM
                      </div>
                    ) : session.status === "not_started" ? (
                      <Button
                        className="w-full"
                        size="sm"
                        variant={cta.variant}
                        onClick={() => {
                          setPendingFiles([])
                          setStartTarget(session.session_id)
                        }}
                      >
                        <Icon className="mr-2 h-3.5 w-3.5" />
                        {cta.label}
                      </Button>
                    ) : cta.disabled ? (
                      <Button
                        className="w-full"
                        size="sm"
                        variant={cta.variant}
                        disabled
                      >
                        <Icon className="mr-2 h-3.5 w-3.5" />
                        {cta.label}
                      </Button>
                    ) : (
                      <Link href={`/department/sessions/${session.session_id}`} className="w-full">
                        <Button className="w-full" size="sm" variant={cta.variant}>
                          <Icon className="mr-2 h-3.5 w-3.5" />
                          {cta.label}
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Start Session — upload supporting documents ── */}
      <Dialog open={!!startTarget} onOpenChange={(o) => { if (!o) closeStartDialog() }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Start Session</DialogTitle>
            <DialogDescription>
              Optionally upload supporting documents for this report (financial reports, project
              summaries, etc.). Our AI will read them and draft an answer for every question —
              you&apos;ll review and refine each one in the next step. You can also skip this and
              upload documents later from the session workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              multiple
              className="hidden"
              onChange={handlePickFiles}
            />

            {pendingFiles.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border-2 border-dashed border-muted-foreground/30 p-5 text-center hover:border-primary/50 hover:bg-accent transition-colors"
              >
                <FileUp className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
                <p className="text-sm font-medium">Click to attach documents</p>
                <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, DOC, TXT — optional</p>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="rounded-lg border divide-y">
                  {pendingFiles.map((f, i) => (
                    <div key={`${f.name}-${i}`} className="flex items-center gap-3 p-2.5">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{f.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(f.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => removePendingFile(i)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="mr-2 h-3.5 w-3.5" />
                  Add more
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeStartDialog}>
              Cancel
            </Button>
            <Button onClick={handleStartSession}>
              {pendingFiles.length === 0 ? "Skip" : "Extract Answers & Start"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
