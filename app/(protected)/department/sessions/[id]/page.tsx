"use client"

import { use, useState, useEffect, useCallback, useRef } from "react"
import { useSession, useSubmitAnswers, useGenerateDraft } from "@/hooks/useSessions"
import { departmentApi } from "@/lib/api/department"
import {
  languageMismatchWarning,
  isLanguageAcceptable,
} from "@/lib/lang"
import { useDocLanguageCheck } from "@/hooks/useDocLanguageCheck"
import { DocFileRow } from "@/components/ui/doc-file-row"
import { LanguageMismatchAlert } from "@/components/ui/language-mismatch-alert"
import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Question } from "@/types"
import {
  ArrowLeft, CheckCircle2, Sparkles, ChevronRight, ChevronLeft,
  FileText, Loader2, LayoutGrid, Send, ArrowUpRight, Copy, Wand2,
  RotateCcw, PanelLeftOpen,
  PanelLeftClose, List, Ban, Info, Save, Download, FileUp,
} from "lucide-react"
import { ExtractionLoader, type ExtractionResult } from "@/components/department/extraction-loader"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

// ── Constants ──────────────────────────────────────────────────────────────────

// Canonical "Not Applicable" answer — submitted verbatim through the normal
// answers endpoint. A question whose answer starts with "N/A" is treated as N/A.
const NA_ANSWER = "N/A — This question does not apply to our department."
const isNAAnswer = (text: string | undefined) => !!text && text.startsWith("N/A")

// The document-extraction step stores this exact phrase when it can't find an
// answer in the uploaded documents. Treated as "no answer" — never pre-filled.
const NOT_FOUND_PREFIX = "information not found in uploaded documents"
const isNotFoundAnswer = (text: string | undefined) =>
  !!text && text.trim().toLowerCase().startsWith(NOT_FOUND_PREFIX)

// Centriyon status pill — coloured dot + label, keyed by session status.
const SESSION_PILL: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  assigned:    { label: "Assigned",      dot: "bg-slate-400",   text: "text-slate-600",   bg: "bg-slate-100" },
  not_started: { label: "Not Started",   dot: "bg-slate-400",   text: "text-slate-600",   bg: "bg-slate-100" },
  in_progress: { label: "In Progress",   dot: "bg-indigo-500",  text: "text-indigo-700",  bg: "bg-indigo-50" },
  submitted:   { label: "Submitted",     dot: "bg-amber-500",   text: "text-amber-700",   bg: "bg-amber-50" },
  approved:    { label: "Approved",      dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  reopened:    { label: "Needs Changes", dot: "bg-red-500",     text: "text-red-700",     bg: "bg-red-50" },
}

function SessionStatusPill({ status }: { status: string }) {
  const s = SESSION_PILL[status] ?? SESSION_PILL.not_started
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", s.bg, s.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  )
}

