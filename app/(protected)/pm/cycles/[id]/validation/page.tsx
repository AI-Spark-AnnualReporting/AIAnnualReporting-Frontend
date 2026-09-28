"use client"

import { use, useEffect, useRef } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, ShieldCheck } from "lucide-react"

import { RouteGuard } from "@/components/auth/RouteGuard"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { PageLoader } from "@/components/ui/spinner"
import { ReportValidateLoader } from "@/components/report/ReportValidateLoader"
import { ValidationPanel } from "@/components/report/ValidationPanel"
import { useFinalReport, useValidateReport } from "@/hooks/useReportBuilder"
import { usePMCycleDashboard } from "@/hooks/useSessions"
import { formatDateTime } from "@/lib/utils"

/* The validation findings, on their own page.
 *
 * Its own tab rather than a panel above the document: the findings are worked
 * through against the report, and stacking them on top of it meant scrolling
 * past one to read the other. A URL also means it can sit on a second screen,
 * or be sent to someone.
 *
 * `?run=1` is what the Validate button opens, and it runs on arrival. Reaching
 * the page any other way shows the stored result instead — returning to a
 * bookmark should not spend another thirty seconds of model time. */
export default function ValidationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return (
    <RouteGuard allowedRoles={["project_manager", "admin"]}>
      <ValidationView cycleId={id} />
    </RouteGuard>
  )
}

function ValidationView({ cycleId }: { cycleId: string }) {
  const search = useSearchParams()
  const shouldRun = search.get("run") === "1"

  const reportQuery = useFinalReport(cycleId)
  const validate = useValidateReport(cycleId)
  const { data: dash } = usePMCycleDashboard(cycleId)

  // Fire once. The ref, not isPending: pending is still false on the render
  // that schedules the call, and React runs effects twice in dev — without it
  // this bills two runs every time the tab opens.
  const started = useRef(false)
  useEffect(() => {
    if (!shouldRun || started.current) return
    started.current = true
    validate.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRun])

  const cycleName =
    (dash as { cycle?: { cycle_name?: string } } | undefined)?.cycle?.cycle_name

  // Prefer the run just finished; fall back to what the server stored. The
  // server has already discarded a validation that predates this assembly.
  const validation = validate.data?.validation ?? reportQuery.data?.validation ?? null

  if (reportQuery.isLoading) return <PageLoader />

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      {validate.isPending && <ReportValidateLoader />}

      <div className="flex items-start gap-3">
        <Link href={`/pm/cycles/${cycleId}/report`}>
          <Button variant="outline" size="icon" className="mt-0.5 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          className="flex-1"
          title="Report Validation"
          description={
            validation
              ? `${cycleName ?? "This report"} — checked ${formatDateTime(validation.validated_at)}`
              : `${cycleName ?? "This report"} — not checked yet`
          }
          action={
            <Button
              variant="outline"
              onClick={() => validate.mutate()}
              disabled={validate.isPending}
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              {validation ? "Validate again" : "Validate report"}
            </Button>
          }
        />
      </div>

      {validation ? (
        <ValidationPanel validation={validation} />
      ) : (
        <EmptyState
          icon={ShieldCheck}
          title="Not checked yet"
          description="Validate the report to trace its figures back to what the departments submitted, and to see what the sections claim that nothing supports."
        />
      )}
    </div>
  )
}
