"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ClipboardList,
  Loader2,
  Lock,
  LockOpen,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ProsePreview } from "@/components/ui/prose-preview"
import { Textarea } from "@/components/ui/textarea"
import { MarkdownHelpChip } from "@/components/report/MarkdownHelp"
import { SectionChat } from "@/components/report/SectionChat"
import { SectionHeader } from "@/components/report/SectionDetail"
import { LockedBanner } from "@/components/report/ManualSection"
import {
  useGenerateSection,
  useLockSection,
  usePlan,
  useRefineSection,
  useSaveGenerateContent,
  useUnlockSection,
} from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { cn } from "@/lib/utils"
import type { CycleReportSection } from "@/types"

interface DashboardData {
  departments?: Array<{ department_code: string; department_name: string }>
}

export function GenerateSection({
  section,
  cycleId,
  isRtl = false,
}: {
  section: CycleReportSection
  cycleId: string
  isRtl?: boolean
}) {
  const sectionCode = section.section_code
  const status = section.status
  const content = section.content ?? ""

  const { data: plan } = usePlan(cycleId)
  const { data: pmDataRaw } = usePMCycleDashboard(cycleId)
  const pmData = pmDataRaw as DashboardData | undefined

  const feederCodes =
    plan?.feeders?.find((f) => f.section_code === sectionCode)?.departments ??
    []
  const deptByCode = new Map(
    (pmData?.departments ?? []).map((d) => [d.department_code, d.department_name]),
  )
  const feederNames = feederCodes.map((c) => deptByCode.get(c) ?? c)

  const generate = useGenerateSection(cycleId)
  const refine = useRefineSection(cycleId)
  const lock = useLockSection(cycleId)
  const unlock = useUnlockSection(cycleId)

  const [regenOpen, setRegenOpen] = useState(false)

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <SectionHeader section={section} isRtl={isRtl} />
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-6 space-y-5">
          {status === "pending" ? (
            <PendingView
              cycleId={cycleId}
              feederNames={feederNames}
              hasFeeders={feederCodes.length > 0}
              generating={generate.isPending}
              onGenerate={() => generate.mutate({ sectionCode })}
            />
          ) : status === "locked" ? (
            <LockedView
              content={content}
              lockedAt={section.locked_at}
              unlocking={unlock.isPending}
              isRtl={isRtl}
              onUnlock={() => unlock.mutate({ sectionCode })}
            />
          ) : (
            <DraftingView
              // Remount the editor's draft when the panel switches sections —
              // without it, an open editor would carry one section's text into
              // the next.
              key={sectionCode}
              cycleId={cycleId}
              sectionCode={sectionCode}
              content={content}
              regenerating={generate.isPending}
              locking={lock.isPending}
              refining={refine.isPending}
              isRtl={isRtl}
              onRegenerate={() => setRegenOpen(true)}
              onLock={() => lock.mutate({ sectionCode })}
              onRefine={(instruction) =>
                refine.mutate({ sectionCode, instruction })
              }
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={regenOpen}
        onOpenChange={setRegenOpen}
        title="Replace this draft?"
        description="Your current generated text will be lost."
        confirmLabel="Regenerate"
        variant="destructive"
        isLoading={generate.isPending}
        onConfirm={async () => {
          await generate.mutateAsync({ sectionCode })
          setRegenOpen(false)
        }}
      />
    </div>
  )
}

function PendingView({
  cycleId,
  feederNames,
  hasFeeders,
  generating,
  onGenerate,
}: {
  cycleId: string
  feederNames: string[]
  hasFeeders: boolean
  generating: boolean
  onGenerate: () => void
}) {
  if (!hasFeeders) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12 px-4">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50">
          <AlertCircle className="h-7 w-7 text-amber-500" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-1.5">No source assigned</h2>
        <p className="text-sm text-slate-500 mb-5 max-w-md">
          Assign a department on the Review Plan screen before generating this
          section.
        </p>
        <Link href={`/pm/cycles/${cycleId}/plan`}>
          <Button className="bg-indigo-600 text-white hover:bg-indigo-700">
            <ClipboardList className="h-4 w-4 mr-2" />
            Go to Review Plan
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
        <Sparkles className="h-7 w-7 text-indigo-600" />
      </div>
      <h2 className="text-lg font-bold text-slate-900 mb-1.5">
        Written by the AI narrative writer
      </h2>
      <p className="text-sm text-slate-500 mb-5 max-w-md leading-relaxed">
        Uses the report&apos;s themes and content from:{" "}
        <span className="font-medium text-slate-700">
          {feederNames.join(", ")}
        </span>
        .
      </p>
      <Button
        onClick={onGenerate}
        disabled={generating}
        size="lg"
        className="bg-indigo-600 text-white hover:bg-indigo-700"
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Writing this section…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate Section
          </>
        )}
      </Button>
    </div>
  )
}

