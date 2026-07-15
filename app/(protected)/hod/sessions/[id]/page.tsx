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
  HOD_WRITE_KEY,
} from "@/hooks/useHod"
import { QUERY_KEYS } from "@/lib/constants"
import type { HODQuestion } from "@/lib/api/hod"
import {
  ArrowLeft, Check, X, Pencil, Trash2, Plus, RotateCcw, Undo2,
  Loader2, Send, Clock, CheckCircle2,
} from "lucide-react"

const reviewOf = (q: HODQuestion) => q.review_status || "pending"

export default function HODCuratePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session, isLoading, isError } = useHODSession(id)

  const review = useReviewQuestion(id)
  const addQ = useAddQuestion(id)
  const removeQ = useRemoveQuestion(id)
  const approveAll = useApproveAll(id)

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

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [adding, setAdding] = useState(false)
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

  const canAssign = counts.total > 0 && counts.pending === 0 && counts.approved > 0

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

  const startEdit = (q: HODQuestion) => { setEditingId(q.question_id); setEditText(q.question) }
  const saveEdit = (questionId: string) => {
    const text = editText.trim()
    if (!text) return
    setEditingId(null) // close immediately; the optimistic update shows the new text
    review.mutate({ questionId, body: { text } })
  }
  const submitAdd = () => {
    const text = newText.trim()
    if (!text) return
    setNewText("")
    setAdding(false) // close immediately; the optimistic update appends the question
    addQ.mutate(text)
  }

  const deptName = session.departments?.department_name || "Department"
  const cycleName = session.reporting_cycles?.cycle_name || "Cycle"

  return (
    <div className="mx-auto max-w-3xl pb-28">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <button onClick={() => router.push("/hod")} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold text-[#1A1D2E]">{deptName} · {cycleName}</h1>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Reviewing questions
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">{counts.reviewed}/{counts.total} reviewed</span>
          <button
            onClick={() => approveAll.mutate()}
            disabled={counts.pending === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[#1A1D2E] hover:bg-slate-50 disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" /> Approve all pending
          </button>
          <button
            onClick={() => setAssignOpen(true)}
            disabled={!canAssign}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4040c8] px-3 py-2 text-xs font-bold text-white hover:bg-[#3535b5] disabled:opacity-40"
          >
            Assign &amp; send →
          </button>
        </div>
      </div>

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
          const editing = editingId === q.question_id
          const border = status === "approved" ? "border-l-emerald-400" : status === "rejected" ? "border-l-rose-400" : "border-l-amber-400"
          return (
            <div key={q.question_id} className={`rounded-2xl border border-slate-200 border-l-4 bg-white p-4 ${border}`}>
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-500">
                  {q.order}
                </span>
                <div className="min-w-0 flex-1">
                  <StatusPill status={status} />
                  {editing ? (
                    <div className="mt-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        autoFocus
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
                      {q.question}
                    </p>
                  )}

                  {!editing && (
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
        {adding ? (
          <div className="rounded-2xl border border-[#4040c8] bg-white p-4">
            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={3}
              autoFocus
              placeholder="Type the new question…"
              className="w-full resize-y rounded-lg border border-slate-200 p-3 text-sm text-[#1A1D2E] outline-none focus:border-[#4040c8] focus:ring-2 focus:ring-[#4040c8]/20"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => { setAdding(false); setNewText("") }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
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
      <div className="fixed bottom-6 left-1/2 z-20 w-[min(48rem,calc(100%-3rem))] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs font-semibold">
            {counts.pending > 0 ? (
              <><Clock className="h-4 w-4 text-amber-500" /><span className="text-slate-600">{counts.pending} question{counts.pending === 1 ? "" : "s"} still pending your review</span></>
            ) : (
              <><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="text-slate-600">All reviewed — {counts.approved} will be sent, {counts.rejected} rejected</span></>
            )}
          </p>
          <button
            onClick={() => setAssignOpen(true)}
            disabled={!canAssign}
            className="inline-flex items-center gap-2 rounded-lg bg-[#4040c8] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#3535b5] disabled:opacity-40"
          >
            <Send className="h-3.5 w-3.5" /> Assign &amp; send to team member
          </button>
        </div>
      </div>

      {assignOpen && (
        <AssignModal
          sessionId={id}
          approvedCount={counts.approved}
          onClose={() => setAssignOpen(false)}
          onAssigned={() => router.push("/hod")}
        />
      )}
    </div>
  )
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
  sessionId: string; approvedCount: number; onClose: () => void; onAssigned: () => void
}) {
  const { data: users, isLoading } = useHODAssignableUsers(sessionId)
  const assign = useAssignSession(sessionId)
  const [userId, setUserId] = useState<string | null>(null)
  const [note, setNote] = useState("")

  const send = () => {
    if (!userId) return
    assign.mutate({ user_id: userId, note: note.trim() || undefined }, { onSuccess: onAssigned })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-[#1A1D2E]">Assign &amp; send questions</h2>
            <p className="mt-1 text-xs text-slate-500">{approvedCount} approved question{approvedCount === 1 ? "" : "s"} will be sent to the team member you choose.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Choose a department user</p>
        <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-6 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !users?.length ? (
            <p className="rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-700">No department users in your department yet. Ask an admin to add one.</p>
          ) : (
            users.map((u) => {
              const selected = userId === u.user_id
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
                    <span className="block truncate text-sm font-bold text-[#1A1D2E]">{u.full_name}</span>
                    {u.title && <span className="block truncate text-xs text-slate-400">{u.title}</span>}
                  </span>
                  <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${selected ? "border-[#4040c8] bg-[#4040c8]" : "border-slate-300"}`} />
                </button>
              )
            })
          )}
        </div>

        <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">Note to the team member <span className="font-medium normal-case text-slate-300">optional</span></p>
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
            disabled={!userId || assign.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[#4040c8] px-4 py-2 text-xs font-bold text-white hover:bg-[#3535b5] disabled:opacity-40"
          >
            {assign.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send questions
          </button>
        </div>
      </div>
    </div>
  )
}
