"use client"

import { use, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Layers,
  Loader2,
  Lock,
  Palette,
  Sparkles,
} from "lucide-react"
import { RouteGuard } from "@/components/auth/RouteGuard"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PageSkeleton } from "@/components/ui/skeletons"
import { Progress } from "@/components/ui/progress"
import { AddSectionPicker } from "@/components/report/AddSectionPicker"
import { PlanSectionGrid } from "@/components/report/PlanSectionGrid"
import { RegeneratePlanButton } from "@/components/report/RegeneratePlanButton"
import { ThemeEditor } from "@/components/report/ThemeEditor"
import {
  useBuildPlan,
  useLockPlan,
  usePMCycleSections,
  usePlan,
} from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { pmApi } from "@/lib/api/pm"
import { QUERY_KEYS } from "@/lib/constants"
import { isTableOfContentsSection } from "@/lib/section-filters"
import { cn, formatDateTime } from "@/lib/utils"
import type {
  ContentLanguage,
  CycleReportSection,
  FeederMapEntry,
  PlanResponse,
} from "@/types"

type Step = 1 | 2

export default function PlanReviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return (
    <RouteGuard allowedRoles={["project_manager", "admin"]}>
      <PlanShell cycleId={id} />
    </RouteGuard>
  )
}

interface PMDashboardData {
  cycle?: { cycle_name?: string; content_language?: ContentLanguage }
  departments?: Array<{ department_code: string; department_name: string }>
}

function PlanShell({ cycleId }: { cycleId: string }) {
  const [step, setStep] = useState<Step>(1)
  // The lock is authoritative on the server (`plan.sections_locked`). Once set,
  // the blueprint is frozen one-way: no reordering, removing, source editing,
  // theme/headline edits, or regeneration. There is no unlock.
  const lockPlan = useLockPlan(cycleId)

  const planQuery = usePlan(cycleId)
  const sectionsQuery = usePMCycleSections(cycleId)
  const { data: pmDataRaw } = usePMCycleDashboard(cycleId)
  const pmData = pmDataRaw as PMDashboardData | undefined

  if (planQuery.isLoading || sectionsQuery.isLoading) return <PageSkeleton />

  const cycleName = pmData?.cycle?.cycle_name
  // Arabic cycles render section/theme titles right-to-left.
  const isRtl = pmData?.cycle?.content_language === "arabic"
  const departments = (pmData?.departments ?? []).map((d) => ({
    department_code: d.department_code,
    department_name: d.department_name,
  }))

  const plan = planQuery.data
  const planMissing =
    !!planQuery.error || !plan || plan.plan_generated_at === null

  if (planMissing) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-7">
        <PlanHeader cycleId={cycleId} cycleName={cycleName} right={null} />
        <EmptyPlan cycleId={cycleId} />
      </div>
    )
  }

  const sections = [...(sectionsQuery.data ?? [])]
    .filter((s) => !isTableOfContentsSection(s))
    .sort((a, b) => a.display_order - b.display_order)
  const sectionsLocked = plan.sections_locked
  const needsSource = countSectionsNeedingFeeders(plan.feeders, sections)
  const canLockSections = needsSource === 0 && sections.length > 0

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7">
      <PlanHeader
        cycleId={cycleId}
        cycleName={cycleName}
        right={
          <div className="flex items-center gap-4">
            <p className="hidden max-w-xs text-right text-sm text-slate-500 lg:block">
              Edit anything here — the build uses your revisions.
            </p>
            <RegeneratePlanButton cycleId={cycleId} disabled={sectionsLocked} />
          </div>
        }
      />

      <StepIndicator
        step={step}
        canAdvance={canLockSections}
        onStep={(s) => {
          // Allow free backward nav; gate forward.
          if (s === 1) setStep(1)
          else if (s === 2 && canLockSections) setStep(2)
        }}
      />

      {step === 1 ? (
        <SectionsStep
          cycleId={cycleId}
          sections={sections}
          feeders={plan.feeders ?? []}
          departments={departments}
          needsSource={needsSource}
          locked={sectionsLocked}
          lockedAt={plan.sections_locked_at}
          locking={lockPlan.isPending}
          isRtl={isRtl}
          onLock={async () => {
            // Persist the lock first; only advance once the server confirms.
            await lockPlan.mutateAsync()
            setStep(2)
          }}
          onContinue={() => setStep(2)}
        />
      ) : (
        <ThemesStep
          cycleId={cycleId}
          plan={plan}
          sections={sections}
          locked={sectionsLocked}
          isRtl={isRtl}
          onBack={() => setStep(1)}
        />
      )}
    </div>
  )
}

