"use client"

import { use, useEffect, useState } from "react"
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
  usePMCycleSections,
  usePlan,
} from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { pmApi } from "@/lib/api/pm"
import { QUERY_KEYS } from "@/lib/constants"
import { isTableOfContentsSection } from "@/lib/section-filters"
import { cn } from "@/lib/utils"
import type {
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
  cycle?: { cycle_name?: string }
  departments?: Array<{ department_code: string; department_name: string }>
}

function PlanShell({ cycleId }: { cycleId: string }) {
  const [step, setStep] = useState<Step>(1)
  const planQuery = usePlan(cycleId)
  const sectionsQuery = usePMCycleSections(cycleId)
  const { data: pmDataRaw } = usePMCycleDashboard(cycleId)
  const pmData = pmDataRaw as PMDashboardData | undefined

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("sidebar-set-mode", { detail: { mode: "hidden" } }),
    )
    return () => {
      window.dispatchEvent(
        new CustomEvent("sidebar-set-mode", { detail: { mode: "expanded" } }),
      )
    }
  }, [])

  if (planQuery.isLoading || sectionsQuery.isLoading) return <PageSkeleton />

  const cycleName = pmData?.cycle?.cycle_name
  const departments = (pmData?.departments ?? []).map((d) => ({
    department_code: d.department_code,
    department_name: d.department_name,
  }))

  const plan = planQuery.data
  const planMissing =
    !!planQuery.error || !plan || plan.plan_generated_at === null

  if (planMissing) {
    return (
      <PlanShellChrome cycleId={cycleId} cycleName={cycleName} toolbarRight={null}>
        <EmptyPlan cycleId={cycleId} />
      </PlanShellChrome>
    )
  }

  const sections = [...(sectionsQuery.data ?? [])]
    .filter((s) => !isTableOfContentsSection(s))
    .sort((a, b) => a.display_order - b.display_order)
  const needsSource = countSectionsNeedingFeeders(plan.feeders, sections)
  const canLockSections = needsSource === 0 && sections.length > 0

  const toolbarRight = (
    <div className="flex items-center gap-2">
      <RegeneratePlanButton cycleId={cycleId} />
    </div>
  )

  return (
    <PlanShellChrome
      cycleId={cycleId}
      cycleName={cycleName}
      toolbarRight={toolbarRight}
    >
      <div className="mx-auto w-full max-w-6xl px-6 pt-8 pb-0 flex flex-col flex-1 min-h-0">
        <ReportTitleBlock cycleName={cycleName} />

        <div className="mt-7">
          <StepIndicator
            step={step}
            canAdvance={canLockSections}
            onStep={(s) => {
              // Allow free backward nav; gate forward.
              if (s === 1) setStep(1)
              else if (s === 2 && canLockSections) setStep(2)
            }}
          />
        </div>

        <div className="mt-6 flex-1 min-h-0 flex flex-col">
          {step === 1 ? (
            <SectionsStep
              cycleId={cycleId}
              sections={sections}
              feeders={plan.feeders ?? []}
              departments={departments}
              needsSource={needsSource}
              onLock={() => setStep(2)}
            />
          ) : (
            <ThemesStep
              cycleId={cycleId}
              plan={plan}
              sections={sections}
              onBack={() => setStep(1)}
            />
          )}
        </div>
      </div>
    </PlanShellChrome>
  )
}

// ─────────────────────────── Chrome / Layout ───────────────────────────

