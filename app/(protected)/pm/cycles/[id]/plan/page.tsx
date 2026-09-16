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
import { PageLoader } from "@/components/ui/spinner"
import { Progress } from "@/components/ui/progress"
import { AddSectionPicker } from "@/components/report/AddSectionPicker"
import { AiLoadingScreen } from "@/components/report/AiLoadingScreen"
import { DepartmentCoverage } from "@/components/report/DepartmentCoverage"
import { PlanSectionGrid } from "@/components/report/PlanSectionGrid"
import { AreasOfFocusSummary } from "@/components/report/AreasOfFocusSummary"
import { ConceptMessagesSummary } from "@/components/report/ConceptMessagesSummary"
import { SuggestedThemesEditor } from "@/components/report/SuggestedThemesEditor"
import {
  useBuildPlan,
  useLockPlan,
  usePMCycleSections,
  usePlan,
  useSetFeeders,
  useSetSourceMode,
} from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { pmApi, type AreaOfFocus, type SuggestedTheme } from "@/lib/api/pm"
import { QUERY_KEYS } from "@/lib/constants"
import {
  applyPending,
  mergePending,
  type PendingSourceChange,
  type PendingSources,
} from "@/lib/pendingSectionSources"
import { isTableOfContentsSection } from "@/lib/section-filters"
import { cn, formatDateTime } from "@/lib/utils"
import type {
  ContentLanguage,
  CycleReportSection,
  FeederMapEntry,
  PlanResponse,
} from "@/types"

type Step = 1 | 2

// What the save actually does, in order. Each changed section has its source
// type written before its departments, because switching to "Upload later"
// clears departments server-side.
const SAVE_MILESTONES = [
  "Checking the plan is still editable",
  "Updating each section's source type",
  "Assigning the departments you chose",
  "Refreshing the plan",
]

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
  cycle?: {
    cycle_name?: string
    content_language?: ContentLanguage
    areas_of_focus?: AreaOfFocus[] | null
    suggested_themes?: SuggestedTheme[] | null
  }
  departments?: Array<{ department_code: string; department_name: string }>
}

