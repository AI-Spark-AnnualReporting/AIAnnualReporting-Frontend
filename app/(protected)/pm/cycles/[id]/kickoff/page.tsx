"use client"

import { use, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { usePMCycleDashboard, useSurveyQuestions } from "@/hooks/useSessions"
import { pmApi, CycleBriefFields, SurveyQuestion } from "@/lib/api/pm"
import { storeKickoffAnswers } from "@/lib/kickoffBriefStorage"
import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { KickoffStepper } from "@/components/pm/kickoff-stepper"
import { ShareWithClientButton } from "@/components/pm/ShareWithClientButton"
import {
  QuestionnaireForm,
  QuestionnaireValue,
  buildAnswersPayload as buildPayload,
  emptyQuestionnaireValue,
  answeredCount as countAnswered,
  requiredCount as countRequired,
  isComplete,
  valueFromAnswers,
} from "@/components/pm/QuestionnaireForm"
import { useApproveShare, useCycleShares, useSendBackShare } from "@/hooks/useShare"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ArrowLeft, ArrowRight, CheckCircle2, Clock, Loader2, Plus, ShieldAlert,
  Sparkles, Undo2,
} from "lucide-react"

/* ────────────────────────────────────────────────────────────────────────────
   STRATEGIC BRIEF & THEMES — Step 1: Questionnaire

   Questions come live from GET /pm/cycles/{id}/survey-questions (see
   useSurveyQuestions + pmApi.getSurveyQuestions). Nothing here is hardcoded:
   - `total` drives the "X of {total} answered" counter.
   - `options: string[]` → chip-select. Render ALL of them; the API never
     appends an "Other" entry, so slicing the array drops a real answer. The
     "Other…" box is ours, drawn alongside. Options that read as full sentences
     switch that row to stacked full-width checkbox rows (see isLongForm) —
     the layout follows the CONTENT, never the question id.
   - `options: null` → plain free-text box, no chips.
   - Order is stable per cycle, so questions are safely indexed by position.

   Answers only live in local state (no answer-save endpoint) until "Generate
   brief" is clicked, at which point they're handed to Step 2
   (kickoff/review) via sessionStorage — see lib/kickoffBriefStorage.
──────────────────────────────────────────────────────────────────────────── */

