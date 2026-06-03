"use client"

import { useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Edit2,
  Loader2,
  Lock,
  LockOpen,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { ProsePreview } from "@/components/ui/prose-preview"
import { Textarea } from "@/components/ui/textarea"
import { SectionChat } from "@/components/report/SectionChat"
import { SectionHeader } from "@/components/report/SectionDetail"
import {
  useLockSection,
  usePlan,
  useRefineSection,
  useRunAnalysis,
  useSetAnalyzeContent,
  useUnlockSection,
} from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { cn, formatDateTime } from "@/lib/utils"
import type { CycleReportSection } from "@/types"

interface DashboardData {
  departments?: Array<{ department_code: string; department_name: string }>
}

export function AnalyzeSection({
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
    plan?.feeders?.find((f) => f.section_code === sectionCode)?.departments ?? []
  const deptByCode = new Map(
    (pmData?.departments ?? []).map((d) => [d.department_code, d.department_name]),
  )
  const feederNames = feederCodes.map((c) => deptByCode.get(c) ?? c)

  const runAnalysis = useRunAnalysis(cycleId)
  const refine = useRefineSection(cycleId)
  const setContent = useSetAnalyzeContent(cycleId)
  const lock = useLockSection(cycleId)
  const unlock = useUnlockSection(cycleId)

  const [editMode, setEditMode] = useState(false)
  const [draft, setDraft] = useState(content)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)

  // Re-seed editor when server content changes externally (e.g. re-run result).
  const [prevContent, setPrevContent] = useState(content)
  if (prevContent !== content) {
    setPrevContent(content)
    setDraft(content)
    setEditMode(false)
  }

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
              running={runAnalysis.isPending}
              onRun={() => runAnalysis.mutate({ sectionCode })}
            />
          ) : status === "locked" ? (
            <LockedView
              content={content}
              lockedAt={section.locked_at}
              unlocking={unlock.isPending}
              onUnlock={() => setUnlockOpen(true)}
            />
          ) : editMode ? (
            <EditView
              draft={draft}
              saving={setContent.isPending}
              onChange={setDraft}
              onSave={async () => {
                await setContent.mutateAsync({ sectionCode, content: draft })
                setEditMode(false)
              }}
              onCancel={() => {
                setEditMode(false)
                setDraft(content)
              }}
            />
          ) : (
            <DraftingView
              content={content}
              feederNames={feederNames}
              running={runAnalysis.isPending}
              refining={refine.isPending}
              locking={lock.isPending}
              canLock={content.trim() !== ""}
              onRun={() => runAnalysis.mutate({ sectionCode })}
              onRefine={(instruction) => refine.mutate({ sectionCode, instruction })}
              onEdit={() => setEditMode(true)}
              onClear={() => setClearOpen(true)}
              onLock={() => lock.mutate({ sectionCode })}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={unlockOpen}
        onOpenChange={setUnlockOpen}
        title="Unlock this section?"
        description="You can edit or re-run the analysis, then re-lock."
        confirmLabel="Unlock"
        variant="destructive"
        isLoading={unlock.isPending}
        onConfirm={async () => {
          await unlock.mutateAsync({ sectionCode })
          setUnlockOpen(false)
        }}
      />

      <ConfirmDialog
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear findings?"
        description="This removes the AI findings and resets the section to pending. You can re-run the analysis at any time."
        confirmLabel="Clear"
        variant="destructive"
        isLoading={setContent.isPending}
        onConfirm={async () => {
          await setContent.mutateAsync({ sectionCode, content: null })
          setClearOpen(false)
        }}
      />
    </div>
  )
}

function PendingView({
  cycleId,
  feederNames,
  hasFeeders,
  running,
  onRun,
}: {
  cycleId: string
  feederNames: string[]
  hasFeeders: boolean
  running: boolean
  onRun: () => void
}) {
  if (!hasFeeders) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-12 px-4">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/40">
          <AlertCircle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="text-lg font-semibold mb-1.5">No source assigned</h2>
        <p className="text-sm text-muted-foreground mb-5 max-w-md">
          Assign feeder departments on the Review Plan screen before running analysis.
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
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-950/40">
        {running ? (
          <Loader2 className="h-7 w-7 text-indigo-600 dark:text-indigo-400 animate-spin" />
        ) : (
          <RefreshCw className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
        )}
      </div>
      <h2 className="text-lg font-semibold mb-1.5">
        {running ? "Analysis running…" : "Analysis pending"}
      </h2>
      <p className="text-sm text-muted-foreground mb-5 max-w-md leading-relaxed">
        {running
          ? "The analyze agent is reading digests from the assigned departments."
          : "The analyze agent will produce structured findings from: "}
        {!running && (
          <span className="font-medium text-foreground">
            {feederNames.join(", ")}
          </span>
        )}
        {!running && "."}
      </p>
      <Button onClick={onRun} disabled={running} variant="outline">
        {running ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Running…
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4 mr-2" />
            Run Analysis Now
          </>
        )}
      </Button>
    </div>
  )
}

function DraftingView({
  content,
  feederNames,
  running,
  refining,
  locking,
  canLock,
  onRun,
  onRefine,
  onEdit,
  onClear,
  onLock,
}: {
  content: string
  feederNames: string[]
  running: boolean
  refining: boolean
  locking: boolean
  canLock: boolean
  onRun: () => void
  onRefine: (instruction: string) => void
  onEdit: () => void
  onClear: () => void
  onLock: () => void
}) {
  const busy = running || refining || locking

  return (
    <div className="space-y-4">
      {feederNames.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Findings from:{" "}
          <span className="font-medium text-foreground">
            {feederNames.join(", ")}
          </span>
        </p>
      )}

      <div
        className={cn(
          "rounded-lg border bg-card p-6 transition-opacity",
          (running || refining) && "opacity-60 pointer-events-none",
        )}
      >
        {content.trim() ? (
          <ProsePreview content={content} />
        ) : (
          <p className="text-sm text-muted-foreground italic">
            No findings yet — run the analysis to generate them.
          </p>
        )}
      </div>

      {(running || refining) && (
        <div className="flex items-center gap-2 rounded-full border bg-background/95 px-4 py-2 shadow-sm w-fit">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
          <span className="text-sm font-medium">
            {running ? "Re-running analysis…" : "Refining…"}
          </span>
        </div>
      )}

      <SectionChat refining={refining} onRefine={onRefine} />

      <p className="text-xs text-muted-foreground">
        Review the findings. Lock when you&apos;re satisfied — you can unlock
        and re-run any time.
      </p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRun}
            disabled={busy}
            title="Re-run the analyze agent and overwrite current findings"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Re-run Analysis
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            disabled={busy}
            title="Hand-edit the findings"
          >
            <Edit2 className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
          {content.trim() && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              disabled={busy}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              title="Clear findings and reset to pending"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Clear
            </Button>
          )}
        </div>

        <Button
          onClick={onLock}
          disabled={busy || !canLock}
          title={!canLock ? "Run the analysis first — content is required to lock" : undefined}
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

function EditView({
  draft,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  draft: string
  saving: boolean
  onChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label
          htmlFor="analyze-section-content"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Edit findings
        </label>
        <span className="text-xs text-muted-foreground">Markdown supported</span>
      </div>
      <Textarea
        id="analyze-section-content"
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        placeholder="## Key Findings&#10;- …&#10;&#10;## Trends&#10;- …"
        rows={18}
        className="text-sm leading-relaxed font-mono"
      />
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save
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
