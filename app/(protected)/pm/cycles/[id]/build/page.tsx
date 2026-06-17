"use client"

import { use, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { RouteGuard } from "@/components/auth/RouteGuard"
import { useBuildReadiness, usePMCycleSections, useFinalReport } from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { PageLoader } from "@/components/ui/spinner"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import { SectionList } from "@/components/report/SectionList"
import { SectionDetail } from "@/components/report/SectionDetail"
import type { ContentLanguage } from "@/types"
import { AssembleEntry } from "@/components/report/AssembleEntry"
import { ArrowLeft, ClipboardList, Lock, ShieldAlert } from "lucide-react"
import { isTableOfContentsSection, isSectionReady } from "@/lib/section-filters"

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
  const finalReportQuery = useFinalReport(cycleId)
  // isSuccess = a final report exists (404 → isError, loading → isPending)
  const assembled = finalReportQuery.isSuccess

  const [selectedCode, setSelectedCode] = useState<string | null>(null)

  const readiness = readinessQuery.data
  const sections = (sectionsQuery.data ?? []).filter(
    (s) => !isTableOfContentsSection(s),
  )

  // Defend against deep-linking into an unbuildable cycle.
  useEffect(() => {
    if (readiness && !readiness.can_build) {
      toast.error("This cycle isn't ready to build yet")
      router.replace(`/pm/cycles/${cycleId}`)
    }
  }, [readiness, router, cycleId])

  if (readinessQuery.isLoading || sectionsQuery.isLoading) return <PageLoader />

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
  if (readiness && !readiness.can_build) return <PageLoader />

  const ordered = [...sections].sort((a, b) => a.display_order - b.display_order)
  const total = sections.length
  // Auto sections are system-rendered at assembly time, and the cover is always
  // ready (optional image) — count them as ready so they don't block the
  // progress bar from reaching 100%.
  const locked = sections.filter(isSectionReady).length
  const lockedPct = total > 0 ? Math.round((locked / total) * 100) : 0
  // Default to the first section until the PM picks one — derived during render
  // (no effect) so the initial selection never causes a cascading re-render.
  const effectiveCode = selectedCode ?? ordered[0]?.section_code ?? null
  const selected =
    sections.find((s) => s.section_code === effectiveCode) ?? null
  const cycleMeta = (pmData as { cycle?: { cycle_name?: string; content_language?: ContentLanguage } } | undefined)?.cycle
  const cycleName = cycleMeta?.cycle_name
  const contentLanguage = cycleMeta?.content_language ?? "english"
  const isRtl = contentLanguage === "arabic"

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <Link
          href={`/pm/cycles/${cycleId}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
          aria-label="Back to cycle"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-slate-900">
          Report Builder{cycleName ? ` — ${cycleName}` : ""}
        </h1>
        <Link href={`/pm/cycles/${cycleId}/plan`} className="shrink-0">
          <Button variant="outline" className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
            <ClipboardList className="mr-1.5 h-4 w-4" />
            Review Plan
          </Button>
        </Link>
        <AssembleEntry cycleId={cycleId} />
      </div>

      {/* Body — two cards */}
      <div className="flex min-h-0 flex-1 gap-6">
        {/* Left — progress + section list */}
        <div className="flex w-[360px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="shrink-0 border-b border-slate-100 px-5 py-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">
                {locked} of {total} sections locked
              </span>
              <Lock className="h-4 w-4 text-slate-400" />
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all"
                style={{ width: `${lockedPct}%` }}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <SectionList
              sections={ordered}
              selectedCode={effectiveCode}
              onSelect={setSelectedCode}
              isRtl={isRtl}
            />
          </div>
        </div>

        {/* Right — mode-appropriate detail */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <SectionDetail
            section={selected}
            cycleId={cycleId}
            assembled={assembled}
            contentLanguage={contentLanguage}
            isRtl={isRtl}
          />
        </div>
      </div>
    </div>
  )
}
