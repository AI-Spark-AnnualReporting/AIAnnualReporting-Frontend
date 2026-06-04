"use client"

import { useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  CheckCircle2,
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
import {
  useGenerateSection,
  useLockSection,
  usePlan,
  useRefineSection,
  useUnlockSection,
} from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { cn, formatDateTime } from "@/lib/utils"
import type { CycleReportSection } from "@/types"

interface DashboardData {
  departments?: Array<{ department_code: string; department_name: string }>
}

export function GenerateSection({
  section,
  cycleId,
}: {
  section: CycleReportSection
  cycleId: string
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
      <SectionHeader section={section} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-6 space-y-5">
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
              onUnlock={() => unlock.mutate({ sectionCode })}
            />
          ) : (
            <DraftingView
              content={content}
              regenerating={generate.isPending}
              locking={lock.isPending}
              refining={refine.isPending}
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
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/40">
          <AlertCircle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-lg font-semibold mb-1.5">No source assigned</h2>
        <p className="text-sm text-muted-foreground mb-5 max-w-md">
          Assign a department on the Review Plan screen before generating this
          section.
        </p>
        <Link href={`/pm/cycles/${cycleId}/plan`}>
          <Button>
            <ClipboardList className="h-4 w-4 mr-2" />
            Go to Review Plan
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Sparkles className="h-7 w-7 text-primary" />
      </div>
      <h2 className="text-lg font-semibold mb-1.5">
        Written by the AI narrative writer
      </h2>
      <p className="text-sm text-muted-foreground mb-5 max-w-md leading-relaxed">
        Uses the report&apos;s themes and content from:{" "}
        <span className="font-medium text-foreground">
          {feederNames.join(", ")}
        </span>
        .
      </p>
      <Button onClick={onGenerate} disabled={generating} size="lg">
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
  onRegenerate,
  onLock,
  onRefine,
}: {
  content: string
  regenerating: boolean
  locking: boolean
  refining: boolean
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
          className={cn(
            "rounded-lg border bg-card p-6 transition-opacity",
            refining && "opacity-60 pointer-events-none",
          )}
        >
          {content.trim() ? (
            <ProsePreview content={content} />
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Draft is empty — try regenerating.
            </p>
          )}
        </div>
        {refining && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-2 rounded-full border bg-background/95 px-4 py-2 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium">Refining…</span>
            </div>
          </div>
        )}
      </div>

      <SectionChat refining={refining} onRefine={onRefine} />

      <p className="text-xs text-muted-foreground">
        Review the draft. Lock it when you&apos;re satisfied — you can unlock
        and regenerate any time.
      </p>

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={onRegenerate}
          disabled={busy}
        >
          {regenerating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Regenerate
        </Button>
        <Button onClick={onLock} disabled={busy}>
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
  onUnlock,
}: {
  content: string
  lockedAt: string | null
  unlocking: boolean
  onUnlock: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-6">
        {content.trim() ? (
          <ProsePreview content={content} />
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No content available.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900/50 dark:bg-green-950/25">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Section locked</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Locked on {formatDateTime(lockedAt)}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Button variant="outline" onClick={onUnlock} disabled={unlocking}>
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
