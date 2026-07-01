"use client"

import { useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useHODSession, useReviewAnswers } from "@/hooks/useHod"
import { PageLoader } from "@/components/ui/spinner"
import { ArrowLeft, Check, Send, X, Loader2, Info, CircleSlash } from "lucide-react"
import { cn } from "@/lib/utils"

const isNA = (a: string) => a.trim().toUpperCase().startsWith("N/A")

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  submitted: { label: "Submitted — awaiting your review", cls: "bg-amber-50 text-amber-700" },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700" },
  reopened: { label: "Sent back for changes", cls: "bg-rose-50 text-rose-600" },
}

export default function HODReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session, isLoading, isError } = useHODSession(id)
  const review = useReviewAnswers(id)

  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [notes, setNotes] = useState("")

  const questions = useMemo(
    () => [...(session?.questions || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
    [session],
  )

  if (isLoading) return <PageLoader />
  if (isError || !session) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm font-semibold text-[#1A1D2E]">Couldn’t load this submission</p>
        <button onClick={() => router.push("/hod/reviews")} className="mt-4 text-xs font-bold text-[#4040c8]">← Back to reviews</button>
      </div>
    )
  }

  const answerFor = (qid: string) => (session.answers || []).find((a) => a.question_id === qid)?.answer ?? ""
  const isSubmitted = session.status === "submitted"
  const badge = STATUS_BADGE[session.status]
  const dept = session.departments?.department_name || "Department"
  const cycle = session.reporting_cycles?.cycle_name || "Reporting cycle"
  const assignee = session.users?.full_name

  const approve = () =>
    review.mutate({ action: "approved" }, { onSuccess: () => router.push("/hod/reviews") })
  const sendBack = () => {
    if (!notes.trim()) return
    review.mutate(
      { action: "reopened", review_notes: notes.trim() },
      { onSuccess: () => router.push("/hod/reviews") },
    )
  }

  return (
    <div className="mx-auto max-w-3xl pb-28">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button onClick={() => router.push("/hod/reviews")} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold text-[#1A1D2E]">{cycle}</h1>
          <p className="truncate text-xs text-slate-500">{dept}{assignee ? ` · ${assignee}` : ""}</p>
        </div>
        {badge && (
          <span className={cn("ml-auto rounded-full px-2.5 py-1 text-[11px] font-semibold", badge.cls)}>
            {badge.label}
          </span>
        )}
      </div>

      {/* Prior feedback (if this was sent back before and resubmitted) */}
      {session.review_notes && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700">Your previous note</p>
          <p className="mt-1 text-sm text-amber-800">{session.review_notes}</p>
        </div>
      )}

      {/* Read-only Q&A */}
      <div className="space-y-3">
        {questions.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
            No questions on this session.
          </div>
        ) : (
          questions.map((q, idx) => {
            const ans = answerFor(q.question_id)
            const has = !!ans.trim()
            const na = has && isNA(ans)
            return (
              <div key={q.question_id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-500">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-relaxed text-[#1A1D2E]">{q.question}</p>
                    {na ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">
                        <Info className="h-3.5 w-3.5" /> Marked not applicable
                      </p>
                    ) : has ? (
                      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                        {ans}
                      </p>
                    ) : (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400">
                        <CircleSlash className="h-3.5 w-3.5" /> No answer provided
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Action bar */}
      {isSubmitted ? (
        <div className="fixed bottom-6 left-1/2 z-20 w-[min(48rem,calc(100%-3rem))] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-slate-600">
              Approve to include this in the report, or send it back for changes.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSendBackOpen(true)}
                disabled={review.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" /> Send back
              </button>
              <button
                onClick={approve}
                disabled={review.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {review.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Approve
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
          {session.status === "approved"
            ? "You’ve approved this submission — it’s included in the report."
            : "You sent this back — waiting for the team member to resubmit."}
        </div>
      )}

      {/* Send-back modal */}
      {sendBackOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSendBackOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-[#1A1D2E]">Send back for changes</h2>
                <p className="mt-1 text-xs text-slate-500">Tell {assignee || "the team member"} what needs fixing — they’ll be able to edit and resubmit.</p>
              </div>
              <button onClick={() => setSendBackOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              autoFocus
              placeholder="e.g. Please add the FY2026 figures to questions 3 and 5…"
              className="mt-4 w-full resize-y rounded-lg border border-slate-200 p-3 text-sm text-[#1A1D2E] outline-none focus:border-[#4040c8] focus:ring-2 focus:ring-[#4040c8]/20"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSendBackOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={sendBack}
                disabled={!notes.trim() || review.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-40"
              >
                {review.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
