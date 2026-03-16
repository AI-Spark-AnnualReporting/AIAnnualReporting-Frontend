"use client"

import { use, useState, useEffect, useCallback, useRef } from "react"
import { useSession, useSubmitAnswers, useGenerateDraft } from "@/hooks/useSessions"
import { departmentApi } from "@/lib/api/department"
import { chatApi } from "@/lib/api/chat"
import { PageSkeleton } from "@/components/ui/skeletons"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Question } from "@/types"
import {
  ArrowLeft, CheckCircle2, Sparkles, ChevronRight, ChevronLeft,
  FileText, Loader2, ArrowUpRight, LayoutGrid, Send, Bot,
  User as UserIcon, RotateCcw, PanelLeftOpen, Copy,
  Wand2, Paperclip, PanelLeftClose, List,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

// ── Types ──────────────────────────────────────────────────────────────────────
interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Pull a string out of an AI API response using only explicit field names.
 * Does NOT fall back to iterating all values — that picks up the "question" field.
 */
function extractContent(res: unknown): string | null {
  if (!res || typeof res !== "object") return null
  const obj = res as Record<string, unknown>

  // { assistant_message: { content: "..." } } — Chat API shape
  if (obj.assistant_message && typeof obj.assistant_message === "object") {
    const nested = obj.assistant_message as Record<string, unknown>
    if (typeof nested.content === "string" && nested.content.trim())
      return nested.content
  }

  // { message: { content: "..." } } — alternative nested shape
  if (obj.message && typeof obj.message === "object") {
    const nested = obj.message as Record<string, unknown>
    if (typeof nested.content === "string" && nested.content.trim())
      return nested.content
  }

  // Explicit answer field names (most-specific first, no ambiguous fallbacks)
  const KEYS = [
    "suggested_answer", "suggestion", "answer", "result", "ai_suggestion", "ai_response",
    "content", "text", "output", "generated_text", "completion", "reply", "response",
  ]
  for (const k of KEYS) {
    const v = obj[k]
    if (typeof v === "string" && v.trim().length > 0) return v
  }

  return null
}

// ── Constants ──────────────────────────────────────────────────────────────────
const TONE_ACTIONS = [
  { label: "Executive summary", prompt: "Rewrite in an executive tone — strategic, concise, and impact-focused" },
  { label: "Add data & metrics", prompt: "Expand with specific KPIs, metrics and quantifiable achievements" },
  { label: "Bullet points", prompt: "Restructure as a clear, organised bullet-point list" },
  { label: "Shorten it", prompt: "Make more concise while keeping every key point" },
  { label: "Formal tone", prompt: "Rewrite in formal language appropriate for a board-level annual report" },
]

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
  const chatEndRef = useRef<HTMLDivElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const [autoSaving, setAutoSaving] = useState(false)

  // Evidence upload
  const [uploadingDoc, setUploadingDoc] = useState(false)

  // AI Chat
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState("")
  const [chatLoading, setChatLoading] = useState(false)

  const session = data?.session
  const questions = session?.questions || []
  const currentQ = questions[currentIndex]

  const answeredCount = Object.values(answers).filter((v) => v?.trim()).length
  const progress = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0
  const isSubmitted = session?.status === "submitted" || session?.status === "approved"
  const isReopened = session?.status === "reopened"
  const isApproved = session?.status === "approved"

  // Pre-fill saved answers
  useEffect(() => {
    if (session?.answers) {
      const existing: Record<string, string> = {}
      session.answers.forEach((a) => { existing[a.question_id] = a.answer })
      setAnswers(existing)
    }
  }, [session])

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages, chatLoading])

  const switchToQuestion = (idx: number) => {
    setCurrentIndex(idx)
    setConversationId(null)
    setChatMessages([])
    setChatInput("")
  }

  const handleAnswerChange = useCallback(
    (questionId: string, value: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }))
      setSaved((prev) => ({ ...prev, [questionId]: false }))
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
      autosaveTimer.current = setTimeout(async () => {
        setAutoSaving(true)
        try {
          const updated = { ...answers, [questionId]: value }
          const payload = questions
            .filter((q) => updated[q.question_id]?.trim())
            .map((q) => ({ question_id: q.question_id, question: q.question, answer: updated[q.question_id] }))
          if (payload.length > 0) {
            await departmentApi.submitAnswers(id, { answers: payload })
            setSaved((prev) => ({ ...prev, [questionId]: true }))
          }
        } catch { /* silent autosave fail */ }
        finally { setAutoSaving(false) }
      }, 2000)
    },
    [answers, questions, id]
  )

  const handleSaveAnswer = async () => {
    if (!currentQ) return
    const payload = questions
      .filter((q) => answers[q.question_id]?.trim())
      .map((q) => ({ question_id: q.question_id, question: q.question, answer: answers[q.question_id] }))
    await submitAnswers.mutateAsync({ sessionId: id, data: { answers: payload } })
    setSaved((prev) => ({ ...prev, [currentQ.question_id]: true }))
    refetch()
  }

  const getOrCreateConversation = async (): Promise<string> => {
    if (conversationId) return conversationId
    const conv = await chatApi.createConversation({
      title: `${session?.department_name || "Annual Report"} – Q&A`,
    })
    const newId = conv.conversation_id || (conv as Record<string, string>).id
    setConversationId(newId)
    return newId
  }

  /**
   * Tries AI endpoints in sequence, returns first successful string content.
   * All attempts are logged so failures are visible in DevTools console.
   */
  const fetchAiContent = async (displayText: string, isSuggest: boolean): Promise<string | null> => {
    if (!currentQ) return null
    const currentAnswer = answers[currentQ.question_id] || ""

    // 1 ── Chat API ────────────────────────────────────────────────────────────
    try {
      const convId = await getOrCreateConversation()
      const msg = isSuggest
        ? [
            "You are helping a department write their annual report.",
            `Question: "${currentQ.question}"`,
            currentAnswer ? `Existing draft: "${currentAnswer.substring(0, 400)}"` : "",
            "Write a comprehensive, professional answer.",
          ].filter(Boolean).join("\n")
        : [
            displayText,
            `Context — Question: "${currentQ.question}"`,
            currentAnswer ? `Current answer: "${currentAnswer.substring(0, 300)}"` : "",
          ].filter(Boolean).join("\n")
      const res = await chatApi.sendMessage(convId, msg)
      console.info("[AI raw] Chat API:", res)
      const c = extractContent(res)
      if (c) { console.info("[AI ✓] Chat API"); return c }
      console.warn("[AI ✗] Chat API returned unrecognised shape:", Object.keys(res as object))
    } catch (e) { console.warn("[AI ✗] Chat API:", e) }

    // 2 ── GET /questions/{id}/suggestion ─────────────────────────────────────
    try {
      const res = await departmentApi.getAiSuggestion(id, currentQ.question_id)
      console.info("[AI raw] getAiSuggestion:", res)
      const c = extractContent(res)
      if (c) { console.info("[AI ✓] getAiSuggestion"); return c }
      console.warn("[AI ✗] getAiSuggestion returned unrecognised shape:", Object.keys(res as object))
    } catch (e) { console.warn("[AI ✗] getAiSuggestion:", e) }

    // 3 ── POST suggest-answer ─────────────────────────────────────────────────
    try {
      const res = await departmentApi.suggestAnswer(id, {
        question_id: currentQ.question_id,
        question: currentQ.question,
        context: currentAnswer,
      })
      console.info("[AI raw] suggestAnswer:", res)
      const c = extractContent(res)
      if (c) { console.info("[AI ✓] suggestAnswer"); return c }
      console.warn("[AI ✗] suggestAnswer returned unrecognised shape:", Object.keys(res as object))
    } catch (e) { console.warn("[AI ✗] suggestAnswer:", e) }

    // 4 ── POST conversation ───────────────────────────────────────────────────
    try {
      const res = await departmentApi.conversationPrompt(id, {
        question_id: currentQ.question_id,
        question: currentQ.question,
        current_answer: currentAnswer,
        prompt: displayText,
      })
      console.info("[AI raw] conversationPrompt:", res)
      const c = extractContent(res)
      if (c) { console.info("[AI ✓] conversationPrompt"); return c }
      console.warn("[AI ✗] conversationPrompt returned unrecognised shape:", Object.keys(res as object))
    } catch (e) { console.warn("[AI ✗] conversationPrompt:", e) }

    return null
  }

  const sendChatMessage = async (displayText: string, isSuggest = false) => {
    if (!currentQ || chatLoading) return
    setChatMessages((prev) => [...prev, { role: "user", content: displayText }])
    setChatLoading(true)
    const content = await fetchAiContent(displayText, isSuggest)
    if (content) {
      setChatMessages((prev) => [...prev, { role: "assistant", content }])
    } else {
      toast.error("Couldn't reach the AI — check the browser console for details.")
      setChatMessages((prev) => prev.slice(0, -1))
    }
    setChatLoading(false)
  }

  const applyToAnswer = (content: string) => {
    if (!currentQ) return
    setAnswers((prev) => ({ ...prev, [currentQ.question_id]: content }))
    setSaved((prev) => ({ ...prev, [currentQ.question_id]: false }))
    toast.success("Applied to your answer below")
  }

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase()
    if (![".pdf", ".docx", ".doc", ".txt"].includes(ext)) {
      toast.error("Upload PDF, Word, or TXT files only.")
      e.target.value = ""
      return
    }
    setUploadingDoc(true)
    try {
      await departmentApi.uploadDocument(id, file)
      toast.success(`"${file.name}" uploaded — AI will reference this document`)
      refetch()
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || "Upload failed.")
    } finally {
      setUploadingDoc(false)
      e.target.value = ""
    }
  }

  const handleGenerateDraft = async () => {
    await generateDraft.mutateAsync(id)
    router.push(`/department/sessions/${id}/draft`)
  }

  // ── Early returns ─────────────────────────────────────────────────────────────
  if (isLoading) return <PageSkeleton />
  if (!session)
    return <EmptyState title="Session not found" description="This session doesn't exist or you don't have access." />

  // ── OVERVIEW mode ─────────────────────────────────────────────────────────────
  if (viewMode === "overview") {
    return (
      <div className="-mx-6 -mt-6 -mb-6 flex flex-col h-[calc(100vh-4rem)] bg-background">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b bg-card shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewMode("focused")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-sm truncate">{session.department_name}</h1>
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{answeredCount}/{questions.length} answered</span>
          <Progress value={progress} className="w-16 h-1.5 shrink-0" />
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">{progress}%</span>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {questions.map((q: Question, idx: number) => {
              const answered = !!answers[q.question_id]?.trim()
              return (
                <button
                  key={q.question_id}
                  onClick={() => { switchToQuestion(idx); setViewMode("focused") }}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-all hover:shadow-md",
                    answered ? "border-green-200 bg-green-50" : "border-border bg-card hover:border-primary/40"
                  )}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold border",
                      answered ? "bg-green-500 border-green-500 text-white" : "border-muted-foreground text-muted-foreground"
                    )}>
                      {answered ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                    </div>
                    <span className={cn("text-xs font-medium", answered ? "text-green-700" : "text-muted-foreground")}>
                      {answered ? "Answered" : "Not answered"}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed line-clamp-3">{q.question}</p>
                  {answered && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{answers[q.question_id]}</p>
                  )}
                  <div className="flex items-center gap-1 mt-3 text-xs text-primary font-medium">
                    {answered ? "Edit" : "Answer"} <ChevronRight className="h-3 w-3" />
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
    <div className="-mx-6 -mt-6 -mb-6 flex flex-col h-[calc(100vh-4rem)] bg-background">

      {/* Status banners */}
      {(isReopened || isApproved) && (
        <div className={cn(
          "flex items-start gap-3 px-5 py-3 border-b shrink-0",
          isApproved ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"
        )}>
          {isApproved
            ? <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
            : <RotateCcw className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />}
          <div>
            <p className={cn("text-sm font-semibold", isApproved ? "text-green-800" : "text-amber-800")}>
              {isApproved ? "Report Approved — this session is read-only" : "Revision Requested"}
            </p>
            {isReopened && session.review_notes && (
              <p className="text-xs text-amber-700 mt-0.5">{session.review_notes}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Top bar ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-card shrink-0">
        <Link href="/department">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        {/* Toggle main navigation sidebar — hides it completely for max horizontal space */}
        <Button
          variant="ghost" size="icon" className="h-8 w-8 shrink-0"
          onClick={toggleMainNav}
          title={navHidden ? "Show navigation" : "Hide navigation for more space"}
        >
          {navHidden
            ? <PanelLeftOpen className="h-4 w-4" />
            : <PanelLeftClose className="h-4 w-4" />}
        </Button>
        {/* Toggle question list panel */}
        <Button
          variant="ghost" size="icon" className="h-8 w-8 shrink-0"
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? "Hide question list" : "Show question list"}
        >
          <List className="h-4 w-4" />
        </Button>

        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sm truncate leading-tight">{session.department_name}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={session.status} variant="session" />
            <span className="text-xs text-muted-foreground">{answeredCount}/{questions.length} answered</span>
            {autoSaving && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" /> Saving…
              </span>
            )}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <Progress value={progress} className="w-20 h-1.5" />
          <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
        </div>

        <Button
          variant="outline" size="sm" className="h-8 text-xs shrink-0"
          onClick={() => setViewMode("overview")}
        >
          <LayoutGrid className="h-3.5 w-3.5 mr-1.5" /> Overview
        </Button>

        {session.ai_generated_draft ? (
          <Link href={`/department/sessions/${id}/draft`}>
            <Button size="sm" variant="outline" className="h-8 shrink-0">
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Draft
            </Button>
          </Link>
        ) : (
          <Button
            size="sm" className="h-8 shrink-0"
            onClick={handleGenerateDraft}
            disabled={answeredCount === 0 || generateDraft.isPending}
          >
            {generateDraft.isPending
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
            Generate Draft
          </Button>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      {questions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={FileText}
            title="No questions yet"
            description="The PM needs to submit a kickoff brief first. Questions will appear here once generated."
          />
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">

          {/* ── Question sidebar ── */}
          {sidebarOpen && (
            <div className="w-56 xl:w-64 shrink-0 flex flex-col border-r bg-card overflow-hidden">
              <div className="px-3 py-2.5 border-b bg-muted/30 flex items-center justify-between shrink-0">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Questions</p>
                <span className="text-xs text-muted-foreground">{answeredCount}/{questions.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {questions.map((q: Question, idx: number) => {
                  const answered = !!answers[q.question_id]?.trim()
                  const active = idx === currentIndex
                  return (
                    <button
                      key={q.question_id}
                      onClick={() => switchToQuestion(idx)}
                      className={cn(
                        "w-full flex items-start gap-2.5 px-3 py-3 text-left transition-colors border-b border-border/30",
                        active
                          ? "bg-primary/10 border-l-2 border-l-primary pl-2.5"
                          : "hover:bg-accent"
                      )}
                    >
                      <div className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium",
                        answered
                          ? "bg-green-500 border-green-500 text-white"
                          : active
                            ? "border-primary text-primary"
                            : "border-muted-foreground/50 text-muted-foreground"
                      )}>
                        {answered ? <CheckCircle2 className="h-3 w-3" /> : idx + 1}
                      </div>
                      <p className={cn("text-xs leading-relaxed line-clamp-2", active && "font-medium text-foreground")}>
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
            <div className="flex-1 flex flex-col min-h-0 min-w-0">

              {/* Question header */}
              <div className="px-6 py-4 border-b bg-card shrink-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        Q{currentIndex + 1} of {questions.length}
                      </span>
                      {saved[currentQ.question_id] && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Saved
                        </span>
                      )}
                    </div>
                    <p className="text-base font-medium leading-relaxed text-foreground">
                      {currentQ.question}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 mt-1">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => switchToQuestion(Math.max(0, currentIndex - 1))}
                      disabled={currentIndex === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => switchToQuestion(Math.min(questions.length - 1, currentIndex + 1))}
                      disabled={currentIndex === questions.length - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* ── AI Chat area (flex-1 — takes most of the screen) ── */}
              <div className="flex-1 overflow-y-auto min-h-0 bg-background">
                {/* Empty state */}
                {chatMessages.length === 0 && !chatLoading && (
                  <div className="flex flex-col items-center justify-center h-full px-8 py-10 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 border border-primary/20">
                      <Wand2 className="h-7 w-7 text-primary" />
                    </div>
                    <p className="text-base font-semibold mb-1">AI Assistant</p>
                    <p className="text-sm text-muted-foreground max-w-sm mb-6 leading-relaxed">
                      Generate a professional answer based on the question context and any session documents.
                    </p>
                    {!isSubmitted && (
                      <>
                        <Button
                          className="w-full max-w-xs h-11 text-sm mb-5"
                          onClick={() => sendChatMessage(`Suggest an answer for: "${currentQ.question}"`, true)}
                          disabled={chatLoading}
                        >
                          {chatLoading
                            ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            : <Sparkles className="h-4 w-4 mr-2" />}
                          Generate Answer
                        </Button>
                        <div className="flex items-center gap-3 w-full max-w-xs mb-4">
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-xs text-muted-foreground">or choose a style</span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                          {TONE_ACTIONS.map((t) => (
                            <button
                              key={t.label}
                              onClick={() => sendChatMessage(t.prompt, false)}
                              disabled={chatLoading}
                              className="text-xs px-3 py-1.5 rounded-full border bg-card hover:bg-accent hover:border-primary/30 transition-colors disabled:opacity-50 font-medium"
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Messages */}
                {(chatMessages.length > 0 || chatLoading) && (
                  <div className="px-6 py-5 space-y-5">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={cn("flex gap-3", msg.role === "user" && "flex-row-reverse")}>
                        <div className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-0.5",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted border border-border"
                        )}>
                          {msg.role === "user"
                            ? <UserIcon className="h-4 w-4" />
                            : <Bot className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div className={cn(
                          "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-muted/60 border rounded-tl-sm"
                        )}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                          {msg.role === "assistant" && !isSubmitted && (
                            <div className="flex items-center gap-3 mt-3 pt-2.5 border-t border-border/50">
                              <button
                                onClick={() => applyToAnswer(msg.content)}
                                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                              >
                                <ArrowUpRight className="h-3.5 w-3.5" /> Use as answer
                              </button>
                              <button
                                onClick={() => { navigator.clipboard.writeText(msg.content); toast.success("Copied") }}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                              >
                                <Copy className="h-3 w-3" /> Copy
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Typing indicator */}
                    {chatLoading && (
                      <div className="flex gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted border border-border">
                          <Bot className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="rounded-2xl rounded-tl-sm bg-muted/60 border px-5 py-4">
                          <div className="flex gap-1.5 items-center">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "160ms" }} />
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "320ms" }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>

              {/* ── Bottom panel ── compact to maximise chat space ─────────── */}
              <div className="border-t bg-card shrink-0">

                {/* Refine chips — only visible when a conversation is active */}
                {chatMessages.length > 0 && !isSubmitted && (
                  <div className="px-4 pt-2 pb-1 flex flex-wrap gap-1.5">
                    {TONE_ACTIONS.slice(0, 4).map((t) => (
                      <button
                        key={t.label}
                        onClick={() => sendChatMessage(t.prompt, false)}
                        disabled={chatLoading}
                        className="text-xs px-3 py-1 rounded-full border hover:bg-accent hover:border-primary/30 transition-colors disabled:opacity-50 font-medium"
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Chat input row — attach + single-line input + send */}
                {!isSubmitted && (
                  <div className="px-4 py-2 flex items-center gap-2">
                    {/* Attach document */}
                    <label className="cursor-pointer shrink-0" title="Attach evidence document (PDF / Word / TXT)">
                      <input
                        ref={docInputRef}
                        type="file"
                        accept=".pdf,.docx,.doc,.txt"
                        className="hidden"
                        onChange={handleDocUpload}
                        disabled={uploadingDoc}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                        <span>
                          {uploadingDoc
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Paperclip className="h-3.5 w-3.5" />}
                        </span>
                      </Button>
                    </label>
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask AI to refine, expand, or rephrase… (Enter)"
                      className="flex-1 h-8 px-3 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && chatInput.trim()) {
                          sendChatMessage(chatInput, false)
                          setChatInput("")
                        }
                      }}
                    />
                    <Button
                      size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => { if (chatInput.trim()) { sendChatMessage(chatInput, false); setChatInput("") } }}
                      disabled={!chatInput.trim() || chatLoading}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}

                {/* Answer editor — compact: label + status + save + nav all in one header row */}
                <div className="px-4 pb-3 border-t pt-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Answer</span>
                    {saved[currentQ.question_id] && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                    {autoSaving && <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />}
                    <div className="flex-1" />
                    {!isSubmitted && (
                      <Button
                        size="sm" variant="outline" className="h-6 px-2.5 text-xs"
                        onClick={handleSaveAnswer}
                        disabled={submitAnswers.isPending}
                      >
                        {submitAnswers.isPending
                          ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          : "Save"}
                      </Button>
                    )}
                    <div className="flex items-center gap-0.5 ml-1 border-l pl-2">
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => switchToQuestion(Math.max(0, currentIndex - 1))}
                        disabled={currentIndex === 0}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-xs text-muted-foreground tabular-nums w-12 text-center">
                        {currentIndex + 1}/{questions.length}
                      </span>
                      <Button
                        variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => switchToQuestion(Math.min(questions.length - 1, currentIndex + 1))}
                        disabled={currentIndex === questions.length - 1}
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={answers[currentQ.question_id] || ""}
                    onChange={(e) => handleAnswerChange(currentQ.question_id, e.target.value)}
                    placeholder="Type your answer, or generate with AI above…"
                    rows={3}
                    className="w-full resize-y text-sm leading-relaxed min-h-[72px]"
                    disabled={isSubmitted}
                  />
                </div>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  )
}