// ─────────────────────────── Header ───────────────────────────

function PlanHeader({
  cycleId,
  cycleName,
  right,
}: {
  cycleId: string
  cycleName: string | undefined
  right: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        <Link
          href={`/pm/cycles/${cycleId}`}
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
          aria-label="Back to cycle"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Review the plan before we build
          </p>
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            {cycleName ?? "Untitled cycle"}
          </h1>
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

// ─────────────────────────── Step Indicator ───────────────────────────

function StepIndicator({
  step,
  canAdvance,
  onStep,
}: {
  step: Step
  canAdvance: boolean
  onStep: (s: Step) => void
}) {
  const step1State: BubbleState = step === 1 ? "active" : "complete"
  const step2State: BubbleState =
    step === 2 ? "active" : canAdvance ? "available" : "locked"

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
      <ol className="flex items-center gap-3">
        <StepBubble
          n={1}
          icon={Layers}
          label="Sections"
          sublabel="Review, source and lock"
          state={step1State}
          onClick={() => onStep(1)}
        />
        <StepConnector active={step === 2 || canAdvance} />
        <StepBubble
          n={2}
          icon={Palette}
          label="Themes"
          sublabel="Confirm the narrative"
          state={step2State}
          onClick={() => onStep(2)}
        />
      </ol>
    </div>
  )
}

type BubbleState = "active" | "complete" | "available" | "locked"

function StepBubble({
  n,
  icon: Icon,
  label,
  sublabel,
  state,
  onClick,
}: {
  n: number
  icon: React.ComponentType<{ className?: string }>
  label: string
  sublabel: string
  state: BubbleState
  onClick: () => void
}) {
  const isLocked = state === "locked"
  return (
    <li className="min-w-0 shrink-0">
      <button
        type="button"
        onClick={onClick}
        disabled={isLocked}
        className={cn(
          "flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors",
          state === "active" && "bg-indigo-50",
          (state === "available" || state === "complete") && "hover:bg-slate-50",
          isLocked && "cursor-not-allowed opacity-60",
        )}
      >
        <span
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-all",
            state === "active" && "bg-indigo-600 text-white",
            state === "complete" && "bg-emerald-500 text-white",
            state === "available" && "bg-slate-100 text-slate-600",
            isLocked && "bg-slate-100 text-slate-400",
          )}
        >
          {state === "complete" ? (
            <Check className="h-4 w-4" strokeWidth={3} />
          ) : isLocked ? (
            <Lock className="h-3.5 w-3.5" />
          ) : (
            <span className="tabular-nums">{n}</span>
          )}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                state === "active" ? "text-indigo-600" : "text-slate-400",
              )}
            />
            <span
              className={cn(
                "truncate text-sm font-semibold",
                state === "active" ? "text-slate-900" : "text-slate-700",
              )}
            >
              {label}
            </span>
          </span>
          <span className="block truncate text-xs text-slate-400">
            {sublabel}
          </span>
        </span>
      </button>
    </li>
  )
}

function StepConnector({ active }: { active: boolean }) {
  return (
    <li
      aria-hidden
      className={cn(
        "h-px flex-1 transition-colors",
        active ? "bg-indigo-300" : "bg-slate-200",
      )}
    />
  )
}

// ─────────────────────────── Step 1: Sections ───────────────────────────

