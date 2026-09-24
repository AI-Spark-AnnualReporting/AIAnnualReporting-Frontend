"use client"

import { use, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { PageLoader } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { AreaConceptCard } from "@/components/report/AreaConceptCard"
import {
  QuestionnaireForm,
  QuestionnaireValue,
  buildAnswersPayload,
  emptyQuestionnaireValue,
  answeredCount,
  requiredCount,
  isComplete,
  valueFromAnswers,
} from "@/components/pm/QuestionnaireForm"
import { clientShareApi, ClientShareView, ShareResponsePayload } from "@/lib/api/share"
import { cn } from "@/lib/utils"
import {
  roleSelectionComplete,
  MIN_SELECTED_AREAS,
  MAX_SELECTED_AREAS,
  MAX_AREAS_ON_PAGE,
} from "@/lib/areasOfFocus"
import type { AreaOfFocus } from "@/lib/areasOfFocus"
import type { ConceptMessage, SurveyQuestion } from "@/lib/api/pm"
import {
  AlertTriangle, CheckCircle2, FileText, Link2Off, Loader2, MessageSquareQuote,
  Plus, Send, Upload,
} from "lucide-react"

/* ────────────────────────────────────────────────────────────────────────────
   The client's page. No login, no account, no app shell.

   Lives at app/share/[token]/ rather than inside the (public) route group: that
   group's layout is a centred flex box sized for a login card, and this needs
   full width. Here it inherits only the root layout — fonts and providers.

   Two things this page deliberately does NOT have:

   - Any AI button. Refine and Regenerate spend OpenAI budget, and this page is
     reachable by anyone holding the link.
   - Any way to edit after submitting. The link goes read-only the moment it is
     sent, so what Spark reads is what Spark approves.
──────────────────────────────────────────────────────────────────────────── */

export default function ClientSharePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = use(params)

  const [view, setView] = useState<ClientShareView | null>(null)
  const [loading, setLoading] = useState(true)
  // "dead" is the server saying this token is not a live share. "stumbled" is
  // anything else — a dropped connection, a restart mid-request, a 500. They
  // must not look the same: telling a client their link is finished when the
  // server merely hiccuped is a message they cannot recover from, on a page
  // with no login, no history and nobody to ask.
  // Sending is one-shot: the link locks the moment it lands. Asked before it
  // happens, because the person on this page has no account, no undo and
  // nobody in the product to ask — the line under the button is easy to send
  // straight past.
  const [confirmSend, setConfirmSend] = useState(false)
  const [dead, setDead] = useState(false)
  const [stumbled, setStumbled] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Questionnaire state
  const [answers, setAnswers] = useState<QuestionnaireValue>(emptyQuestionnaireValue)

  // Bundle state
  const [brief, setBrief] = useState("")
  const [areas, setAreas] = useState<AreaOfFocus[]>([])
  const [concepts, setConcepts] = useState<ConceptMessage[]>([])
  // How many areas arrived from Spark. Anything past this the client wrote, and
  // only those get a bin — Spark's own areas are dropped by marking them
  // "Not used", which already keeps them out of the report.
  const [sparkAreaCount, setSparkAreaCount] = useState(0)

  // Their own strategic brief, optional. Uploaded immediately on pick, not held
  // until submit — the file is what guides the AI draft, so it has to land
  // before they send their answers.
  // Questions the client adds themselves. Local until they submit — the
  // server adopts them onto the cycle then, and renumbers the ids.
  const [extraQuestions, setExtraQuestions] = useState<SurveyQuestion[]>([])
  const [newQuestion, setNewQuestion] = useState("")
  // Their note back on the bundle. The questionnaire doesn't need one — its
  // last question already asks "anything else?".
  const [note, setNote] = useState("")

  // Shown the moment they submit. The banner further down covers a later
  // revisit; this is the confirmation for the act itself.
  const [justSent, setJustSent] = useState(false)
  const [closeBlocked, setCloseBlocked] = useState(false)

  const [docName, setDocName] = useState<string | null>(null)
  const [docState, setDocState] = useState<"idle" | "uploading" | "error">("idle")
  const [docError, setDocError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const pickDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Cleared so the same filename can be re-picked after a failure.
    if (fileRef.current) fileRef.current.value = ""
    if (!file) return
    setDocState("uploading")
    setDocError(null)
    try {
      const res = await clientShareApi.uploadDocument(token, file)
      setDocName(res.filename)
      setDocState("idle")
    } catch (err) {
      setDocError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          "Couldn't upload that file. PDF, DOCX, DOC or TXT, up to 20 MB.",
      )
      setDocState("error")
    }
  }

  useEffect(() => {
    let cancelled = false
    clientShareApi
      .view(token)
      .then((v) => {
        if (cancelled) return
        setView(v)
        if (v.stage === "questionnaire") {
          // Fill from whatever they last sent. Two cases, same behaviour: a
          // submitted link shows back what they sent rather than an empty form
          // implying it never arrived, and work sent back for changes opens
          // with their answers still on it so they edit rather than restart.
          const submitted = v.response?.answers
          setAnswers(
            submitted?.length
              ? valueFromAnswers(v.payload.questions ?? [], submitted)
              : emptyQuestionnaireValue,
          )
          setDocName(v.document_name ?? null)
        } else {
          const src = v.status === "pending" ? v.payload : { ...v.payload, ...v.response }
          setBrief(src.strategic_brief ?? "")
          setAreas((src.areas_of_focus ?? []) as AreaOfFocus[])
          setConcepts((src.concept_messages ?? []) as ConceptMessage[])
          setSparkAreaCount((v.payload.areas_of_focus ?? []).length)
        }
      })
      .catch((err) => {
        if (cancelled) return
        // publicClient is a bare axios instance with no interceptors, so the
        // status sits on err.response — not flattened onto err the way the
        // authenticated client does it.
        const e = err as { response?: { status?: number }; status?: number } | null
        const status = e?.response?.status ?? e?.status
        // Only the server's own "no such live share" is final. A timeout, a
        // dropped connection or a 500 leaves status undefined, and that is the
        // case this split exists for.
        if (status === 404) setDead(true)
        else setStumbled(true)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [token])

  // Theirs go last, after the catch-all: a question they wrote is the newest
  // thing on the page and reads as an addition rather than part of our set.
  const questions = useMemo(
    () => [...(view?.payload.questions ?? []), ...extraQuestions],
    [view, extraQuestions],
  )

  const addQuestion = () => {
    const text = newQuestion.trim()
    if (!text) return
    // A local id only. The server assigns the real one and moves the answer
    // with it, so nothing here can collide with a question of Spark's.
    setExtraQuestions((prev) => [
      ...prev,
      { id: `own-${Date.now()}`, text, source: "manual", options: null },
    ])
    setNewQuestion("")
  }

  const editExtraQuestion = (questionId: string, text: string) => {
    setExtraQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, text } : q)),
    )
  }

  const removeExtraQuestion = (questionId: string) => {
    const index = questions.findIndex((q) => q.id === questionId)
    setExtraQuestions((prev) => prev.filter((q) => q.id !== questionId))
    // Answers are keyed by POSITION, so dropping a question has to drop its
    // answer and shuffle everything after it down — otherwise every later
    // answer lands on the wrong question.
    setAnswers((prev) => {
      const nextAnswers: typeof prev.answers = {}
      Object.entries(prev.answers).forEach(([k, v]) => {
        const i = Number(k)
        if (i < index) nextAnswers[i] = v
        else if (i > index) nextAnswers[i - 1] = v
      })
      return { ...prev, answers: nextAnswers, rejected: {} }
    })
  }
  const editable = view?.status === "pending"
  // Adding is a first-round act. A link that came back for changes is a second
  // look at a settled set — they are here to reword, not to extend it, and the
  // server refuses a late addition either way.
  const firstRound = (view?.revision_count ?? 0) === 0
  const canAdd = editable && firstRound

  const answered = useMemo(() => answeredCount(questions, answers), [questions, answers])
  const required = useMemo(() => requiredCount(questions, answers), [questions, answers])

  // Mirrors the server's validate_area_selection, which 422s on a half-made
  // selection. Catching it here means the client gets a sentence instead of a
  // validation error from a backend they've never heard of.
  // The client is here to CHOOSE, so an untouched set is not a response.
  const areasValid = roleSelectionComplete(areas)

  // An area they started and left blank would reach Spark as an empty card and
  // steer nothing. Name it or take it out.
  const blankAreas = areas.some((a) => !a.slogan.trim())

  const canSubmit = editable && !submitting && (
    view?.stage === "questionnaire"
      ? isComplete(questions, answers)
      : areasValid && !blankAreas
  )

  /** Their own area, with an empty concept message to write underneath it. */
  const addArea = () => {
    setAreas((prev) => [
      ...prev,
      { slogan: "", summary: "", sub_slogans: [], role: "none" },
    ])
    setConcepts((prev) => [...prev, { title: "", description: "" }])
  }

  /** Only ever one they added — the two lists are linked by position, so both
   *  have to lose the same index. */
  const removeArea = (index: number) => {
    setAreas((prev) => prev.filter((_, k) => k !== index))
    setConcepts((prev) => prev.filter((_, k) => k !== index))
  }

  const submit = async () => {
    if (!canSubmit || !view) return
    setSubmitting(true)
    try {
      const response: ShareResponsePayload =
        view.stage === "questionnaire"
          ? {
              answers: buildAnswersPayload(questions, answers),
              added_questions: extraQuestions.map((q) => ({ id: q.id, text: q.text })),
            }
          : {
              strategic_brief: brief,
              areas_of_focus: areas,
              concept_messages: concepts,
            }
      const next = await clientShareApi.submit(token, {
        response,
        client_note: view.stage === "brief" ? note.trim() || undefined : undefined,
      })
      setView(next)
      setJustSent(true)
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          "Couldn't send your response. Please try again.",
      )
      setSubmitting(false)
    }
  }

  if (loading) return <PageLoader />

  if (stumbled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-700" />
          </span>
          <p className="font-semibold text-foreground">We couldn&apos;t load this right now.</p>
          <p className="text-sm text-muted-foreground">
            Your link is fine — something went wrong at our end. Try again in a
            moment.
          </p>
          <Button onClick={() => window.location.reload()} className="mt-1">
            Try again
          </Button>
        </div>
      </div>
    )
  }

  if (dead || !view) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Link2Off className="h-5 w-5 text-muted-foreground" />
          </span>
          <p className="font-semibold text-foreground">This link is no longer valid.</p>
          <p className="text-sm text-muted-foreground">
            It may have been replaced by a newer one. Check your inbox for a more
            recent message, or contact your Spark contact.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {/* ── Header ── */}
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
            {view.cycle_name}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {view.stage === "questionnaire"
              ? "A few questions about the year ahead"
              : "Review the strategic direction"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {view.stage === "questionnaire"
              ? "Your answers shape the strategic brief for this annual report."
              : "Read through the brief, the areas of focus and the concept messages. Edit anything that isn't right."}
          </p>
        </div>

        {/* ── Sent back for changes ──
            Above everything: it is the reason they are here, and reading their
            own answers first would bury it. */}
        {editable && view.review_comment && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <MessageSquareQuote className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="font-semibold text-amber-900">
                A note from the Spark team
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-amber-900">
                {view.review_comment}
              </p>
              <p className="mt-2 text-sm text-amber-800">
                Your previous answers are below — edit what needs changing and send
                them again.
              </p>
            </div>
          </div>
        )}

        {/* ── Already submitted ── */}
        {!editable && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            <div>
              <p className="font-semibold text-green-800">
                Thank you — your response is with the Spark team.
              </p>
              <p className="mt-0.5 text-sm text-green-700">
                {view.status === "approved"
                  ? "It has been approved. Nothing more is needed from you."
                  : "Nothing more is needed from you right now."}
                {" "}Everything below is what you sent.
              </p>
            </div>
          </div>
        )}

        {/* ── Questionnaire ── */}
        {view.stage === "questionnaire" && (
          <>
            {editable && (
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Pick the closest option for each — or write your own.
                </p>
                <p className="text-sm font-medium text-muted-foreground tabular-nums">
                  <span className="text-foreground">{answered}</span> of {required} answered
                </p>
              </div>
            )}
            <QuestionnaireForm
              questions={questions}
              value={answers}
              onChange={setAnswers}
              readOnly={!editable}
              // Only their own. Spark's questions are theirs to answer, not
              // to reword or remove.
              editableQuestionIds={extraQuestions.map((q) => q.id)}
              onRemoveQuestion={canAdd ? removeExtraQuestion : undefined}
              onEditQuestion={canAdd ? editExtraQuestion : undefined}
            />

            {/* Anything we didn't think to ask. They write the question and
                answer it themselves — it reaches Spark as part of the response.
                First round only: a link sent back is a second look at a settled
                set, and the server refuses a late addition. */}
            {canAdd && (
              <div className="mt-4 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/30 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Something we didn&apos;t ask about?
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Add your own question and answer it — it goes to the Spark team with
                  the rest.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={newQuestion}
                    onChange={(e) => setNewQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addQuestion()
                      }
                    }}
                    placeholder="e.g. How should we describe the new plant?"
                    className="h-9 min-w-[18rem] flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-indigo-400"
                  />
                  <Button
                    type="button"
                    disabled={!newQuestion.trim()}
                    onClick={addQuestion}
                    className="h-9 bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Plus className="h-4 w-4" /> Add question
                  </Button>
                </div>
              </div>
            )}

            {/* Optional attachment. Uploads on pick rather than on submit: the
                file guides the AI draft, so it has to be on the cycle before
                the answers are sent. */}
            {editable && (
              <div
                className={cn(
                  "mt-4 rounded-2xl border border-dashed p-4",
                  docState === "error"
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-indigo-200 bg-indigo-50/30",
                )}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  className="hidden"
                  onChange={pickDocument}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        docState === "error"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-indigo-100 text-indigo-600",
                      )}
                    >
                      {docState === "uploading" ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : docState === "error" ? (
                        <AlertTriangle className="h-5 w-5" />
                      ) : docName ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <FileText className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {docName ?? "Attach a strategic brief"}{" "}
                        {!docName && (
                          <span className="font-normal text-muted-foreground">
                            (optional)
                          </span>
                        )}
                      </p>
                      <p
                        className={cn(
                          "text-xs",
                          docState === "error"
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {docState === "uploading"
                          ? "Uploading…"
                          : docState === "error"
                            ? docError
                            : docName
                              ? "Attached — this will guide the draft."
                              : "Already have one? Upload it — PDF, DOCX, DOC or TXT."}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant={docName ? "outline" : "default"}
                    disabled={docState === "uploading"}
                    onClick={() => fileRef.current?.click()}
                    className={cn(!docName && "bg-indigo-600 text-white hover:bg-indigo-700")}
                  >
                    <Upload className="h-4 w-4" /> {docName ? "Replace" : "Upload file"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── The bundle: brief, then each area with its message inside ──
            Not three separate lists. A concept message is written FOR an area
            and is tied to it by position alone, so showing them apart asks the
            reader to reconstruct a pairing nothing on screen states — and it is
            the pairing, not either half, that the primary/secondary choice is
            actually about. */}
        {view.stage === "brief" && (
          <div className="space-y-8">
            <section>
              <h2 className="mb-2 text-lg font-semibold text-foreground">Strategic brief</h2>
              <Textarea
                value={brief}
                readOnly={!editable}
                onChange={(e) => setBrief(e.target.value)}
                rows={14}
                className="text-sm leading-relaxed"
              />
            </section>

            <section>
              <h2 className="text-lg font-semibold text-foreground">Areas of focus</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Each area has its concept message beneath it. Mark{" "}
                {MIN_SELECTED_AREAS}–{MAX_SELECTED_AREAS} of them as used, and pick
                exactly one to lead the report.
              </p>
              <div className="space-y-4">
                {areas.map((area, i) => (
                  <AreaConceptCard
                    key={i}
                    index={i}
                    area={area}
                    // Position is the link between the two lists.
                    message={concepts[i]}
                    roleGroup="client-areas"
                    readOnly={!editable}
                    onAreaChange={(next) =>
                      setAreas((prev) => prev.map((a, k) => (k === i ? { ...a, ...next } : a)))
                    }
                    onMessageChange={(next) =>
                      setConcepts((prev) =>
                        prev.map((m, k) => (k === i ? { ...m, ...next } : m)),
                      )
                    }
                    // Theirs to remove; Spark's are dropped with "Not used".
                    onRemove={
                      canAdd && i >= sparkAreaCount ? () => removeArea(i) : undefined
                    }
                    // One choice, two records: the area says which areas are
                    // used, the message says which concept leads. They must not
                    // be allowed to disagree.
                    onRoleChange={(role) => {
                      setAreas((prev) =>
                        prev.map((a, k) =>
                          k === i
                            ? { ...a, role }
                            : role === "primary" && a.role === "primary"
                              ? { ...a, role: "secondary" }
                              : a,
                        ),
                      )
                      setConcepts((prev) =>
                        prev.map((m, k) => ({
                          ...m,
                          role: k === i && role === "primary" ? "primary" : "secondary",
                        })),
                      )
                    }}
                  />
                ))}
              </div>
              {canAdd && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={addArea}
                  disabled={areas.length >= MAX_AREAS_ON_PAGE}
                  title={
                    areas.length >= MAX_AREAS_ON_PAGE
                      ? `At most ${MAX_AREAS_ON_PAGE} areas of focus on the page`
                      : "Add an area of your own and write its concept message"
                  }
                  className="mt-4"
                >
                  <Plus className="h-4 w-4" /> Add area of focus
                </Button>
              )}
              {editable && blankAreas && (
                <p className="mt-2 text-sm font-medium text-amber-700">
                  Give every area a name before sending.
                </p>
              )}
              {editable && !areasValid && (
                <p className="mt-2 text-sm font-medium text-amber-700">
                  Mark {MIN_SELECTED_AREAS}–{MAX_SELECTED_AREAS} areas as used, with one
                  set to lead, before sending.
                </p>
              )}
            </section>
          </div>
        )}

        {/* Their note on the bundle. Editing the copy says what they'd write;
            this is for "I'm uneasy about area 2" without rewriting it. */}
        {editable && view.stage === "brief" && (
          <div className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <label className="text-sm font-semibold text-foreground">
              Anything you&apos;d like to add?{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Context, concerns, anything the team should know…"
              className="mt-2 text-sm"
            />
          </div>
        )}

        {/* ── Submit ──
            No extra fields: this page shows exactly what the PM's own screens
            show and nothing more. The questionnaire already ends with the
            catch-all question (t7, always sorted last). */}
        {editable && (
          <div className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Once you send this you won&apos;t be able to change it — get in touch
                with your Spark contact if you need to.
              </p>
              <Button
                type="button"
                onClick={() => setConfirmSend(true)}
                disabled={!canSubmit}
                title={
                  view.stage === "questionnaire" && !isComplete(questions, answers)
                    ? "Answer every question to send"
                    : undefined
                }
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                <Send className="h-4 w-4" /> Send response
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Last chance before it locks. */}
    <Dialog open={confirmSend} onOpenChange={(o) => !submitting && setConfirmSend(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle className="text-lg">
          {view.stage === "questionnaire"
            ? "Send your answers to the Spark team?"
            : "Send this back to the Spark team?"}
        </DialogTitle>
        <DialogDescription>
          {view.stage === "questionnaire"
            ? "You won't be able to change your answers afterwards — if something needs correcting later, ask your Spark contact to send it back to you."
            : "You won't be able to change it afterwards — ask your Spark contact to send it back if something needs correcting."}
        </DialogDescription>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            disabled={submitting}
            onClick={() => setConfirmSend(false)}
          >
            Keep editing
          </Button>
          <Button
            disabled={submitting}
            onClick={() => { setConfirmSend(false); submit() }}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send it
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Sent. A dialog rather than a toast: this is the end of the task, and a
        message that fades after four seconds is the wrong way to say so. */}
    <Dialog open={justSent} onOpenChange={setJustSent}>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </span>
          <DialogTitle className="text-lg">
            Thank you — your response is with the Spark team.
          </DialogTitle>
          <DialogDescription>
            {closeBlocked
              ? "You can close this tab now."
              : "Nothing more is needed from you right now. We'll be in touch if anything else comes up."}
          </DialogDescription>
          <Button
            type="button"
            onClick={() => {
              // Only works on tabs a script opened. Theirs came from an email,
              // so this usually does nothing — say so rather than leave them
              // clicking a button that appears broken.
              window.close()
              setTimeout(() => setCloseBlocked(true), 250)
            }}
            className="mt-1 bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {closeBlocked ? "Done" : "Close this tab"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}