// Pull the text out of an AI refine response — checks the common field names.
function extractAiText(res: unknown): string | null {
  if (!res || typeof res !== "object") return null
  const o = res as Record<string, unknown>
  if (o.message && typeof o.message === "object") {
    const c = (o.message as Record<string, unknown>).content
    if (typeof c === "string" && c.trim()) return c
  }
  for (const k of ["suggestion", "answer", "result", "response", "content", "text", "reply"]) {
    const v = o[k]
    if (typeof v === "string" && v.trim()) return v
  }
  return null
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SessionWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const { data, isLoading, refetch } = useSession(id)
  const submitAnswers = useSubmitAnswers()
  const generateDraft = useGenerateDraft()

  // Layout
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"focused" | "overview">("focused")
  // Track whether the main nav sidebar is hidden (for the toggle button icon)
  const [navHidden, setNavHidden] = useState(() =>
    typeof window !== "undefined" && localStorage.getItem("sidebar-mode") === "hidden"
  )

  const toggleMainNav = () => {
    const next = navHidden ? "expanded" : "hidden"
    localStorage.setItem("sidebar-mode", next)
    setNavHidden(!navHidden)
    window.dispatchEvent(new CustomEvent("sidebar-set-mode", { detail: { mode: next } }))
  }

  // Q&A state
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  // Questions marked "Not Applicable" — local mirror of N/A answers
  const [naQuestions, setNaQuestions] = useState<Set<string>>(new Set())

  // "Ask AI to refine" — user-initiated only. aiResult holds the latest refined
  // answer for the current question (shown in the card); cleared on question switch.
  const [chatInput, setChatInput] = useState("")
  const [aiResult, setAiResult] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  // PDF download of the question list
  const [downloading, setDownloading] = useState(false)

  // Upload supporting documents — same flow as the dashboard's Start Session
  // popup: upload each file, run AI answer-extraction, then refresh the session
  // so the drafted answers appear in the cards.
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const session = data?.session
  const questions = session?.questions || []
  const currentQ = questions[currentIndex]
  const currentIsNA = !!currentQ && naQuestions.has(currentQ.question_id)
  // The answer stored on the server for the current question — the AI extraction
  // on first visit, the user's saved answer afterwards. Shown in the answer card.
  const storedAnswer = currentQ
    ? session?.answers?.find((a) => a.question_id === currentQ.question_id)?.answer
    : undefined
  const hasStoredAnswer = !!storedAnswer?.trim() && !isNotFoundAnswer(storedAnswer)

  // Answer language must match the cycle's language (warn + block Save).
  const cycleLang = session?.content_language ?? "english"
  // Per-file language status for the supporting-docs upload dialog.
  const docCheck = useDocLanguageCheck(cycleLang)
  const currentAnswerText = currentQ ? answers[currentQ.question_id] || "" : ""
  const currentAnswerLangWarning = languageMismatchWarning(currentAnswerText, cycleLang)
  const currentAnswerLangOk = isLanguageAcceptable(currentAnswerText, cycleLang)

  // Count only answers tied to a CURRENT question — answers for regenerated/
  // removed questions stay in session.answers but must not inflate progress.
  // Used for the "X/Y answered" label and the submit gate (needs to react instantly).
  const answeredCount = questions.filter((q) => answers[q.question_id]?.trim()).length
  // Progress % is read from the backend so it stays consistent with the dashboard,
  // PM, and admin views (single source of truth). It refreshes after each save →
  // refetch(), reflecting persisted answers rather than unsaved keystrokes.
  const progress = session?.progress_percentage ?? 0
  // Every question answered or marked N/A — ready to review & submit.
  const allComplete = questions.length > 0 && answeredCount === questions.length
  // N/A cap: at least half the questions must carry a real answer, so no more
  // than 50% may be marked "Not Applicable".
  const maxNA = Math.floor(questions.length / 2)
  const naLimitReached = naQuestions.size >= maxNA
  // Draft generation needs at least one REAL answer (N/A answers don't count) —
  // one is enough to unlock the button.
  const realAnsweredCount = questions.filter(
    (q) => answers[q.question_id]?.trim() && !isNAAnswer(answers[q.question_id])
  ).length
  const meetsAnswerMinimum = realAnsweredCount >= 1
  const isLastQuestion = questions.length > 0 && currentIndex === questions.length - 1
  const isSubmitted = session?.status === "submitted" || session?.status === "approved"
  const isReopened = session?.status === "reopened"
  const isApproved = session?.status === "approved"
  // Editing/AI/upload allowed in active, revision, or not-yet-started states.
  // (not_started is included because the backend flips status on first save.)
  const canEdit =
    session?.status === "in_progress" ||
    session?.status === "reopened" ||
    session?.status === "not_started"

  // Pre-fill saved answers, and mirror any already-saved N/A answers into local state.
  // The "not found" extraction marker is treated as no answer — it's surfaced in the
  // answer card instead, and must never land in the editable textarea.
  useEffect(() => {
    if (session?.answers) {
      const existing: Record<string, string> = {}
      const na = new Set<string>()
      session.answers.forEach((a) => {
        existing[a.question_id] = isNotFoundAnswer(a.answer) ? "" : a.answer
        if (isNAAnswer(a.answer)) na.add(a.question_id)
      })
      setAnswers(existing)
      setNaQuestions(na)
    }
  }, [session])

  // Switch question — clear the per-question AI refine state.
  const switchToQuestion = (idx: number) => {
    setCurrentIndex(idx)
    setAiResult(null)
    setChatInput("")
  }

  // Typing only updates local state — nothing is persisted until the user
  // explicitly clicks "Save Answer".
  const handleAnswerChange = useCallback(
    (questionId: string, value: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }))
      setSaved((prev) => ({ ...prev, [questionId]: false }))
    },
    []
  )

  // Copy a card answer (the document answer, or an AI refine result) into the
  // editable draft below.
  const applyAsAnswer = (text: string) => {
    if (!currentQ || !text.trim()) return
    const qId = currentQ.question_id
    setAnswers((prev) => ({ ...prev, [qId]: text }))
    setSaved((prev) => ({ ...prev, [qId]: false }))
    // Applying an answer clears any prior "Not Applicable" mark.
    setNaQuestions((prev) => {
      if (!prev.has(qId)) return prev
      const s = new Set(prev)
      s.delete(qId)
      return s
    })
    toast.success("Applied to your answer below")
  }

  // "Ask AI to refine, expand, or rephrase" — user-initiated. Sends the
  // instruction plus the current answer to the flexible /ai-assist endpoint
  // (handles tone changes and content additions) and shows the result in the
  // card. Stateless — the result is only persisted when the user saves.
  const sendRefine = async (prompt: string) => {
    if (!currentQ || !prompt.trim() || aiLoading) return
    setAiLoading(true)
    try {
      const currentAnswer =
        answers[currentQ.question_id]?.trim() || storedAnswer || ""
      const message = currentAnswer
        ? `${prompt.trim()}\n\n${currentAnswer}`
        : prompt.trim()
      const res = await departmentApi.aiAssist(id, {
        message,
        question_id: currentQ.question_id,
        include_documents: false,
      })
      const text = extractAiText(res)
      if (text) {
        setAiResult(text)
        setChatInput("")
      } else {
        toast.error("Couldn't get a response — please try again.")
      }
    } catch {
      toast.error("Couldn't reach the AI — please try again.")
    } finally {
      setAiLoading(false)
    }
  }

  // Submit the full set of non-empty answers (matches autosave/save behaviour).
  const persistAnswers = async (next: Record<string, string>) => {
    const payload = questions
      .filter((q) => next[q.question_id]?.trim())
      .map((q) => ({ question_id: q.question_id, question: q.question, answer: next[q.question_id] }))
    await submitAnswers.mutateAsync({ sessionId: id, data: { answers: payload } })
  }

  const handleSaveAnswer = async () => {
    if (!currentQ) return
    await persistAnswers(answers)
    setSaved((prev) => ({ ...prev, [currentQ.question_id]: true }))
    refetch()
  }

  // Mark a question "Not Applicable" — stores the canonical N/A string and saves immediately.
  const markAsNA = async (questionId: string) => {
    // Enforce the 50% rule: at least half the questions must be genuinely answered.
    if (!naQuestions.has(questionId) && naQuestions.size >= maxNA) {
      toast.error(
        `You can mark at most ${maxNA} of ${questions.length} questions as N/A — at least half must be answered.`
      )
      return
    }
    const next = { ...answers, [questionId]: NA_ANSWER }
    setAnswers(next)
    setNaQuestions((prev) => new Set(prev).add(questionId))
    setSaved((prev) => ({ ...prev, [questionId]: false }))
    try {
      await persistAnswers(next)
      setSaved((prev) => ({ ...prev, [questionId]: true }))
      toast.success("Marked as not applicable")
    } catch {
      toast.error("Couldn't save — please try again")
    }
  }

  // Undo an N/A mark — clears the answer locally so the user can answer normally.
  const undoNA = async (questionId: string) => {
    const next = { ...answers, [questionId]: "" }
    setAnswers(next)
    setNaQuestions((prev) => {
      const s = new Set(prev)
      s.delete(questionId)
      return s
    })
    setSaved((prev) => ({ ...prev, [questionId]: false }))
    try {
      await persistAnswers(next)
    } catch {
      toast.error("Couldn't update — please try again")
    }
  }

  // Download the question list as a PDF — regenerated by the backend on each call.
  const handleDownloadQuestions = async () => {
    if (downloading) return
    setDownloading(true)
    try {
      const { blob, filename } = await departmentApi.downloadQuestions(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("Couldn't download questions — please try again.")
    } finally {
      setDownloading(false)
    }
  }

  // ── Upload supporting documents ──────────────────────────────────────────────
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
    // Each file is language-checked independently; a wrong-language file stays
    // red and keeps the button disabled until removed.
    docCheck.addFiles(valid)
  }

  const closeUploadDialog = () => {
    setUploadOpen(false)
    docCheck.reset()
  }

  // Upload every file then run AI answer-extraction — identical to the dashboard
  // Start Session flow, but stays on this page and refreshes the answers in place.
  const handleUploadDocuments = async () => {
    const files = [...docCheck.files]
    if (files.length === 0) return

    // Swap the dialog for the full-screen extraction loader.
    setUploadOpen(false)
    setExtractionResult(null)
    setUploading(true)

    // ── Phase 1: upload documents ──────────────────────────────────────────────
    // If the upload fails the documents never reached the server — drop the
    // loader and reopen the dialog with the files still selected so the user can
    // adjust and retry.
    try {
      for (const file of files) {
        await departmentApi.uploadDocument(id, file)
      }
    } catch (err: unknown) {
      setUploading(false)
      setExtractionResult(null)
      // Restore the files (re-verifying language) and reopen the dialog so the
      // user can adjust and retry; a wrong-language file re-flags itself red.
      docCheck.setAll(files)
      setUploadOpen(true)
      toast.error(
        (err as { message?: string })?.message ||
          "Document upload failed — please check your files and try again."
      )
      return
    }

    // ── Phase 2: extract answers ───────────────────────────────────────────────
    // Documents are uploaded. Refetch on success or failure so any drafted
    // answers (and progress) are reflected in the workspace.
    try {
      const result = await departmentApi.extractAnswers(id)
      setExtractionResult({
        total_questions: result.total_questions,
        found_count: result.found_count,
        not_found_count: result.not_found_count,
      })
      // Let the success state breathe before returning to the workspace.
      setTimeout(() => { setUploading(false); refetch() }, 2200)
    } catch (err: unknown) {
      toast.error(
        (err as { message?: string })?.message ||
          "We couldn't extract answers from your documents — you can still answer each question manually."
      )
      setTimeout(() => { setUploading(false); refetch() }, 1400)
    } finally {
      docCheck.reset()
    }
  }

  const handleGenerateDraft = async () => {
    await generateDraft.mutateAsync(id)
    router.push(`/department/sessions/${id}/draft`)
  }

  // From the final question: jump to the draft page for review & submission.
  // Re-uses the existing draft if one has already been generated.
  const handleProceedToSubmit = async () => {
    if (session?.ai_generated_draft) {
      router.push(`/department/sessions/${id}/draft`)
      return
    }
    await handleGenerateDraft()
  }

  // ── Early returns ─────────────────────────────────────────────────────────────
  if (isLoading) return <PageLoader />
  if (uploading) return <ExtractionLoader result={extractionResult} />
  if (!session)
    return <EmptyState title="Session not found" description="This session doesn't exist or you don't have access." />

  // ── OVERVIEW mode ─────────────────────────────────────────────────────────────
  if (viewMode === "overview") {
    return (
      <div className="-m-8 flex h-[calc(100vh-72px)] flex-col bg-[#f5f6fc]">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-8 py-5">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            onClick={() => setViewMode("focused")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="min-w-0 flex-1 truncate text-2xl font-bold text-slate-900">{session.department_name}</h1>
          <span className="flex shrink-0 items-center gap-2 text-sm text-slate-500">
            {answeredCount}/{questions.length} answered
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
          </span>
          <span className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums">{progress}%</span>
          {questions.length > 0 && (
            <Button
              variant="outline"
              className="h-10 shrink-0 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              onClick={handleDownloadQuestions}
              disabled={downloading}
              title="Download the question list as a PDF"
            >
              {downloading
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Download className="mr-2 h-4 w-4" />}
              Download Questions
            </Button>
          )}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {questions.map((q: Question, idx: number) => {
              const isNa = naQuestions.has(q.question_id)
              // "Answered" means a real answer — N/A is shown distinctly.
              const answered = !isNa && !!answers[q.question_id]?.trim()
              return (
                <button
                  key={q.question_id}
                  onClick={() => { switchToQuestion(idx); setViewMode("focused") }}
                  className="rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-sm transition-all hover:shadow-md"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <div className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                      answered
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : isNa
                          ? "border-amber-500 bg-amber-500 text-white"
                          : "border-slate-300 text-slate-400"
                    )}>
                      {answered
                        ? <CheckCircle2 className="h-4 w-4" />
                        : isNa
                          ? <Ban className="h-4 w-4" />
                          : idx + 1}
                    </div>
                    <span className={cn(
                      "text-xs font-semibold",
                      answered ? "text-emerald-600" : isNa ? "text-amber-600" : "text-slate-400"
                    )}>
                      {answered ? "Answered" : isNa ? "Not applicable" : "Not answered"}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-sm leading-relaxed text-slate-700">{q.question}</p>
                  {answered && (
                    <p className="mt-2 line-clamp-2 text-xs text-slate-400">{answers[q.question_id]}</p>
                  )}
                  <div className="mt-4 flex items-center gap-1 text-sm font-semibold text-indigo-600">
                    {answered || isNa ? "Edit" : "Answer"} <ChevronRight className="h-4 w-4" />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── FOCUSED workspace ─────────────────────────────────────────────────────────
  return (
    <div className="-m-8 flex h-[calc(100vh-72px)] flex-col bg-[#f5f6fc]">

      {/* Status banners */}
      {(isReopened || isApproved) && (
        <div className={cn(
          "flex shrink-0 items-start gap-3 border-b px-6 py-3",
          isApproved ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
        )}>
          {isApproved
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            : <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
          <div>
            <p className={cn("text-sm font-semibold", isApproved ? "text-emerald-800" : "text-amber-800")}>
              {isApproved ? "Report Approved — this session is read-only" : "Revision Requested"}
            </p>
            {isReopened && session.review_notes && (
              <p className="mt-0.5 text-xs text-amber-700">{session.review_notes}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Top bar ───────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-slate-200 bg-white">
        {/* Row 1 — title + status */}
        <div className="flex items-center gap-2 px-6 py-3">
          <Link href="/department">
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          {/* Toggle main navigation sidebar — hides it completely for max horizontal space */}
          <Button
            variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100"
            onClick={toggleMainNav}
            title={navHidden ? "Show navigation" : "Hide navigation for more space"}
          >
            {navHidden
              ? <PanelLeftOpen className="h-4 w-4" />
              : <PanelLeftClose className="h-4 w-4" />}
          </Button>
          {/* Toggle question list panel */}
          <Button
            variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Hide question list" : "Show question list"}
          >
            <List className="h-4 w-4" />
          </Button>

          <h1 className="ml-1 truncate text-lg font-bold text-slate-900">{session.department_name}</h1>
          <SessionStatusPill status={session.status} />
          <span className="shrink-0 text-sm text-slate-500">{answeredCount}/{questions.length} answered</span>
        </div>

        {/* Row 2 — progress + actions */}
        <div className="flex items-center gap-3 border-t border-slate-100 px-6 py-2.5">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs font-medium text-slate-500 tabular-nums">{progress}%</span>
          </div>

          <div className="flex-1" />

          {canEdit && (
            <Button
              variant="outline" className="h-9 shrink-0 rounded-lg border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              onClick={() => { docCheck.reset(); setUploadOpen(true) }}
              title="Upload supporting documents and let AI draft answers"
            >
              <FileUp className="mr-2 h-4 w-4" />
              Upload Documents
            </Button>
          )}

          {questions.length > 0 && (
            <Button
              variant="outline" className="h-9 shrink-0 rounded-lg border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              onClick={handleDownloadQuestions}
              disabled={downloading}
              title="Download the question list as a PDF"
            >
              {downloading
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Download className="mr-2 h-4 w-4" />}
              Download Questions
            </Button>
          )}

          <Button
            variant="outline" className="h-9 shrink-0 rounded-lg border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            onClick={() => setViewMode("overview")}
          >
            <LayoutGrid className="mr-2 h-4 w-4" /> Overview
          </Button>

          {session.ai_generated_draft ? (
            <Link href={`/department/sessions/${id}/draft`}>
              <Button variant="outline" className="h-9 shrink-0 rounded-lg border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                <FileText className="mr-2 h-4 w-4" /> Draft Content
              </Button>
            </Link>
          ) : (
            <Button
              className="h-9 shrink-0 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={handleGenerateDraft}
              disabled={!canEdit || generateDraft.isPending || !meetsAnswerMinimum}
              title={
                !meetsAnswerMinimum
                  ? "Answer at least one question before generating draft content"
                  : undefined
              }
            >
              {generateDraft.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Sparkles className="mr-2 h-4 w-4" />}
              Generate Draft Content
            </Button>
          )}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      {questions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon={FileText}
            title="No questions yet"
            description="The PM needs to submit a kickoff brief first. Questions will appear here once generated."
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">

          {/* ── Question sidebar ── */}
          {sidebarOpen && (
            <div className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white xl:w-64">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Questions</p>
                <span className="text-xs text-slate-400">{answeredCount}/{questions.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {questions.map((q: Question, idx: number) => {
                  const isNa = naQuestions.has(q.question_id)
                  // "Answered" here means a real answer — N/A is shown distinctly.
                  const answered = !isNa && !!answers[q.question_id]?.trim()
                  const active = idx === currentIndex
                  return (
                    <button
                      key={q.question_id}
                      onClick={() => switchToQuestion(idx)}
                      className={cn(
                        "flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                        active ? "bg-indigo-50" : "hover:bg-slate-50"
                      )}
                    >
                      <div className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                        answered
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : isNa
                            ? "border-amber-500 bg-amber-500 text-white"
                            : active
                              ? "border-indigo-500 text-indigo-600"
                              : "border-slate-300 text-slate-400"
                      )}>
                        {answered
                          ? <CheckCircle2 className="h-3 w-3" />
                          : isNa
                            ? <Ban className="h-3 w-3" />
                            : idx + 1}
                      </div>
                      <p className={cn("line-clamp-2 text-xs leading-relaxed text-slate-600", active && "font-semibold text-slate-900")}>
                        {q.question}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Main workspace ──────────────────────────────────────────────── */}
          {currentQ && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">

              {/* Scrollable question + answer area */}
              <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
                {/* Question label + nav */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-400">
                      Q{currentIndex + 1} of {questions.length}
                    </span>
                    {saved[currentQ.question_id] && (
                      <span className="flex items-center gap-1 text-sm font-medium text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" /> Saved
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline" size="icon"
                      className="h-9 w-9 rounded-lg border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                      onClick={() => switchToQuestion(Math.max(0, currentIndex - 1))}
                      disabled={currentIndex === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline" size="icon"
                      className="h-9 w-9 rounded-lg border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                      onClick={() => switchToQuestion(Math.min(questions.length - 1, currentIndex + 1))}
                      disabled={currentIndex === questions.length - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Question */}
                <h2 className="mt-4 text-2xl font-bold leading-snug text-slate-900">
                  {currentQ.question}
                </h2>

                {/* ── Answer card — document answer, the user's saved answer, or
                    an AI refine result. No automatic AI call. ── */}
                <div className="mt-6">
                  {aiLoading ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50">
                        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                      </div>
                      <p className="text-sm font-medium text-slate-600">Asking the AI…</p>
                    </div>
                  ) : aiResult ? (
                    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 px-5 py-4">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white ring-1 ring-indigo-100">
                          <Wand2 className="h-4 w-4 text-indigo-600" />
                        </div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                          AI response
                        </p>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        {aiResult}
                      </p>
                      {!isSubmitted && (
                        <div className="mt-3 flex items-center gap-4 border-t border-indigo-100 pt-2.5">
                          <button
                            onClick={() => applyAsAnswer(aiResult)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" /> Use as answer
                          </button>
                          <button
                            onClick={() => { navigator.clipboard.writeText(aiResult); toast.success("Copied") }}
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </button>
                          <button
                            onClick={() => setAiResult(null)}
                            className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
                          >
                            <RotateCcw className="h-3 w-3" /> Discard
                          </button>
                        </div>
                      )}
                    </div>
                  ) : saved[currentQ.question_id] && hasStoredAnswer ? (
                    <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
                      <div className="mb-2 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                          Saved answer
                        </p>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        {storedAnswer}
                      </p>
                    </div>
                  ) : hasStoredAnswer ? (
                    <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-sm">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
                          <Wand2 className="h-4 w-4 text-indigo-600" />
                        </div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Answer from your documents
                        </p>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                        {storedAnswer}
                      </p>
                      {!isSubmitted && (
                        <div className="mt-3 flex items-center gap-4 border-t border-slate-100 pt-2.5">
                          <button
                            onClick={() => applyAsAnswer(storedAnswer ?? "")}
                            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
                          >
                            <ArrowUpRight className="h-3.5 w-3.5" /> Use as answer
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(storedAnswer ?? "")
                              toast.success("Copied")
                            }}
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                      <div className="flex items-start gap-3">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-amber-900">
                            Information not found in this document
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-amber-700">
                            The AI couldn&apos;t find an answer to this question in your
                            uploaded documents. Please answer it manually below.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Ask AI to refine, expand, or rephrase ── */}
              {!isSubmitted && (
                <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-6 py-3">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Ask AI to refine, expand, or rephrase… (Enter)"
                    className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50"
                    disabled={!canEdit || aiLoading}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && chatInput.trim()) sendRefine(chatInput)
                    }}
                  />
                  <Button
                    size="icon" className="h-11 w-11 shrink-0 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700"
                    onClick={() => sendRefine(chatInput)}
                    disabled={!canEdit || !chatInput.trim() || aiLoading}
                  >
                    {aiLoading
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              )}

              {/* ── Answer editor ── */}
              <div className={cn(
                "flex shrink-0 flex-col border-t border-slate-200 bg-white px-6 pb-4 pt-3 transition-colors",
                currentIsNA && "bg-slate-50"
              )}>
                <div className="mb-2 flex shrink-0 items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Answer</span>
                  {saved[currentQ.question_id] && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  <div className="flex-1" />
                  {!isSubmitted && !currentIsNA && (
                    <>
                      <Button
                        size="sm" variant="outline"
                        className="h-9 rounded-lg border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => markAsNA(currentQ.question_id)}
                        disabled={!canEdit || submitAnswers.isPending || naLimitReached}
                        title={
                          naLimitReached
                            ? `N/A limit reached — at least half of the ${questions.length} questions must be answered`
                            : undefined
                        }
                      >
                        <Ban className="mr-1.5 h-3.5 w-3.5" /> Reject
                      </Button>
                      <Button
                        size="sm"
                        className="h-9 rounded-lg bg-indigo-600 px-4 text-xs font-medium text-white hover:bg-indigo-700"
                        onClick={handleSaveAnswer}
                        disabled={!canEdit || submitAnswers.isPending || !currentAnswerLangOk}
                        title={!currentAnswerLangOk ? currentAnswerLangWarning ?? undefined : undefined}
                      >
                        {submitAnswers.isPending ? (
                          <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving…
                          </>
                        ) : (
                          <>
                            <Save className="mr-1.5 h-3.5 w-3.5" /> Save Answer
                          </>
                        )}
                      </Button>
                    </>
                  )}
                  <div className="ml-1 flex items-center gap-0.5 border-l border-slate-200 pl-2">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:bg-slate-100"
                      onClick={() => switchToQuestion(Math.max(0, currentIndex - 1))}
                      disabled={currentIndex === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="w-12 text-center text-xs tabular-nums text-slate-500">
                      {currentIndex + 1}/{questions.length}
                    </span>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-slate-500 hover:bg-slate-100"
                      onClick={() => switchToQuestion(Math.min(questions.length - 1, currentIndex + 1))}
                      disabled={currentIndex === questions.length - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {currentIsNA ? (
                  <div className="flex shrink-0 items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-600">
                        <Ban className="h-3.5 w-3.5" /> Marked as not applicable
                      </p>
                      <p className="mt-0.5 text-xs italic text-slate-400">
                        &ldquo;This question does not apply to our department.&rdquo;
                      </p>
                    </div>
                    {!isSubmitted && (
                      <Button
                        size="sm" variant="outline" className="h-8 shrink-0 border-slate-200 bg-white text-xs"
                        onClick={() => undoNA(currentQ.question_id)}
                        disabled={!canEdit || submitAnswers.isPending}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" /> Undo
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Textarea
                      value={answers[currentQ.question_id] || ""}
                      onChange={(e) => handleAnswerChange(currentQ.question_id, e.target.value)}
                      placeholder="Type your answer here…"
                      rows={4}
                      className="min-h-[96px] w-full resize-y rounded-xl border-slate-200 text-sm leading-relaxed"
                      disabled={!canEdit}
                    />
                    {currentAnswerLangWarning && (
                      <p className="text-xs text-amber-600">{currentAnswerLangWarning}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Submit CTA — appears on the last question once every
                  question is answered or marked N/A */}
              {isLastQuestion && allComplete && !isSubmitted && (
                <div className="shrink-0 bg-white px-6 pb-4 pt-0">
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-emerald-800">All questions complete</p>
                      <p className="text-xs text-emerald-700">
                        Every question is answered or marked N/A — review your draft and submit.
                      </p>
                    </div>
                    <Button
                      className="shrink-0 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                      onClick={handleProceedToSubmit}
                      disabled={!canEdit || generateDraft.isPending}
                    >
                      {generateDraft.isPending
                        ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                        : <Send className="mr-1.5 h-4 w-4" />}
                      Review &amp; Submit
                    </Button>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      )}

      {/* ── Upload supporting documents — same upload + AI extraction as the
          dashboard Start Session popup ── */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!o) closeUploadDialog() }}>
        <DialogContent className="max-w-lg rounded-2xl border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-900">Upload Supporting Documents</DialogTitle>
            <DialogDescription className="text-slate-500">
              Upload supporting documents for this report (financial reports, project
              summaries, etc.). Our AI will read them and draft an answer for every question —
              you can review and refine each one here.
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
                <p className="mt-1 text-xs text-slate-500">PDF, DOCX, DOC, TXT</p>
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
            <Button variant="outline" className="border-slate-200 bg-white" onClick={closeUploadDialog}>
              Cancel
            </Button>
            <Button
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={handleUploadDocuments}
              disabled={docCheck.docs.length === 0 || docCheck.blocked}
            >
              Extract Answers
              <Sparkles className="ml-2 h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
