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
  AreasReview,
  BriefReview,
  QuestionnaireReview,
} from "@/components/share/ResponseReview"
import {
  BannerStatus,
  CentriyonFooter,
  CentriyonMark,
  ClientShareBanner,
} from "@/components/share/ClientShareBanner"
import {
  QuestionnaireForm,
  QuestionnaireValue,
  answerAfterOptionsChange,
  buildAnswersPayload,
  cleanChoices,
  emptyQuestionnaireValue,
  answeredCount,
  requiredCount,
  isComplete,
  valueFromAnswers,
} from "@/components/pm/QuestionnaireForm"
import {
  clientShareApi,
  ClientShareView,
  ClientSupportingDocument,
  MAX_CLIENT_DOCUMENTS,
  ShareResponsePayload,
} from "@/lib/api/share"
import { cn } from "@/lib/utils"
import {
  roleSelectionComplete,
  MIN_SELECTED_AREAS,
  MAX_SELECTED_AREAS,
  maxAreasFor,
  MIN_AREAS_ON_PAGE,
} from "@/lib/areasOfFocus"
import type { AreaOfFocus } from "@/lib/areasOfFocus"
import type { ConceptMessage, SurveyQuestion } from "@/lib/api/pm"
import {
  areasMissingPrimaryMessage,
  blankAreaMessages,
  hasBlankUsedMessage,
  isGrouped,
  messagesOfArea,
  removeAreaMessages,
  setMessageRole,
} from "@/lib/conceptMessages"
import {
  AlertTriangle, CheckCircle2, FileText, Info, Link2Off, Loader2, MessageSquareQuote,
  Plus, Send, Upload, X,
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

/** The form filled from their previous reply.
 *
 *  Skipped means "they rejected it", taken from the list their reply now
 *  records. Guessing it from a missing answer marked every question Spark
 *  brought back or added since their last round as skipped, because they had
 *  never answered it. Older replies, saved before the list existed, keep the
 *  guess. */
function valueFromReply(
  questions: SurveyQuestion[],
  reply: ShareResponsePayload,
): QuestionnaireValue {
  const value = valueFromAnswers(questions, reply.answers ?? [])
  const rejectedIds = reply.rejected_question_ids
  if (!Array.isArray(rejectedIds)) return value
  const rejected: QuestionnaireValue["rejected"] = {}
  questions.forEach((q, i) => {
    if (rejectedIds.includes(q.id)) rejected[i] = true
  })
  return { ...value, rejected }
}

/** A copy of a position-keyed map with the entry at `removed` dropped and
 *  every later entry moved down one place. */
function shiftAfterRemoval<T>(byPosition: Record<number, T>, removed: number): Record<number, T> {
  const shifted: Record<number, T> = {}
  Object.entries(byPosition).forEach(([key, value]) => {
    const position = Number(key)
    if (position < removed) shifted[position] = value
    else if (position > removed) shifted[position - 1] = value
  })
  return shifted
}

/** True for a link that shows a list of questions to answer: the kickoff
 *  questionnaire, or one department's questions sent by its HOD. Both use the
 *  same form; only the wording around it differs. */
function isQuestionList(view: ClientShareView): boolean {
  return view.stage === "questionnaire" || view.stage === "department_questions"
}

/** Where the client stands on this link, for the banner. */
function bannerStatus(view: ClientShareView): BannerStatus {
  if (view.status === "approved") return "approved"
  if (view.status !== "pending") return "sent"
  if (view.review_comment && view.revision_count > 0) return "sent_back"
  return "open"
}

/** The banner's headline for each stage and state. */
function bannerTitle(view: ClientShareView, status: BannerStatus): string {
  if (status === "sent" || status === "approved") {
    return "Thank you — your response is with the Centriyon team"
  }
  if (status === "sent_back") return "A few changes, please"
  if (view.stage === "department_questions") {
    return `${view.department_name || "Department"} questions`
  }
  if (view.stage === "questionnaire") return "A few questions about the year ahead"
  if (view.stage === "brief") return "Review the strategic brief"
  return "Review the areas of focus"
}

/** The line under the headline. */
function bannerSubtitle(
  view: ClientShareView,
  status: BannerStatus,
  grouped = false,
): string {
  if (status === "approved") {
    return "It has been approved. Nothing more is needed from you. Everything below is what you sent."
  }
  if (status === "sent") {
    return "Nothing more is needed from you right now. Everything below is what you sent."
  }
  if (status === "sent_back") {
    return isQuestionList(view)
      ? "Your previous answers are below. Edit what needs changing and send them again."
      : "What you sent is below. Edit what needs changing and send it again."
  }
  if (view.stage === "department_questions") {
    return `Your answers shape the ${view.department_name || "department"} section of this annual report. Answer each in your own words, reject any that don't apply, or reword one that isn't quite right.`
  }
  if (view.stage === "questionnaire") {
    return "Your answers shape the strategic brief for this annual report. Pick the closest option for each, or write your own."
  }
  if (view.stage === "brief") {
    return "This is the direction for the whole report. Edit anything that isn't right — everything else is written from it."
  }
  if (grouped) {
    return "Each area has three concept messages beneath it. Pick one area to lead the report and mark the others as used or not. In every area you use, pick one message to lead, and mark the others as used or not. Edit anything that isn't right."
  }
  return `Each area has its concept message beneath it. Mark ${MIN_SELECTED_AREAS}–${MAX_SELECTED_AREAS} of them as used, pick exactly one to lead, and edit anything that isn't right.`
}

/** Roughly how long the questionnaire takes: under a minute a question,
 *  rounded to the nearest 5, and never less than 5. */
function questionnaireMinutes(questionCount: number): number {
  return Math.max(5, Math.round((questionCount * 0.8) / 5) * 5)
}

/** The short chips under the headline, while the link is still open. */
function bannerFacts(
  view: ClientShareView,
  questionCount: number,
  areaCount: number,
  firstRound: boolean,
): string[] {
  if (isQuestionList(view)) {
    const facts = [
      `${questionCount} questions`,
      `About ${questionnaireMinutes(questionCount)} minutes`,
    ]
    if (firstRound) facts.push("You can add your own questions")
    if (view.stage === "questionnaire") facts.push("You can attach your own brief")
    if (view.stage === "department_questions") facts.push("You can attach supporting documents")
    return facts
  }
  if (view.stage === "brief") return ["About 5 minutes", "You can add a note"]
  return [`${areaCount} areas of focus`, "About 10 minutes", "You can add a note"]
}

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

  // Their own strategic brief, optional. Uploaded immediately on pick, not held
  // until submit — the file is what guides the AI draft, so it has to land
  // before they send their answers.
  // Questions the client adds themselves. Local until they submit — the
  // server adopts them onto the cycle then, and renumbers the ids.
  const [extraQuestions, setExtraQuestions] = useState<SurveyQuestion[]>([])
  const [newQuestion, setNewQuestion] = useState("")
  // Choices for their new question, and the "+ Add choice" box's text. None
  // means they answer it in their own words. Same as Spark's add box.
  const [newChoices, setNewChoices] = useState<string[]>([])
  const [newChoiceDraft, setNewChoiceDraft] = useState("")
  // Their rewording of OUR questions, by question id. Local until they send —
  // the server then writes it onto the cycle. Kept apart from the link's list
  // so "Undo my change" can put the original back.
  const [questionEdits, setQuestionEdits] = useState<
    Record<string, { text: string; options: string[] | null }>
  >({})
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

  // Department links: supporting documents the client attaches instead of (or
  // as well as) answering. Each uploads on pick and is added to the link's list.
  const [clientDocs, setClientDocs] = useState<ClientSupportingDocument[]>([])
  // The upload in progress, e.g. "HR.docx (2 of 3)". Null when idle.
  const [uploadingLabel, setUploadingLabel] = useState<string | null>(null)
  // Removes still finishing on the server. The file is already off the list.
  const [removingCount, setRemovingCount] = useState(0)
  const clientDocsBusy = uploadingLabel !== null
  const [clientDocsError, setClientDocsError] = useState<string | null>(null)
  const clientDocsRef = useRef<HTMLInputElement>(null)

  /** Upload the picked files one at a time, up to the limit. */
  const addClientDocuments = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    // Cleared so the same filename can be re-picked after a failure.
    if (clientDocsRef.current) clientDocsRef.current.value = ""
    if (picked.length === 0) return
    const room = MAX_CLIENT_DOCUMENTS - clientDocs.length
    const files = picked.slice(0, room)
    setClientDocsError(
      picked.length > room ? `Only ${MAX_CLIENT_DOCUMENTS} documents can be attached.` : null,
    )
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setUploadingLabel(files.length > 1 ? `${file.name} (${i + 1} of ${files.length})` : file.name)
      try {
        const added = await clientShareApi.addSupportingDocument(token, file)
        setClientDocs((prev) => [...prev, added])
      } catch (err) {
        setClientDocsError(
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            `Couldn't upload ${file.name}. PDF, DOCX, DOC or TXT, up to 20 MB.`,
        )
      }
    }
    setUploadingLabel(null)
  }

  /** Remove one of their files. It leaves the list at once; the server
   *  delete finishes in the background. If that fails, the file comes back. */
  const removeClientDocument = async (documentId: string) => {
    const index = clientDocs.findIndex((d) => d.id === documentId)
    const removed = clientDocs[index]
    if (!removed) return
    setClientDocsError(null)
    setClientDocs((prev) => prev.filter((d) => d.id !== documentId))
    setRemovingCount((n) => n + 1)
    try {
      await clientShareApi.removeSupportingDocument(token, documentId)
    } catch {
      setClientDocs((prev) => {
        const next = [...prev]
        next.splice(Math.min(index, next.length), 0, removed)
        return next
      })
      setClientDocsError(`Couldn't remove ${removed.filename}. Please try again.`)
    } finally {
      setRemovingCount((n) => n - 1)
    }
  }

  useEffect(() => {
    let cancelled = false
    clientShareApi
      .view(token)
      .then((v) => {
        if (cancelled) return
        setView(v)
        if (isQuestionList(v)) {
          // Fill from whatever they last sent. Two cases, same behaviour: a
          // submitted link shows back what they sent rather than an empty form
          // implying it never arrived, and work sent back for changes opens
          // with their answers still on it so they edit rather than restart.
          const submitted = v.response?.answers
          setAnswers(
            submitted?.length
              ? valueFromReply(v.payload.questions ?? [], v.response)
              : emptyQuestionnaireValue,
          )
          setDocName(v.document_name ?? null)
          setClientDocs(v.payload.documents ?? [])
        } else {
          const src = v.status === "pending" ? v.payload : { ...v.payload, ...v.response }
          setBrief(src.strategic_brief ?? "")
          setAreas((src.areas_of_focus ?? []) as AreaOfFocus[])
          setConcepts((src.concept_messages ?? []) as ConceptMessage[])
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
  const questions = useMemo(() => {
    const shown: SurveyQuestion[] = []
    for (const q of view?.payload.questions ?? []) {
      const edit = questionEdits[q.id]
      shown.push(edit ? { ...q, text: edit.text, options: edit.options } : q)
    }
    return [...shown, ...extraQuestions]
  }, [view, extraQuestions, questionEdits])

  /** The client's own questions: the ones added in this browser, plus (on a
   *  department link sent back for changes) the ones they added last round,
   *  which the server marks added_by "client". */
  const ownQuestionIds = useMemo(() => {
    const ids = extraQuestions.map((q) => q.id)
    for (const q of view?.payload.questions ?? []) {
      if ((q as SurveyQuestion & { added_by?: string }).added_by === "client") ids.push(q.id)
    }
    return ids
  }, [view, extraQuestions])

  /** The question as the link showed it, before any change of theirs. */
  const originalQuestion = (questionId: string): SurveyQuestion | undefined =>
    (view?.payload.questions ?? []).find((q) => q.id === questionId)

  /** Their edit of any question. Their own new questions are changed in
   *  place; ours are kept as an edit so it can be undone. */
  const editQuestion = (questionId: string, text: string, options: string[] | null) => {
    if (extraQuestions.some((q) => q.id === questionId)) {
      setExtraQuestions((prev) =>
        prev.map((q) => (q.id === questionId ? { ...q, text, options } : q)),
      )
      return
    }
    const original = originalQuestion(questionId)
    const unchanged =
      original &&
      original.text === text &&
      JSON.stringify(original.options ?? null) === JSON.stringify(options)
    setQuestionEdits((prev) => {
      const next = { ...prev }
      if (unchanged) delete next[questionId]
      else next[questionId] = { text, options }
      return next
    })
  }

  /** Put our wording back, and keep their answer valid for our choices. */
  const undoQuestionEdit = (questionId: string) => {
    const original = originalQuestion(questionId)
    const index = questions.findIndex((q) => q.id === questionId)
    setQuestionEdits((prev) => {
      const next = { ...prev }
      delete next[questionId]
      return next
    })
    if (!original || index < 0) return
    setAnswers((prev) => {
      const current = prev.answers[index]
      if (!current) return prev
      return {
        ...prev,
        answers: {
          ...prev.answers,
          [index]: answerAfterOptionsChange(current, original.options ?? null),
        },
      }
    })
  }

  /** Turn the "+ Add choice" box's text into a choice, then clear the box. */
  const addNewChoice = () => {
    const text = newChoiceDraft.trim()
    if (!text) return
    setNewChoices((prev) => [...prev, text])
    setNewChoiceDraft("")
  }

  const addQuestion = () => {
    const text = newQuestion.trim()
    if (!text) return
    // A choice still sitting in the box counts, so it isn't lost on Add.
    const pending = newChoiceDraft.trim()
    const options = cleanChoices(pending ? [...newChoices, pending] : newChoices)
    // A local id only. The server assigns the real one and moves the answer
    // with it, so nothing here can collide with a question of Spark's.
    setExtraQuestions((prev) => [
      ...prev,
      { id: `own-${Date.now()}`, text, source: "manual", options },
    ])
    setNewQuestion("")
    setNewChoices([])
    setNewChoiceDraft("")
  }

  const removeExtraQuestion = (questionId: string) => {
    const index = questions.findIndex((q) => q.id === questionId)
    setExtraQuestions((prev) => prev.filter((q) => q.id !== questionId))
    // Answers and rejections are keyed by POSITION, so dropping a question
    // has to drop its entry and shuffle everything after it down — otherwise
    // every later answer lands on the wrong question. Rejections move the same
    // way: they used to be wiped here, which silently un-rejected every
    // question the client had rejected.
    setAnswers((prev) => ({
      answers: shiftAfterRemoval(prev.answers, index),
      rejected: shiftAfterRemoval(prev.rejected, index),
    }))
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
  // Same for the message under it: a named area with nothing written beneath
  // reached Spark as an empty card. The server refuses it too.
  // New cycles (3 messages per area): each message's role is picked within its
  // area, and a "not used" message may stay blank.
  const grouped = isGrouped(concepts)
  // 3 for new cycles; old one-message-per-area cycles keep their cap of 5.
  const maxAreas = maxAreasFor(concepts, areas.length)
  const blankMessages = grouped
    ? hasBlankUsedMessage(concepts)
    : areas.some(
        (_, i) => !concepts[i]?.title?.trim() || !concepts[i]?.description?.trim(),
      )
  // New cycles: every area they keep needs its leading message picked.
  const areasMissingLead = grouped ? areasMissingPrimaryMessage(areas, concepts) : []

  // A department link can go with only some answers, or none at all when
  // supporting documents are attached. The kickoff questionnaire needs all.
  const departmentReady =
    required > 0 &&
    !clientDocsBusy &&
    removingCount === 0 &&
    (answered > 0 || clientDocs.length > 0)
  const canSubmit = editable && !submitting && (
    view?.stage === "department_questions"
      ? departmentReady
      : view && isQuestionList(view)
      ? isComplete(questions, answers)
      : view?.stage === "brief"
        ? brief.trim().length > 0
        : areasValid && !blankAreas && !blankMessages && areasMissingLead.length === 0
  )

  /** Their own area, with an empty concept message to write underneath it. */
  const addArea = () => {
    setAreas((prev) => [
      ...prev,
      { slogan: "", summary: "", sub_slogans: [], role: "none" },
    ])
    // New cycles get 3 blank messages to write (or leave out) under it.
    setConcepts((prev) =>
      isGrouped(prev)
        ? [...prev, ...blankAreaMessages(areas.length)]
        : [...prev, { title: "", description: "" }],
    )
  }

  /** Only ever one they added — the two lists are linked by position, so both
   *  have to lose the same index. */
  const removeArea = (index: number) => {
    setAreas((prev) => prev.filter((_, k) => k !== index))
    setConcepts((prev) =>
      isGrouped(prev)
        ? removeAreaMessages(prev, index)
        : prev.filter((_, k) => k !== index),
    )
  }

  const submit = async () => {
    if (!canSubmit || !view) return
    setSubmitting(true)
    try {
      // Each gate sends only its own half. The brief gate has no areas yet —
      // they are written from whatever this call stores, once Spark approves.
      const response: ShareResponsePayload =
        isQuestionList(view)
          ? {
              answers: buildAnswersPayload(questions, answers),
              added_questions: extraQuestions.map((q) => ({
                id: q.id,
                text: q.text,
                options: q.options,
              })),
              edited_questions: Object.entries(questionEdits).map(([qid, edit]) => ({
                id: qid,
                text: edit.text,
                options: edit.options,
              })),
              // Recorded on the question as "rejected by the client", so Spark
              // can tell a deliberate skip from a missed one.
              rejected_question_ids: questions
                .filter((_, i) => answers.rejected[i])
                .map((q) => q.id),
            }
          : view.stage === "brief"
            ? { strategic_brief: brief }
            : {
                areas_of_focus: areas,
                concept_messages: concepts,
              }
      const next = await clientShareApi.submit(token, {
        response,
        client_note: !isQuestionList(view) ? note.trim() || undefined : undefined,
      })
      // Closed only once it has landed, so the dialog's own spinner covers
      // the request. Closing first left the client watching an unchanged page
      // with no sign anything was happening.
      setConfirmSend(false)
      setView(next)
      // The server now lists their questions on the link itself (renumbered),
      // so the browser-only copies would show twice.
      setExtraQuestions([])
      // Same for their rewording: the link's list now carries it.
      setQuestionEdits({})
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-muted/30 p-6">
        <CentriyonMark />
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-muted/30 p-6">
        <CentriyonMark />
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Link2Off className="h-5 w-5 text-muted-foreground" />
          </span>
          <p className="font-semibold text-foreground">This link is no longer valid.</p>
          <p className="text-sm text-muted-foreground">
            It may have been replaced by a newer one. Check your inbox for a more
            recent message, or contact your Centriyon contact.
          </p>
        </div>
      </div>
    )
  }

  // Named so it can't be mistaken for the browser's global `status`.
  const bannerState = bannerStatus(view)

  return (
    <>
    <div className="min-h-screen bg-muted/30">
      <ClientShareBanner
        // A department's link is not one of the kickoff steps, so no trail.
        stage={view.stage === "department_questions" ? undefined : view.stage}
        cycleName={view.cycle_name}
        title={bannerTitle(view, bannerState)}
        subtitle={bannerSubtitle(view, bannerState, grouped)}
        facts={editable ? bannerFacts(view, questions.length, areas.length, firstRound) : []}
        status={bannerState}
        submittedAt={view.submitted_at}
        progress={isQuestionList(view) && editable ? { answered, required } : null}
        contactName={view.contact_name}
        contactEmail={view.contact_email}
      />
      {/* Pulled up into the banner's lower edge, so the first card overlaps it
          and the page reads as one piece. */}
      <div className="relative mx-auto -mt-12 max-w-4xl px-4 pb-10 sm:px-6">
        {/* ── Sent back for changes ──
            Above everything: it is the reason they are here, and reading their
            own answers first would bury it. The banner already says what to do
            with it. */}
        {editable && view.review_comment && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
            <MessageSquareQuote className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="font-semibold text-amber-900">
                A note from the Centriyon team
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-amber-900">
                {view.review_comment}
              </p>
            </div>
          </div>
        )}

        {/* ── Questionnaire (kickoff, or a department's questions) ── */}
        {isQuestionList(view) && (
          <>
            {view.stage === "department_questions" && editable && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                <p className="text-sm text-indigo-900">
                  Answer all the questions, just some of them, or attach supporting
                  documents at the bottom of the page and we&apos;ll take the answers
                  from them.
                </p>
              </div>
            )}
            <QuestionnaireForm
              questions={questions}
              value={answers}
              onChange={setAnswers}
              readOnly={!editable}
              // Delete: only their own. Spark's questions they can reject,
              // not remove.
              editableQuestionIds={extraQuestions.map((q) => q.id)}
              onRemoveQuestion={canAdd ? removeExtraQuestion : undefined}
              // Edit: any question, every round, while the link is open.
              onEditQuestion={editable ? editQuestion : undefined}
              undoableQuestionIds={Object.keys(questionEdits)}
              onUndoEdit={undoQuestionEdit}
              showEditedBy={false}
              usedIn={view.stage === "department_questions" ? "the report" : "the brief"}
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
                  Add your own question — with choices to pick from, or none to answer in
                  your own words. It goes to the Centriyon team with the rest.
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
                {/* Choices — same pills and "+ Add choice" box as Spark's add
                    box, so both sides add questions the same way. */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {newChoices.map((choice, idx) => (
                    <span
                      key={idx}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground"
                    >
                      {choice}
                      <button
                        type="button"
                        onClick={() => setNewChoices((prev) => prev.filter((_, k) => k !== idx))}
                        title={`Remove "${choice}"`}
                        className="text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={newChoiceDraft}
                    onChange={(e) => setNewChoiceDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addNewChoice()
                      }
                    }}
                    onBlur={addNewChoice}
                    placeholder="+ Add choice (optional)"
                    aria-label="Add a choice to the new question"
                    className="min-w-[12rem] max-w-full rounded-full border border-dashed border-muted-foreground/40 bg-background px-3.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-indigo-400"
                  />
                </div>
              </div>
            )}

            {/* Optional attachment. Uploads on pick rather than on submit: the
                file guides the AI draft, so it has to be on the cycle before
                the answers are sent. Once sent it stays on the page, read-only,
                so a returning client can see their file arrived. */}
            {view.stage === "questionnaire" && (editable || docName) && (
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
                  {editable && (
                    <Button
                      type="button"
                      variant={docName ? "outline" : "default"}
                      disabled={docState === "uploading"}
                      onClick={() => fileRef.current?.click()}
                      className={cn(!docName && "bg-indigo-600 text-white hover:bg-indigo-700")}
                    >
                      <Upload className="h-4 w-4" /> {docName ? "Replace" : "Upload file"}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Supporting documents, department links only. Up to 10 files,
                each uploaded on pick. Read-only once sent. */}
            {view.stage === "department_questions" && (editable || clientDocs.length > 0) && (
              <div
                className={cn(
                  "mt-4 rounded-2xl border border-dashed p-4",
                  clientDocsError
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-indigo-200 bg-indigo-50/30",
                )}
              >
                <input
                  ref={clientDocsRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.txt"
                  className="hidden"
                  onChange={addClientDocuments}
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      Supporting documents{" "}
                      <span className="font-normal text-muted-foreground">
                        ({clientDocs.length} of {MAX_CLIENT_DOCUMENTS})
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Rather not answer everything? Attach documents that hold the
                      answers. PDF, DOCX, DOC or TXT.
                    </p>
                  </div>
                  {editable && (
                    <Button
                      type="button"
                      disabled={clientDocsBusy || clientDocs.length >= MAX_CLIENT_DOCUMENTS}
                      onClick={() => clientDocsRef.current?.click()}
                      className="bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      {clientDocsBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {clientDocsBusy ? "Uploading…" : "Attach files"}
                    </Button>
                  )}
                </div>
                {(clientDocs.length > 0 || uploadingLabel) && (
                  <ul className="mt-3 space-y-2">
                    {clientDocs.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                      >
                        <span className="flex min-w-0 items-center gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                          <span className="truncate">{doc.filename}</span>
                        </span>
                        {editable && (
                          <button
                            type="button"
                            onClick={() => removeClientDocument(doc.id)}
                            title={`Remove ${doc.filename}`}
                            className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    ))}
                    {uploadingLabel && (
                      <li className="flex items-center gap-2 rounded-lg border border-dashed border-indigo-200 bg-background px-3 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-600" />
                        <span className="truncate">Uploading {uploadingLabel}…</span>
                      </li>
                    )}
                  </ul>
                )}
                {clientDocsError && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" /> {clientDocsError}
                  </p>
                )}
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
        {/* The brief gate: this and nothing else. Everything downstream is
            written FROM it, once Spark approves what the client sends back,
            so showing that work here would be asking them to sign off on a
            brief while the consequences of the old one sat underneath it. */}
        {view.stage === "brief" && (
          <section>
            {editable ? (
              <>
                <Textarea
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  rows={18}
                  // Solid, not the default transparent: it overlaps the banner.
                  className="rounded-2xl bg-card p-5 text-sm leading-relaxed shadow-sm"
                />
                {!brief.trim() && (
                  <p className="mt-2 text-sm font-medium text-amber-700">
                    The brief can&apos;t be empty.
                  </p>
                )}
              </>
            ) : (
              /* Once it is sent there is nothing to type into, so it stops
                 looking like somewhere to type. A read-only textarea keeps the
                 focus ring, the inner scrollbar and the fixed height of a form
                 field, which reads as "broken input" rather than "finished".
                 Rendered as plain text, not markdown: this is the client's own
                 wording, and running it through a renderer would both restyle
                 what they wrote and put untrusted content through an HTML
                 path. */
              <div className="whitespace-pre-line rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed text-foreground shadow-sm">
                {brief}
              </div>
            )}
          </section>
        )}

        {view.stage === "areas" && (
          <div className="space-y-8">
            <section>
              <div className="space-y-4">
                {areas.map((area, i) => (
                  <AreaConceptCard
                    key={i}
                    index={i}
                    area={area}
                    // Position is the link between the two lists (old cycles).
                    message={concepts[i]}
                    // New cycles: this area's 3 messages, each with its own pick.
                    groupedMessages={grouped ? messagesOfArea(concepts, i) : undefined}
                    onGroupedMessageChange={(position, next) =>
                      setConcepts((prev) =>
                        prev.map((m, k) => (k === position ? { ...m, ...next } : m)),
                      )
                    }
                    onGroupedRoleChange={(position, role) =>
                      setConcepts((prev) => setMessageRole(prev, position, role))
                    }
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
                    // Any area, on the first round — the same rule Spark has.
                    // With the maximum on the page there is no room to add, so
                    // deleting one is the only way to make room for their own.
                    // Never below two: the server refuses a smaller set.
                    onRemove={
                      canAdd && areas.length > MIN_AREAS_ON_PAGE
                        ? () => removeArea(i)
                        : undefined
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
                      // Old cycles only: the message's role follows its area.
                      // New cycles pick message roles inside each area instead.
                      if (!grouped) {
                        setConcepts((prev) =>
                          prev.map((m, k) => ({
                            ...m,
                            role: k === i && role === "primary" ? "primary" : "secondary",
                          })),
                        )
                      }
                    }}
                  />
                ))}
              </div>
              {/* Says how to make room rather than leaving a greyed-out button
                  with its reason hidden in a tooltip. */}
              {canAdd && areas.length >= maxAreas && (
                <p className="mt-4 flex items-start gap-1.5 text-xs font-medium text-indigo-700">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    {maxAreas} is the maximum. To add your own, delete one
                    first.
                  </span>
                </p>
              )}
              {canAdd && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={addArea}
                  disabled={areas.length >= maxAreas}
                  title={
                    areas.length >= maxAreas
                      ? `At most ${maxAreas} areas of focus on the page`
                      : "Add an area of your own and write its concept message"
                  }
                  className="mt-2"
                >
                  <Plus className="h-4 w-4" /> Add area of focus
                </Button>
              )}
              {editable && blankAreas && (
                <p className="mt-2 text-sm font-medium text-amber-700">
                  Give every area a name before sending.
                </p>
              )}
              {editable && !blankAreas && blankMessages && (
                <p className="mt-2 text-sm font-medium text-amber-700">
                  {grouped
                    ? "Every concept message you use needs a title and its text — or mark it as not used."
                    : "Give every area a concept message (a title and its text) before sending."}
                </p>
              )}
              {editable && areasMissingLead.length > 0 && (
                <p className="mt-2 text-sm font-medium text-amber-700">
                  Pick a primary concept message for: {areasMissingLead.join(", ")}.
                </p>
              )}
              {editable && !areasValid && (
                <p className="mt-2 text-sm font-medium text-amber-700">
                  Mark {MIN_SELECTED_AREAS}–{Math.min(MAX_SELECTED_AREAS, areas.length)} areas as used, with one
                  set to lead, before sending.
                </p>
              )}
            </section>
          </div>
        )}

        {/* Their note on the brief or the areas. Editing the copy says what
            they'd write; this is for "section 2 feels long" without rewriting
            it. The questionnaire has none: its last question is the catch-all. */}
        {editable && !isQuestionList(view) && (
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

        {/* Their note, once sent. The box above only exists while they can
            edit, so without this the note vanished from their own view. */}
        {!editable && !isQuestionList(view) && view.client_note && (
          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <MessageSquareQuote className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Your note to the Centriyon team</p>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                {view.client_note}
              </p>
            </div>
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
                with your Centriyon contact if you need to.
              </p>
              <Button
                type="button"
                onClick={() => setConfirmSend(true)}
                disabled={!canSubmit}
                title={
                  view.stage === "department_questions"
                    ? departmentReady
                      ? undefined
                      : required === 0
                        ? "You've rejected every question — answer at least one to send"
                        : "Answer at least one question or attach a document to send"
                    : isQuestionList(view) && !isComplete(questions, answers)
                    ? required === 0
                      ? "You've rejected every question — answer at least one to send"
                      : "Answer every question to send"
                    : undefined
                }
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {submitting ? "Sending…" : "Send response"}
              </Button>
            </div>
          </div>
        )}

        <CentriyonFooter />
      </div>
    </div>

    {/* Last chance before it locks: a read-only summary of exactly what is
        about to go, so the client checks it once more rather than sending
        straight past a one-line warning. */}
    <Dialog open={confirmSend} onOpenChange={(o) => !submitting && setConfirmSend(o)}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-4xl">
        <DialogTitle className="text-lg">
          {isQuestionList(view)
            ? "Review your answers"
            : view.stage === "brief"
              ? "Review your strategic brief"
              : "Review your areas of focus"}
        </DialogTitle>
        <DialogDescription>
          {view.stage === "brief"
            ? "Once the Centriyon team approve it, the areas of focus for the report are written from this brief, so it's worth a last read."
            : "This is exactly what the Centriyon team will receive."}
        </DialogDescription>

        {isQuestionList(view) && (
          <QuestionnaireReview
            questions={questions}
            value={answers}
            ownQuestionIds={ownQuestionIds}
            documentName={view.stage === "department_questions" ? null : docName}
            documentNames={
              view.stage === "department_questions" ? clientDocs.map((d) => d.filename) : []
            }
          />
        )}
        {view.stage === "brief" && (
          <BriefReview
            brief={brief}
            originalBrief={view.payload.strategic_brief ?? ""}
            note={note}
          />
        )}
        {view.stage === "areas" && (
          <AreasReview areas={areas} concepts={concepts} note={note} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            You can&apos;t change this after sending. Ask your Centriyon contact to
            send it back if something needs correcting.
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={submitting}
              onClick={() => setConfirmSend(false)}
            >
              ← Back to edit
            </Button>
            <Button
              disabled={submitting}
              onClick={submit}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Confirm &amp; send
            </Button>
          </div>
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
            Thank you — your response is with the Centriyon team.
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
