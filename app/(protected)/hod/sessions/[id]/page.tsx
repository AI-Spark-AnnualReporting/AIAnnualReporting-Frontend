"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useIsMutating, useQueryClient } from "@tanstack/react-query"
import {
  useHODSession,
  useReviewQuestion,
  useAddQuestion,
  useRemoveQuestion,
  useApproveAll,
  useHODAssignableUsers,
  useAssignSession,
  useDeptClientShare,
  HOD_WRITE_KEY,
} from "@/hooks/useHod"
import {
  DepartmentShareBanner,
  DepartmentShareButton,
} from "@/components/hod/DepartmentClientShare"
import { DepartmentHistoryButton } from "@/components/pm/KickoffHistoryPanel"
import { AddQuestionAfterAssign } from "@/components/hod/AddQuestionAfterAssign"
import { ClientDocumentsList } from "@/components/share/ClientDocumentsList"
import type { ClientSupportingDocument } from "@/lib/api/share"
import { useAuth } from "@/contexts/AuthContext"
import { QUERY_KEYS } from "@/lib/constants"
import { formatDateTime } from "@/lib/utils"
import type { AssignableUser, HODQuestion, HODSession } from "@/lib/api/hod"
import { QuestionTag } from "@/components/ui/question-text"
import { QUESTION_PLACEHOLDER, TOPIC_PLACEHOLDER, joinQuestion, splitQuestion } from "@/lib/questionText"
import { dirOf } from "@/lib/lang"
import {
  ArrowLeft, Check, X, Pencil, Trash2, Plus, RotateCcw, Undo2,
  Loader2, Send, Clock, CheckCircle2,
} from "lucide-react"

const reviewOf = (q: HODQuestion) => q.review_status || "pending"

