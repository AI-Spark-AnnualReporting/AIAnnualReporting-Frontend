"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { useAddQuestionAfterAssign } from "@/hooks/useHod"

/* The Lead adds a question after Assign & send, until they approve.
   Answers are kept; the outline and draft are cleared on the server, so the
   Lead confirms first. Used on the Lead's department page and review page. */
export function AddQuestionAfterAssign({
  sessionId,
  deptName,
}: {
  sessionId: string
  deptName: string
}) {
  const [text, setText] = useState("")
  const [confirming, setConfirming] = useState(false)
  const add = useAddQuestionAfterAssign(sessionId)
  const cleaned = text.trim()

  const submit = () =>
    add.mutate(cleaned, {
      onSuccess: () => {
        setText("")
        setConfirming(false)
      },
    })

  return (
    <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-[#1A1D2E]">
        <Plus className="h-4 w-4 text-[#4040c8]" /> Add a question
      </p>
      <p className="mt-0.5 text-xs text-slate-500">
        You can add questions until you approve this department.
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setConfirming(false)
        }}
        disabled={add.isPending}
        rows={2}
        placeholder="e.g. How many employees completed safety training this year?"
        className="mt-3 w-full rounded-lg border border-slate-200 p-2.5 text-sm focus:border-[#4040c8] focus:outline-none"
      />
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={!cleaned}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#4040c8] px-4 py-2 text-xs font-bold text-white hover:bg-[#3535b5] disabled:opacity-40"
        >
          Add question
        </button>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="min-w-0 flex-1 text-xs text-amber-900">
            This clears {deptName}&apos;s outline and draft; their answers are kept. They&apos;ll answer
            the new question and rebuild the draft.
          </p>
          <button
            onClick={() => setConfirming(false)}
            disabled={add.isPending}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={add.isPending}
            className="rounded-lg bg-[#4040c8] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-60"
          >
            {add.isPending ? "Adding…" : "Yes, add it"}
          </button>
        </div>
      )}
    </div>
  )
}