function SectionsStep({
  cycleId,
  sections,
  feeders,
  departments,
  needsSource,
  locked,
  lockedAt,
  locking,
  isRtl,
  onLock,
  onContinue,
}: {
  cycleId: string
  sections: CycleReportSection[]
  feeders: FeederMapEntry[]
  departments: Array<{ department_code: string; department_name: string }>
  needsSource: number
  locked: boolean
  lockedAt: string | null
  locking: boolean
  isRtl: boolean
  onLock: () => void
  onContinue: () => void
}) {
  const canLock = needsSource === 0 && sections.length > 0

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Report sections</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {locked
              ? "Sections are locked — reordering, sources, and removal are disabled."
              : "Drag to reorder, assign a department source to each generated section, and add optional sections."}
          </p>
        </div>
        <div className="shrink-0 text-sm tabular-nums text-slate-400">
          {sections.length} total
          {!locked && needsSource > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              {needsSource} need a source
            </span>
          )}
        </div>
      </div>

      <PlanSectionGrid
        cycleId={cycleId}
        sections={sections}
        feeders={feeders}
        departments={departments}
        readOnly={locked}
        isRtl={isRtl}
      />

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
        {locked ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
            <Lock className="h-4 w-4" />
            Sections locked
            {lockedAt ? ` on ${formatDateTime(lockedAt)}` : ""} — sources and
            structure can&apos;t be changed.
          </span>
        ) : (
          <AddSectionPicker cycleId={cycleId} />
        )}
        <div className="flex items-center gap-3">
          {locked ? (
            <Button
              onClick={onContinue}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Continue
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : (
            <>
              {!canLock && needsSource > 0 && (
                <span className="hidden text-xs text-amber-700 sm:block">
                  Assign a source to every flagged section to continue.
                </span>
              )}
              <Button
                onClick={onLock}
                disabled={!canLock || locking}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {locking ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="mr-1.5 h-4 w-4" />
                )}
                Lock sections
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────── Step 2: Themes ───────────────────────────

function ThemesStep({
  cycleId,
  plan,
  sections,
  locked,
  isRtl,
  onBack,
}: {
  cycleId: string
  plan: PlanResponse
  sections: CycleReportSection[]
  locked: boolean
  isRtl: boolean
  onBack: () => void
}) {
  return (
    <section className="space-y-5">
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <ThemeEditor
          cycleId={cycleId}
          themes={plan.themes ?? []}
          readOnly={locked}
          isRtl={isRtl}
        />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to sections
        </Button>
        <StartBuildingAction cycleId={cycleId} plan={plan} sections={sections} />
      </div>
    </section>
  )
}

// ─────────────────────────── Start Building Action ───────────────────────────

function StartBuildingAction({
  cycleId,
  plan,
  sections,
}: {
  cycleId: string
  plan: PlanResponse
  sections: CycleReportSection[]
}) {
  const router = useRouter()
  const qc = useQueryClient()
  const needsSource = countSectionsNeedingFeeders(plan.feeders, sections)
  const disabled = needsSource > 0

  const [running, setRunning] = useState(false)
  const [total, setTotal] = useState(0)
  const [completed, setCompleted] = useState(0)
  const [failed, setFailed] = useState(0)
  const [pendingTitles, setPendingTitles] = useState<string[]>([])
  const [allDone, setAllDone] = useState(false)

  const patchSection = (updated: CycleReportSection) => {
    qc.setQueryData<CycleReportSection[]>(
      QUERY_KEYS.PM_CYCLE_SECTIONS(cycleId),
      (old) => {
        if (!old) return old
        return old.map((s) =>
          s.section_code === updated.section_code ? updated : s,
        )
      },
    )
  }

  const eligibleToGenerate = sections.filter((s) => {
    if (s.mode !== "generate") return false
    // Never invoke the AI for manual sections — the PM writes those directly.
    if (!s.ai_allowed) return false
    if (s.status !== "pending") return false
    const feeders =
      plan.feeders?.find((f) => f.section_code === s.section_code)
        ?.departments ?? []
    return feeders.length > 0
  })

  const totalWork = eligibleToGenerate.length

  const onStart = async () => {
    if (totalWork === 0) {
      router.push(`/pm/cycles/${cycleId}/build`)
      return
    }
    setRunning(true)
    setTotal(totalWork)
    setCompleted(0)
    setFailed(0)
    setAllDone(false)
    setPendingTitles(eligibleToGenerate.map((s) => s.title))

    await Promise.allSettled(
      eligibleToGenerate.map(async (s) => {
        try {
          const updated = await pmApi.generateSection(cycleId, s.section_code)
          patchSection(updated)
          setCompleted((c) => c + 1)
        } catch {
          setFailed((f) => f + 1)
        } finally {
          setPendingTitles((titles) => titles.filter((t) => t !== s.title))
        }
      }),
    )
    setAllDone(true)
  }

  const goToBuilder = () => {
    setRunning(false)
    if (failed > 0) {
      toast.error(
        `${failed} section${failed === 1 ? "" : "s"} failed to generate. You can retry from the builder.`,
      )
    }
    router.push(`/pm/cycles/${cycleId}/build`)
  }

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <>
      <Button
        disabled={disabled || running}
        onClick={onStart}
        className="bg-indigo-600 text-white hover:bg-indigo-700"
        title={
          disabled
            ? "Assign a department to each flagged section before building."
            : totalWork > 0
              ? `Auto-generate ${totalWork} narrative section${totalWork === 1 ? "" : "s"} then open the builder`
              : undefined
        }
      >
        Start Building
        <ArrowRight className="ml-1.5 h-4 w-4" />
      </Button>

      <Dialog
        open={running}
        onOpenChange={(open) => {
          if (!open && allDone) goToBuilder()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {allDone ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <Sparkles className="h-5 w-5 text-indigo-600" />
              )}
              {allDone
                ? failed > 0
                  ? "Finished with some errors"
                  : "All sections generated"
                : "Generating sections"}
            </DialogTitle>
            <DialogDescription>
              {allDone
                ? `Wrote ${completed} of ${total} section${total === 1 ? "" : "s"}. Opening the builder so you can review and lock.`
                : `Writing the AI narrative for each section that has a source assigned. This usually takes 30–60 seconds.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {completed} of {total} complete
                {failed > 0 ? ` · ${failed} failed` : ""}
              </span>
              <span className="tabular-nums">{percent}%</span>
            </div>
            <Progress value={percent} />

            {!allDone && pendingTitles.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-md border bg-muted/30 p-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Still writing
                </p>
                <ul className="space-y-1">
                  {pendingTitles.map((t) => (
                    <li
                      key={t}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                      <span className="truncate">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            {allDone ? (
              <Button
                onClick={goToBuilder}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Open Builder
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            ) : (
              <Button variant="outline" onClick={goToBuilder}>
                Skip and continue
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─────────────────────────── Empty Plan ───────────────────────────

function EmptyPlan({ cycleId }: { cycleId: string }) {
  const build = useBuildPlan(cycleId)
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-10 shadow-sm">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
          <Sparkles className="h-7 w-7 text-indigo-600" />
        </div>
        <h2 className="mb-1.5 text-lg font-bold text-slate-900">
          Generate the report plan
        </h2>
        <p className="mb-5 text-sm text-slate-500">
          We&apos;ll run two AI passes over your approved department content to
          propose a headline, themes, and per-section feeders. This usually
          takes 30–60 seconds.
        </p>
        <Button
          onClick={() => build.mutate({})}
          disabled={build.isPending}
          size="lg"
          className="bg-indigo-600 text-white hover:bg-indigo-700"
        >
          {build.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating plan…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Plan
            </>
          )}
        </Button>
        {build.isError && (
          <p className="mt-3 text-xs text-red-600">
            Couldn&apos;t generate the plan. Make sure at least one department
            session is approved.
          </p>
        )}
      </div>
    </div>
  )
}

function countSectionsNeedingFeeders(
  feeders: FeederMapEntry[] | undefined,
  sections: CycleReportSection[],
): number {
  // Iterate the sections themselves — a generate section with no feeder entry at
  // all still needs a source, so counting only feeder rows would miss it.
  const feederByCode = new Map((feeders ?? []).map((f) => [f.section_code, f]))
  return sections.filter((s) => {
    // Manual sections (`ai_allowed = false`) are written by the PM directly.
    if (!s.ai_allowed) return false
    const entry = feederByCode.get(s.section_code)
    // The feeder map's mode is authoritative (a mode switch lands there first).
    // Generate and analyze sections require department feeders; extract is
    // sourced by its document.
    const mode = entry?.mode ?? s.mode
    if (mode !== "generate" && mode !== "analyze") return false
    return (entry?.departments.length ?? 0) === 0
  }).length
}