function PlanShell({ cycleId }: { cycleId: string }) {
  const [step, setStep] = useState<Step>(1)
  // Source edits live here, not on the server, until the PM leaves step 1.
  // PlanShell owns them because every route out of the step — Continue, the
  // step indicator, the back arrow — has to save or warn about them.
  const [pending, setPending] = useState<PendingSources>({})
  const [saving, setSaving] = useState(false)
  // Real save progress, so the loader shows a measured percentage rather than
  // a simulated climb. { done, total } in sections.
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 })
  const setFeeders = useSetFeeders(cycleId)
  const setSourceMode = useSetSourceMode(cycleId)

  // Source edits only exist in this component until Continue writes them, so a
  // reload or tab close would silently drop them. The browser shows its own
  // generic prompt; the text here is ignored by every modern browser.
  const unsavedCount = Object.keys(pending).length
  useEffect(() => {
    if (unsavedCount === 0) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [unsavedCount])
  // The lock is authoritative on the server (`plan.sections_locked`). Once set,
  // the blueprint is frozen one-way: no reordering, removing, source editing,
  // theme/headline edits, or regeneration. There is no unlock. Locking now
  // happens at "Start Building" (see StartBuildingAction), not when advancing.

  const planQuery = usePlan(cycleId)
  const sectionsQuery = usePMCycleSections(cycleId)
  const { data: pmDataRaw } = usePMCycleDashboard(cycleId)
  const pmData = pmDataRaw as PMDashboardData | undefined

  if (planQuery.isLoading || sectionsQuery.isLoading) return <PageLoader />

  const cycleName = pmData?.cycle?.cycle_name
  // Arabic cycles render section/theme titles right-to-left.
  const isRtl = pmData?.cycle?.content_language === "arabic"
  const departments = (pmData?.departments ?? []).map((d) => ({
    department_code: d.department_code,
    department_name: d.department_name,
  }))
  // Areas of focus chosen during the Strategic Brief flow (persisted on the cycle).
  const areasOfFocus = pmData?.cycle?.areas_of_focus ?? []
  const suggestedThemes = pmData?.cycle?.suggested_themes ?? []

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
  // One merged view of the sources, used by the cards, the counter and the
  // coverage strip alike, so an unsaved tick shows everywhere at once.
  const feeders = applyPending(plan.feeders ?? [], sections, pending)
  const needsSource = countSectionsNeedingFeeders(feeders, sections)
  const canLockSections = needsSource === 0 && sections.length > 0
  const hasUnsaved = Object.keys(pending).length > 0

  const onPendingChange = (
    sectionCode: string,
    change: PendingSourceChange,
  ) => {
    const section = sections.find((x) => x.section_code === sectionCode)
    if (!section) return
    // Compared against the saved map, so an edit that returns a section to its
    // stored value drops out of `pending` entirely.
    const entry = (plan.feeders ?? []).find(
      (f) => f.section_code === sectionCode,
    )
    setPending((prev) => mergePending(prev, section, entry, change))
  }

  // Write every unsaved edit, then advance. Sequential rather than parallel:
  // within a section the mode must land before the feeders (switching to
  // extract clears them server-side), and one-at-a-time keeps the failure
  // message specific and stops a wobbly connection being hit in a burst.
  const saveThen = async (after: () => void) => {
    if (!hasUnsaved) return after()
    const count = Object.keys(pending).length
    setSaveProgress({ done: 0, total: count })
    setSaving(true)
    const remaining: PendingSources = { ...pending }
    let done = 0
    try {
      for (const [sectionCode, change] of Object.entries(pending)) {
        if (change.mode) {
          await setSourceMode.mutateAsync({ sectionCode, mode: change.mode })
        }
        // Extract reads its document and nothing else; the mode switch above
        // already cleared its feeders, so writing them would be refused.
        const finalMode =
          change.mode ??
          (plan.feeders ?? []).find((f) => f.section_code === sectionCode)?.mode
        if (change.feeders && finalMode !== "extract") {
          await setFeeders.mutateAsync({
            sectionCode,
            departmentCodes: change.feeders,
          })
        }
        delete remaining[sectionCode]
        done += 1
        setSaveProgress({ done, total: count })
      }
      setPending({})
      // No success toast: the loader just showed this happening, section by
      // section, and then the next step appears. Announcing it again after the
      // fact only repeats what the PM watched.
      after()
    } catch {
      // The mutation already toasted the reason. Keep whatever did not land so
      // the PM can retry without re-picking anything.
      setPending(remaining)
    } finally {
      setSaving(false)
    }
  }

  // Saving is a per-section round trip, so a plan with several edited sections
  // takes long enough to need a real loader rather than a button spinner.
  if (saving) {
    const { done, total } = saveProgress
    return (
      <div className="fixed inset-0 z-[1400] overflow-y-auto">
        <AiLoadingScreen
          title="Saving your section sources"
          subtitle="Writing the departments and source types you picked for each section."
          milestones={SAVE_MILESTONES}
          // No bar: the milestone checklist already shows how far along this
          // is, and controlledProgress still steps it section by section.
          showProgress={false}
          controlledProgress={total > 0 ? Math.round((done / total) * 100) : 0}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-7">
      <PlanHeader
        cycleId={cycleId}
        cycleName={cycleName}
        confirmLeave={hasUnsaved}
        right={
          <p className="hidden max-w-xs text-right text-sm text-slate-500 lg:block">
            Edit anything here — the build uses your revisions.
          </p>
        }
      />

      <StepIndicator
        step={step}
        canAdvance={canLockSections && !saving}
        onStep={(s) => {
          // Allow free backward nav; gate forward. Leaving step 1 forward is
          // the save point, so it goes through the same path as Continue.
          if (s === 1) setStep(1)
          else if (s === 2 && canLockSections) saveThen(() => setStep(2))
        }}
      />

      {step === 1 ? (
        <SectionsStep
          cycleId={cycleId}
          sections={sections}
          feeders={feeders}
          departments={departments}
          needsSource={needsSource}
          locked={sectionsLocked}
          lockedAt={plan.sections_locked_at}
          isRtl={isRtl}
          hasUnsaved={hasUnsaved}
          saving={saving}
          onPendingChange={onPendingChange}
          onContinue={() => saveThen(() => setStep(2))}
        />
      ) : (
        <ThemesStep
          cycleId={cycleId}
          plan={plan}
          sections={sections}
          areasOfFocus={areasOfFocus}
          suggestedThemes={suggestedThemes}
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
  confirmLeave,
}: {
  cycleId: string
  cycleName: string | undefined
  right: React.ReactNode
  /** Unsaved source edits would be lost — ask before navigating away. */
  confirmLeave?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        <Link
          href={`/pm/cycles/${cycleId}`}
          onClick={(e) => {
            if (!confirmLeave) return
            // beforeunload does not fire on a client-side route change, so the
            // back arrow needs its own guard.
            if (
              !window.confirm(
                "Your source changes haven't been saved yet. Leave without saving?",
              )
            ) {
              e.preventDefault()
            }
          }}
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
          sublabel="Review & source"
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
  isRtl,
  hasUnsaved,
  saving,
  onPendingChange,
  onContinue,
}: {
  cycleId: string
  sections: CycleReportSection[]
  feeders: FeederMapEntry[]
  departments: Array<{ department_code: string; department_name: string }>
  needsSource: number
  locked: boolean
  lockedAt: string | null
  isRtl: boolean
  hasUnsaved: boolean
  saving: boolean
  onPendingChange: (sectionCode: string, change: PendingSourceChange) => void
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

      <DepartmentCoverage
        departments={departments}
        feeders={feeders}
        isRtl={isRtl}
      />

      <PlanSectionGrid
        cycleId={cycleId}
        sections={sections}
        feeders={feeders}
        departments={departments}
        onPendingChange={onPendingChange}
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
          <AddSectionPicker cycleId={cycleId} departments={departments} />
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
              {!canLock && needsSource > 0 ? (
                <span className="hidden text-xs text-amber-700 sm:block">
                  Assign a source to every flagged section to continue.
                </span>
              ) : hasUnsaved ? (
                <span className="hidden text-xs text-slate-500 sm:block">
                  Your source changes are saved when you continue.
                </span>
              ) : null}
              {/* Advancing no longer locks — the plan is locked at "Start Building". */}
              <Button
                onClick={onContinue}
                disabled={!canLock || saving}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {saving ? "Saving…" : "Continue"}
                {!saving && <ArrowRight className="ml-1.5 h-4 w-4" />}
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
  areasOfFocus,
  suggestedThemes,
  locked,
  isRtl,
  onBack,
}: {
  cycleId: string
  plan: PlanResponse
  sections: CycleReportSection[]
  areasOfFocus: AreaOfFocus[]
  suggestedThemes: SuggestedTheme[]
  locked: boolean
  isRtl: boolean
  onBack: () => void
}) {
  // Selection now lives on each theme as a persisted `selected` flag (toggled +
  // saved inside the editors below). The backend reads those flags directly, so
  // this step no longer tracks selection or writes plan.themes. Once the plan is
  // locked (Start Building), both editors render view-only.
  return (
    <section className="space-y-5">
      {/* Areas of Focus — from the brief, view-only (the role choice is made there). */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <AreasOfFocusSummary areas={areasOfFocus} locked={locked} isRtl={isRtl} />
      </div>

      {/* Concept Messages — the narrative written from those areas, view-only
          (they're edited on the kickoff wizard's Concept Messages step). Sits
          here because it's what the section writer is actually handed. */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <ConceptMessagesSummary cycleId={cycleId} locked={locked} isRtl={isRtl} />
      </div>

      {/* Suggested Themes — cycle.suggested_themes: editable + AI-refine + selectable. */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <SuggestedThemesEditor
          cycleId={cycleId}
          themes={suggestedThemes}
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
  const lockPlan = useLockPlan(cycleId)
  const alreadyLocked = plan.sections_locked
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
    // Lock the plan — the one-way freeze that used to live on Step 1. Theme
    // selection is already persisted per-theme, so there's nothing else to save.
    // Abort the build if the lock fails (the hook already surfaces the error).
    if (!alreadyLocked) {
      try {
        await lockPlan.mutateAsync()
      } catch {
        return
      }
    }
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
        disabled={disabled || running || lockPlan.isPending}
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
          Report theme and outline
        </h2>
        <p className="mb-5 text-sm text-slate-500">
          We&apos;ll run two AI passes over your approved department content to
          propose a headline, themes, and per-section feeders. This usually
          takes 30–60 seconds.
        </p>
        <Button
          onClick={() => build.mutate()}
          disabled={build.isPending}
          size="lg"
          className="bg-indigo-600 text-white hover:bg-indigo-700"
        >
          {build.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate
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
    const entry = feederByCode.get(s.section_code)
    // The feeder map's mode is authoritative (a mode switch lands there first).
    // Generate and analyze sections require department feeders; extract is
    // sourced by its document, and manual/attach/auto by the PM — the mode test
    // below covers all of those.
    //
    // Deliberately NOT gated on ai_allowed. That was here to skip manual
    // sections, but it also skipped analyze sections flagged ai_allowed=false —
    // financial_highlights and five_year_summary are exactly that, and they do
    // read department digests. Their cards said "Needs a source" while this
    // counter returned 0, so Continue stayed enabled on an unsourced plan.
    const mode = entry?.mode ?? s.mode
    if (mode !== "generate" && mode !== "analyze") return false
    return (entry?.departments.length ?? 0) === 0
  }).length
}