/**
 * The section body as raw Markdown, in a textarea that grows with its text.
 *
 * Saves on blur, on ⌘/Ctrl-Enter and on the Save button; Escape cancels.
 * Unchanged text is deliberately never sent — a no-op PUT would still mark the
 * section hand-edited. Ported from the board report's ProseEditor so the two
 * reports behave the same way under the same fingers.
 */
function SectionBodyEditor({
  value,
  saving,
  isRtl,
  onSave,
  onCancel,
}: {
  value: string
  saving: boolean
  isRtl: boolean
  onSave: (content: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)
  const taRef = useRef<HTMLTextAreaElement>(null)
  // The text this editor opened on. A background refetch can move `value` while
  // the PM is typing, so "unchanged" has to mean "unchanged since I started",
  // not "same as whatever the cache holds this instant". State rather than a
  // ref because it is read during render, to decide whether Save is live.
  const [openedOn] = useState(value)
  // A blur normally means "I'm done" — except when something else has already
  // decided. Escape and Cancel set this, and so does the cheat sheet, which
  // takes focus on purpose and must not end the edit.
  const skipBlur = useRef(false)

  // Focus the box on open, size it to its text, and put the caret at the end
  // rather than wherever the click happened to land.
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.focus()
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const trimmed = draft.trim()
  const changed = trimmed !== openedOn.trim()

  const commit = () => {
    if (saving || !trimmed || !changed) return
    onSave(trimmed)
  }

  return (
    <div className="space-y-3">
      <MarkdownHelpChip
        onOpenChange={(open) => {
          if (open) {
            skipBlur.current = true
            return
          }
          // The dialog is still mounted here and its focus trap bounces any
          // focus taken back too early — and that bounce arrives as a blur,
          // i.e. as "the edit is over". Wait a frame: by then it has unmounted
          // and handed focus back to the textarea itself, and dropping the
          // guard is safe.
          requestAnimationFrame(() => {
            taRef.current?.focus()
            skipBlur.current = false
          })
        }}
      />
      <Textarea
        ref={taRef}
        value={draft}
        disabled={saving}
        rows={14}
        dir={isRtl ? "rtl" : "ltr"}
        aria-label="Section content (Markdown)"
        placeholder={"### Sub-heading\n\nWrite the section body here…"}
        onChange={(e) => {
          setDraft(e.target.value)
          // Grow with the text instead of scrolling inside a fixed window — a
          // section body is reviewed as a whole.
          e.target.style.height = "auto"
          e.target.style.height = `${e.target.scrollHeight}px`
        }}
        onBlur={() => {
          if (skipBlur.current || saving) return
          if (trimmed && changed) onSave(trimmed)
          else onCancel()
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            skipBlur.current = true
            onCancel()
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            commit()
          }
        }}
        className={cn(
          "resize-none rounded-xl text-sm leading-relaxed",
          isRtl && "text-right",
        )}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={commit}
          // Clicking away already saves, but nobody should have to know that:
          // without this, mousedown blurs the textarea and saves once, then the
          // click saves a second time.
          onMouseDown={(e) => e.preventDefault()}
          disabled={saving || !trimmed || !changed}
          className="bg-indigo-600 text-white hover:bg-indigo-700"
          title={
            !trimmed
              ? "Add some content before saving"
              : !changed
                ? "No changes to save"
                : "Save (⌘+Enter)"
          }
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="ghost"
          onClick={onCancel}
          onMouseDown={(e) => {
            e.preventDefault()
            skipBlur.current = true
          }}
          disabled={saving}
        >
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <span className="ml-auto text-xs text-slate-400">
          Saves when you click away · ⌘+Enter to save · Esc to cancel
        </span>
      </div>
    </div>
  )
}

