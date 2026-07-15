"use client"

import { use, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useIsMutating } from "@tanstack/react-query"
import {
  useSession,
  useOutline,
  useGenerateOutline,
  useGenerateDraft,
  OUTLINE_PATCH_KEY,
} from "@/hooks/useSessions"
import { OutlineHeadingCard } from "./OutlineHeadingCard"
import { OutlineBuildLoader } from "@/components/department/outline-build-loader"
import { PageLoader } from "@/components/ui/spinner"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Lock,
  AlertTriangle,
  ArrowRight,
} from "lucide-react"
import { toast } from "sonner"

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export default function OutlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const { data, isLoading: sessionLoading } = useSession(id)
  const {
    data: outlineData,
    isLoading: outlineLoading,
    refetch: refetchOutline,
  } = useOutline(id)
  const generateOutline = useGenerateOutline()
  const generateDraft = useGenerateDraft()

  const savingCount = useIsMutating({ mutationKey: OUTLINE_PATCH_KEY })
  const savingRef = useRef(0)
  useEffect(() => {
    savingRef.current = savingCount
  }, [savingCount])

  const [regenOpen, setRegenOpen] = useState(false)
  // Only shown when generation failed and there is no outline yet.
  const [genError, setGenError] = useState(false)

  const session = data?.session
  const outline = outlineData?.outline ?? null
  const editable = outlineData?.editable ?? true
  const hasAnswers = (session?.answers ?? []).some((a) => a.answer && a.answer.trim().length > 0)

  const runGenerate = async () => {
    setGenError(false)
    try {
      await generateOutline.mutateAsync(id)
    } catch (err) {
      const e = err as { status?: number; error?: string; message?: string }
      if (e?.status === 400 && e?.error === "no_answers") {
        toast.error("Answer at least one question first.")
      } else {
        toast.error(e?.message || "Couldn't build the outline. Please try again.")
      }
      // Show the retry screen only when we have nothing to fall back to.
      if (!outline) setGenError(true)
    }
  }

  // Auto-generate on arrival: the previous step routes here, and generation
  // kicks off automatically — there is no separate "Generate" button.
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (autoStartedRef.current) return
    if (sessionLoading || outlineLoading) return
    if (!session || outline || !hasAnswers) return
    if (generateOutline.isPending || genError) return
    autoStartedRef.current = true
    runGenerate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, outlineLoading, session, outline, hasAnswers, genError])

  const handleContinue = async () => {
    // Commit any in-flight rename before generating the draft.
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    // Let the just-triggered blur PATCH register, then wait for all saves to settle.
    await delay(60)
    while (savingRef.current > 0) await delay(60)

    try {
      await generateDraft.mutateAsync(id)
      router.push(`/department/sessions/${id}/draft`)
    } catch (err) {
      const e = err as { status?: number; error?: string; message?: string }
      if (e?.status === 409 && e?.error === "outline_required") {
        // Backend lost the outline — refetch (auto-generation will restart).
        autoStartedRef.current = false
        await refetchOutline()
      } else {
        toast.error(e?.message || "Couldn't generate the draft. Please try again.")
      }
    }
  }

  if (sessionLoading || outlineLoading) return <PageLoader />
  if (!session)
    return <EmptyState title="Session not found" description="This session doesn't exist or you don't have access." />

  const isRtl = (session.content_language ?? "english") === "arabic"
  const busyContinue = generateDraft.isPending || savingCount > 0
  const sortedHeadings = outline ? [...outline.headings].sort((a, b) => a.order - b.order) : []

  // Full-screen loader while building the outline (or in the brief window
  // before auto-generation kicks off).
  const showLoader = generateOutline.isPending || (!outline && !genError && hasAnswers)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {showLoader && <OutlineBuildLoader />}

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/department/sessions/${id}`}>
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-xl border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Headings &amp; Subheadings — {session.department_name}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Built from your answers. You can rename headings and subheadings — you can&apos;t add, remove, or reorder them.
          </p>
        </div>
      </div>

      {showLoader ? null : genError && !outline ? (
        /* ── Generation failed, nothing to show ── */
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't build the outline"
          description="Something went wrong while generating your outline. Please try again."
          action={
            <Button className="bg-indigo-600 text-white hover:bg-indigo-700" onClick={runGenerate}>
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          }
        />
      ) : !outline ? (
        /* ── No answers to build from (shouldn't happen via the normal flow) ── */
        <EmptyState
          icon={AlertTriangle}
          title="No answers yet"
          description="Answer at least one question before building your outline."
          action={
            <Link href={`/department/sessions/${id}`}>
              <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Workspace
              </Button>
            </Link>
          }
        />
      ) : (
        /* ── Outline present (editable or read-only) ── */
        <div className="space-y-4">
          {!editable && (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              <Lock className="h-4 w-4 shrink-0" />
              The outline is locked once the draft is generated.
            </div>
          )}

          {sortedHeadings.map((heading) => (
            <OutlineHeadingCard
              key={heading.id}
              sessionId={id}
              heading={heading}
              questions={session.questions ?? []}
              isRtl={isRtl}
              readOnly={!editable}
              onLocked={() => refetchOutline()}
            />
          ))}

          {editable && (
            <div className="flex flex-col items-stretch gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="outline"
                className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                onClick={() => setRegenOpen(true)}
                disabled={busyContinue}
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Regenerate Outline
              </Button>
              <Button
                className="bg-indigo-600 text-white hover:bg-indigo-700"
                onClick={handleContinue}
                onMouseDown={() => (document.activeElement as HTMLElement | null)?.blur?.()}
                disabled={busyContinue}
              >
                {generateDraft.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-2 h-4 w-4" />
                )}
                Continue → Generate Draft
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title="Regenerate outline?"
        description="This rebuilds the outline from scratch. Any titles you changed will be lost."
        confirmLabel="Regenerate"
        cancelLabel="Keep current"
        variant="destructive"
        isLoading={generateOutline.isPending}
        onConfirm={async () => {
          setRegenOpen(false)
          await runGenerate()
        }}
      />
    </div>
  )
}
