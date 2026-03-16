"use client"

import { use, useState } from "react"
import { useSession, useGenerateDraft, useAdjustTone, useFinalizeSession } from "@/hooks/useSessions"
import { PageSkeleton } from "@/components/ui/skeletons"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TONE_OPTIONS } from "@/lib/constants"
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
    await finalizeSession.mutateAsync({
      sessionId: id,
      data: { final_content: effectiveDraft },
    })
    setSubmitted(true)
    setConfirmSubmit(false)
  }

  if (submitted || isSubmitted) {
    return (
      <div className="max-w-lg mx-auto text-center space-y-6 py-16">
        <div className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full mx-auto",
          isApproved ? "bg-green-100" : "bg-blue-100"
        )}>
          <CheckCircle2 className={cn("h-8 w-8", isApproved ? "text-green-600" : "text-blue-600")} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">
            {isApproved ? "Report Approved!" : "Submission Complete!"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {isApproved
              ? "Your report has been approved by the PM. No further action is required."
              : "Your report has been submitted for PM review. You will be notified when it's approved."}
          </p>
        </div>
        <Link href="/department">
          <Button>Back to Dashboard</Button>
        </Link>
      </div>
    )
  }

  if (!serverDraft && !generateDraft.isPending) {
    return (
      <div className="max-w-lg mx-auto text-center space-y-6 py-16">
        <EmptyState
          icon={FileText}
          title="No draft yet"
          description="Go back to the session workspace and answer questions first, then generate your draft."
          action={
            <Link href={`/department/sessions/${id}`}>
              <Button>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Workspace
              </Button>
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* REOPENED banner */}
      {isReopened && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <RotateCcw className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Revision Requested</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Update your draft based on PM feedback and resubmit when ready.
            </p>
            {session.review_notes && (
              <div className="mt-2 border-t border-amber-200 pt-2">
                <p className="text-xs font-semibold text-amber-900">PM Notes:</p>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">{session.review_notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/department/sessions/${id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="font-semibold">Draft Report — {session.department_name}</h1>
            <p className="text-sm text-muted-foreground">
              Review, edit, and adjust tone before final submission
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerateDraft}
            disabled={generateDraft.isPending}
          >
            {generateDraft.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
            )}
            Regenerate
          </Button>
          <Button
            size="sm"
            onClick={() => setConfirmSubmit(true)}
            disabled={!effectiveDraft}
          >
            <CheckCircle2 className="mr-2 h-3.5 w-3.5" />
            Finalize & Submit
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Draft editor / preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Draft Content</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {effectiveDraft.split(/\s+/).filter(Boolean).length} words
              </span>
              {/* Preview / Edit toggle */}
              <div className="flex items-center border rounded-md overflow-hidden">
                <button
                  onClick={() => setPreviewMode(true)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                    previewMode ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground"
                  )}
                >
                  <Eye className="h-3 w-3" /> Preview
                </button>
                <button
                  onClick={() => setPreviewMode(false)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l",
                    !previewMode ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground"
                  )}
                >
                  <Code2 className="h-3 w-3" /> Edit
                </button>
              </div>
            </div>
          </div>

          {previewMode ? (
            /* Rendered HTML / plain-text preview */
            <div className="min-h-[500px] rounded-md border bg-background p-5 overflow-y-auto">
              {effectiveDraft ? (
                isHtml(effectiveDraft) ? (
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: effectiveDraft }}
                  />
                ) : (
                  <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed">
                    {effectiveDraft}
                  </pre>
                )
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No draft content yet — generate a draft from the workspace.
                </p>
              )}
            </div>
          ) : (
            /* Raw edit textarea */
            <Textarea
              value={effectiveDraft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-h-[500px] font-mono text-sm leading-relaxed resize-none"
              placeholder="Your AI-generated draft will appear here..."
            />
          )}
        </div>

        {/* Right panel: tone */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-medium">Adjust Tone</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Rewrite the draft in a different style using AI.
            </p>
            <div className="space-y-2">
              {TONE_OPTIONS.map((tone) => (
                <button
                  key={tone.value}
                  onClick={() => handleAdjustTone(tone.value)}
                  disabled={adjusting}
                  className={cn(
                    "w-full flex items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent",
                    selectedTone === tone.value && "border-primary bg-primary/5"
                  )}
                >
                  <div>
                    <p className="font-medium text-sm">{tone.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{tone.description}</p>
                  </div>
                  {adjusting && selectedTone === tone.value && (
                    <Loader2 className="h-4 w-4 animate-spin ml-auto shrink-0 mt-0.5" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Checklist */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <p className="text-sm font-medium">Submission Checklist</p>
            <div className="space-y-2 text-sm">
              {[
                { label: "All questions answered", done: (session.answers?.length || 0) > 0 },
                { label: "Draft generated", done: !!serverDraft },
                { label: "Content reviewed", done: !!draft || !!serverDraft },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <CheckCircle2
                    className={cn(
                      "h-4 w-4 shrink-0",
                      item.done ? "text-green-500" : "text-muted-foreground"
                    )}
                  />
                  <span className={item.done ? "text-foreground" : "text-muted-foreground"}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <Button
            className="w-full"
            onClick={() => setConfirmSubmit(true)}
            disabled={!effectiveDraft}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Finalize & Submit
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title="Finalize Submission"
        description="This will submit your department report for PM review. You won't be able to edit it after submission unless the PM reopens it."
        confirmLabel="Yes, Submit"
        cancelLabel="Keep Editing"
        variant="default"
        onConfirm={handleFinalize}
        isLoading={finalizeSession.isPending}
      />
    </div>
  )
}