function DraftingView({
  cycleId,
  sectionCode,
  content,
  regenerating,
  locking,
  refining,
  isRtl,
  onRegenerate,
  onLock,
  onRefine,
}: {
  cycleId: string
  sectionCode: string
  content: string
  regenerating: boolean
  locking: boolean
  refining: boolean
  isRtl: boolean
  onRegenerate: () => void
  onLock: () => void
  onRefine: (instruction: string) => void
}) {
  const save = useSaveGenerateContent(cycleId)
  const [editing, setEditing] = useState(false)
  const busy = regenerating || locking || refining

  const handleSave = async (next: string) => {
    try {
      await save.mutateAsync({ sectionCode, content: next })
      setEditing(false)
    } catch {
      // The hook owns the message and the cache rollback. Staying in the editor
      // keeps the typed text on screen so the PM can retry rather than retype.
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {editing ? "Editing section" : "Draft"}
        </p>
        {!editing && (
          <Button
            variant="outline"
            size="icon"
            onClick={() => setEditing(true)}
            disabled={busy}
            title="Edit this section"
            aria-label="Edit this section"
            className="h-7 w-7 border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Preview with a refining dim + overlay so the PM has clear feedback
          while the LLM is rewriting the section. */}
      <div className="relative">
        <div
          dir={isRtl ? "rtl" : "ltr"}
          className={cn(
            "rounded-xl border border-slate-200 border-l-2 border-l-indigo-400 bg-white p-6 transition-opacity",
            isRtl && "text-right",
            refining && "opacity-60 pointer-events-none",
          )}
        >
          {editing ? (
            <SectionBodyEditor
              value={content}
              saving={save.isPending}
              isRtl={isRtl}
              onSave={handleSave}
              onCancel={() => setEditing(false)}
            />
          ) : content.trim() ? (
            <ProsePreview content={content} />
          ) : (
            <p className="text-sm text-slate-400 italic">
              Draft is empty — regenerate it, or use the pencil to write it
              yourself.
            </p>
          )}
        </div>
        {refining && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-4 py-2 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
              <span className="text-sm font-medium text-slate-700">Refining…</span>
            </div>
          </div>
        )}
      </div>

      {/* Hidden while the editor is open. Refine and Regenerate both replace the
          body from the server, which would pull the text out from under the
          textarea mid-edit; Lock would 409 the save that follows it. */}
      {!editing && (
        <>
          <SectionChat refining={refining} onRefine={onRefine} />

          <p className="text-xs text-slate-500">
            Review the draft. Lock it when you&apos;re satisfied — you can unlock
            and regenerate any time.
          </p>

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={onRegenerate}
              disabled={busy}
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              {regenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Regenerate
            </Button>
            <Button
              onClick={onLock}
              disabled={busy}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {locking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Locking…
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" />
                  Lock section
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function LockedView({
  content,
  lockedAt,
  unlocking,
  isRtl,
  onUnlock,
}: {
  content: string
  lockedAt: string | null
  unlocking: boolean
  isRtl: boolean
  onUnlock: () => void
}) {
  return (
    <div className="space-y-4">
      {/* No pencil here: a locked section is read-only and the save endpoint
          409s. Unlock first. */}
      <div
        dir={isRtl ? "rtl" : "ltr"}
        className={cn("rounded-xl border border-slate-200 bg-white p-6", isRtl && "text-right")}
      >
        {content.trim() ? (
          <ProsePreview content={content} />
        ) : (
          <p className="text-sm text-slate-400 italic">No content available.</p>
        )}
      </div>

      <LockedBanner lockedAt={lockedAt} />

      <div className="flex items-center justify-end">
        <Button
          variant="outline"
          onClick={onUnlock}
          disabled={unlocking}
          className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          {unlocking ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <LockOpen className="h-4 w-4 mr-2" />
          )}
          Unlock
        </Button>
      </div>
    </div>
  )
}