export default function KickoffQuestionnairePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const qc = useQueryClient()
  const { data: pmData, isLoading: cycleLoading } = usePMCycleDashboard(id)
  const {
    data: surveyData,
    isLoading: questionsLoading,
    error: questionsError,
  } = useSurveyQuestions(id)

  // Answers and rejections, both keyed by array position — see
  // QuestionnaireForm for why id is not safe to key on.
  const [qValue, setQValue] = useState<QuestionnaireValue>(emptyQuestionnaireValue)

  // Both gates' state. The client answers this questionnaire, so nothing here
  // is editable or submittable until Spark has approved what they sent.
  const { data: shares } = useCycleShares(id)
  const approveShare = useApproveShare(id)
  // Send back lives on this page, next to Approve: this is where their answers
  // are actually read, so it is where the decision about them is made.
  const sendBackShare = useSendBackShare(id)
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [sendBackNote, setSendBackNote] = useState("")
  const share = shares?.questionnaire
  // Only while the client still holds the link. Once they submit they're
  // locked out, so their answers become Spark's to correct before sign-off.
  const awaitingClient = share?.status === "pending"
  const clientApproved = share?.status === "approved"
  // The client has answered but nobody has signed it off yet. Their answers are
  // shown below so there is something to actually review — approving what you
  // cannot see is not a review.
  const needsApproval = share?.status === "responded"

  const cycle = (pmData as { cycle?: CycleBriefFields } | undefined)?.cycle
  // Prefer the cycle's actual name; fall back to a fiscal-year label only if
  // the name is missing.
  const fiscalLabel =
    cycle?.cycle_name ??
    (cycle?.fiscal_year ? `FY${cycle.fiscal_year} Annual Report` : "Annual Report")

  // Until a kickoff brief exists, the cycle dashboard immediately redirects back
  // here (it can't be managed yet) — so "Back" must exit to the cycles list
  // instead, or clicking it would look like a no-op.
  const backHref = cycle?.kickoff_brief ? `/pm/cycles/${id}` : "/pm/cycles"

  // A brief already exists, so going forward is "continue", not "generate".
  // Regenerating would throw away the brief, the areas of focus and every
  // concept message written for them — Step 2 owns that as a deliberate button.
  const briefExists = !!cycle?.kickoff_brief?.trim()

  // Two reasons this screen goes read-only, and they are different:
  //   - the client currently holds the link, so editing would collide;
  //   - the brief has already been drafted from these answers, so editing them
  //     changes nothing. Continue no longer regenerates, and letting someone
  //     retype an answer that can't reach anything is worse than locking it.
  const answersLocked = awaitingClient || briefExists

  // Spark's own questions. Added before the questionnaire goes out and not
  // after: from the first share the list is what the client is answering, and
  // an answer is stored against a question id, so a set that keeps moving
  // leaves answers pointing at questions that changed. The server refuses it
  // too. Deliberately NOT tied to answersLocked — that reopens between rounds.
  const [newQuestion, setNewQuestion] = useState("")
  const [savingQuestions, setSavingQuestions] = useState(false)
  const canEditQuestions = !share && !briefExists

  const saveQuestions = async (next: SurveyQuestion[]) => {
    setSavingQuestions(true)
    try {
      await pmApi.saveSurveyQuestions(id, next)
      qc.invalidateQueries({ queryKey: ["pm", "survey-questions", id] })
    } catch (err) {
      toast.error((err as { message?: string })?.message || "Couldn't save the question.")
    } finally {
      setSavingQuestions(false)
    }
  }

  const addQuestion = async () => {
    const text = newQuestion.trim()
    if (!text || savingQuestions) return
    // Ids only have to be unique within the cycle; "m" keeps them clear of the
    // template's t* and the AI's g*, and unknown ids sort before the catch-all.
    const taken = new Set(questions.map((q) => q.id))
    let n = 1
    while (taken.has(`m${n}`)) n += 1
    setNewQuestion("")
    await saveQuestions([
      ...questions,
      { id: `m${n}`, text, source: "manual", options: null },
    ])
  }

  const removeQuestion = async (questionId: string) => {
    if (savingQuestions) return
    await saveQuestions(questions.filter((q) => q.id !== questionId))
  }

  const editQuestion = async (questionId: string, text: string) => {
    if (savingQuestions) return
    await saveQuestions(
      questions.map((q) => (q.id === questionId ? { ...q, text } : q)),
    )
  }

  // Memoised because it feeds the seeding check below. `?? []` builds a fresh
  // array every render, which would make that check fire on every render and
  // overwrite whatever the PM had just typed.
  const questions = useMemo(() => surveyData?.questions ?? [], [surveyData])
  const total = surveyData?.total ?? 0

  const answeredCount = useMemo(() => countAnswered(questions, qValue), [questions, qValue])
  const required = useMemo(() => countRequired(questions, qValue), [questions, qValue])

  // Fill the form with the client's answers the moment they SUBMIT, not when
  // they are approved — the PM has to read them to decide whether to approve.
  // Adjusted during render rather than in an effect: this is the "reset state
  // when something changes" case, and an effect here costs an extra render
  // with an empty form painted first.
  //
  // Keyed on responded_at, which does not change when the share is later
  // approved — so this seeds exactly once and the PM's own edits afterwards
  // are theirs to keep, even across a background refetch.
  const [seededFrom, setSeededFrom] = useState<string | null>(null)
  const submittedAnswers = share?.response?.answers
  const seedKey = share?.responded_at ?? null
  if (seedKey && seedKey !== seededFrom && questions.length && submittedAnswers?.length) {
    setSeededFrom(seedKey)
    setQValue(valueFromAnswers(questions, submittedAnswers))
  }

  const progressPct = required > 0 ? Math.round((answeredCount / required) * 100) : 0

  // `required > 0` also blocks the everything-rejected case, which would
  // otherwise generate a brief from an empty answer set.
  const allAnswered = isComplete(questions, qValue)
  // Three things gate generation now:
  //   - every question answered;
  //   - any attached doc finished uploading (generate-brief reads the cycle's
  //     doc, so it must land first — an upload ERROR doesn't block, the doc is
  //     simply not attached);
  //   - the client has answered and Spark has approved. The server enforces
  //     this one too; the disabled button is only the courteous half.
  //   - the client has answered and Spark has approved. The server enforces
  //     this one too; the disabled button is only the courteous half.
  //
  // `allAnswered` works for a client submission too: the questions they skipped
  // come back marked rejected, which takes them out of the denominator — so a
  // 10-of-12 submission reads as complete rather than permanently short.
  const canGenerate = allAnswered && (clientApproved || needsApproval)

  const [approveOpen, setApproveOpen] = useState(false)

  const handleGenerate = async () => {
    if (!canGenerate) return
    // Approving is the signature the rest of the wizard is gated on, so it is
    // never a side effect of clicking Continue — ask first.
    if (needsApproval && !approveOpen) {
      setApproveOpen(true)
      return
    }
    setApproveOpen(false)
    // One button, two steps: sign the client's answers off, then carry on with
    // them. Splitting these made the PM approve in a dialog and then hunt for
    // the button that was disabled a second ago.
    if (needsApproval) {
      try {
        await approveShare.mutateAsync("questionnaire")
      } catch {
        return // the hook has already toasted; stay put rather than half-proceed
      }
    }
    storeKickoffAnswers(id, buildPayload(questions, qValue), { generate: !briefExists })
    router.push(`/pm/cycles/${id}/kickoff/review`)
  }

  if (cycleLoading || questionsLoading) return <PageLoader />

  const status = (questionsError as { status?: number } | null)?.status

  return (
    <div>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Link href={backHref}>
              <Button variant="outline" size="icon" className="mt-0.5 h-9 w-9 shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cycle Setup
              </p>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">
                Strategic Brief &amp; Areas of Focus
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {fiscalLabel} · Set the strategic direction before departments begin.
              </p>
            </div>
          </div>

          {/* Client sign-off. The client answers these questions, so this gate
              comes before anything else on the page can be finished. */}
          {!questionsError && total > 0 && (
            <ShareWithClientButton cycleId={id} stage="questionnaire" share={share} />
          )}
        </div>

        {/* ── Stepper ── */}
        <KickoffStepper current={1} />

        {/* ── Access error (403 / 404) ── */}
        {questionsError && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5">
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="font-semibold text-red-800">
                {status === 403
                  ? "You don't have access to this cycle"
                  : "Cycle not found"}
              </p>
              <p className="mt-0.5 text-sm text-red-700">
                {status === 403
                  ? "This cycle belongs to a different project manager."
                  : "It may have been removed, or the link is incorrect."}
              </p>
              <Link href="/pm/cycles" className="mt-3 inline-block">
                <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100">
                  Back to All Cycles
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* ── Pending / not-yet-generated state ── */}
        {!questionsError && surveyData && total === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-muted p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-semibold text-foreground">Questions aren&apos;t ready yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              The question set for this cycle hasn&apos;t been generated. Check back shortly, or contact support if this persists.
            </p>
          </div>
        )}

        {/* ── Questionnaire ── */}
        {!questionsError && total > 0 && (
          <>
            {/* The client's answers are waiting to be signed off. Say so above
                them — otherwise a read-only form full of text nobody typed
                here reads as a bug. */}
            {needsApproval && (
              // Louder than the other banners on purpose: this one says a
              // person did something and it is now your turn. The amber
              // "with the client" state is a status; this is a prompt.
              <div className="flex items-start gap-3 rounded-2xl border-2 border-green-400 bg-green-50 p-5 shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle2 className="h-5 w-5 text-green-700" />
                </span>
                <div>
                  <p className="text-base font-bold text-green-900">
                    Answered by client
                  </p>
                  <p className="mt-0.5 text-sm text-green-800">
                    Their answers are below. Edit anything that needs correcting, then
                    &ldquo;Approve &amp; generate brief&rdquo; signs them off and drafts
                    the brief from them.
                  </p>
                </div>
              </div>
            )}

            {/* Intro + progress */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">
                  {briefExists || needsApproval
                    ? "The client's answers"
                    : "A few quick questions"}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {briefExists
                    ? "The brief has already been drafted from these. To change them, use Regenerate on the next step."
                    : needsApproval
                      ? "Sent back by the client. Edit them if anything needs correcting — these are what the brief is drafted from."
                      : "Pick the closest option for each — or write your own. Your answers shape the AI-drafted brief."}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium text-muted-foreground">
                  <span className="text-foreground">{answeredCount}</span> of {required} answered
                </p>
                <div className="mt-1.5 h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Question cards — shared with the client's own page, so the
                two never drift in how an answer is shaped. */}
            <QuestionnaireForm
              questions={questions}
              value={qValue}
              onChange={setQValue}
              readOnly={answersLocked}
              // Spark's own questions only. The client's adopted ones are
              // stored as "manual" too, so ownership is stated rather than
              // inferred from the source.
              editableQuestionIds={questions
                .filter((q) => q.source === "manual")
                .map((q) => q.id)}
              onRemoveQuestion={canEditQuestions ? removeQuestion : undefined}
              onEditQuestion={canEditQuestions ? editQuestion : undefined}
            />

            {/* Says WHY the add box is gone. Without this the box simply
                vanishes once the questionnaire is shared, which reads as a bug
                rather than a rule — and the rule is invisible everywhere else
                on the page. */}
            {!canEditQuestions && share && (
              <p className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                The question set is settled — it has gone to the client and an
                answer is stored against each question, so the list can&apos;t
                change now. Re-share if something important is missing; that
                sends a fresh link.
              </p>
            )}

            {/* Spark's own questions. Only before it goes out — once the client
                has the list, changing it would leave their answers pointing at
                questions that no longer exist. */}
            {canEditQuestions && (
              <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/30 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Add your own question
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Goes to the client with the rest. They&apos;ll answer it in their own
                  words — no options to pick from.
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
                    placeholder="e.g. Which three achievements should lead this year's report?"
                    className="h-9 min-w-[18rem] flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-indigo-400"
                  />
                  <Button
                    type="button"
                    disabled={!newQuestion.trim() || savingQuestions}
                    onClick={addQuestion}
                    className="h-9 bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    {savingQuestions ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add question
                  </Button>
                </div>
              </div>
            )}

            {/* The strategic brief document is the CLIENT's to attach now —
                it's their document, and they upload it on their own link
                alongside the answers. Nothing to do here. */}
          </>
        )}
      </div>

      {/* ── Sticky footer bar ──
          Bleeds past the shell's px-8/py-8 padding (-mx-8 -mb-8) so it spans the
          full content area and sits flush at the bottom, while its inner content
          re-pads (px-8) to align its edges with the full-width cards above. */}
      <div className="sticky bottom-0 z-10 -mx-8 -mb-8 mt-8 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between gap-4 px-8 py-3">
          <Link href={backHref}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </Link>
          <div className="flex items-center gap-4">
            {total > 0 && (
              <span className="text-sm font-medium text-muted-foreground tabular-nums">
                {answeredCount}/{required} answered
              </span>
            )}
            {needsApproval && (
              <Button
                variant="outline"
                onClick={() => setSendBackOpen(true)}
                title="Return these answers to the client with a note"
              >
                <Undo2 className="h-4 w-4" /> Send back
              </Button>
            )}
            <Button
              onClick={handleGenerate}
              disabled={!canGenerate}
              title={
                share?.status === "pending"
                  ? "Waiting on the client's answers"
                  : !share
                    ? "Share the questionnaire with the client first"
                    : !needsApproval && !allAnswered
                      ? "Answer every question to continue"
                      : undefined
              }
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {approveShare.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : briefExists ? (
                <ArrowRight className="h-4 w-4" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {needsApproval
                ? briefExists
                  ? "Approve & continue"
                  : "Approve & generate brief"
                : briefExists
                  ? "Continue"
                  : "Generate brief"}
            </Button>
          </div>
        </div>
      </div>

      {/* Send back — the note that goes with it. A dialog rather than an inline
          box because the footer is sticky and has no room for a textarea. */}
      <Dialog open={sendBackOpen} onOpenChange={setSendBackOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send these answers back</DialogTitle>
            <DialogDescription>
              They&apos;ll get an email with your note. Their answers stay on the page
              so they can edit rather than start again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              What should they change?
            </label>
            <Textarea
              value={sendBackNote}
              onChange={(e) => setSendBackNote(e.target.value)}
              rows={4}
              autoFocus
              placeholder="e.g. Answer 3 is too vague — we need specific numbers."
              className="text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              disabled={sendBackShare.isPending}
              onClick={() => {
                setSendBackOpen(false)
                setSendBackNote("")
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={sendBackShare.isPending || !sendBackNote.trim()}
              onClick={() =>
                sendBackShare.mutate(
                  { stage: "questionnaire", comment: sendBackNote.trim() },
                  {
                    onSuccess: () => {
                      setSendBackOpen(false)
                      setSendBackNote("")
                    },
                  },
                )
              }
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {sendBackShare.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Undo2 className="h-4 w-4" />
              )}
              Send back with this note
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approving the client's answers — the signature the brief is drafted
          from, and the thing every later step is gated on. */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve the client&apos;s answers?</DialogTitle>
            <DialogDescription>
              This signs off what they sent and drafts the strategic brief from it.
              It can&apos;t be undone — send it back instead if anything still needs
              their eyes.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              disabled={approveShare.isPending}
              onClick={() => setApproveOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={approveShare.isPending}
              onClick={handleGenerate}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {approveShare.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Approve &amp; continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
