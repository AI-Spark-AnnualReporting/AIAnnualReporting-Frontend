"use client"

import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { RouteGuard } from "@/components/auth/RouteGuard"
import { useBuildReadiness, usePMCycleSections } from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { PageSkeleton } from "@/components/ui/skeletons"
import { EmptyState } from "@/components/ui/empty-state"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { SectionList } from "@/components/report/SectionList"
import { SectionDetail } from "@/components/report/SectionDetail"
import { AssembleEntry } from "@/components/report/AssembleEntry"
import { ArrowLeft, ClipboardList, Lock, ShieldAlert } from "lucide-react"
import { isTableOfContentsSection } from "@/lib/section-filters"

export default function ReportBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return (
    <RouteGuard allowedRoles={["project_manager", "admin"]}>
      <BuilderShell cycleId={id} />
    </RouteGuard>
  )
}

function BuilderShell({ cycleId }: { cycleId: string }) {
  const router = useRouter()
  const readinessQuery = useBuildReadiness(cycleId)
  const sectionsQuery = usePMCycleSections(cycleId)
  const { data: pmData } = usePMCycleDashboard(cycleId)

  const [selectedCode, setSelectedCode] = useState<string | null>(null)

  const readiness = readinessQuery.data
  const sections = (sectionsQuery.data ?? []).filter(
    (s) => !isTableOfContentsSection(s),
  )

  // Give the builder horizontal room — collapse the app nav, restore on leave.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("sidebar-set-mode", { detail: { mode: "hidden" } })
    )
    return () => {
      window.dispatchEvent(
        new CustomEvent("sidebar-set-mode", { detail: { mode: "expanded" } })
      )
    }
  }, [])

  // Defend against deep-linking into an unbuildable cycle.
  useEffect(() => {
    if (readiness && !readiness.can_build) {
      toast.error("This cycle isn't ready to build yet")
      router.replace(`/pm/cycles/${cycleId}`)
    }
  }, [readiness, router, cycleId])

  // Default the selection to the first section once data loads.
  useEffect(() => {
    if (!selectedCode && sections.length > 0) {
      const first = [...sections].sort(
        (a, b) => a.display_order - b.display_order
      )[0]
      setSelectedCode(first.section_code)
    }
  }, [sections, selectedCode])

  if (readinessQuery.isLoading || sectionsQuery.isLoading) return <PageSkeleton />

  if (readinessQuery.isError || sectionsQuery.isError) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Can't open the builder"
        description="This cycle's builder couldn't be loaded — you may not have access to it."
        action={
          <Link href={`/pm/cycles/${cycleId}`}>
            <Button variant="outline">Back to cycle</Button>
          </Link>
        }
      />
    )
  }

  // Redirect effect above handles this — render a skeleton meanwhile.
  if (readiness && !readiness.can_build) return <PageSkeleton />

  const ordered = [...sections].sort((a, b) => a.display_order - b.display_order)
  const total = sections.length
  // Auto sections are system-rendered at assembly time — count them as always
  // ready so they don't block the progress bar from reaching 100%.
  const locked = sections.filter(
    (s) => s.status === "locked" || s.mode === "auto",
  ).length
  const lockedPct = total > 0 ? Math.round((locked / total) * 100) : 0
  const selected =
    sections.find((s) => s.section_code === selectedCode) ?? null
  const cycleName = (pmData as { cycle?: { cycle_name?: string } } | undefined)
    ?.cycle?.cycle_name

  return (
    <div className="-mx-6 -mt-6 -mb-6 flex flex-col h-[calc(100vh-4rem)] bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b bg-card shrink-0">
        <Link href={`/pm/cycles/${cycleId}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sm truncate">
            Report Builder{cycleName ? ` — ${cycleName}` : ""}
          </h1>
        </div>
        <Link href={`/pm/cycles/${cycleId}/plan`}>
          <Button variant="outline" size="sm" className="h-8 shrink-0">
            <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
            Review Plan
          </Button>
        </Link>
        <AssembleEntry cycleId={cycleId} />
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Left — progress + section list */}
        <div className="w-[300px] shrink-0 flex flex-col border-r bg-card">
          <div className="px-3 py-3 border-b shrink-0">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium">
                {locked} of {total} sections locked
              </span>
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <Progress value={lockedPct} className="h-1.5" />
          </div>
          <div className="flex-1 overflow-y-auto">
            <SectionList
              sections={ordered}
              selectedCode={selectedCode}
              onSelect={setSelectedCode}
            />
          </div>
        </div>

        {/* Right — mode-appropriate detail */}
        <div className="flex-1 flex flex-col min-h-0">
          <SectionDetail section={selected} cycleId={cycleId} />
        </div>
      </div>
    </div>
  )
}
