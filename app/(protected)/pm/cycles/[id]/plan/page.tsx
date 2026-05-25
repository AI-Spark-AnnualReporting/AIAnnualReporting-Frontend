"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
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
import { HeadlineBlock } from "@/components/report/HeadlineBlock"
import { PlanSectionList } from "@/components/report/PlanSectionList"
import { ThemeEditor } from "@/components/report/ThemeEditor"
import {
  useBuildPlan,
  usePMCycleSections,
  usePlan,
} from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { pmApi } from "@/lib/api/pm"
import { QUERY_KEYS } from "@/lib/constants"
import type {
  CycleReportSection,
  FeederMapEntry,
  PlanResponse,
} from "@/types"

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
  const planQuery = usePlan(cycleId)
  const sectionsQuery = usePMCycleSections(cycleId)
  const { data: pmDataRaw } = usePMCycleDashboard(cycleId)
  const pmData = pmDataRaw as PMDashboardData | undefined

  // Builder shell collapses the app nav for room — mirror that here.
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

  // No plan yet — either a 404 from the backend or a 200 with null timestamp.
  // Either way drive the same "Generate Plan" prompt.
  const plan = planQuery.data
  const planMissing =
    !!planQuery.error || !plan || plan.plan_generated_at === null

  if (planMissing) {
    return (
      <PlanLayout cycleId={cycleId} cycleName={cycleName} header={null}>
        <EmptyPlan cycleId={cycleId} />
      </PlanLayout>
    )
  }

  const sections = sectionsQuery.data ?? []
  return (
    <PlanLayout
      cycleId={cycleId}
      cycleName={cycleName}
      header={
        <StartBuildingHeader
          cycleId={cycleId}
          plan={plan}
          sections={sections}
        />
      }
    >
      <div className="mx-auto max-w-4xl px-6 py-6 space-y-8">
        <HeadlineBlock cycleId={cycleId} headline={plan.headline} />
        <ThemeEditor cycleId={cycleId} themes={plan.themes ?? []} />
        <PlanSectionList
          cycleId={cycleId}
          sections={[...sections].sort(
            (a, b) => a.display_order - b.display_order,
          )}
          feeders={plan.feeders ?? []}
          departments={departments}
        />
        <AddSectionPicker cycleId={cycleId} />
      </div>
    </PlanLayout>
  )
}

// Shared chrome — back button + title + a right-side slot.
function PlanLayout({
  cycleId,
  cycleName,
  header,
  children,
}: {
  cycleId: string
  cycleName: string | undefined
  header: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="-mx-6 -mt-6 -mb-6 flex flex-col h-[calc(100vh-4rem)] bg-background">
      <div className="flex items-center gap-3 px-5 py-3 border-b bg-card shrink-0">
        <Link href={`/pm/cycles/${cycleId}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sm truncate">
            Review the plan before we build
            {cycleName ? ` — ${cycleName}` : ""}
          </h1>
          <p className="text-xs text-muted-foreground">
            Edit anything here — the build uses your revisions.
          </p>
        </div>
        {header}
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}

function StartBuildingHeader({
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

  // Bulk-generate progress dialog state.
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

  // Find every pending narrative section that has feeders assigned — the AI
  // can write these without further input.
  const eligibleToGenerate = sections.filter((s) => {
    if (s.mode !== "generate") return false
    if (s.status !== "pending") return false // skip drafting/locked; don't overwrite
    const feeders =
      plan.feeders?.find((f) => f.section_code === s.section_code)
        ?.departments ?? []
    return feeders.length > 0
  })

  // System (auto) sections are rendered at assembly time and don't need to be
  // locked — the backend rejects lock attempts on them. So we no longer try
  // to lock them here; they're treated as always-ready in the progress count.

  const totalWork = eligibleToGenerate.length

  const onStart = async () => {
    if (totalWork === 0) {
      // Nothing to do here; just route.
      router.push(`/pm/cycles/${cycleId}/build`)
      return
    }
    setRunning(true)
    setTotal(totalWork)
    setCompleted(0)
    setFailed(0)
    setAllDone(false)
    setPendingTitles(eligibleToGenerate.map((s) => s.title))

    // Fire all narrative generations in parallel. Each completion patches the
    // sections cache so the PM sees fresh content the moment they land on
    // /build. Auto sections need no action here.
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
    <div className="flex items-center gap-3 shrink-0">
      {disabled && (
        <span className="text-xs text-amber-700 dark:text-amber-400">
          {needsSource} section{needsSource === 1 ? "" : "s"} still need a source
        </span>
      )}
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
          // Only allow close once everything is done — otherwise generations
          // are in-flight and we want the PM to wait or explicitly skip.
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
    </div>
  )
}

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