function PlanShellChrome({
  cycleId,
  cycleName,
  toolbarRight,
  children,
}: {
  cycleId: string
  cycleName: string | undefined
  toolbarRight: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="-mx-6 -mt-6 -mb-6 flex flex-col h-[calc(100vh-4rem)] bg-muted/30">
      <header className="flex items-center gap-3 px-6 py-3 border-b bg-card shrink-0">
        <Link href={`/pm/cycles/${cycleId}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
            Review the plan before we build
          </p>
          <h1 className="font-semibold text-base truncate -mt-0.5">
            {cycleName ?? "Untitled cycle"}
          </h1>
        </div>
        <p className="hidden md:block text-xs text-muted-foreground max-w-xs text-right">
          Edit anything here — the build uses your revisions.
        </p>
        {toolbarRight}
      </header>

      <main className="flex-1 min-h-0 flex flex-col">{children}</main>
    </div>
  )
}

// ─────────────────────────── Report Title ───────────────────────────

function ReportTitleBlock({ cycleName }: { cycleName: string | undefined }) {
  return (
    <section className="space-y-2">
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-medium">
        Report title
      </p>
      <h2 className="text-3xl md:text-4xl font-semibold tracking-tight leading-[1.1] text-foreground">
        {cycleName ?? "Untitled cycle"}
      </h2>
    </section>
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
    <div className="rounded-2xl border bg-card px-5 py-4 shadow-sm">
      <ol className="flex items-center gap-2">
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
    <li className="flex-1 min-w-0">
      <button
        type="button"
        onClick={onClick}
        disabled={isLocked}
        className={cn(
          "w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
          state === "active" && "bg-primary/5",
          state === "available" && "hover:bg-accent",
          state === "complete" && "hover:bg-accent",
          isLocked && "opacity-60 cursor-not-allowed",
        )}
      >
        <span
          className={cn(
            "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-all",
            state === "active" &&
              "bg-primary text-primary-foreground shadow-[0_0_0_4px_hsl(var(--primary)/0.12)]",
            state === "complete" &&
              "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
            state === "available" &&
              "bg-muted text-foreground border",
            isLocked && "bg-muted text-muted-foreground border",
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
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Icon
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                state === "active"
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            />
            <span
              className={cn(
                "text-sm font-semibold truncate",
                state === "active" ? "text-foreground" : "text-foreground/90",
              )}
            >
              {label}
            </span>
          </span>
          <span className="block text-[11px] text-muted-foreground truncate">
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
        "h-px flex-1 max-w-16 transition-colors",
        active ? "bg-primary/30" : "bg-border",
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
  onLock,
}: {
  cycleId: string
  sections: CycleReportSection[]
  feeders: FeederMapEntry[]
  departments: Array<{ department_code: string; department_name: string }>
  needsSource: number
  onLock: () => void
}) {
  const canLock = needsSource === 0 && sections.length > 0

  return (
    <section className="flex flex-col flex-1 min-h-0">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Report sections
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Drag to reorder, assign a department source to each generated section, and add optional sections.
          </p>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums shrink-0">
          {sections.length} total
          {needsSource > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {needsSource} need a source
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto -mr-2 pr-2 pb-2">
        <PlanSectionGrid
          cycleId={cycleId}
          sections={sections}
          feeders={feeders}
          departments={departments}
        />
      </div>

      <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-border/80">
        <AddSectionPicker cycleId={cycleId} />
        <div className="flex items-center gap-3">
          {!canLock && needsSource > 0 && (
            <span className="text-xs text-amber-700 dark:text-amber-400 hidden sm:block">
              Assign a source to every flagged section to continue.
            </span>
          )}
          <Button onClick={onLock} disabled={!canLock} size="sm">
            <Lock className="h-3.5 w-3.5 mr-1.5" />
            Lock sections
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
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
  onBack,
}: {
  cycleId: string
  plan: PlanResponse
  sections: CycleReportSection[]
  onBack: () => void
}) {
  return (
    <section className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto -mr-2 pr-2 pb-2">
        <div className="rounded-2xl border bg-card p-5">
          <ThemeEditor cycleId={cycleId} themes={plan.themes ?? []} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-border/80">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
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
        size="sm"
        disabled={disabled || running}
        onClick={onStart}
        title={
          disabled
            ? "Assign a department to each flagged section before building."
            : totalWork > 0
              ? `Auto-generate ${totalWork} narrative section${totalWork === 1 ? "" : "s"} then open the builder`
              : undefined
        }
      >
        Start Building
        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
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
                <Sparkles className="h-5 w-5 text-primary" />
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
              <div className="rounded-md border bg-muted/30 p-3 max-h-32 overflow-y-auto">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  Still writing
                </p>
                <ul className="space-y-1">
                  {pendingTitles.map((t) => (
                    <li
                      key={t}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                      <span className="truncate">{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            {allDone ? (
              <Button onClick={goToBuilder}>
                Open Builder
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
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
    <div className="flex flex-1 items-center justify-center p-8 min-h-[60vh]">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Sparkles className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-lg font-semibold mb-1.5">
          Generate the report plan
        </h2>
        <p className="text-sm text-muted-foreground mb-5">
          We&apos;ll run two AI passes over your approved department content to
          propose a headline, themes, and per-section feeders. This usually
          takes 30–60 seconds.
        </p>
        <Button
          onClick={() => build.mutate({})}
          disabled={build.isPending}
          size="lg"
        >
          {build.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating plan…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Plan
            </>
          )}
        </Button>
        {build.isError && (
          <p className="text-xs text-destructive mt-3">
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
  if (!feeders) return 0
  const generateCodes = new Set(
    sections.filter((s) => s.mode === "generate").map((s) => s.section_code),
  )
  return feeders.filter(
    (f) => generateCodes.has(f.section_code) && f.departments.length === 0,
  ).length
}
