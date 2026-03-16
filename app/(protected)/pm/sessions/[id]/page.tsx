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
  ArrowLeft, CheckCircle, XCircle, RotateCcw, FileText,
  Eye, CheckCircle2, Clock, Sparkles,
} from "lucide-react"
import Link from "next/link"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// The backend supports: reviewed → intermediate "PM has read it"
//                        approved → content included in final report
//                        rejected → hard reject
//                        reopened → sent back to department for changes
type ReviewAction = "reviewed" | "approved" | "rejected" | "reopened"

export default function SessionReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading, refetch } = usePMSession(id)
  const reviewMutation = useReviewSession()

  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null)
  const [reviewNotes, setReviewNotes] = useState("")
  const [activeTab, setActiveTab] = useState<"answers" | "draft">("answers")

  if (isLoading) return <PageSkeleton />

  const session = data?.session

  if (!session) {
    return <EmptyState title="Session not found" description="This session does not exist." />
  }

  const handleReview = async () => {
    if (!reviewAction) return
    try {
      await reviewMutation.mutateAsync({
        sessionId: id,
        data: { status: reviewAction, review_notes: reviewNotes || undefined },
      })
      toast.success(
        reviewAction === "reviewed"   ? "Marked as reviewed — ready for final approval" :
        reviewAction === "approved"   ? "Submission approved — will be included in the final report" :
        reviewAction === "rejected"   ? "Submission rejected" :
        "Sent back to department for revision"
      )
    } catch {
      // error toast handled by hook
    }
    setReviewAction(null)
    setReviewNotes("")
    refetch()
  }

  const isSubmitted = session.status === "submitted"
  const isReviewed  = session.status === "reviewed"
  const isApproved  = session.status === "approved"
  const isRejected  = session.status === "rejected"
  const isReopened  = session.status === "reopened"

  // PM can act when status is submitted OR reviewed
  const canAct = isSubmitted || isReviewed

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

        {/* Action buttons — differ by current status */}
        {canAct && (
          <div className="flex gap-2 flex-wrap shrink-0">
            {isSubmitted && (
              /* First step: PM reads it and marks it reviewed */
              <Button
                variant="outline"
                onClick={() => setReviewAction("reviewed")}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <Eye className="mr-2 h-4 w-4" /> Mark Reviewed
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setReviewAction("reopened")}
              className="text-orange-600 border-orange-200 hover:bg-orange-50"
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Request Revision
            </Button>
            <Button
              variant="outline"
              onClick={() => setReviewAction("rejected")}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <XCircle className="mr-2 h-4 w-4" /> Reject
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
        {isRejected && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700">
              <XCircle className="h-4 w-4" /> Rejected
            </span>
          </div>
        )}
        {isReopened && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1.5 text-sm font-medium text-orange-700">
              <RotateCcw className="h-4 w-4" /> Revision Requested
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
          <WorkflowStep icon={Sparkles}    label="Submitted"  done={!["not_started","in_progress"].includes(session.status)} />
          <WorkflowConnector done={isReviewed || isApproved} />
          <WorkflowStep icon={Eye}         label="Reviewed"   active={isSubmitted} done={isReviewed || isApproved} />
          <WorkflowConnector done={isApproved} />
          <WorkflowStep icon={CheckCircle2} label="Approved"  active={isReviewed}  done={isApproved} />
          <WorkflowConnector done={false} />
          <WorkflowStep icon={FileText}    label="In Report"  done={isApproved} />
        </div>
        {isSubmitted && (
          <p className="text-xs text-muted-foreground mt-3">
            Click <span className="font-medium text-blue-600">Mark Reviewed</span> once you have read the submission, then <span className="font-medium text-green-600">Approve</span> to include it in the final report.
          </p>
        )}
        {isReviewed && (
          <p className="text-xs text-muted-foreground mt-3">
            You have reviewed this submission. Click <span className="font-medium text-green-600">Approve</span> to include it in the final consolidated report.
          </p>
        )}
        {isApproved && (
          <p className="text-xs text-green-700 mt-3">
            This submission is approved and will be included when you generate the final report for this cycle.
          </p>
        )}
        {(isRejected || isReopened) && session.review_notes && (
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
              {reviewAction === "reviewed"  ? "Mark as Reviewed"       :
               reviewAction === "approved"  ? "Approve Submission"     :
               reviewAction === "rejected"  ? "Reject Submission"      :
               "Request Revision"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Contextual description */}
            <div className={cn(
              "rounded-lg p-3 text-sm",
              reviewAction === "reviewed"  ? "bg-blue-50 text-blue-800 border border-blue-200"   :
              reviewAction === "approved"  ? "bg-green-50 text-green-800 border border-green-200" :
              reviewAction === "rejected"  ? "bg-red-50 text-red-800 border border-red-200"       :
              "bg-orange-50 text-orange-800 border border-orange-200"
            )}>
              {reviewAction === "reviewed" &&
                "This marks the submission as reviewed by you. The department won't be notified yet. Use Approve when you are ready to include this in the final report."}
              {reviewAction === "approved" &&
                "This submission will be marked approved and included in the final cycle report when you generate it."}
              {reviewAction === "rejected" &&
                "This will reject the submission. Use 'Request Revision' instead if you want the department to make changes."}
              {reviewAction === "reopened" &&
                "This will send the submission back to the department with your feedback for revision."}
            </div>

            <div className="space-y-2">
              <Label>
                {reviewAction === "reopened" ? "Revision Notes (required)" : "Notes"}
                {reviewAction !== "reopened" && (
                  <span className="text-xs text-muted-foreground font-normal ml-1">(optional)</span>
                )}
              </Label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={
                  reviewAction === "reopened"
                    ? "Explain what needs to be revised or improved..."
                    : reviewAction === "approved"
                    ? "Any notes for the final report (optional)..."
                    : "Add feedback or notes..."
                }
                rows={3}
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
                (reviewAction === "reopened" && !reviewNotes.trim())
              }
              className={cn(
                reviewAction === "reviewed"  && "bg-blue-600 hover:bg-blue-700 text-white",
                reviewAction === "approved"  && "bg-green-600 hover:bg-green-700 text-white",
                reviewAction === "rejected"  && "bg-red-600 hover:bg-red-700 text-white",
                reviewAction === "reopened"  && "bg-orange-500 hover:bg-orange-600 text-white",
              )}
            >
              {reviewMutation.isPending ? "Saving…" :
               reviewAction === "reviewed"  ? "Mark Reviewed"   :
               reviewAction === "approved"  ? "Approve"         :
               reviewAction === "rejected"  ? "Reject"          :
               "Send for Revision"}
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
