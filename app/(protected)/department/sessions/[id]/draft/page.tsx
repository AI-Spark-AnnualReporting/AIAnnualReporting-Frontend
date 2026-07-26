"use client"

import { use, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  useSession,
  useGenerateDraft,
  useAdjustTone,
  useFinalizeSession,
  useSaveDraft,
} from "@/hooks/useSessions"
import {
  canEditSession,
  isSessionSubmitted,
  draftContent,
  isDraftStale,
} from "@/lib/session"
import { DraftBuildLoader } from "@/components/department/draft-build-loader"
import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TONE_OPTIONS } from "@/lib/constants"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
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
  AlertTriangle,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

/** Detect whether content is HTML or plain text */
function isHtml(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content.trim().substring(0, 200))
}

// Quiet enough not to fire mid-sentence, short enough that the residual loss
// window on a hard tab-close stays about a second. Blur also commits, so most
// saves land well before this elapses.
const DRAFT_AUTOSAVE_MS = 1000

type SaveState = "idle" | "saving" | "saved" | "error"

// Both destructive actions on this page. One dialog, one union — they can't both
// open at once and a third would be one map entry.
type ConfirmKind = "submit" | "regenerate"

export default function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data, isLoading, refetch } = useSession(id)
  const generateDraft = useGenerateDraft()
  const adjustTone = useAdjustTone()
  const finalizeSession = useFinalizeSession()
  const saveDraft = useSaveDraft()

  const [draft, setDraft] = useState<string | null>(null)
  const [selectedTone, setSelectedTone] = useState("")
  const [adjusting, setAdjusting] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [wasResubmit, setWasResubmit] = useState(false)
  const [previewMode, setPreviewMode] = useState(true) // default to rendered preview
  const [saveState, setSaveState] = useState<SaveState>("idle")

  // Auto-save bookkeeping. All of it is read/written from handlers and async
  // callbacks — never during render — which keeps this clear of the strict
  // react-hooks/refs rule. Nothing here syncs props into state, so
  // react-hooks/set-state-in-effect never fires either.
  const savedRef = useRef<string | null>(null) // last text the server confirmed
  const pendingRef = useRef<string | null>(null) // latest text the user typed
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Monotonic id per save. A debounce firing and a blur-flush landing back to
  // back means two PUTs in flight; without this, the slower (older) one's
  // response could mark stale text as "saved" and suppress the real save.
  const saveSeq = useRef(0)

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    },
    []
  )

  const session = data?.session

  // The persisted working copy. `draft` (local) shadows it while the user types;
  // null means "untouched this session", which is distinct from "" — the user
  // deliberately clearing the editor. Hence `??`, not `||`: with `||` an emptied
  // textarea would silently refill from the server and could never be cleared.
  const serverDraft = draftContent(session)
  const effectiveDraft = draft ?? serverDraft

  const persist = async (content: string) => {
    const seq = ++saveSeq.current
    setSaveState("saving")
    try {
      await saveDraft.mutateAsync({ sessionId: id, content })
      // A newer save started while this was in flight — it owns the outcome.
      if (seq !== saveSeq.current) return
      savedRef.current = content
      setSaveState("saved")
    } catch (err) {
      const e = err as { status?: number; error?: string; message?: string }
      if (e?.status === 409 && e?.error === "session_locked") {
        // The PM approved (or someone submitted) while we were typing. Drop the
        // local shadow and re-read: the page will flip to its submitted screen.
        setDraft(null)
        setSaveState("idle")
        refetch()
        toast.error("This session has been submitted — your latest changes weren't saved.")
        return
      }
      // Inline retry rather than a toast: a nag on every keystroke pause is worse
      // than a persistent, quiet indicator the user can act on.
      setSaveState("error")
    }
  }

  // What's already on the server: whatever we last confirmed, or — before any
  // save this session — the text the page loaded with. Comparing against this
  // (rather than savedRef alone) means typing and undoing back to the original
  // sends nothing.
  const persistedText = () => savedRef.current ?? serverDraft

  // Debounced save-as-you-type.
  const scheduleSave = (raw: string) => {
    pendingRef.current = raw
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (pendingRef.current === persistedText()) return
      persist(pendingRef.current ?? "")
    }, DRAFT_AUTOSAVE_MS)
  }

  // Commit now — on blur, and before navigating away.
  const flush = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (pendingRef.current === null || pendingRef.current === persistedText()) return
    await persist(pendingRef.current)
  }

  // Drop a queued save without sending it. Used before finalize: the submission
  // already carries the local text, and a debounced PUT landing after it would
  // hit a now-submitted session and 409 for no reason.
  const cancelPendingSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    pendingRef.current = null
  }

  if (isLoading) return <PageLoader />

  if (!session) return (
    <EmptyState title="Session not found" description="Session does not exist." />
  )

  const isApproved = session.status === "approved"
  const isSubmitted = isSessionSubmitted(session.status)
  const isReopened = session.status === "reopened"
  // Gates every mutating control on this page — editing, regenerating, tone, and
  // finalize. The user may change the draft right up until they submit it.
  const canEdit = canEditSession(session.status)

  const handleRegenerateDraft = async () => {
    // Whatever the user was typing is about to be replaced — don't let a queued
    // save land on top of the fresh draft.
    cancelPendingSave()
    const res = await generateDraft.mutateAsync(id)
    // generate-draft writes the new text to draft_content server-side, so it's
    // already persisted. Show the returned text directly (faster than waiting on
    // the refetch) and mark it saved, so auto-save won't re-send it.
    const fresh = (res as { ai_generated_draft?: string } | undefined)?.ai_generated_draft
    if (fresh !== undefined) {
      setDraft(fresh)
      savedRef.current = fresh
    } else {
      setDraft(null)
    }
    setSaveState("idle")
    refetch()
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
      // adjust-tone is stateless — it returns the rewritten text without storing
      // it. Auto-save only fires from onChange, so without this an adjusted tone
      // would be lost on navigation. Save immediately: this is a discrete action,
      // not typing, so there's nothing to debounce.
      cancelPendingSave()
      await persist(res.adjusted_content)
      toast.success(`Tone adjusted to ${tone}`)
    } finally {
      setAdjusting(false)
    }
  }

  const handleFinalize = async () => {
    const isResubmit = isReopened
    // Cancel, don't flush: the payload below already carries the local text, and
    // a queued PUT landing after finalize would hit a submitted session and pop
    // a spurious 409 on top of the success screen.
    cancelPendingSave()
    await finalizeSession.mutateAsync({
      sessionId: id,
      data: { final_content: effectiveDraft },
    })
    setWasResubmit(isResubmit)
    setSubmitted(true)
    setConfirm(null)
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
      {/* Full-screen loader while (re)generating — same wait treatment as the
          outline/draft build elsewhere in the flow. */}
      {generateDraft.isPending && <DraftBuildLoader />}

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

      {/* Answers moved on after this draft was written. Nothing rebuilds itself,
          so say so — regenerating is the user's call, since it discards edits. */}
      {canEdit && isDraftStale(session) && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-xs leading-relaxed text-amber-800">
            <span className="font-semibold">Your answers changed after this draft was generated.</span>{" "}
            Regenerate to rebuild it from your latest answers — note that this replaces any edits you&apos;ve made here.
          </p>
        </div>
      )}

      {/* Header. The left group is navigation, the right group is actions —
          keeping "back to headings" out of the Regenerate/Finalize cluster so a
          nav click never reads as a destructive one. Back goes to the previous
          step (headings), not the workspace, matching the flow's own order. */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            title="Back to Headings &amp; Subheadings"
            // Commit anything queued before leaving — blur alone can miss the
            // last keystrokes when the click lands inside the debounce window.
            onClick={async () => {
              await flush()
              router.push(`/department/sessions/${id}/outline`)
            }}
            className="h-11 w-11 shrink-0 rounded-xl border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
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
            // Confirms now: draft edits are persisted, so regenerating throws
            // away real work rather than just disposable AI output.
            onClick={() => setConfirm("regenerate")}
            disabled={!canEdit || generateDraft.isPending}
          >
            {generateDraft.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Regenerate
          </Button>
          {canEdit && (
            <Button
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => setConfirm("submit")}
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
              {/* Save status. "Saved" persists until the next edit rather than
                  fading — on a document this long, a durable "your work is safe"
                  is worth more than a tidy header. */}
              {saveState === "saving" && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </span>
              )}
              {saveState === "saved" && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> Saved
                </span>
              )}
              {saveState === "error" && (
                <button
                  type="button"
                  onClick={() => void flush()}
                  className="flex items-center gap-1 text-xs font-medium text-red-600 hover:underline"
                >
                  <RefreshCw className="h-3 w-3" /> Save failed — Retry
                </button>
              )}
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
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{effectiveDraft}</ReactMarkdown>
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
                onChange={(e) => {
                  setDraft(e.target.value)
                  scheduleSave(e.target.value)
                }}
                onBlur={() => void flush()}
                disabled={!canEdit}
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
                  disabled={!canEdit || adjusting}
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
                {
                  // "The user actually changed something", not "text exists" —
                  // the latter is true the instant a draft is generated, which
                  // made this tick permanently and mean nothing.
                  label: "Content reviewed",
                  done:
                    session.draft_content != null &&
                    session.draft_content !== session.ai_generated_draft,
                },
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

          {canEdit && (
            <Button
              className="w-full bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => setConfirm("submit")}
              disabled={!effectiveDraft}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {isReopened ? "Resubmit" : "Finalize & Submit"}
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm === "regenerate"
            ? "Regenerate the draft?"
            : isReopened
            ? "Resubmit for Review?"
            : "Finalize Submission?"
        }
        description={
          confirm === "regenerate"
            ? "This writes a new draft from your answers and headings. Your current draft — including any edits you've made to it — will be replaced."
            : isReopened
            ? "Your revised submission will be sent back to the PM for review."
            : "Once submitted, you won't be able to make changes unless the PM requests revisions."
        }
        confirmLabel={
          confirm === "regenerate" ? "Regenerate" : isReopened ? "Resubmit" : "Submit"
        }
        cancelLabel="Keep Editing"
        variant={confirm === "regenerate" ? "destructive" : "default"}
        isLoading={confirm === "regenerate" ? generateDraft.isPending : finalizeSession.isPending}
        onConfirm={async () => {
          if (confirm === "regenerate") {
            setConfirm(null)
            await handleRegenerateDraft()
          } else {
            await handleFinalize()
          }
        }}
      />
    </div>
  )
}
