"use client"

import { useState } from "react"
import { usePMReviewQueue, useReviewSession } from "@/hooks/useSessions"
import type { ReviewQueueItem } from "@/hooks/useSessions"
import { EmptyState } from "@/components/ui/empty-state"
import { PageSkeleton } from "@/components/ui/skeletons"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { ClipboardCheck, Check, Clock } from "lucide-react"
import Link from "next/link"
import { formatDate, getInitials, cn } from "@/lib/utils"
import { toast } from "sonner"

// Deterministic avatar tint so each submitter keeps a stable colour.
const AVATAR_TINTS = [
  "bg-gradient-to-br from-rose-500 to-pink-500",
  "bg-gradient-to-br from-blue-500 to-indigo-500",
  "bg-gradient-to-br from-emerald-500 to-teal-500",
  "bg-gradient-to-br from-amber-500 to-orange-500",
  "bg-gradient-to-br from-violet-500 to-purple-500",
]
function tintFor(name: string): string {
  let sum = 0
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i)
  return AVATAR_TINTS[sum % AVATAR_TINTS.length]
}

export default function PMReviewsPage() {
  const { data, isLoading } = usePMReviewQueue()
  const review = useReviewSession()

  // Per-card "in flight" tracking so we only disable the card being acted on.
  const [actingId, setActingId] = useState<string | null>(null)
  // The submission currently targeted by the "Request changes" dialog.
  const [changesFor, setChangesFor] = useState<ReviewQueueItem | null>(null)
  const [notes, setNotes] = useState("")

  if (isLoading) return <PageSkeleton />

  const submissions = data ?? []

  function approve(sub: ReviewQueueItem) {
    setActingId(sub.session_id)
    review.mutate(
      { sessionId: sub.session_id, data: { action: "approved" } },
      {
        onSuccess: () => toast.success(`${sub.department_name} submission approved`),
        onSettled: () => setActingId(null),
      }
    )
  }

  function submitChanges() {
    if (!changesFor) return
    const trimmed = notes.trim()
    if (!trimmed) {
      toast.error("Please describe the changes needed")
      return
    }
    const sub = changesFor
    setActingId(sub.session_id)
    review.mutate(
      { sessionId: sub.session_id, data: { action: "reopened", review_notes: trimmed } },
      {
        onSuccess: () => {
          toast.success(`Changes requested from ${sub.department_name}`)
          setChangesFor(null)
          setNotes("")
        },
        onSettled: () => setActingId(null),
      }
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Pending Reviews</h1>
        <p className="mt-1.5 text-base text-slate-500">
          Department submissions awaiting your review.
        </p>
      </div>

      {submissions.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="All caught up!"
          description="There are no submissions pending your review right now."
        />
      ) : (
        <div className="space-y-4">
          {submissions.map((sub) => {
            const busy = review.isPending && actingId === sub.session_id
            return (
              <div
                key={sub.session_id}
                className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
                      <ClipboardCheck className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="text-base font-bold text-slate-900">{sub.department_name}</h3>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-600">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Awaiting review
                        </span>
                      </div>
                      <Link
                        href={`/pm/cycles/${sub.cycle_id}`}
                        className="block text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                      >
                        {sub.cycle_name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white",
                              tintFor(sub.user_name || "?")
                            )}
                          >
                            {getInitials(sub.user_name || "?")}
                          </span>
                          {sub.user_name}
                        </span>
                        {sub.submitted_at && (
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {formatDate(sub.submitted_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <Button
                      variant="outline"
                      className="border-slate-200 text-slate-700 hover:bg-slate-50"
                      disabled={busy}
                      onClick={() => {
                        setChangesFor(sub)
                        setNotes("")
                      }}
                    >
                      Request changes
                    </Button>
                    <Button
                      className="bg-indigo-600 text-white hover:bg-indigo-700"
                      disabled={busy}
                      onClick={() => approve(sub)}
                    >
                      <Check className="mr-1.5 h-4 w-4" />
                      {busy ? "Working…" : "Approve"}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Request changes dialog */}
      <Dialog open={!!changesFor} onOpenChange={(open) => { if (!open) { setChangesFor(null); setNotes("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request changes</DialogTitle>
            <DialogDescription>
              {changesFor
                ? `Send ${changesFor.department_name} back to revise their submission. Your notes are shown to the department.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe what needs to change before this can be approved…"
            rows={5}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setChangesFor(null); setNotes("") }}
              disabled={review.isPending}
            >
              Cancel
            </Button>
            <Button
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={submitChanges}
              disabled={review.isPending}
            >
              {review.isPending ? "Sending…" : "Send back for changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