export default function HODCuratePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session, isLoading, isError } = useHODSession(id)
  const { user: me } = useAuth()

  const review = useReviewQuestion(id)
  const addQ = useAddQuestion(id)
  const removeQ = useRemoveQuestion(id)
  const approveAll = useApproveAll(id)
  // Spark-led sessions go to the client before they can be assigned.
  // Only Spark staff have this step; nobody else makes the call.
  const isSpark = me?.role === "spark_internal"
  const {
    data: clientState,
    isLoading: clientLoading,
    isError: clientError,
    refetch: refetchClient,
  } = useDeptClientShare(id, isSpark)

  // When every queued curation write has settled, do ONE reconciling refetch —
  // fixes the temp ids from optimistic adds and self-corrects any failed send.
  const qc = useQueryClient()
  const writing = useIsMutating({ mutationKey: HOD_WRITE_KEY(id) })
  const prevWriting = useRef(0)
  useEffect(() => {
    if (prevWriting.current > 0 && writing === 0) {
      qc.invalidateQueries({ queryKey: QUERY_KEYS.HOD_SESSION(id) })
      qc.invalidateQueries({ queryKey: ["hod", "sessions"] })
    }
    prevWriting.current = writing
  }, [writing, id, qc])

  // Topic and question are typed apart and stored joined ("Topic — question").
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTopic, setEditTopic] = useState("")
  const [editText, setEditText] = useState("")
  const [adding, setAdding] = useState(false)
  const [newTopic, setNewTopic] = useState("")
  const [newText, setNewText] = useState("")
  const [assignOpen, setAssignOpen] = useState(false)

  const questions = useMemo(
    () => [...(session?.questions || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
    [session],
  )
  const counts = useMemo(() => {
    const pending = questions.filter((q) => reviewOf(q) === "pending").length
    const approved = questions.filter((q) => reviewOf(q) === "approved").length
    const rejected = questions.filter((q) => reviewOf(q) === "rejected").length
    const total = questions.length
    const reviewed = approved + rejected
    return { pending, approved, rejected, total, reviewed, progress: total ? Math.round((reviewed / total) * 100) : 0 }
  }, [questions])

  const reviewDone = counts.total > 0 && counts.pending === 0 && counts.approved > 0
  const clientShare = clientState?.share ?? null
  // The client step applies when this user must take it (Spark), or when it
  // was already taken (so nobody assigns around an open share).
  const clientStep = !!clientState?.required || !!clientShare
  const clientApproved = clientShare?.status === "approved"
  // For Spark, the client step isn't known until its state loads (or if that
  // failed). Until then nothing is offered: no edits, no Assign, no Send.
  const clientUnknown = isSpark && (clientLoading || clientError)
  // Once sent, only the client changes the questions; after approval nobody does.
  const locked = !!clientShare || clientUnknown
  const canAssign = reviewDone && !clientUnknown && (!clientStep || clientApproved)
  const showShareButton = clientStep && !clientApproved
  // The client rejected every question: nothing left to approve.
  const nothingToApprove = clientShare?.status === "responded" && counts.approved === 0
  // Once the client has replied, each card shows their answer under the question.
  // The reply keys answers by the same question ids as the session's questions.
  const clientReplied = !!clientShare && clientShare.status !== "pending"
  const clientAnswerById = new Map<string, string>()
  for (const a of clientShare?.response?.answers ?? []) {
    clientAnswerById.set(a.question_id, a.answer)
  }
  const clientRejectedIds = new Set(clientShare?.response?.rejected_question_ids ?? [])

  if (isLoading) {
    return <div className="flex items-center justify-center py-24 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }
  if (isError || !session) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm font-semibold text-[#1A1D2E]">Couldn’t load this session</p>
        <button onClick={() => router.push("/hod")} className="mt-4 text-xs font-bold text-[#4040c8]">← Back to dashboard</button>
      </div>
    )
  }

  const setStatus = (questionId: string, review_status: "pending" | "approved" | "rejected") =>
    review.mutate({ questionId, body: { review_status } })

  const startEdit = (q: HODQuestion) => {
    const { topic, question } = splitQuestion(q.question)
    setEditingId(q.question_id)
    setEditTopic(topic ?? "")
    setEditText(question)
  }
  const saveEdit = (questionId: string) => {
    const text = joinQuestion(editTopic, editText)
    if (!editText.trim()) return
    setEditingId(null) // close immediately; the optimistic update shows the new text
    review.mutate({ questionId, body: { text } })
  }
  const submitAdd = () => {
    const text = joinQuestion(newTopic, newText)
    if (!newText.trim()) return
    setNewTopic("")
    setNewText("")
    setAdding(false) // close immediately; the optimistic update appends the question
    addQ.mutate(text)
  }

  const deptName = session.departments?.department_name || "Department"
  const cycleName = session.reporting_cycles?.cycle_name || "Cycle"

  // Once Assign & send has run the questions have left review: the server
  // refuses every change here, so the page says where they went instead of
  // offering Assign & send again (reached by Back, a link or a refresh).
  if (session.status !== "hod_curation") {
    return (
      <SentView
        session={session}
        questions={questions}
        title={`${deptName} · ${cycleName}`}
        mine={!!me && session.user_id === me.user_id}
        clientDocuments={clientShare?.payload.documents ?? []}
        historyButton={
          isSpark ? <DepartmentHistoryButton sessionId={id} title={`${deptName} questions`} /> : null
        }
        onBack={() => router.push("/hod")}
        onAnswer={() => router.push("/department")}
        onReview={() => router.push(`/hod/sessions/${id}/review`)}
      />
    )
  }

  return (
    <div className="mx-auto max-w-3xl pb-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button onClick={() => router.push("/hod")} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold text-[#1A1D2E]">{deptName} · {cycleName}</h1>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{" "}
          {!clientShare
            ? "Reviewing questions"
            : clientShare.status === "pending"
              ? "With the client"
              : clientShare.status === "responded"
                ? "Client responded"
                : "Client answered"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">{counts.reviewed}/{counts.total} reviewed</span>
          {/* From the start for Spark HODs: their edits before sending are
              recorded too, not only what happens with the client. */}
          {(clientShare || clientState?.required) && (
            <DepartmentHistoryButton sessionId={id} title={`${deptName} questions`} />
          )}
          {!locked && (
            <button
              onClick={() => approveAll.mutate()}
              disabled={counts.pending === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[#1A1D2E] hover:bg-slate-50 disabled:opacity-40"
            >
              <Check className="h-3.5 w-3.5" /> Approve all pending
            </button>
          )}
          {!showShareButton && !clientUnknown && (
            <button
              onClick={() => setAssignOpen(true)}
              disabled={!canAssign}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#4040c8] px-3 py-2 text-xs font-bold text-white hover:bg-[#3535b5] disabled:opacity-40"
            >
              Assign &amp; send →
            </button>
          )}
        </div>
      </div>

      {clientShare && <DepartmentShareBanner share={clientShare} />}

      {/* Counters */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat n={counts.pending} label="Pending review" tone="amber" highlight={counts.pending > 0} />
        <Stat n={counts.approved} label="Approved" tone="green" />
        <Stat n={counts.rejected} label="Rejected" tone="red" />
        <Stat n={counts.approved} label="Will be sent" tone="indigo" />
        <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-3 sm:col-span-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>Review progress</span><span>{counts.progress}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[#4040c8] transition-all" style={{ width: `${counts.progress}%` }} />
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-3">
        {questions.map((q) => {
          const status = reviewOf(q)
          const { topic, question } = splitQuestion(q.question)
          // An edit box left open when the questions were sent closes itself.
          const editing = editingId === q.question_id && !locked
          const border = status === "approved" ? "border-l-emerald-400" : status === "rejected" ? "border-l-rose-400" : "border-l-amber-400"
          return (
            <div key={q.question_id} dir={dirOf(question)} className={`rounded-2xl border border-slate-200 border-l-4 bg-white p-4 ${border}`}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-500">
                  {q.order}
                </span>
                <div className="min-w-0 flex-1">
                  {/* Topic tag left, review status right — the status is the
                      thing being acted on here, so it sits at the edge. */}
                  <div className="flex items-start justify-between gap-2">
                    {topic ? <QuestionTag topic={topic} /> : <span />}
                    <StatusPill status={status} />
                  </div>
                  {editing ? (
                    <div className="mt-2 space-y-2">
                      <input
                        value={editTopic}
                        onChange={(e) => setEditTopic(e.target.value)}
                        placeholder={TOPIC_PLACEHOLDER}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#1A1D2E] outline-none focus:border-[#4040c8] focus:ring-2 focus:ring-[#4040c8]/20"
                      />
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder={QUESTION_PLACEHOLDER}
                        className="w-full resize-y rounded-lg border border-[#4040c8] p-3 text-sm text-[#1A1D2E] outline-none focus:ring-2 focus:ring-[#4040c8]/20"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button onClick={() => setEditingId(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                        <button onClick={() => saveEdit(q.question_id)} disabled={!editText.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4040c8] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#3535b5] disabled:opacity-40">
                          <Check className="h-3.5 w-3.5" /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className={`mt-2 text-sm leading-relaxed ${status === "rejected" ? "text-slate-400 line-through" : "text-[#1A1D2E]"}`}>
                      {question}
                    </p>
                  )}

                  {clientReplied && !clientRejectedIds.has(q.question_id) && (
                    <ClientAnswer answer={clientAnswerById.get(q.question_id)} />
                  )}

                  {clientReplied && clientRejectedIds.has(q.question_id) && (
                    <p className="mt-1.5 text-[11px] font-semibold text-rose-600">Rejected by the client</p>
                  )}

                  {(q.added_by === "client" || q.edited_by === "client") && (
                    <p className="mt-1.5 text-[11px] font-semibold text-indigo-600">
                      {q.added_by === "client" ? "Added by the client" : "Reworded by the client"}
                    </p>
                  )}

                  {!editing && !locked && (
                    <div className="mt-3 flex items-center gap-2">
                      {status === "pending" && (
                        <>
                          <Action onClick={() => setStatus(q.question_id, "approved")} icon={<Check className="h-3.5 w-3.5" />} label="Approve" />
                          <Action onClick={() => setStatus(q.question_id, "rejected")} icon={<X className="h-3.5 w-3.5" />} label="Reject" />
                        </>
                      )}
                      {status === "approved" && (
                        <>
                          <Action onClick={() => setStatus(q.question_id, "pending")} icon={<Undo2 className="h-3.5 w-3.5" />} label="Undo" />
                          <Action onClick={() => setStatus(q.question_id, "rejected")} icon={<X className="h-3.5 w-3.5" />} label="Reject" />
                        </>
                      )}
                      {status === "rejected" && (
                        <>
                          <Action onClick={() => setStatus(q.question_id, "approved")} icon={<Check className="h-3.5 w-3.5" />} label="Approve" />
                          <Action onClick={() => setStatus(q.question_id, "pending")} icon={<RotateCcw className="h-3.5 w-3.5" />} label="Restore" />
                        </>
                      )}
                      <Action onClick={() => startEdit(q)} icon={<Pencil className="h-3.5 w-3.5" />} label="Edit" />
                      <button
                        onClick={() => removeQ.mutate(q.question_id)}
                        title="Remove question"
                        className="ml-auto rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {/* Add a question */}
        {locked ? null : adding ? (
          <div className="rounded-2xl border border-[#4040c8] bg-white p-4">
            <input
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              autoFocus
              placeholder={TOPIC_PLACEHOLDER}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-[#1A1D2E] outline-none focus:border-[#4040c8] focus:ring-2 focus:ring-[#4040c8]/20"
            />
            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={3}
              placeholder={QUESTION_PLACEHOLDER}
              className="mt-2 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm text-[#1A1D2E] outline-none focus:border-[#4040c8] focus:ring-2 focus:ring-[#4040c8]/20"
            />
            <p className="mt-1.5 text-[11px] text-slate-400">
              The topic becomes the question&apos;s tag.
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => { setAdding(false); setNewTopic(""); setNewText("") }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={submitAdd} disabled={!newText.trim()} className="rounded-lg bg-[#4040c8] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#3535b5] disabled:opacity-40">Add question</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#4040c8]/40 py-4 text-sm font-bold text-[#4040c8] hover:bg-[#4040c8]/[0.03]"
          >
            <Plus className="h-4 w-4" /> Add a question
          </button>
        )}
      </div>

      {/* Sticky assign bar */}
      {/* Sticky, not fixed: it stays inside the page column, so it lines up with the cards. */}
      <div className="sticky bottom-6 z-20 mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex min-w-0 flex-1 basis-60 items-center gap-2 text-xs font-semibold">
            {showShareButton && clientShare ? (
              <><Clock className="h-4 w-4 text-amber-500" /><span className="text-slate-600">
                {clientShare.status === "pending"
                  ? "Waiting on the client. You can assign once you've approved their answers."
                  : "The client has responded. Approve their answers or send them back."}
              </span></>
            ) : counts.pending > 0 ? (
              <><Clock className="h-4 w-4 text-amber-500" /><span className="text-slate-600">{counts.pending} question{counts.pending === 1 ? "" : "s"} still pending your review</span></>
            ) : (
              <><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="text-slate-600">All reviewed — {counts.approved} will be sent, {counts.rejected} rejected</span></>
            )}
          </p>
          {/* The one place the client-step button lives: the sticky bar is
              always on screen, and two copies would mean two dialogs. */}
          {clientUnknown ? (
            // Spark, client-step state not loaded yet (or it failed).
            <button
              onClick={() => refetchClient()}
              disabled={!clientError}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              {clientError ? (
                <><RotateCcw className="h-3.5 w-3.5" /> Couldn&apos;t check the client step — retry</>
              ) : (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</>
              )}
            </button>
          ) : showShareButton ? (
            <DepartmentShareButton
              sessionId={id}
              departmentName={deptName}
              share={clientShare}
              suggestedEmail={clientState?.suggested_email}
              nothingToApprove={nothingToApprove}
              blockedReason={
                !clientShare && !reviewDone
                  ? counts.pending > 0
                    ? "Approve or reject every question first"
                    : "Approve at least one question to send"
                  : undefined
              }
            />
          ) : (
            <button
              onClick={() => setAssignOpen(true)}
              disabled={!canAssign}
              className="inline-flex items-center gap-2 rounded-lg bg-[#4040c8] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#3535b5] disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" /> Assign &amp; send questions
            </button>
          )}
        </div>
      </div>

      {assignOpen && (
        <AssignModal
          sessionId={id}
          approvedCount={counts.approved}
          onClose={() => setAssignOpen(false)}
          // Self-assigned: go to the department workspace — the same entry point
          // a department user gets, Start Session dialog and all.
          onAssigned={(self) => router.push(self ? "/department" : "/hod")}
        />
      )}
    </div>
  )
}

/** The page after the questions were sent: read-only, saying to whom and
 *  when, with the way on. */
function SentView({
  session, questions, title, mine, clientDocuments, historyButton, onBack, onAnswer, onReview,
}: {
  session: HODSession
  questions: HODQuestion[]
  title: string
  /** Supporting documents the client attached (Spark-led sessions). */
  clientDocuments: ClientSupportingDocument[]
  /** Spark-led sessions: the History stays readable after Assign & send. */
  historyButton?: React.ReactNode
  /** Sent to the person viewing: they answer them next. */
  mine: boolean
  onBack: () => void
  onAnswer: () => void
  onReview: () => void
}) {
  const sent = questions.filter((q) => reviewOf(q) !== "rejected")
  // Assign & send may move rejected questions out to `rejected_questions`.
  const rejected = questions.length - sent.length + (session.rejected_questions?.length ?? 0)
  const to = mine ? "you" : session.users?.full_name || "a team member"
  const on = (iso?: string | null) => (iso ? ` on ${formatDateTime(iso)}` : "")
  const stage = sentStage(session.status)

  // What the bar says and offers follows where the answers are now: being
  // written, waiting for the lead's review, approved, or sent back.
  const bar =
    stage === "submitted"
      ? {
          badge: "Answers submitted",
          title: `Answers submitted${on(session.submitted_at)}`,
          text: "They're waiting for your review.",
          button: "Review answers →",
          onClick: onReview,
        }
      : stage === "approved"
        ? {
            badge: "Approved",
            title: `Answers approved${on(session.reviewed_at)}`,
            text: "Nothing more to do on this session.",
            button: "View answers",
            onClick: onReview,
          }
        : {
            badge: stage === "reopened" ? "Sent back" : "Questions sent",
            title:
              stage === "reopened"
                ? "Sent back for changes"
                : `Questions sent to ${to}${on(session.routed_at)}`,
            text:
              stage === "reopened"
                ? "They're being updated."
                : mine
                  ? "Answer them in your workspace. You can still add a question until you approve."
                  : "They're being answered now. You can still add a question until you approve.",
            button: mine ? "Go to answering →" : "Back to dashboard",
            onClick: mine ? onAnswer : onBack,
          }

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold text-[#1A1D2E]">{title}</h1>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {bar.badge}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-500">
            {sent.length} sent · {rejected} rejected
          </span>
          {historyButton}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold text-[#1A1D2E]">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> {bar.title}
          </p>
          <p className="mt-0.5 text-xs text-slate-600">{bar.text}</p>
        </div>
        <button
          onClick={bar.onClick}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#4040c8] px-4 py-2 text-xs font-bold text-white hover:bg-[#3535b5]"
        >
          {bar.button}
        </button>
      </div>

      {clientDocuments.length > 0 && (
        <div className="mb-6 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4">
          <p className="mb-2 text-sm font-bold text-[#1A1D2E]">
            Supporting documents from the client ({clientDocuments.length})
          </p>
          <ClientDocumentsList documents={clientDocuments} />
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3">
        <Stat n={sent.length} label="Sent" tone="green" />
        <Stat n={rejected} label="Rejected" tone="red" />
      </div>

      <div className="space-y-3">
        {questions.map((q) => {
          const isRejected = reviewOf(q) === "rejected"
          const { topic, question } = splitQuestion(q.question)
          return (
            <div
              key={q.question_id}
              dir={dirOf(question)}
              className={`rounded-2xl border border-slate-200 border-l-4 bg-white p-4 ${isRejected ? "border-l-rose-400" : "border-l-emerald-400"}`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-500">
                  {q.order}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    {topic ? <QuestionTag topic={topic} /> : <span />}
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${isRejected ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"}`}
                    >
                      {isRejected ? "REJECTED" : "SENT"}
                    </span>
                  </div>
                  <p className={`mt-2 text-sm leading-relaxed ${isRejected ? "text-slate-400 line-through" : "text-[#1A1D2E]"}`}>
                    {question}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {stage !== "approved" && (
        <AddQuestionAfterAssign
          sessionId={session.session_id}
          deptName={session.departments?.department_name || "the department"}
        />
      )}
    </div>
  )
}

/** Where a sent session's answers are: being written, submitted for the
 *  lead's review, approved, or sent back. */
function sentStage(status: string): "answering" | "submitted" | "approved" | "reopened" {
  if (status === "submitted") return "submitted"
  if (status === "approved") return "approved"
  if (status === "reopened") return "reopened"
  return "answering"
}

function Stat({ n, label, tone, highlight }: { n: number; label: string; tone: "amber" | "green" | "red" | "indigo"; highlight?: boolean }) {
  const color = { amber: "text-amber-600", green: "text-emerald-600", red: "text-rose-600", indigo: "text-[#4040c8]" }[tone]
  return (
    <div className={`rounded-xl border bg-white p-3 ${highlight ? "border-amber-300" : "border-slate-200"}`}>
      <p className={`text-2xl font-extrabold ${color}`}>{n}</p>
      <p className="text-[11px] font-medium text-slate-400">{label}</p>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-50 text-amber-700",
    approved: "bg-emerald-50 text-emerald-700",
    rejected: "bg-rose-50 text-rose-600",
  }
  const label: Record<string, string> = { pending: "PENDING", approved: "APPROVED", rejected: "REJECTED" }
  return <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold tracking-wide ${map[status]}`}>{label[status]}</span>
}

function Action({ onClick, icon, label, disabled }: { onClick: () => void; icon: React.ReactNode; label: string; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
      {icon} {label}
    </button>
  )
}

function AssignModal({ sessionId, approvedCount, onClose, onAssigned }: {
  sessionId: string; approvedCount: number; onClose: () => void; onAssigned: (self: boolean) => void
}) {
  const { data: users, isLoading } = useHODAssignableUsers(sessionId)
  const { user: me } = useAuth()
  const assign = useAssignSession(sessionId)
  const [userId, setUserId] = useState<string | null>(null)
  const [note, setNote] = useState("")

  // The HOD can keep the questions and answer them personally — same flow as a
  // department user. Listed first, and filtered out of the rest so it can't
  // appear twice if the backend already returns the HOD as assignable.
  const choices = useMemo<AssignableUser[]>(() => {
    const others = (users || []).filter((u) => u.user_id !== me?.user_id)
    if (!me) return others
    return [{ user_id: me.user_id, full_name: me.full_name, title: "Answer these questions yourself" }, ...others]
  }, [users, me])

  // A Spark-internal tester hits this modal against a one-person department on
  // every pass, where the only option opens unselected and Send is disabled — so
  // the first click is always a no-op. Assume it for them, and only then: with two
  // or more candidates nothing is assumed, so questions can never be assigned to
  // the wrong person by default. Derived rather than stored, so when the user list
  // finishes loading and others appear, this simply stops applying — and so it
  // never fires while `users` is still undefined and `choices` is briefly [me].
  const soleChoice =
    !isLoading && me?.role === "spark_internal" && choices.length === 1
      ? choices[0].user_id
      : null
  const effectiveUserId = userId ?? soleChoice

  const self = !!me && effectiveUserId === me.user_id

  // Stays true from the first click on, success included: the modal is still
  // open while the page moves away, and a second click then was refused by
  // the server ("not awaiting question review").
  const [sending, setSending] = useState(false)
  const send = () => {
    if (!effectiveUserId || sending) return
    setSending(true)
    assign.mutate(
      { user_id: effectiveUserId, note: note.trim() || undefined },
      { onSuccess: () => onAssigned(self), onError: () => setSending(false) },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-[#1A1D2E]">Assign &amp; send questions</h2>
            <p className="mt-1 text-xs text-slate-500">{approvedCount} approved question{approvedCount === 1 ? "" : "s"} will go to whoever you choose — a team member, or yourself.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Choose who answers</p>
        <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-6 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !choices.length ? (
            <p className="rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-700">No department users in your department yet. Ask an admin to add one.</p>
          ) : (
            choices.map((u) => {
              const selected = effectiveUserId === u.user_id
              const isMe = u.user_id === me?.user_id
              return (
                <button
                  key={u.user_id}
                  onClick={() => setUserId(u.user_id)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${selected ? "border-[#4040c8] bg-[#4040c8]/[0.04]" : "border-slate-200 hover:bg-slate-50"}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4040c8] text-[11px] font-bold text-white">
                    {(u.full_name || "?").split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[#1A1D2E]">
                      {u.full_name}
                      {isMe && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">YOU</span>}
                    </span>
                    {u.title && <span className="block truncate text-xs text-slate-400">{u.title}</span>}
                  </span>
                  <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${selected ? "border-[#4040c8] bg-[#4040c8]" : "border-slate-300"}`} />
                </button>
              )
            })
          )}
        </div>

        <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          {self ? "Note to yourself" : "Note to the team member"} <span className="font-medium normal-case text-slate-300">optional</span>
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="e.g. Please prioritise the KPI and budget questions…"
          className="mt-2 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm text-[#1A1D2E] outline-none focus:border-[#4040c8] focus:ring-2 focus:ring-[#4040c8]/20"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
          <button
            onClick={send}
            disabled={!effectiveUserId || sending}
            className="inline-flex items-center gap-2 rounded-lg bg-[#4040c8] px-4 py-2 text-xs font-bold text-white hover:bg-[#3535b5] disabled:opacity-40"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {sending ? "Sending…" : self ? "Start answering" : "Send questions"}
          </button>
        </div>
      </div>
    </div>
  )
}

/** The client's answer under a question, or a quiet line when they left it blank. */
function ClientAnswer({ answer }: { answer: string | undefined }) {
  if (!answer || !answer.trim()) {
    return <p className="mt-2 text-xs italic text-slate-500">No answer from the client</p>
  }
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-bold tracking-wider text-slate-500">CLIENT&apos;S ANSWER</p>
      <p dir={dirOf(answer)} className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{answer}</p>
    </div>
  )
}
