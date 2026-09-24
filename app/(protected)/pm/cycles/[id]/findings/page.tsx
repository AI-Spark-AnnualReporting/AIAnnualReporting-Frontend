"use client"

import { use } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, ScanSearch } from "lucide-react"

import { useBuildReadiness, useCheckDrafts, useDraftFindings } from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { PageHeader } from "@/components/ui/page-header"
import { PageLoader } from "@/components/ui/spinner"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import { DraftFindingsPanel } from "@/components/report/DraftFindingsPanel"
import { DraftCheckLoader } from "@/components/report/DraftCheckLoader"
import { formatDateTime } from "@/lib/utils"

/* What the analysis found, and the only route into the Report Builder.
   Putting Open Report Builder here rather than on the cycle page means the PM
   cannot reach the builder without passing the findings — which is the whole
   point of checking before the report is assembled. */
export default function CycleFindingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data, isLoading } = useDraftFindings(id)
  const { data: readiness } = useBuildReadiness(id)
  const { data: dash } = usePMCycleDashboard(id)
  const check = useCheckDrafts(id)

  if (isLoading) return <PageLoader />

  const findings = data?.findings ?? []
  const openCount = data?.open_count ?? 0
  const neverChecked = !data?.checked_at
  const cycleName =
    (dash as { cycle?: { cycle_name?: string } } | undefined)?.cycle?.cycle_name ?? "This cycle"

  const description = neverChecked
    ? `${cycleName} — the drafts haven't been analyzed yet`
    : openCount > 0
      ? `${cycleName} — ${openCount} thing${openCount === 1 ? "" : "s"} to check before building`
      : findings.length > 0
        ? `${cycleName} — everything has been handled`
        : `${cycleName} — no problems found`

  return (
    <div className="space-y-6">
      {check.isPending && <DraftCheckLoader />}

      <div className="flex items-start gap-3">
        <Link href={`/pm/cycles/${id}`}>
          <Button variant="outline" size="icon" className="mt-0.5 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          className="flex-1"
          title="Draft Findings"
          description={description}
          action={
            <>
              <Button
                variant="outline"
                onClick={() => check.mutate()}
                disabled={check.isPending}
              >
                {check.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ScanSearch className="mr-2 h-4 w-4" />
                )}
                {check.isPending ? "Analyzing…" : neverChecked ? "Analyze" : "Analyze again"}
              </Button>
              <OpenBuilderButton
                cycleId={id}
                canBuild={!!readiness?.can_build}
                openCount={openCount}
              />
            </>
          }
        />
      </div>

      {data?.checked_at && (
        <p className="text-xs text-muted-foreground">
          Last analyzed {formatDateTime(data.checked_at)}.
        </p>
      )}

      {findings.length === 0 ? (
        <EmptyState
          icon={neverChecked ? ScanSearch : CheckCircle2}
          title={neverChecked ? "Not analyzed yet" : "No problems found"}
          description={
            neverChecked
              ? "Analyze the drafts to look for claims the answers don't support, and figures that disagree between departments."
              : "Every draft matches what its department stated, and no figures disagree between departments."
          }
        />
      ) : (
        <DraftFindingsPanel cycleId={id} findings={findings} />
      )}
    </div>
  )
}

/* Two gates. The cycle must be assemblable at all — sections resolved, every
   department approved — and every finding must have been dealt with.

   Nothing can deadlock here: "Looks right" clears a finding without touching
   any text, so even a finding the PM disagrees with costs one click rather
   than blocking the report. */
function OpenBuilderButton({
  cycleId,
  canBuild,
  openCount,
}: {
  cycleId: string
  canBuild: boolean
  openCount: number
}) {
  const blocked = !canBuild || openCount > 0
  const reason = !canBuild
    ? "Available once sections are resolved and every department is approved"
    : `Handle all ${openCount} finding${openCount === 1 ? "" : "s"} first`

  if (blocked) {
    return (
      <Button disabled title={reason}>
        Open Report Builder
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    )
  }
  return (
    <Link href={`/pm/cycles/${cycleId}/plan`}>
      <Button>
        Open Report Builder
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </Link>
  )
}
