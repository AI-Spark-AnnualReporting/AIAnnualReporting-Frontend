"use client"

import { use, useState } from "react"
import { usePMSession, useReviewSession } from "@/hooks/useSessions"
import { PageSkeleton } from "@/components/ui/skeletons"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { StatusBadge } from "@/components/ui/status-badge"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  ArrowLeft, CheckCircle, RotateCcw, FileText,
  CheckCircle2, Clock, Sparkles,
} from "lucide-react"
import Link from "next/link"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { PMReviewAction } from "@/types"

export default function SessionReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading, refetch } = usePMSession(id)
  const reviewMutation = useReviewSession()

  const [reviewAction, setReviewAction] = useState<PMReviewAction | null>(null)
  const [reviewNotes, setReviewNotes] = useState("")
  const [activeTab, setActiveTab] = useState<"answers" | "draft">("answers")

  if (isLoading) return <PageSkeleton />

  const session = data?.session

  if (!session) {
    return <EmptyState title="Session not found" description="This session does not exist." />
  }

  const handleReview = async () => {
    if (!reviewAction) return
    // Backend requires non-empty review_notes for "rejected" — block before send.
    if (reviewAction === "rejected" && !reviewNotes.trim()) return
    try {
      await reviewMutation.mutateAsync({
        sessionId: id,
        data: { action: reviewAction, review_notes: reviewNotes || undefined },
      })
      toast.success(
        reviewAction === "approved"
          ? "Submission approved — will be included in the final report"
          : "Sent back to department for revision"
      )
    } catch {
      // error toast handled by hook
    }
    setReviewAction(null)
    setReviewNotes("")
    refetch()
  }

  const isSubmitted = session.status === "submitted"
  const isApproved  = session.status === "approved"
  const isReopened  = session.status === "reopened"

  // PM can act only when status is submitted (reopened means waiting on dept user).
  const canAct = isSubmitted

  /* ── Status workflow banner ─────────────────────────────────────────────── */
  const WorkflowStep = ({
    icon: Icon, label, active, done,
  }: { icon: React.ElementType; label: string; active?: boolean; done?: boolean }) => (
    <div className={cn(
      "flex flex-col items-center gap-1 text-center",
      done   ? "text-green-600" :
      active ? "text-primary"   : "text-muted-foreground"
    )}>
      <div className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full border-2",
        done   ? "bg-green-100 border-green-500" :
        active ? "bg-primary/10 border-primary"  : "border-muted-foreground/30"
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-xs font-medium whitespace-nowrap">{label}</span>
    </div>
  )

  const WorkflowConnector = ({ done }: { done?: boolean }) => (
    <div className={cn("h-0.5 flex-1 mt-4", done ? "bg-green-400" : "bg-muted")} />
  )

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/pm">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="font-semibold text-lg">
              Review — {session.department_name}
            </h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <StatusBadge status={session.status} variant="session" />
              <span className="text-sm text-muted-foreground">
                Progress: {session.progress_percentage}%
              </span>
              {session.submitted_at && (
                <span className="text-sm text-muted-foreground">
                  Submitted {formatDate(session.submitted_at)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons — only when PM can act (status === submitted) */}
        {canAct && (
          <div className="flex gap-2 flex-wrap shrink-0">
            <Button
              variant="outline"
              onClick={() => setReviewAction("rejected")}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Request Changes
            </Button>
            <Button
              onClick={() => setReviewAction("approved")}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="mr-2 h-4 w-4" /> Approve
            </Button>
          </div>
        )}

        {/* Read-only state badges when finalized */}
        {isApproved && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Approved — included in final report
            </span>
          </div>
        )}
        {isReopened && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1.5 text-sm font-medium text-orange-700">
              <Clock className="h-4 w-4" /> Waiting for department to revise and resubmit
            </span>
          </div>
        )}
      </div>

      {/* ── Workflow pipeline ── */}
      <div className="rounded-xl border bg-card px-6 py-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
          Review Workflow
        </p>
        <div className="flex items-center gap-0">
          <WorkflowStep icon={Sparkles}     label="Submitted" done={isSubmitted || isApproved || isReopened} />
          <WorkflowConnector done={isApproved} />
          <WorkflowStep icon={CheckCircle2} label="Approved"  active={isSubmitted} done={isApproved} />
          <WorkflowConnector done={isApproved} />
          <WorkflowStep icon={FileText}     label="In Report" done={isApproved} />
        </div>
        {isSubmitted && (
          <p className="text-xs text-muted-foreground mt-3">
            Review the submission, then <span className="font-medium text-green-600">Approve</span> to include it in the final report or <span className="font-medium text-red-600">Request Changes</span> to send it back to the department.
          </p>
        )}
        {isApproved && (
          <p className="text-xs text-green-700 mt-3">
            This submission is approved and will be included when you generate the final report for this cycle.
          </p>
        )}
        {isReopened && session.review_notes && (
          <div className="mt-3 rounded-lg bg-orange-50 border border-orange-200 p-3">
            <p className="text-xs font-semibold text-orange-800">Your feedback:</p>
            <p className="text-xs text-orange-700 mt-0.5">{session.review_notes}</p>
          </div>
        )}
      </div>

      {/* ── Content Tabs ── */}
      <div className="flex gap-1 border-b">
        {(["answers", "draft"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "answers" ? "Q&A Answers" : "Draft Report"}
          </button>
        ))}
      </div>

      {/* ── Answers tab ── */}
      {activeTab === "answers" && (
        <div className="space-y-4">
          {session.questions.length === 0 ? (
            <EmptyState icon={FileText} title="No questions" description="No questions for this session." />
          ) : (
            session.questions.map((q, idx) => {
              const answer = session.answers?.find((a) => a.question_id === q.question_id)
              return (
                <div key={q.question_id} className="rounded-lg border bg-card p-5 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {idx + 1}
                    </span>
                    <p className="font-medium text-sm leading-relaxed">{q.question}</p>
                  </div>
                  {answer ? (
                    <div className="ml-9 rounded-md bg-muted/40 p-4 text-sm leading-relaxed">
                      {answer.answer}
                    </div>
                  ) : (
                    <div className="ml-9 text-sm text-muted-foreground italic">
                      Not answered
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Draft tab ── */}
      {activeTab === "draft" && (
        <div className="rounded-lg border bg-card p-6">
          {(session.final_submission || session.ai_generated_draft) ? (() => {
            const content = session.final_submission || session.ai_generated_draft || ""
            const html = /<[a-z][\s\S]*>/i.test(content.trim().substring(0, 200))
            return html ? (
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: content }} />
            ) : (
              <pre className="text-sm whitespace-pre-wrap leading-relaxed font-sans">{content}</pre>
            )
          })() : (
            <EmptyState
              icon={FileText}
              title="No draft yet"
              description="The department hasn't generated a draft report."
            />
          )}
        </div>
      )}

      {/* ── Review action dialog ── */}
      <Dialog open={!!reviewAction} onOpenChange={(o: boolean) => !o && setReviewAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === "approved" ? "Approve Submission" : "Request Changes"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className={cn(
              "rounded-lg p-3 text-sm",
              reviewAction === "approved"
                ? "bg-green-50 text-green-800 border border-green-200"
                : "bg-red-50 text-red-800 border border-red-200"
            )}>
              {reviewAction === "approved"
                ? "This submission will be marked approved and included in the final cycle report when you generate it."
                : "Tell the department what needs to be revised. This message will be shown to them."}
            </div>

            <div className="space-y-2">
              <Label>
                {reviewAction === "approved" ? "Notes" : "Revision Notes (required)"}
                {reviewAction === "approved" && (
                  <span className="text-xs text-muted-foreground font-normal ml-1">(optional)</span>
                )}
              </Label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={
                  reviewAction === "approved"
                    ? "Any notes for the final report (optional)..."
                    : "Describe what needs to change..."
                }
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewAction(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleReview}
              disabled={
                reviewMutation.isPending ||
                (reviewAction === "rejected" && !reviewNotes.trim())
              }
              className={cn(
                reviewAction === "approved" && "bg-green-600 hover:bg-green-700 text-white",
                reviewAction === "rejected" && "bg-red-600 hover:bg-red-700 text-white",
              )}
            >
              {reviewMutation.isPending
                ? "Saving…"
                : reviewAction === "approved"
                ? "Approve"
                : "Send Back"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Quick stats footer ── */}
      <div className="flex items-center gap-6 rounded-xl border bg-muted/30 px-6 py-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {session.questions.length} questions
        </span>
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {session.answers?.filter(a => a.answer?.trim()).length ?? 0} answered
        </span>
        <span className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          {session.final_submission ? "Draft submitted" : session.ai_generated_draft ? "AI draft only" : "No draft"}
        </span>
      </div>
    </div>
  )
}
