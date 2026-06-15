"use client"

import { useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ClipboardList,
  Loader2,
  Lock,
  LockOpen,
  RefreshCw,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ProsePreview } from "@/components/ui/prose-preview"
import { SectionChat } from "@/components/report/SectionChat"
import { SectionHeader } from "@/components/report/SectionDetail"
import { LockedBanner } from "@/components/report/ManualSection"
import {
  useGenerateSection,
  useLockSection,
  usePlan,
  useRefineSection,
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

function DraftingView({
  content,
  regenerating,
  locking,
  refining,
  isRtl,
  onRegenerate,
  onLock,
  onRefine,
}: {
  content: string
  regenerating: boolean
  locking: boolean
  refining: boolean
  isRtl: boolean
  onRegenerate: () => void
  onLock: () => void
  onRefine: (instruction: string) => void
}) {
  const busy = regenerating || locking || refining
  return (
    <div className="space-y-4">
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
          {content.trim() ? (
            <ProsePreview content={content} />
          ) : (
            <p className="text-sm text-slate-400 italic">
              Draft is empty — try regenerating.
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
