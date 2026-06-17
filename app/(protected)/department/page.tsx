"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useDepartmentDashboard } from "@/hooks/useSessions"
import { departmentApi } from "@/lib/api/department"
import { EmptyState } from "@/components/ui/empty-state"
import { PageLoader } from "@/components/ui/spinner"
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
import { useDocLanguageCheck } from "@/hooks/useDocLanguageCheck"
import { DocFileRow } from "@/components/ui/doc-file-row"
import { LanguageMismatchAlert } from "@/components/ui/language-mismatch-alert"
import {
  ClipboardList, ArrowRight, Bell, Calendar, RotateCcw, Clock, Eye, FileUp,
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

// Centriton status pill — coloured dot + label, keyed by session status.
const STATUS_PILL: Record<SessionStatus, { label: string; dot: string; text: string; bg: string }> = {
  assigned:    { label: "Assigned",      dot: "bg-slate-400",   text: "text-slate-600",   bg: "bg-slate-100" },
  not_started: { label: "Not Started",   dot: "bg-slate-400",   text: "text-slate-600",   bg: "bg-slate-100" },
  in_progress: { label: "In Progress",   dot: "bg-indigo-500",  text: "text-indigo-700",  bg: "bg-indigo-50" },
  submitted:   { label: "Submitted",     dot: "bg-amber-500",   text: "text-amber-700",   bg: "bg-amber-50" },
  approved:    { label: "Approved",      dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  reopened:    { label: "Needs Changes", dot: "bg-red-500",     text: "text-red-700",     bg: "bg-red-50" },
}

function StatusPill({ status }: { status: SessionStatus }) {
  const s = STATUS_PILL[status]
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", s.bg, s.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  )
}

export default function DepartmentDashboard() {
  const { data, isLoading } = useDepartmentDashboard()
  const router = useRouter()
  const [filter, setFilter] = useState<StatusFilter>("all")
  const [startTarget, setStartTarget] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Language of the cycle whose "Start Session" dialog is open — drives the
  // per-file wrong-language check below.
  const startAssignment = data?.assignments?.find((a) => a.session_id === startTarget)
  const docCheck = useDocLanguageCheck(startAssignment?.content_language ?? "english")

  const handlePickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || [])
    const valid: File[] = []
    const invalid: string[] = []
    for (const f of picked) {
      if (/\.(pdf|docx?|txt)$/i.test(f.name)) valid.push(f)
      else invalid.push(f.name)
    }
    if (invalid.length) toast.error(`Only PDF, Word, and TXT files are supported: ${invalid.join(", ")}`)
    e.target.value = ""
    docCheck.addFiles(valid)
  }

  const closeStartDialog = () => {
    setStartTarget(null)
    docCheck.reset()
  }

  // Documents are optional. When files are attached: upload them, run AI
  // answer-extraction, then hand the user to the session workspace to review
  // the drafted answers. When none are attached: skip straight to the workspace
  // — the user can upload documents from there later.
  const handleStartSession = async () => {
    if (!startTarget) return
    const sessionId = startTarget
    const files = [...docCheck.files]

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
      docCheck.setAll(files)      // keep + re-verify the selection so the user can retry
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
      docCheck.reset()
    }
  }

  if (isLoading) return <PageLoader />
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
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Welcome, {data?.user_name || ""}!
        </h1>
        <p className="mt-1.5 text-base text-slate-500">
          {departmentLabel} Department · Annual Report Workspace
        </p>
      </div>

      {/* Unread notifications */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4"
            >
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
              <p className="text-sm text-indigo-900">{n.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sessions */}
      <div>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-bold text-slate-900">My Report Sessions</h2>
          <span className="text-sm text-slate-400">
            {visibleSessions.length} of {sessions.length}
          </span>
        </div>

        {/* Status filter chips */}
        {sessions.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
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
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <span>{f.label}</span>
                  <span
                    className={cn(
                      "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold",
                      active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
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
          <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-sm text-slate-500">
            No sessions in the{" "}
            <span className="font-medium text-slate-700">
              {FILTERS.find((f) => f.value === filter)?.label}
            </span>{" "}
            status.
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {visibleSessions.map((session) => {
              const isReopened = session.status === "reopened"
              const isTerminalOrSubmitted =
                session.status === "submitted" || session.status === "approved"
              const isOverdue =
                session.submission_deadline &&
                new Date(session.submission_deadline) < new Date() &&
                !isTerminalOrSubmitted &&
                !isReopened
              const pct = session.progress_percentage

              return (
                <div
                  key={session.session_id}
                  className={cn(
                    "rounded-2xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md",
                    isOverdue ? "border-red-200" : "border-slate-100",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-slate-900">{session.cycle_name}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{session.department_name}</p>
                    </div>
                    <StatusPill status={session.status} />
                  </div>

                  {/* Reopened — show PM feedback when present, otherwise a generic prompt */}
                  {isReopened && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <RotateCcw className="h-3.5 w-3.5 shrink-0 text-red-600" />
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
                  <div className="mt-5">
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="text-slate-500">Progress</span>
                      <span className="font-bold text-slate-900">{pct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-all"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>

                  {/* Deadline */}
                  <div className="mt-4 flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className={cn("text-slate-500", isOverdue && "font-medium text-red-600")}>
                      Deadline: {formatDate(session.submission_deadline)}
                      {isOverdue && " — Overdue"}
                    </span>
                  </div>

                  {/* Action */}
                  <div className="mt-5">
                    {session.status === "assigned" ? (
                      <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm italic text-slate-500">
                        <Clock className="h-4 w-4 shrink-0" />
                        Awaiting questions from PM
                      </div>
                    ) : session.status === "submitted" ? (
                      <Button
                        className="w-full border-slate-200 bg-white text-slate-500"
                        variant="outline"
                        disabled
                      >
                        <Clock className="mr-2 h-4 w-4" />
                        Awaiting Review
                      </Button>
                    ) : session.status === "not_started" ? (
                      <Button
                        className="w-full bg-indigo-600 text-white hover:bg-indigo-700"
                        onClick={() => {
                          docCheck.reset()
                          setStartTarget(session.session_id)
                        }}
                      >
                        <ArrowRight className="mr-2 h-4 w-4" />
                        Start Session
                      </Button>
                    ) : session.status === "in_progress" ? (
                      <Link href={`/department/sessions/${session.session_id}`} className="block">
                        <Button className="w-full bg-indigo-600 text-white hover:bg-indigo-700">
                          <ArrowRight className="mr-2 h-4 w-4" />
                          {pct > 0 ? "Continue Session" : "Start Session"}
                        </Button>
                      </Link>
                    ) : isReopened ? (
                      <Link href={`/department/sessions/${session.session_id}`} className="block">
                        <Button className="w-full bg-red-600 text-white hover:bg-red-700">
                          <RotateCcw className="mr-2 h-4 w-4" />
                          Revise &amp; Resubmit
                        </Button>
                      </Link>
                    ) : (
                      <Link href={`/department/sessions/${session.session_id}`} className="block">
                        <Button
                          className="w-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          variant="outline"
                        >
                          View Submission
                          <Eye className="ml-2 h-4 w-4" />
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
        <DialogContent className="max-w-lg rounded-2xl border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-900">Start Session</DialogTitle>
            <DialogDescription className="text-slate-500">
              Optionally upload supporting documents for this report (financial reports, project
              summaries, etc.). Our AI will read them and draft an answer for every question —
              you&apos;ll review and refine each one in the next step. You can also skip this and
              upload documents later from the session workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <LanguageMismatchAlert message={docCheck.warning} />
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.txt"
              multiple
              className="hidden"
              onChange={handlePickFiles}
            />

            {docCheck.docs.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-8 text-center transition-colors hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
                  <FileUp className="h-5 w-5 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-900">Click to attach documents</p>
                <p className="mt-1 text-xs text-slate-500">PDF, DOCX, DOC, TXT — optional</p>
              </button>
            ) : (
              <div className="space-y-2">
                {docCheck.docs.map((d, i) => (
                  <DocFileRow
                    key={`${d.file.name}-${i}`}
                    name={d.file.name}
                    sizeKB={d.file.size / 1024}
                    lang={d.lang}
                    onRemove={() => docCheck.removeAt(i)}
                  />
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-slate-200 bg-white"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp className="mr-2 h-3.5 w-3.5" />
                  Add more
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" className="border-slate-200 bg-white" onClick={closeStartDialog}>
              Cancel
            </Button>
            <Button
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={handleStartSession}
              disabled={docCheck.blocked}
            >
              {docCheck.docs.length === 0 ? "Skip" : "Extract Answers & Start"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
