"use client"

import { use, useState } from "react"
import { useSession, useGenerateDraft, useAdjustTone, useFinalizeSession } from "@/hooks/useSessions"
import { PageSkeleton } from "@/components/ui/skeletons"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TONE_OPTIONS } from "@/lib/constants"
import ReactMarkdown from "react-markdown"
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  Loader2,
  FileText,
  RefreshCw,
  RotateCcw,
  Eye,
  Code2,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

/** Detect whether content is HTML or plain text */
function isHtml(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content.trim().substring(0, 200))
}

export default function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading, refetch } = useSession(id)
  const generateDraft = useGenerateDraft()
  const adjustTone = useAdjustTone()
  const finalizeSession = useFinalizeSession()

  const [draft, setDraft] = useState<string>("")
  const [selectedTone, setSelectedTone] = useState("")
  const [adjusting, setAdjusting] = useState(false)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [wasResubmit, setWasResubmit] = useState(false)
  const [previewMode, setPreviewMode] = useState(true) // default to rendered preview

  const session = data?.session

  // Sync draft from server
  const serverDraft = session?.ai_generated_draft || session?.final_submission || ""
  const effectiveDraft = draft || serverDraft

  if (isLoading) return <PageSkeleton />

  if (!session) return (
    <EmptyState title="Session not found" description="Session does not exist." />
  )

  const isApproved = session.status === "approved"
  const isSubmittedPending = session.status === "submitted"
  const isSubmitted = isApproved || isSubmittedPending
  const isReopened = session.status === "reopened"
  // Finalize is only meaningful while drafting or revising a returned submission.
  const canFinalize = session.status === "in_progress" || isReopened

  const handleRegenerateDraft = async () => {
    await generateDraft.mutateAsync(id)
    refetch()
    setDraft("")
    toast.success("Draft regenerated")
  }

  const handleAdjustTone = async (tone: string) => {
    if (!effectiveDraft) return
    setAdjusting(true)
    setSelectedTone(tone)
    try {
      const res = await adjustTone.mutateAsync({
        sessionId: id,
        data: { content: effectiveDraft, target_tone: tone },
      })
      setDraft(res.adjusted_content)
      toast.success(`Tone adjusted to ${tone}`)
    } finally {
      setAdjusting(false)
    }
  }

  const handleFinalize = async () => {
    const isResubmit = isReopened
    await finalizeSession.mutateAsync({
      sessionId: id,
      data: { final_content: effectiveDraft },
    })
    setWasResubmit(isResubmit)
    setSubmitted(true)
    setConfirmSubmit(false)
  }

  if (submitted || isSubmitted) {
    const heading = isApproved
      ? "Report Approved!"
      : wasResubmit
      ? "Resubmitted!"
      : "Submission Complete!"
    const message = isApproved
      ? "Your report has been approved by the PM. No further action is required."
      : wasResubmit
      ? "Resubmitted — your revised report is back with the PM for review."
      : "Your report has been submitted for PM review. You will be notified when it's approved."
    return (
      <div className="mx-auto max-w-lg space-y-6 py-16 text-center">
        <div className={cn(
          "mx-auto flex h-16 w-16 items-center justify-center rounded-full",
          isApproved ? "bg-emerald-100" : "bg-indigo-100"
        )}>
          <CheckCircle2 className={cn("h-8 w-8", isApproved ? "text-emerald-600" : "text-indigo-600")} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{heading}</h1>
          <p className="mt-2 text-slate-500">{message}</p>
        </div>
        <Link href="/department">
          <Button className="bg-indigo-600 text-white hover:bg-indigo-700">Back to Dashboard</Button>
        </Link>
      </div>
    )
  }

  if (!serverDraft && !generateDraft.isPending) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-16 text-center">
        <EmptyState
          icon={FileText}
          title="No draft yet"
          description="Go back to the session workspace and answer questions first, then generate your draft."
          action={
            <Link href={`/department/sessions/${id}`}>
              <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Workspace
              </Button>
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* REOPENED banner */}
      {isReopened && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-800">Revision Requested</p>
            <p className="mt-0.5 text-xs text-amber-700">
              Update your draft based on PM feedback and resubmit when ready.
            </p>
            {session.review_notes && (
              <div className="mt-2 border-t border-amber-200 pt-2">
                <p className="text-xs font-semibold text-amber-900">PM Notes:</p>
                <p className="mt-0.5 text-xs leading-relaxed text-amber-800">{session.review_notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/department/sessions/${id}`}>
            <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl border-slate-200 bg-white text-slate-600 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Draft Report — {session.department_name}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Review, edit, and adjust tone before final submission
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            onClick={handleRegenerateDraft}
            disabled={generateDraft.isPending}
          >
            {generateDraft.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Regenerate
          </Button>
          {canFinalize && (
            <Button
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => setConfirmSubmit(true)}
              disabled={!effectiveDraft}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {isReopened ? "Resubmit" : "Finalize & Submit"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Draft editor / preview */}
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <p className="text-base font-bold text-slate-900">Draft Content</p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                {effectiveDraft.split(/\s+/).filter(Boolean).length} words
              </span>
              {/* Preview / Edit toggle */}
              <div className="flex items-center overflow-hidden rounded-lg border border-slate-200">
                <button
                  onClick={() => setPreviewMode(true)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                    previewMode ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  <Eye className="h-3 w-3" /> Preview
                </button>
                <button
                  onClick={() => setPreviewMode(false)}
                  className={cn(
                    "flex items-center gap-1.5 border-l border-slate-200 px-3 py-1.5 text-xs font-medium transition-colors",
                    !previewMode ? "bg-indigo-600 text-white" : "text-slate-500 hover:bg-slate-50"
                  )}
                >
                  <Code2 className="h-3 w-3" /> Edit
                </button>
              </div>
            </div>
          </div>

          <div className="p-5">
            {previewMode ? (
              /* Rendered HTML / plain-text preview */
              <div className="min-h-[500px] overflow-y-auto">
                {effectiveDraft ? (
                  isHtml(effectiveDraft) ? (
                    <div
                      className="prose prose-sm max-w-none prose-slate"
                      dangerouslySetInnerHTML={{ __html: effectiveDraft }}
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none prose-slate">
                      <ReactMarkdown>{effectiveDraft}</ReactMarkdown>
                    </div>
                  )
                ) : (
                  <p className="text-sm italic text-slate-400">
                    No draft content yet — generate a draft from the workspace.
                  </p>
                )}
              </div>
            ) : (
              /* Raw edit textarea */
              <Textarea
                value={effectiveDraft}
                onChange={(e) => setDraft(e.target.value)}
                className="min-h-[500px] resize-none rounded-xl border-slate-200 font-mono text-sm leading-relaxed"
                placeholder="Your AI-generated draft will appear here..."
              />
            )}
          </div>
        </div>

        {/* Right panel: tone */}
        <div className="space-y-5">
          <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <p className="text-base font-bold text-slate-900">Adjust Tone</p>
            </div>
            <p className="text-xs text-slate-500">
              Rewrite the draft in a different style using AI.
            </p>
            <div className="space-y-2">
              {TONE_OPTIONS.map((tone) => (
                <button
                  key={tone.value}
                  onClick={() => handleAdjustTone(tone.value)}
                  disabled={adjusting}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors",
                    selectedTone === tone.value
                      ? "border-indigo-500 bg-indigo-50/60"
                      : "border-slate-200 hover:bg-slate-50"
                  )}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{tone.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{tone.description}</p>
                  </div>
                  {adjusting && selectedTone === tone.value && (
                    <Loader2 className="ml-auto mt-0.5 h-4 w-4 shrink-0 animate-spin text-indigo-600" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Checklist */}
          <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <p className="text-base font-bold text-slate-900">Submission Checklist</p>
            <div className="space-y-2.5 text-sm">
              {[
                { label: "All questions answered", done: (session.answers?.length || 0) > 0 },
                { label: "Draft generated", done: !!serverDraft },
                { label: "Content reviewed", done: !!draft || !!serverDraft },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <CheckCircle2
                    className={cn(
                      "h-4 w-4 shrink-0",
                      item.done ? "text-emerald-500" : "text-slate-300"
                    )}
                  />
                  <span className={item.done ? "text-slate-700" : "text-slate-400"}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {canFinalize && (
            <Button
              className="w-full bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => setConfirmSubmit(true)}
              disabled={!effectiveDraft}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {isReopened ? "Resubmit" : "Finalize & Submit"}
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title={isReopened ? "Resubmit for Review?" : "Finalize Submission?"}
        description={
          isReopened
            ? "Your revised submission will be sent back to the PM for review."
            : "Once submitted, you won't be able to make changes unless the PM requests revisions."
        }
        confirmLabel={isReopened ? "Resubmit" : "Submit"}
        cancelLabel="Keep Editing"
        variant="default"
        onConfirm={handleFinalize}
        isLoading={finalizeSession.isPending}
      />
    </div>
  )
}
